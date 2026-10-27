package storage

import (
	"context"
	"database/sql"
	"time"
)

// TeamSlot — слот командного проекта.
type TeamSlot struct {
	ID             int64
	TaskID         int64
	RoleCode       string
	RoleTitle      string
	AssignedUserID *int64
	Status         string
	ArtifactURL    string
	ArtifactHash   string
	ReadyAt        *time.Time
	CreatedAt      time.Time
	UpdatedAt      time.Time
}

// Состояния слота (CHECK в team_slots.status).
const (
	TeamSlotStatusOpen      = "OPEN"
	TeamSlotStatusClaimed   = "CLAIMED"
	TeamSlotStatusSubmitted = "SUBMITTED"
	TeamSlotStatusAccepted  = "ACCEPTED"
	TeamSlotStatusRejected  = "REJECTED"
	TeamSlotStatusAbandoned = "ABANDONED"
)

// TeamSlotRepo — доступ к таблице team_slots.
type TeamSlotRepo struct {
	db *sql.DB
}

// NewTeamSlotRepo создаёт репозиторий слотов.
func NewTeamSlotRepo(db *sql.DB) *TeamSlotRepo {
	return &TeamSlotRepo{db: db}
}

const teamSlotColumns = `id, task_id, role_code, role_title, assigned_user_id, status,
	artifact_url, artifact_hash, ready_at, created_at, updated_at`

// TeamSlotSeed — описание слота, который создаётся вместе с командным заданием.
type TeamSlotSeed struct {
	RoleCode  string
	RoleTitle string
}

// CreateSlots создаёт слоты командного проекта в переданной транзакции.
func (r *TeamSlotRepo) CreateSlots(ctx context.Context, tx *sql.Tx, taskID int64, seeds []TeamSlotSeed) error {
	for _, seed := range seeds {
		_, err := tx.ExecContext(ctx,
			`INSERT INTO team_slots (task_id, role_code, role_title, status)
			 VALUES (?, ?, ?, ?)`,
			taskID, seed.RoleCode, seed.RoleTitle, TeamSlotStatusOpen)
		if err != nil {
			return MapSQLError(err)
		}
	}

	return nil
}

// GetByID возвращает слот по идентификатору.
func (r *TeamSlotRepo) GetByID(ctx context.Context, id int64) (*TeamSlot, error) {
	row := r.db.QueryRowContext(ctx,
		`SELECT `+teamSlotColumns+` FROM team_slots WHERE id = ?`, id)

	slot, err := scanTeamSlot(row)

	return slot, MapSQLError(err)
}

// ListByTask возвращает слоты задания.
func (r *TeamSlotRepo) ListByTask(ctx context.Context, taskID int64) ([]TeamSlot, error) {
	rows, err := r.db.QueryContext(ctx,
		`SELECT `+teamSlotColumns+` FROM team_slots WHERE task_id = ? ORDER BY role_code`, taskID)
	if err != nil {
		return nil, MapSQLError(err)
	}
	defer rows.Close()

	slots := make([]TeamSlot, 0)

	for rows.Next() {
		slot, err := scanTeamSlot(rows)
		if err != nil {
			return nil, MapSQLError(err)
		}

		slots = append(slots, *slot)
	}

	return slots, MapSQLError(rows.Err())
}

// Claim занимает свободный, брошенный или отклонённый слот.
func (r *TeamSlotRepo) Claim(ctx context.Context, tx *sql.Tx, slotID, userID int64) (*TeamSlot, error) {
	row := tx.QueryRowContext(ctx,
		`UPDATE team_slots
		 SET assigned_user_id = ?, status = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
		 WHERE id = ? AND status IN (?, ?, ?)
		 RETURNING `+teamSlotColumns,
		userID, TeamSlotStatusClaimed, slotID,
		TeamSlotStatusOpen, TeamSlotStatusAbandoned, TeamSlotStatusRejected)

	slot, err := scanTeamSlot(row)

	return slot, MapSQLError(err)
}

// CarryOver перехватывает слот у прежнего исполнителя и возвращает его для аудита.
// `excluded.` в SQLite доступен только в UPSERT, поэтому прежний владелец
// читается отдельным SELECT внутри той же транзакции.
func (r *TeamSlotRepo) CarryOver(ctx context.Context, tx *sql.Tx, slotID, newUserID int64) (*TeamSlot, *int64, error) {
	var previousUserID sql.NullInt64

	err := tx.QueryRowContext(ctx,
		`SELECT assigned_user_id FROM team_slots WHERE id = ?`, slotID).Scan(&previousUserID)
	if err != nil {
		return nil, nil, MapSQLError(err)
	}

	row := tx.QueryRowContext(ctx,
		`UPDATE team_slots
		 SET assigned_user_id = ?, status = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
		 WHERE id = ? AND status IN (?, ?, ?)
		 RETURNING `+teamSlotColumns,
		newUserID, TeamSlotStatusClaimed, slotID,
		TeamSlotStatusOpen, TeamSlotStatusAbandoned, TeamSlotStatusRejected)

	slot, err := scanTeamSlot(row)
	if err != nil {
		return nil, nil, MapSQLError(err)
	}

	return slot, scanInt64Ptr(previousUserID), nil
}

// MarkSubmitted фиксирует артефакт слота и переводит его на приёмку.
func (r *TeamSlotRepo) MarkSubmitted(ctx context.Context, tx *sql.Tx, slotID, userID int64, artifactURL, artifactHash string, readyAt time.Time) (*TeamSlot, error) {
	row := tx.QueryRowContext(ctx,
		`UPDATE team_slots
		 SET status = ?, artifact_url = ?, artifact_hash = ?, ready_at = ?,
		     updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
		 WHERE id = ? AND status = ? AND assigned_user_id = ?
		 RETURNING `+teamSlotColumns,
		TeamSlotStatusSubmitted, artifactURL, artifactHash, formatTime(readyAt), slotID,
		TeamSlotStatusClaimed, userID)

	slot, err := scanTeamSlot(row)

	return slot, MapSQLError(err)
}

// scanTeamSlot читает строку team_slots из row или rows.
func scanTeamSlot(from row) (*TeamSlot, error) {
	var (
		slot                      TeamSlot
		assignedUserID            sql.NullInt64
		artifactURL, artifactHash sql.NullString
		readyAt                   sql.NullString
		createdAt, updatedAt      string
	)

	if err := from.Scan(
		&slot.ID,
		&slot.TaskID,
		&slot.RoleCode,
		&slot.RoleTitle,
		&assignedUserID,
		&slot.Status,
		&artifactURL,
		&artifactHash,
		&readyAt,
		&createdAt,
		&updatedAt,
	); err != nil {
		return nil, err
	}

	if err := fillTeamSlot(&slot, assignedUserID, artifactURL, artifactHash, readyAt, createdAt, updatedAt); err != nil {
		return nil, err
	}

	return &slot, nil
}

// fillTeamSlot раскладывает nullable-колонки слота по доменным полям.
func fillTeamSlot(slot *TeamSlot, assignedUserID sql.NullInt64, artifactURL, artifactHash, readyAt sql.NullString, createdAt, updatedAt string) error {
	slot.AssignedUserID = scanInt64Ptr(assignedUserID)
	slot.ArtifactURL = scanString(artifactURL)
	slot.ArtifactHash = scanString(artifactHash)

	var err error

	if slot.ReadyAt, err = scanTime(readyAt); err != nil {
		return err
	}

	if slot.CreatedAt, err = parseTime(createdAt); err != nil {
		return err
	}

	if slot.UpdatedAt, err = parseTime(updatedAt); err != nil {
		return err
	}

	return nil
}
