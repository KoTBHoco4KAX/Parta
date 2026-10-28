package storage

import (
	"context"
	"database/sql"
	"time"

	domainerrors "github.com/parta/backend/internal/domain/errors"
	"github.com/parta/backend/internal/domain/submission"
)

// TaskRepo — доступ к таблице tasks.
type TaskRepo struct {
	db *sql.DB
}

// NewTaskRepo создаёт репозиторий заданий.
func NewTaskRepo(db *sql.DB) *TaskRepo {
	return &TaskRepo{db: db}
}

const taskColumns = `t.id, t.assignment_id, t.title, t.description_md, t.task_type,
	t.requirements_count, t.expected_hours, t.deadline_at, t.speedrun_window_hours,
	t.team_size, t.base_xp_computed, ta.teacher_id, ta.group_id, t.status, t.created_at,
	t.updated_at`

const taskSelect = `SELECT ` + taskColumns + `
	FROM tasks t
	JOIN teacher_assignments ta ON ta.id = t.assignment_id`

// CreateTaskInput — вход создания задания.
type CreateTaskInput struct {
	AssignmentID      int64
	Title             string
	DescriptionMD     string
	TaskType          string
	RequirementsCount int
	ExpectedHours     float64
	DeadlineAt        string
	SpeedrunWindow    int
	TeamSize          int
	BaseXP            int
	Status            string
}

// GetByID возвращает задание по идентификатору вместе с назначенным преподавателем.
func (r *TaskRepo) GetByID(ctx context.Context, id int64) (*submission.Task, error) {
	return r.getByID(ctx, r.db, id)
}

// getByID читает задание через переданный querier: так чтение остаётся
// доступным и внутри транзакции, где r.db уже занят единственным соединением.
func (r *TaskRepo) getByID(ctx context.Context, q querier, id int64) (*submission.Task, error) {
	row := q.QueryRowContext(ctx, taskSelect+` WHERE t.id = ?`, id)

	task, err := scanTask(row)

	return task, MapSQLError(err)
}

// GroupIDForAssignment возвращает группу, на которую назначено задание.
func (r *TaskRepo) GroupIDForAssignment(ctx context.Context, assignmentID int64) (int64, error) {
	row := r.db.QueryRowContext(ctx,
		`SELECT group_id FROM teacher_assignments WHERE id = ?`, assignmentID)

	var groupID int64

	if err := row.Scan(&groupID); err != nil {
		return 0, MapSQLError(err)
	}

	return groupID, nil
}

// TeacherIDForAssignment возвращает преподавателя, за которым закреплено назначение.
func (r *TaskRepo) TeacherIDForAssignment(ctx context.Context, assignmentID int64) (int64, error) {
	row := r.db.QueryRowContext(ctx,
		`SELECT teacher_id FROM teacher_assignments WHERE id = ?`, assignmentID)

	var teacherID int64

	if err := row.Scan(&teacherID); err != nil {
		return 0, MapSQLError(err)
	}

	return teacherID, nil
}

// Create создаёт задание со статусом PUBLISHED.
func (r *TaskRepo) Create(ctx context.Context, in CreateTaskInput) (*submission.Task, error) {
	id, err := r.create(ctx, r.db, in)
	if err != nil {
		return nil, err
	}

	return r.GetByID(ctx, id)
}

// CreateTx создаёт задание внутри транзакции вместе с командными слотами.
func (r *TaskRepo) CreateTx(ctx context.Context, tx *sql.Tx, in CreateTaskInput) (*submission.Task, error) {
	id, err := r.create(ctx, tx, in)
	if err != nil {
		return nil, err
	}

	return r.getByID(ctx, tx, id)
}

// create вставляет задание через переданный querier и возвращает его id.
func (r *TaskRepo) create(ctx context.Context, q querier, in CreateTaskInput) (int64, error) {
	row := q.QueryRowContext(ctx,
		`INSERT INTO tasks (assignment_id, title, description_md, task_type, requirements_count,
		                    expected_hours, deadline_at, speedrun_window_hours, team_size,
		                    base_xp_computed, status)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		 RETURNING id`,
		in.AssignmentID, in.Title, in.DescriptionMD, in.TaskType, in.RequirementsCount,
		in.ExpectedHours, in.DeadlineAt, in.SpeedrunWindow, in.TeamSize,
		in.BaseXP, in.Status)

	var id int64

	if err := row.Scan(&id); err != nil {
		return 0, MapSQLError(err)
	}

	return id, nil
}

// ListByGroup возвращает опубликованные задания группы.
func (r *TaskRepo) ListByGroup(ctx context.Context, groupID int64) ([]submission.Task, error) {
	rows, err := r.db.QueryContext(ctx,
		taskSelect+`
		 WHERE ta.group_id = ? AND t.status = 'PUBLISHED'
		 ORDER BY t.deadline_at, t.id`, groupID)
	if err != nil {
		return nil, MapSQLError(err)
	}
	defer rows.Close()

	tasks := make([]submission.Task, 0)

	for rows.Next() {
		task, err := scanTask(rows)
		if err != nil {
			return nil, MapSQLError(err)
		}

		tasks = append(tasks, *task)
	}

	return tasks, MapSQLError(rows.Err())
}

// ListAll возвращает все задания (админский справочник).
func (r *TaskRepo) ListAll(ctx context.Context) ([]submission.Task, error) {
	return r.listTasks(ctx, ` ORDER BY t.created_at DESC, t.id DESC`)
}

// ListByTeacher возвращает задания, закреплённые за преподавателем.
func (r *TaskRepo) ListByTeacher(ctx context.Context, teacherID int64) ([]submission.Task, error) {
	return r.listTasks(ctx,
		` WHERE ta.teacher_id = ? ORDER BY t.created_at DESC, t.id DESC`, teacherID)
}

// listTasks выполняет taskSelect с переданным хвостом запроса.
func (r *TaskRepo) listTasks(ctx context.Context, tail string, args ...any) ([]submission.Task, error) {
	rows, err := r.db.QueryContext(ctx, taskSelect+tail, args...)
	if err != nil {
		return nil, MapSQLError(err)
	}
	defer rows.Close()

	tasks := make([]submission.Task, 0)

	for rows.Next() {
		task, err := scanTask(rows)
		if err != nil {
			return nil, MapSQLError(err)
		}

		tasks = append(tasks, *task)
	}

	return tasks, MapSQLError(rows.Err())
}

// UpdateBaseXP пересчитывает и сохраняет Base XP задания.
func (r *TaskRepo) UpdateBaseXP(ctx context.Context, tx *sql.Tx, taskID int64, baseXP int) error {
	result, err := tx.ExecContext(ctx,
		`UPDATE tasks
		 SET base_xp_computed = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
		 WHERE id = ?`, baseXP, taskID)
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

// scanTask читает строку tasks вместе с teacher_id из row или rows.
func scanTask(from row) (*submission.Task, error) {
	var (
		task                 submission.Task
		deadlineAt           string
		speedrunHours        int
		createdAt, updatedAt string
	)

	if err := from.Scan(
		&task.ID,
		&task.AssignmentID,
		&task.Title,
		&task.DescriptionMD,
		&task.TaskType,
		&task.RequirementsCount,
		&task.ExpectedHours,
		&deadlineAt,
		&speedrunHours,
		&task.TeamSize,
		&task.BaseXP,
		&task.AssignedTeacherID,
		&task.GroupID,
		&task.Status,
		&createdAt,
		&updatedAt,
	); err != nil {
		return nil, err
	}

	var err error

	if task.DeadlineAt, err = parseTime(deadlineAt); err != nil {
		return nil, err
	}

	if task.CreatedAt, err = parseTime(createdAt); err != nil {
		return nil, err
	}

	if task.UpdatedAt, err = parseTime(updatedAt); err != nil {
		return nil, err
	}

	task.SpeedrunWindow = time.Duration(speedrunHours) * time.Hour

	return &task, nil
}
