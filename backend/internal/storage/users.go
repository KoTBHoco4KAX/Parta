package storage

import (
	"context"
	"database/sql"
	"time"

	domainerrors "github.com/parta/backend/internal/domain/errors"
)

// User — пользователь ПАРТА.
type User struct {
	ID            int64
	ExternalID    string
	Role          string
	GroupID       *int64
	DisplayName   string
	XPBalance     int
	OnTimeStreak  int
	StreakFreezes int
	CreatedAt     time.Time
	UpdatedAt     time.Time
}

// UserRepo — доступ к таблице users.
type UserRepo struct {
	db *sql.DB
}

// NewUserRepo создаёт репозиторий пользователей.
func NewUserRepo(db *sql.DB) *UserRepo {
	return &UserRepo{db: db}
}

const userColumns = `id, external_id, role, group_id, display_name, xp_balance,
	on_time_streak, streak_freezes, created_at, updated_at`

// GetByID возвращает пользователя по идентификатору.
func (r *UserRepo) GetByID(ctx context.Context, id int64) (*User, error) {
	row := r.db.QueryRowContext(ctx,
		`SELECT `+userColumns+` FROM users WHERE id = ?`, id)

	user, err := scanUser(row)

	return user, MapSQLError(err)
}

// GetByExternalID возвращает пользователя по внешнему идентификатору.
func (r *UserRepo) GetByExternalID(ctx context.Context, extID string) (*User, error) {
	row := r.db.QueryRowContext(ctx,
		`SELECT `+userColumns+` FROM users WHERE external_id = ?`, extID)

	user, err := scanUser(row)

	return user, MapSQLError(err)
}

// ListByGroup возвращает студентов группы в порядке имени.
func (r *UserRepo) ListByGroup(ctx context.Context, groupID int64) ([]User, error) {
	rows, err := r.db.QueryContext(ctx,
		`SELECT `+userColumns+` FROM users WHERE group_id = ? ORDER BY display_name`, groupID)
	if err != nil {
		return nil, MapSQLError(err)
	}
	defer rows.Close()

	users := make([]User, 0)

	for rows.Next() {
		user, err := scanUser(rows)
		if err != nil {
			return nil, MapSQLError(err)
		}

		users = append(users, *user)
	}

	return users, MapSQLError(rows.Err())
}

// Create заводит пользователя с нулевым балансом и стриком.
func (r *UserRepo) Create(ctx context.Context, extID, role string, groupID *int64, displayName string) (*User, error) {
	row := r.db.QueryRowContext(ctx,
		`INSERT INTO users (external_id, role, group_id, display_name)
		 VALUES (?, ?, ?, ?)
		 RETURNING `+userColumns, extID, role, groupID, displayName)

	user, err := scanUser(row)

	return user, MapSQLError(err)
}

// UpdateXPBalance атомарно сдвигает баланс на delta и возвращает новый баланс.
// Если баланс ушёл бы в минус, строки не находится и возвращается ErrNotFound.
func (r *UserRepo) UpdateXPBalance(ctx context.Context, tx *sql.Tx, userID int64, delta int) (int, error) {
	row := tx.QueryRowContext(ctx,
		`UPDATE users
		 SET xp_balance = xp_balance + ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
		 WHERE id = ? AND xp_balance + ? >= 0
		 RETURNING xp_balance`, delta, userID, delta)

	var balance int

	if err := row.Scan(&balance); err != nil {
		return 0, MapSQLError(err)
	}

	return balance, nil
}

// UpdateStreak записывает стрик и запас заморозок.
func (r *UserRepo) UpdateStreak(ctx context.Context, userID int64, streak, freezes int) error {
	return r.updateStreak(ctx, r.db, userID, streak, freezes)
}

// UpdateStreakTx записывает стрик внутри транзакции.
func (r *UserRepo) UpdateStreakTx(ctx context.Context, tx *sql.Tx, userID int64, streak, freezes int) error {
	return r.updateStreak(ctx, tx, userID, streak, freezes)
}

// updateStreak записывает стрик через переданный querier.
func (r *UserRepo) updateStreak(ctx context.Context, q querier, userID int64, streak, freezes int) error {
	result, err := q.ExecContext(ctx,
		`UPDATE users
		 SET on_time_streak = ?, streak_freezes = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
		 WHERE id = ?`, streak, freezes, userID)
	if err != nil {
		return MapSQLError(err)
	}

	affected, err := result.RowsAffected()
	if err != nil {
		return MapSQLError(err)
	}

	if affected == 0 {
		return domainerrors.ErrNotFound
	}

	return nil
}

// DecrementFreezes атомарно тратит одну заморозку и возвращает остаток.
func (r *UserRepo) DecrementFreezes(ctx context.Context, userID int64) (int, error) {
	return r.decrementFreezes(ctx, r.db, userID)
}

// DecrementFreezesTx тратит заморозку внутри транзакции.
func (r *UserRepo) DecrementFreezesTx(ctx context.Context, tx *sql.Tx, userID int64) (int, error) {
	return r.decrementFreezes(ctx, tx, userID)
}

// decrementFreezes тратит заморозку через переданный querier.
func (r *UserRepo) decrementFreezes(ctx context.Context, q querier, userID int64) (int, error) {
	row := q.QueryRowContext(ctx,
		`UPDATE users
		 SET streak_freezes = streak_freezes - 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
		 WHERE id = ? AND streak_freezes > 0
		 RETURNING streak_freezes`, userID)

	var freezes int

	if err := row.Scan(&freezes); err != nil {
		return 0, MapSQLError(err)
	}

	return freezes, nil
}

// AddFreezes пополняет запас заморозок на delta и возвращает новое значение.
func (r *UserRepo) AddFreezes(ctx context.Context, tx *sql.Tx, userID int64, delta int) (int, error) {
	row := tx.QueryRowContext(ctx,
		`UPDATE users
		 SET streak_freezes = streak_freezes + ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
		 WHERE id = ? AND streak_freezes + ? >= 0
		 RETURNING streak_freezes`, delta, userID, delta)

	var freezes int

	if err := row.Scan(&freezes); err != nil {
		return 0, MapSQLError(err)
	}

	return freezes, nil
}

// scanUser читает строку users из row или rows.
func scanUser(from row) (*User, error) {
	var (
		user                 User
		groupID              sql.NullInt64
		createdAt, updatedAt string
	)

	if err := from.Scan(
		&user.ID,
		&user.ExternalID,
		&user.Role,
		&groupID,
		&user.DisplayName,
		&user.XPBalance,
		&user.OnTimeStreak,
		&user.StreakFreezes,
		&createdAt,
		&updatedAt,
	); err != nil {
		return nil, err
	}

	user.GroupID = scanInt64Ptr(groupID)

	var err error

	if user.CreatedAt, err = parseTime(createdAt); err != nil {
		return nil, err
	}

	if user.UpdatedAt, err = parseTime(updatedAt); err != nil {
		return nil, err
	}

	return &user, nil
}
