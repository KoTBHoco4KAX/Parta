package storage

import (
	"context"
	"database/sql"
	"time"

	"github.com/parta/backend/internal/domain/submission"
)

// SubmissionView — карточка работы вместе с данными задания, группы и студента.
// Read-модель нужна экранам канбана и инбокса преподавателя: им мало одних id.
type SubmissionView struct {
	submission.Submission

	TaskTitle           string
	TaskType            string
	DeadlineAt          time.Time
	SpeedrunWindowHours int
	BaseXP              int
	GroupID             int64
	GroupCode           string
	StudentName         string
	TeamSlotRole        *string
	Attempt             int
}

const submissionViewSelect = `SELECT
	s.id, s.task_id, s.student_id, s.team_slot_id, s.status,
	s.artifact_url, s.artifact_hash, s.submitted_at, s.final_submitted_at,
	s.reviewed_at, s.reviewer_id, s.revision_log,
	t.title, t.task_type, t.deadline_at, t.speedrun_window_hours, t.base_xp_computed,
	ta.group_id, g.code, u.display_name, ts.role_code
	FROM submissions s
	JOIN tasks t ON t.id = s.task_id
	JOIN teacher_assignments ta ON ta.id = t.assignment_id
	JOIN groups g ON g.id = ta.group_id
	JOIN users u ON u.id = s.student_id
	LEFT JOIN team_slots ts ON ts.id = s.team_slot_id`

// ListViewsByStudent возвращает карточки студента с данными задания.
func (r *SubmissionRepo) ListViewsByStudent(ctx context.Context, studentID int64) ([]SubmissionView, error) {
	return r.listViews(ctx, submissionViewSelect+`
		WHERE s.student_id = ?
		ORDER BY s.updated_at DESC, s.id DESC`, studentID)
}

// ListViewsForTeacher возвращает карточки по назначениям преподавателя.
func (r *SubmissionRepo) ListViewsForTeacher(ctx context.Context, teacherID int64) ([]SubmissionView, error) {
	return r.listViews(ctx, submissionViewSelect+`
		WHERE ta.teacher_id = ?
		ORDER BY s.submitted_at DESC, s.id DESC`, teacherID)
}

// ListViewsAll возвращает все карточки (админский обзор).
func (r *SubmissionRepo) ListViewsAll(ctx context.Context) ([]SubmissionView, error) {
	return r.listViews(ctx, submissionViewSelect+`
		ORDER BY s.updated_at DESC, s.id DESC`)
}

func (r *SubmissionRepo) listViews(ctx context.Context, query string, args ...any) ([]SubmissionView, error) {
	rows, err := r.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, MapSQLError(err)
	}
	defer rows.Close()

	views := make([]SubmissionView, 0)

	for rows.Next() {
		view, err := scanSubmissionView(rows)
		if err != nil {
			return nil, MapSQLError(err)
		}

		views = append(views, *view)
	}

	return views, MapSQLError(rows.Err())
}

func scanSubmissionView(from row) (*SubmissionView, error) {
	var (
		view         SubmissionView
		status       string
		teamSlotID   sql.NullInt64
		artifactURL  sql.NullString
		artifactHash sql.NullString
		submittedAt  sql.NullString
		finalAt      sql.NullString
		reviewedAt   sql.NullString
		reviewerID   sql.NullInt64
		revisionLog  sql.NullString
		deadlineAt   string
		groupCode    string
		roleCode     sql.NullString
	)

	if err := from.Scan(
		&view.ID,
		&view.TaskID,
		&view.StudentID,
		&teamSlotID,
		&status,
		&artifactURL,
		&artifactHash,
		&submittedAt,
		&finalAt,
		&reviewedAt,
		&reviewerID,
		&revisionLog,
		&view.TaskTitle,
		&view.TaskType,
		&deadlineAt,
		&view.SpeedrunWindowHours,
		&view.BaseXP,
		&view.GroupID,
		&groupCode,
		&view.StudentName,
		&roleCode,
	); err != nil {
		return nil, err
	}

	view.Status = submission.Status(status)
	view.TeamSlotID = scanInt64Ptr(teamSlotID)
	view.ArtifactURL = scanString(artifactURL)
	view.ArtifactHash = scanString(artifactHash)
	view.ReviewerID = scanInt64Ptr(reviewerID)
	view.GroupCode = groupCode
	view.TeamSlotRole = scanStringPtr(roleCode)

	var err error

	if view.SubmittedAt, err = scanTime(submittedAt); err != nil {
		return nil, err
	}

	if view.FinalSubmittedAt, err = scanTime(finalAt); err != nil {
		return nil, err
	}

	if view.ReviewedAt, err = scanTime(reviewedAt); err != nil {
		return nil, err
	}

	if view.RevisionLog, err = parseRevisionLog(revisionLog); err != nil {
		return nil, err
	}

	if view.DeadlineAt, err = parseTime(deadlineAt); err != nil {
		return nil, err
	}

	view.Attempt = len(view.RevisionLog) + 1

	return &view, nil
}

// WagerView — пари вместе с названием задания и его дедлайном.
type WagerView struct {
	Wager
	TaskTitle string
	TaskDueAt time.Time
}

// ListViewsByStudent возвращает пари студента с названиями заданий.
func (r *WagerRepo) ListViewsByStudent(ctx context.Context, studentID int64) ([]WagerView, error) {
	rows, err := r.db.QueryContext(ctx, `SELECT
		w.id, w.student_id, w.task_id, w.stake_amount, w.deadline_at, w.status,
		w.created_at, w.resolved_at, w.resolution_note,
		t.title, t.deadline_at
		FROM wagers w
		JOIN tasks t ON t.id = w.task_id
		WHERE w.student_id = ?
		ORDER BY w.created_at DESC, w.id DESC`, studentID)
	if err != nil {
		return nil, MapSQLError(err)
	}
	defer rows.Close()

	views := make([]WagerView, 0)

	for rows.Next() {
		var (
			view       WagerView
			deadlineAt string
			createdAt  string
			resolvedAt sql.NullString
			note       sql.NullString
			taskDueAt  string
		)

		if err := rows.Scan(
			&view.ID,
			&view.StudentID,
			&view.TaskID,
			&view.StakeAmount,
			&deadlineAt,
			&view.Status,
			&createdAt,
			&resolvedAt,
			&note,
			&view.TaskTitle,
			&taskDueAt,
		); err != nil {
			return nil, MapSQLError(err)
		}

		view.ResolutionNote = scanString(note)

		if view.DeadlineAt, err = parseTime(deadlineAt); err != nil {
			return nil, err
		}

		if view.CreatedAt, err = parseTime(createdAt); err != nil {
			return nil, err
		}

		if view.ResolvedAt, err = scanTime(resolvedAt); err != nil {
			return nil, err
		}

		if view.TaskDueAt, err = parseTime(taskDueAt); err != nil {
			return nil, err
		}

		views = append(views, view)
	}

	return views, MapSQLError(rows.Err())
}

// PeerReviewView — peer-review вместе с заданием, группой и именами участников.
type PeerReviewView struct {
	PeerReview
	TaskID       int64
	TaskTitle    string
	GroupCode    string
	AuthorName   string
	ReviewerName *string
}

const peerReviewViewSelect = `SELECT
	pr.id, pr.submission_id, pr.author_id, pr.reviewer_id, pr.criteria_checklist,
	pr.comments, pr.status, pr.escrow_amount, pr.reward_amount,
	pr.created_at, pr.taken_at, pr.completed_at, pr.expires_at,
	t.id, t.title, g.code, author.display_name, reviewer.display_name
	FROM peer_reviews pr
	JOIN submissions s ON s.id = pr.submission_id
	JOIN tasks t ON t.id = s.task_id
	JOIN teacher_assignments ta ON ta.id = t.assignment_id
	JOIN groups g ON g.id = ta.group_id
	JOIN users author ON author.id = pr.author_id
	LEFT JOIN users reviewer ON reviewer.id = pr.reviewer_id`

// ListViewsForTeacher возвращает peer-review по назначениям преподавателя.
func (r *PeerReviewRepo) ListViewsForTeacher(ctx context.Context, teacherID int64) ([]PeerReviewView, error) {
	return r.listViews(ctx, peerReviewViewSelect+`
		WHERE ta.teacher_id = ?
		ORDER BY pr.created_at DESC, pr.id DESC`, teacherID)
}

// ListViewsAll возвращает все peer-review (админский обзор).
func (r *PeerReviewRepo) ListViewsAll(ctx context.Context) ([]PeerReviewView, error) {
	return r.listViews(ctx, peerReviewViewSelect+`
		ORDER BY pr.created_at DESC, pr.id DESC`)
}

func (r *PeerReviewRepo) listViews(ctx context.Context, query string, args ...any) ([]PeerReviewView, error) {
	rows, err := r.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, MapSQLError(err)
	}
	defer rows.Close()

	views := make([]PeerReviewView, 0)

	for rows.Next() {
		var (
			view         PeerReviewView
			reviewerID   sql.NullInt64
			comments     sql.NullString
			createdAt    string
			expiresAt    string
			takenAt      sql.NullString
			completedAt  sql.NullString
			reviewerName sql.NullString
		)

		if err := rows.Scan(
			&view.ID,
			&view.SubmissionID,
			&view.AuthorID,
			&reviewerID,
			&view.CriteriaChecklist,
			&comments,
			&view.Status,
			&view.EscrowAmount,
			&view.RewardAmount,
			&createdAt,
			&takenAt,
			&completedAt,
			&expiresAt,
			&view.TaskID,
			&view.TaskTitle,
			&view.GroupCode,
			&view.AuthorName,
			&reviewerName,
		); err != nil {
			return nil, MapSQLError(err)
		}

		view.ReviewerID = scanInt64Ptr(reviewerID)
		view.Comments = scanString(comments)
		view.ReviewerName = scanStringPtr(reviewerName)

		if view.CreatedAt, err = parseTime(createdAt); err != nil {
			return nil, err
		}

		if view.ExpiresAt, err = parseTime(expiresAt); err != nil {
			return nil, err
		}

		if view.TakenAt, err = scanTime(takenAt); err != nil {
			return nil, err
		}

		if view.CompletedAt, err = scanTime(completedAt); err != nil {
			return nil, err
		}

		views = append(views, view)
	}

	return views, MapSQLError(rows.Err())
}

// AssignmentView — назначение «преподаватель + группа + дисциплина».
type AssignmentView struct {
	ID              int64
	GroupCode       string
	GroupTitle      string
	DisciplineCode  string
	DisciplineTitle string
	TeacherName     string
}

// ListAssignments возвращает назначения; teacherID = 0 означает «все».
func (r *TaskRepo) ListAssignments(ctx context.Context, teacherID int64) ([]AssignmentView, error) {
	query := `SELECT ta.id, g.code, g.title, d.code, d.title, u.display_name
		FROM teacher_assignments ta
		JOIN groups g ON g.id = ta.group_id
		JOIN disciplines d ON d.id = ta.discipline_id
		JOIN users u ON u.id = ta.teacher_id`

	args := []any{}
	if teacherID > 0 {
		query += ` WHERE ta.teacher_id = ?`
		args = append(args, teacherID)
	}

	query += ` ORDER BY u.display_name, g.code, d.code`

	rows, err := r.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, MapSQLError(err)
	}
	defer rows.Close()

	views := make([]AssignmentView, 0)

	for rows.Next() {
		var view AssignmentView
		if err := rows.Scan(
			&view.ID,
			&view.GroupCode,
			&view.GroupTitle,
			&view.DisciplineCode,
			&view.DisciplineTitle,
			&view.TeacherName,
		); err != nil {
			return nil, MapSQLError(err)
		}

		views = append(views, view)
	}

	return views, MapSQLError(rows.Err())
}
