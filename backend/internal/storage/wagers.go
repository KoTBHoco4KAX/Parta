package storage

import (
	"context"
	"database/sql"
	"time"

	domainerrors "github.com/parta/backend/internal/domain/errors"
)

// Wager — пари студента на собственный результат.
type Wager struct {
	ID             int64
	StudentID      int64
	TaskID         int64
	StakeAmount    int
	DeadlineAt     time.Time
	Status         string
	CreatedAt      time.Time
	ResolvedAt     *time.Time
	ResolutionNote string
	EscrowLedgerID int64
}

// Состояния пари (CHECK в wagers.status).
const (
	WagerStatusPlaced    = "PLACED"
	WagerStatusWon       = "WON"
	WagerStatusLost      = "LOST"
	WagerStatusCancelled = "CANCELLED"
)

// WagerRepo — доступ к таблице wagers.
type WagerRepo struct {
	db     *sql.DB
	ledger *XPLedgerRepo
}

// NewWagerRepo создаёт репозиторий пари.
func NewWagerRepo(db *sql.DB) *WagerRepo {
	return &WagerRepo{db: db, ledger: NewXPLedgerRepo(db)}
}

// CreateWagerInput — параметры создания пари.
type CreateWagerInput struct {
	StudentID   int64
	TaskID      int64
	StakeAmount int
	DeadlineAt  time.Time
}

const wagerColumns = `id, student_id, task_id, stake_amount, deadline_at, status,
	created_at, resolved_at, resolution_note`

// Create заводит пари и списывает ставку в escrow.
func (r *WagerRepo) Create(ctx context.Context, tx *sql.Tx, in CreateWagerInput) (*Wager, error) {
	row := tx.QueryRowContext(ctx,
		`INSERT INTO wagers (student_id, task_id, stake_amount, deadline_at, status)
		 VALUES (?, ?, ?, ?, ?)
		 RETURNING `+wagerColumns,
		in.StudentID, in.TaskID, in.StakeAmount, formatTime(in.DeadlineAt), WagerStatusPlaced)

	wager, err := scanWager(row)
	if err != nil {
		return nil, MapSQLError(err)
	}

	sourceID := wager.ID

	entry, err := r.ledger.Post(ctx, tx, PostLedgerInput{
		UserID:         in.StudentID,
		Amount:         -in.StakeAmount,
		Reason:         ReasonWagerPlace,
		SourceType:     SourceWager,
		SourceID:       &sourceID,
		IdempotencyKey: wagerPlaceKey(wager.ID),
	})
	if err != nil {
		return nil, err
	}

	wager.EscrowLedgerID = entry.ID

	return wager, nil
}

// GetByID возвращает пари по идентификатору вместе с id escrow-проводки.
func (r *WagerRepo) GetByID(ctx context.Context, id int64) (*Wager, error) {
	row := r.db.QueryRowContext(ctx,
		`SELECT `+wagerColumns+`,
		        COALESCE((SELECT l.id FROM xp_ledger l
		                  WHERE l.source_type = ? AND l.source_id = w.id
		                    AND l.reason = ?
		                  ORDER BY l.id LIMIT 1), 0)
		 FROM wagers w
		 WHERE w.id = ?`,
		SourceWager, ReasonWagerPlace, id)

	wager, err := scanWagerWithEscrow(row)

	return wager, MapSQLError(err)
}

// Resolve закрывает пари и проводит выплату по правилам spec/02_FSM.md.
// result: WON — кредит 2*stake_amount, LOST — без возврата, CANCELLED — возврат ставки.
func (r *WagerRepo) Resolve(ctx context.Context, tx *sql.Tx, id int64, result string, note string) (*Wager, error) {
	if result != WagerStatusWon && result != WagerStatusLost && result != WagerStatusCancelled {
		return nil, domainerrors.ErrInvalidArgument
	}

	row := tx.QueryRowContext(ctx,
		`UPDATE wagers
		 SET status = ?, resolved_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'), resolution_note = ?
		 WHERE id = ? AND status = ?
		 RETURNING `+wagerColumns,
		result, note, id, WagerStatusPlaced)

	wager, err := scanWager(row)
	if err != nil {
		return nil, MapSQLError(err)
	}

	if result == WagerStatusLost {
		return wager, nil
	}

	amount := wager.StakeAmount * 2
	reason := ReasonWagerWin

	if result == WagerStatusCancelled {
		amount = wager.StakeAmount
		reason = ReasonWagerPlace
	}

	sourceID := wager.ID

	entry, err := r.ledger.Post(ctx, tx, PostLedgerInput{
		UserID:         wager.StudentID,
		Amount:         amount,
		Reason:         reason,
		SourceType:     SourceWager,
		SourceID:       &sourceID,
		IdempotencyKey: wagerSettleKey(wager.ID, result),
	})
	if err != nil {
		return nil, err
	}

	wager.EscrowLedgerID = entry.ID

	return wager, nil
}

// ListActiveByTask возвращает открытые пари студента по заданию.
func (r *WagerRepo) ListActiveByTask(ctx context.Context, studentID, taskID int64) ([]Wager, error) {
	rows, err := r.db.QueryContext(ctx,
		`SELECT `+wagerColumns+`
		 FROM wagers
		 WHERE student_id = ? AND task_id = ? AND status = ?
		 ORDER BY id`, studentID, taskID, WagerStatusPlaced)
	if err != nil {
		return nil, MapSQLError(err)
	}
	defer rows.Close()

	wagers := make([]Wager, 0)

	for rows.Next() {
		wager, err := scanWager(rows)
		if err != nil {
			return nil, MapSQLError(err)
		}

		wagers = append(wagers, *wager)
	}

	return wagers, MapSQLError(rows.Err())
}

// scanWager читает строку wagers из row или rows.
func scanWager(from row) (*Wager, error) {
	return scanWagerColumns(from, false)
}

// scanWagerWithEscrow читает строку wagers вместе с id escrow-проводки.
func scanWagerWithEscrow(from row) (*Wager, error) {
	return scanWagerColumns(from, true)
}

// scanWagerColumns читает строку wagers, опционально с завершающей колонкой escrow.
func scanWagerColumns(from row, withEscrow bool) (*Wager, error) {
	var (
		wager      Wager
		deadlineAt string
		createdAt  string
		resolvedAt sql.NullString
		note       sql.NullString
		escrowID   int64
	)

	dest := []any{
		&wager.ID,
		&wager.StudentID,
		&wager.TaskID,
		&wager.StakeAmount,
		&deadlineAt,
		&wager.Status,
		&createdAt,
		&resolvedAt,
		&note,
	}

	if withEscrow {
		dest = append(dest, &escrowID)
	}

	if err := from.Scan(dest...); err != nil {
		return nil, err
	}

	wager.ResolutionNote = scanString(note)
	wager.EscrowLedgerID = escrowID

	var err error

	if wager.DeadlineAt, err = parseTime(deadlineAt); err != nil {
		return nil, err
	}

	if wager.CreatedAt, err = parseTime(createdAt); err != nil {
		return nil, err
	}

	if wager.ResolvedAt, err = scanTime(resolvedAt); err != nil {
		return nil, err
	}

	return &wager, nil
}

// wagerPlaceKey — детерминированный ключ идемпотентности списания ставки.
func wagerPlaceKey(wagerID int64) string {
	return "wager:" + itoa(wagerID) + ":place"
}

// wagerSettleKey — детерминированный ключ идемпотентности расчёта пари.
func wagerSettleKey(wagerID int64, result string) string {
	return "wager:" + itoa(wagerID) + ":settle:" + result
}
