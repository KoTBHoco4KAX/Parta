package storage

import (
	"context"
	"database/sql"
	"time"

	domainerrors "github.com/parta/backend/internal/domain/errors"
)

// TaskTemplate — заготовка задания в личной базе преподавателя.
type TaskTemplate struct {
	ID                  int64
	TeacherID           int64
	DisciplineID        int64
	DisciplineCode      string
	DisciplineTitle     string
	Title               string
	DescriptionMD       string
	TaskType            string
	RequirementsCount   int
	ExpectedHours       float64
	SpeedrunWindowHours int
	Attachments         string
	TeamSize            int
	CreatedAt           time.Time
}

// CreateTaskTemplateInput — вход создания шаблона.
type CreateTaskTemplateInput struct {
	TeacherID           int64
	DisciplineID        int64
	Title               string
	DescriptionMD       string
	TaskType            string
	RequirementsCount   int
	ExpectedHours       float64
	SpeedrunWindowHours int
	Attachments         string
	TeamSize            int
}

// TaskTemplateRepo — доступ к таблице task_templates.
type TaskTemplateRepo struct {
	db *sql.DB
}

// NewTaskTemplateRepo создаёт репозиторий базы заданий.
func NewTaskTemplateRepo(db *sql.DB) *TaskTemplateRepo {
	return &TaskTemplateRepo{db: db}
}

const taskTemplateColumns = `tt.id, tt.teacher_id, tt.discipline_id, d.code, d.title,
	tt.title, tt.description_md, tt.task_type, tt.requirements_count,
	tt.expected_hours, tt.speedrun_window_hours, tt.attachments, tt.team_size, tt.created_at`

const taskTemplateSelect = `SELECT ` + taskTemplateColumns + `
	FROM task_templates tt
	JOIN disciplines d ON d.id = tt.discipline_id`

// Create сохраняет шаблон и возвращает его с названием дисциплины.
func (r *TaskTemplateRepo) Create(
	ctx context.Context,
	in CreateTaskTemplateInput,
) (*TaskTemplate, error) {
	row := r.db.QueryRowContext(ctx,
		`INSERT INTO task_templates (
		     teacher_id, discipline_id, title, description_md, task_type,
		     requirements_count, expected_hours, speedrun_window_hours, attachments, team_size
		 )
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		 RETURNING id`,
		in.TeacherID, in.DisciplineID, in.Title, in.DescriptionMD, in.TaskType,
		in.RequirementsCount, in.ExpectedHours, in.SpeedrunWindowHours,
		in.Attachments, in.TeamSize)

	var id int64
	if err := row.Scan(&id); err != nil {
		return nil, MapSQLError(err)
	}

	return r.GetByID(ctx, id)
}

// GetByID возвращает шаблон по идентификатору.
func (r *TaskTemplateRepo) GetByID(ctx context.Context, id int64) (*TaskTemplate, error) {
	row := r.db.QueryRowContext(ctx, taskTemplateSelect+` WHERE tt.id = ?`, id)

	template, err := scanTaskTemplate(row)

	return template, MapSQLError(err)
}

// ListByTeacher возвращает личную базу заданий преподавателя.
func (r *TaskTemplateRepo) ListByTeacher(ctx context.Context, teacherID int64) ([]TaskTemplate, error) {
	return r.list(ctx, ` WHERE tt.teacher_id = ? ORDER BY tt.created_at DESC, tt.id DESC`, teacherID)
}

// ListAll возвращает базу заданий всех преподавателей (для админа).
func (r *TaskTemplateRepo) ListAll(ctx context.Context) ([]TaskTemplate, error) {
	return r.list(ctx, ` ORDER BY tt.created_at DESC, tt.id DESC`)
}

// list выполняет общий SELECT с переданным хвостом.
func (r *TaskTemplateRepo) list(ctx context.Context, tail string, args ...any) ([]TaskTemplate, error) {
	rows, err := r.db.QueryContext(ctx, taskTemplateSelect+tail, args...)
	if err != nil {
		return nil, MapSQLError(err)
	}
	defer rows.Close()

	templates := make([]TaskTemplate, 0)

	for rows.Next() {
		template, err := scanTaskTemplate(rows)
		if err != nil {
			return nil, MapSQLError(err)
		}

		templates = append(templates, *template)
	}

	return templates, MapSQLError(rows.Err())
}

// Delete удаляет шаблон по идентификатору.
func (r *TaskTemplateRepo) Delete(ctx context.Context, id int64) error {
	result, err := r.db.ExecContext(ctx, `DELETE FROM task_templates WHERE id = ?`, id)
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

// scanTaskTemplate читает строку task_templates вместе с дисциплиной.
func scanTaskTemplate(from row) (*TaskTemplate, error) {
	var (
		template  TaskTemplate
		createdAt string
	)

	if err := from.Scan(
		&template.ID,
		&template.TeacherID,
		&template.DisciplineID,
		&template.DisciplineCode,
		&template.DisciplineTitle,
		&template.Title,
		&template.DescriptionMD,
		&template.TaskType,
		&template.RequirementsCount,
		&template.ExpectedHours,
		&template.SpeedrunWindowHours,
		&template.Attachments,
		&template.TeamSize,
		&createdAt,
	); err != nil {
		return nil, err
	}

	parsed, err := parseTime(createdAt)
	if err != nil {
		return nil, err
	}

	template.CreatedAt = parsed

	return &template, nil
}
