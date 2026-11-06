package storage

import (
	"context"
	"database/sql"
)

// Discipline — учебная дисциплина.
type Discipline struct {
	ID    int64
	Code  string
	Title string
}

// DisciplineRepo — доступ к таблице disciplines.
type DisciplineRepo struct {
	db *sql.DB
}

// NewDisciplineRepo создаёт репозиторий дисциплин.
func NewDisciplineRepo(db *sql.DB) *DisciplineRepo {
	return &DisciplineRepo{db: db}
}

const disciplineColumns = `id, code, title`

// GetByID возвращает дисциплину по идентификатору.
func (r *DisciplineRepo) GetByID(ctx context.Context, id int64) (*Discipline, error) {
	row := r.db.QueryRowContext(ctx,
		`SELECT `+disciplineColumns+` FROM disciplines WHERE id = ?`, id)

	return scanDiscipline(row)
}

// GetByCode возвращает дисциплину по коду.
func (r *DisciplineRepo) GetByCode(ctx context.Context, code string) (*Discipline, error) {
	row := r.db.QueryRowContext(ctx,
		`SELECT `+disciplineColumns+` FROM disciplines WHERE code = ?`, code)

	return scanDiscipline(row)
}

// scanDiscipline читает строку disciplines из row.
func scanDiscipline(from row) (*Discipline, error) {
	var discipline Discipline

	if err := from.Scan(&discipline.ID, &discipline.Code, &discipline.Title); err != nil {
		return nil, MapSQLError(err)
	}

	return &discipline, nil
}
