package storage

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"time"

	domainerrors "github.com/parta/backend/internal/domain/errors"
	"github.com/parta/backend/internal/domain/submission"
)

// SubmissionRepo — доступ к таблице submissions.
type SubmissionRepo struct {
	db *sql.DB
}

// NewSubmissionRepo создаёт репозиторий работ.
func NewSubmissionRepo(db *sql.DB) *SubmissionRepo {
	return &SubmissionRepo{db: db}
}

// UpdateStatusInput — параметры перехода карточки по канбану.
type UpdateStatusInput struct {
	ID            int64
	ExpectedFrom  submission.Status
	To            submission.Status
	ActorID       int64
	Now           time.Time
	ArtifactURL   *string
	ArtifactHash  *string
	ReviewComment *string
}

// submissionColumns — колонки карточки, которые возвращает SQLite. Схема задаёт
// их через t.*, но здесь они перечислены явно: при JOIN teacher_id встал бы
// между колонками submissions, и молчаливый сдвиг полей был бы неизбежен.
const submissionColumns = `id, task_id, student_id, team_slot_id, status, artifact_url,
	artifact_hash, submitted_at, final_submitted_at, reviewed_at, reviewer_id,
	revision_log`

// submissionColumnsQualified — те же колонки с префиксом `s.` для запросов с
// JOIN: без префикса `id` и `status` неоднозначны (в tasks тоже есть `id` и
// `status`), и SQLite возвращает «ambiguous column name: id».
const submissionColumnsQualified = `s.id, s.task_id, s.student_id, s.team_slot_id, s.status,
	s.artifact_url, s.artifact_hash, s.submitted_at, s.final_submitted_at, s.reviewed_at,
	s.reviewer_id, s.revision_log`

const appendRevisionSQL = `UPDATE submissions
	SET revision_log = CASE
	        WHEN revision_log IS NULL OR revision_log = '' THEN json_array(json(?1))
	        ELSE json_insert(revision_log, '$[#]', json(?1))
	    END,
	    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
	WHERE id = ?2`

// GetByID возвращает карточку работы по идентификатору.
func (r *SubmissionRepo) GetByID(ctx context.Context, id int64) (*submission.Submission, error) {
	row := r.db.QueryRowContext(ctx,
		`SELECT `+submissionColumns+` FROM submissions WHERE id = ?`, id)

	sub, err := scanSubmission(row)

	return sub, MapSQLError(err)
}

// GetByStudentAndTask возвращает индивидуальную карточку студента по заданию.
func (r *SubmissionRepo) GetByStudentAndTask(ctx context.Context, studentID, taskID int64) (*submission.Submission, error) {
	row := r.db.QueryRowContext(ctx,
		`SELECT `+submissionColumns+`
		 FROM submissions
		 WHERE student_id = ? AND task_id = ? AND team_slot_id IS NULL`, studentID, taskID)

	sub, err := scanSubmission(row)

	return sub, MapSQLError(err)
}

// CreateForTeamSlot идемпотентно создаёт карточку слота командного проекта.
func (r *SubmissionRepo) CreateForTeamSlot(ctx context.Context, taskID, studentID, teamSlotID int64) (*submission.Submission, bool, error) {
	result, err := r.db.ExecContext(ctx,
		`INSERT INTO submissions (task_id, student_id, team_slot_id, status)
		 VALUES (?, ?, ?, 'TODO')
		 ON CONFLICT DO NOTHING`, taskID, studentID, teamSlotID)
	if err != nil {
		return nil, false, MapSQLError(err)
	}

	affected, err := result.RowsAffected()
	if err != nil {
		return nil, false, MapSQLError(err)
	}

	sub, err := r.GetByTeamSlot(ctx, teamSlotID)
	if err != nil {
		return nil, false, err
	}

	return sub, affected > 0, nil
}

// GetByTeamSlot возвращает карточку, привязанную к слоту командного проекта.
func (r *SubmissionRepo) GetByTeamSlot(ctx context.Context, teamSlotID int64) (*submission.Submission, error) {
	row := r.db.QueryRowContext(ctx,
		`SELECT `+submissionColumns+`
		 FROM submissions
		 WHERE team_slot_id = ?`, teamSlotID)

	sub, err := scanSubmission(row)

	return sub, MapSQLError(err)
}

// CreateTodoForPublishedGroupTasks создаёт карточки TODO новому студенту по всем
// уже опубликованным заданиям его группы.
func (r *SubmissionRepo) CreateTodoForPublishedGroupTasks(ctx context.Context, studentID, groupID int64) error {
	_, err := r.db.ExecContext(ctx,
		`INSERT INTO submissions (task_id, student_id, status)
		 SELECT t.id, ?, 'TODO'
		 FROM tasks t
		 JOIN teacher_assignments ta ON ta.id = t.assignment_id
		 WHERE ta.group_id = ? AND t.status = 'PUBLISHED'
		 ON CONFLICT DO NOTHING`, studentID, groupID)

	return MapSQLError(err)
}

// CreateTodoTx создаёт карточку TODO для студента в рамках транзакции.
// Нужна POST /api/tasks: задание сразу появляется на доске всей группы.
func (r *SubmissionRepo) CreateTodoTx(ctx context.Context, tx *sql.Tx, taskID, studentID int64) error {
	_, err := tx.ExecContext(ctx,
		`INSERT INTO submissions (task_id, student_id, status)
		 VALUES (?, ?, 'TODO')
		 ON CONFLICT DO NOTHING`, taskID, studentID)

	return MapSQLError(err)
}

// CreateIfNotExists создаёт карточку в статусе TODO и сообщает, была ли она создана.
func (r *SubmissionRepo) CreateIfNotExists(ctx context.Context, taskID, studentID int64) (*submission.Submission, bool, error) {
	result, err := r.db.ExecContext(ctx,
		`INSERT INTO submissions (task_id, student_id, status)
		 VALUES (?, ?, 'TODO')
		 ON CONFLICT DO NOTHING`, taskID, studentID)
	if err != nil {
		return nil, false, MapSQLError(err)
	}

	affected, err := result.RowsAffected()
	if err != nil {
		return nil, false, MapSQLError(err)
	}

	sub, err := r.GetByStudentAndTask(ctx, studentID, taskID)
	if err != nil {
		return nil, false, err
	}

	return sub, affected > 0, nil
}

// UpdateStatus двигает карточку по канбану с оптимистической блокировкой статуса.
func (r *SubmissionRepo) UpdateStatus(ctx context.Context, tx *sql.Tx, in UpdateStatusInput) (*submission.Submission, error) {
	var query string

	switch in.To {
	case submission.StatusReview:
		query = `UPDATE submissions
			SET status = ?, submitted_at = ?, artifact_url = ?, artifact_hash = ?,
			    locked_at = ?, updated_at = ?
			WHERE id = ? AND status = ?`
	case submission.StatusDone:
		query = `UPDATE submissions
			SET status = ?, reviewed_at = ?, reviewer_id = ?, verdict_comment = ?,
			    final_submitted_at = COALESCE(submitted_at, ?), updated_at = ?
			WHERE id = ? AND status = ?`
	case submission.StatusRejected:
		query = `UPDATE submissions
			SET status = ?, reviewed_at = ?, reviewer_id = ?, verdict_comment = ?,
			    locked_at = NULL, updated_at = ?
			WHERE id = ? AND status = ?`
	case submission.StatusInProgress:
		query = `UPDATE submissions
			SET status = ?, locked_at = NULL, updated_at = ?
			WHERE id = ? AND status = ?`
	default:
		return nil, fmt.Errorf("%w: unsupported target status %q", domainerrors.ErrInvalidArgument, in.To)
	}

	row := tx.QueryRowContext(ctx, query+` RETURNING `+submissionColumns,
		statusArgs(in)...)

	sub, err := scanSubmission(row)
	if err != nil {
		return nil, MapSQLError(err)
	}

	return sub, nil
}

// statusArgs собирает аргументы запроса перехода в порядке его плейсхолдеров.
func statusArgs(in UpdateStatusInput) []any {
	now := formatTime(in.Now)
	actor := in.ActorID

	switch in.To {
	case submission.StatusReview:
		return []any{
			string(submission.StatusReview),
			now,
			scanStringPtrValue(in.ArtifactURL),
			scanStringPtrValue(in.ArtifactHash),
			now,
			now,
			in.ID,
			string(in.ExpectedFrom),
		}
	case submission.StatusDone:
		return []any{
			string(submission.StatusDone),
			now,
			actor,
			scanStringPtrValue(in.ReviewComment),
			now,
			now,
			in.ID,
			string(in.ExpectedFrom),
		}
	case submission.StatusRejected:
		return []any{
			string(submission.StatusRejected),
			now,
			actor,
			scanStringPtrValue(in.ReviewComment),
			now,
			in.ID,
			string(in.ExpectedFrom),
		}
	default:
		return []any{
			string(in.To),
			now,
			in.ID,
			string(in.ExpectedFrom),
		}
	}
}

// RecordRevision добавляет запись в журнал доработок карточки.
func (r *SubmissionRepo) RecordRevision(ctx context.Context, tx *sql.Tx, submissionID int64, entry submission.RevisionEntry) error {
	payload, err := rowToJSON(struct {
		At      string `json:"at"`
		ActorID int64  `json:"actor_id"`
		Comment string `json:"comment"`
	}{
		At:      formatTime(entry.At),
		ActorID: entry.ActorID,
		Comment: entry.Comment,
	})
	if err != nil {
		return err
	}

	result, err := tx.ExecContext(ctx, appendRevisionSQL, payload, submissionID)
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

// ListByStudent возвращает карточки студента по всем заданиям.
func (r *SubmissionRepo) ListByStudent(ctx context.Context, studentID int64) ([]submission.Submission, error) {
	return r.list(ctx,
		`SELECT `+submissionColumns+`
		 FROM submissions
		 WHERE student_id = ?
		 ORDER BY updated_at DESC, id DESC`, studentID)
}

// ListReviewInbox возвращает работы, ожидающие вердикта этого преподавателя.
func (r *SubmissionRepo) ListReviewInbox(ctx context.Context, teacherID int64) ([]submission.Submission, error) {
	return r.list(ctx,
		`SELECT `+submissionColumnsQualified+`
		 FROM submissions s
		 JOIN tasks t ON t.id = s.task_id
		 JOIN teacher_assignments ta ON ta.id = t.assignment_id
		 WHERE ta.teacher_id = ? AND s.status = 'REVIEW'
		 ORDER BY s.submitted_at`, teacherID)
}

// list выполняет запрос и собирает срез работ.
func (r *SubmissionRepo) list(ctx context.Context, query string, args ...any) ([]submission.Submission, error) {
	rows, err := r.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, MapSQLError(err)
	}
	defer rows.Close()

	subs := make([]submission.Submission, 0)

	for rows.Next() {
		sub, err := scanSubmission(rows)
		if err != nil {
			return nil, MapSQLError(err)
		}

		subs = append(subs, *sub)
	}

	return subs, MapSQLError(rows.Err())
}

// scanSubmission читает строку submissions из row или rows.
func scanSubmission(from row) (*submission.Submission, error) {
	var (
		sub          submission.Submission
		status       string
		teamSlotID   sql.NullInt64
		artifactURL  sql.NullString
		artifactHash sql.NullString
		submittedAt  sql.NullString
		finalAt      sql.NullString
		reviewedAt   sql.NullString
		reviewerID   sql.NullInt64
		revisionLog  sql.NullString
	)

	if err := from.Scan(
		&sub.ID,
		&sub.TaskID,
		&sub.StudentID,
		&teamSlotID,
		&status,
		&artifactURL,
		&artifactHash,
		&submittedAt,
		&finalAt,
		&reviewedAt,
		&reviewerID,
		&revisionLog,
	); err != nil {
		return nil, err
	}

	sub.Status = submission.Status(status)
	sub.TeamSlotID = scanInt64Ptr(teamSlotID)
	sub.ArtifactURL = scanString(artifactURL)
	sub.ArtifactHash = scanString(artifactHash)
	sub.ReviewerID = scanInt64Ptr(reviewerID)

	var err error

	if sub.SubmittedAt, err = scanTime(submittedAt); err != nil {
		return nil, err
	}

	if sub.FinalSubmittedAt, err = scanTime(finalAt); err != nil {
		return nil, err
	}

	if sub.ReviewedAt, err = scanTime(reviewedAt); err != nil {
		return nil, err
	}

	if sub.RevisionLog, err = parseRevisionLog(revisionLog); err != nil {
		return nil, err
	}

	return &sub, nil
}

// parseRevisionLog разбирает JSON-журнал доработок карточки.
func parseRevisionLog(raw sql.NullString) ([]submission.RevisionEntry, error) {
	if !raw.Valid || raw.String == "" {
		return []submission.RevisionEntry{}, nil
	}

	var stored []struct {
		At      string `json:"at"`
		ActorID int64  `json:"actor_id"`
		Comment string `json:"comment"`
	}

	if err := json.Unmarshal([]byte(raw.String), &stored); err != nil {
		return nil, fmt.Errorf("decode revision_log: %w", err)
	}

	entries := make([]submission.RevisionEntry, 0, len(stored))

	for _, item := range stored {
		at, err := parseTime(item.At)
		if err != nil {
			return nil, fmt.Errorf("decode revision_log timestamp: %w", err)
		}

		entries = append(entries, submission.RevisionEntry{
			At:      at,
			ActorID: item.ActorID,
			Comment: item.Comment,
		})
	}

	return entries, nil
}

// scanStringPtrValue разыменовывает *string в значение для драйвера.
func scanStringPtrValue(value *string) any {
	if value == nil {
		return nil
	}

	return *value
}
