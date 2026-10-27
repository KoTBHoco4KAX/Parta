package storage

import (
	"context"
	"database/sql"
	"time"

	domainerrors "github.com/parta/backend/internal/domain/errors"
)

// Group — учебная группа.
type Group struct {
	ID        int64
	Code      string
	Title     string
	CreatedAt time.Time
	UpdatedAt time.Time
}

// GroupRepo — доступ к таблице groups.
type GroupRepo struct {
	db *sql.DB
}

// NewGroupRepo создаёт репозиторий групп.
func NewGroupRepo(db *sql.DB) *GroupRepo {
	return &GroupRepo{db: db}
}

const groupColumns = `id, code, title, created_at, updated_at`

// GetByID возвращает группу по идентификатору.
func (r *GroupRepo) GetByID(ctx context.Context, id int64) (*Group, error) {
	row := r.db.QueryRowContext(ctx,
		`SELECT `+groupColumns+` FROM groups WHERE id = ?`, id)

	group, err := scanGroup(row)

	return group, MapSQLError(err)
}

// List возвращает все группы в порядке кода.
func (r *GroupRepo) List(ctx context.Context) ([]Group, error) {
	rows, err := r.db.QueryContext(ctx,
		`SELECT `+groupColumns+` FROM groups ORDER BY code`)
	if err != nil {
		return nil, MapSQLError(err)
	}
	defer rows.Close()

	groups := make([]Group, 0)

	for rows.Next() {
		group, err := scanGroup(rows)
		if err != nil {
			return nil, MapSQLError(err)
		}

		groups = append(groups, *group)
	}

	return groups, MapSQLError(rows.Err())
}

// Create заводит новую группу.
func (r *GroupRepo) Create(ctx context.Context, code, title string) (*Group, error) {
	row := r.db.QueryRowContext(ctx,
		`INSERT INTO groups (code, title) VALUES (?, ?)
		 RETURNING `+groupColumns, code, title)

	group, err := scanGroup(row)

	return group, MapSQLError(err)
}

// Update меняет код и название группы.
func (r *GroupRepo) Update(ctx context.Context, id int64, code, title string) (*Group, error) {
	row := r.db.QueryRowContext(ctx,
		`UPDATE groups
		 SET code = ?, title = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
		 WHERE id = ?
		 RETURNING `+groupColumns, code, title, id)

	group, err := scanGroup(row)

	return group, MapSQLError(err)
}

// Delete удаляет группу, если на неё нет ссылок.
func (r *GroupRepo) Delete(ctx context.Context, id int64) error {
	result, err := r.db.ExecContext(ctx, `DELETE FROM groups WHERE id = ?`, id)
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

// scanGroup читает строку groups из row или rows.
func scanGroup(from row) (*Group, error) {
	var (
		group                Group
		createdAt, updatedAt string
	)

	if err := from.Scan(&group.ID, &group.Code, &group.Title, &createdAt, &updatedAt); err != nil {
		return nil, err
	}

	var err error

	if group.CreatedAt, err = parseTime(createdAt); err != nil {
		return nil, err
	}

	if group.UpdatedAt, err = parseTime(updatedAt); err != nil {
		return nil, err
	}

	return &group, nil
}
