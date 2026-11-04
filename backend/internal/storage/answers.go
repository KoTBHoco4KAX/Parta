package storage

import (
	"context"
	"database/sql"
	"time"

	domainerrors "github.com/parta/backend/internal/domain/errors"
)

// AnswerDraft — черновик ученика, отправленный в пул «Ответов».
type AnswerDraft struct {
	ID             int64
	SubmissionID   int64
	TaskID         int64
	AuthorID       int64
	Text           string
	AttachmentURL  string
	AttachmentName string
	EscrowPercent  int
	EscrowPoolXP   int
	Status         string
	CreatedAt      time.Time
	SettledAt      *time.Time
	CommentsCount  int
}

// AnswerComment — комментарий проверяющего.
type AnswerComment struct {
	ID             int64
	DraftID        int64
	ReviewerID     int64
	Text           string
	Reaction       string
	PayoutPercent  int
	RewardLedgerID *int64
	CreatedAt      time.Time
}

// AnswerTaskOption — активная карточка ученика для выпадающего списка.
type AnswerTaskOption struct {
	SubmissionID  int64
	TaskID        int64
	TaskTitle     string
	TaskType      string
	DeadlineAt    time.Time
	BaseXP        int
	EscrowPercent int
	EscrowPoolXP  int
	DraftStatus   string
}

// AnswerDraftView — черновик вместе с названием задания.
type AnswerDraftView struct {
	Draft     AnswerDraft
	TaskTitle string
	TaskType  string
	Comments  []AnswerComment
}

// AnswerReviewView — комментарий проверяющего вместе с заданием.
type AnswerReviewView struct {
	Comment     AnswerComment
	TaskTitle   string
	DraftStatus string
}

// AnswerRepo — доступ к таблицам answer_drafts и answer_comments.
type AnswerRepo struct {
	db *sql.DB
}

// NewAnswerRepo создаёт репозиторий «Ответов».
func NewAnswerRepo(db *sql.DB) *AnswerRepo {
	return &AnswerRepo{db: db}
}

const answerDraftColumns = `d.id, d.submission_id, d.task_id, d.author_id, d.text,
	d.attachment_url, d.attachment_name, d.escrow_percent, d.escrow_pool_xp,
	d.status, d.created_at, d.settled_at`

const answerDraftReturning = `id, submission_id, task_id, author_id, text,
	attachment_url, attachment_name, escrow_percent, escrow_pool_xp,
	status, created_at, settled_at`

const answerCommentColumns = `c.id, c.draft_id, c.reviewer_id, c.text, c.reaction,
	c.payout_percent, c.reward_ledger_id, c.created_at`

const answerCommentReturning = `id, draft_id, reviewer_id, text, reaction,
	payout_percent, reward_ledger_id, created_at`

// CountDraftsSince считает обращения автора в «Ответы» с указанного момента.
func (r *AnswerRepo) CountDraftsSince(ctx context.Context, authorID int64, since time.Time) (int, error) {
	var count int

	err := r.db.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM answer_drafts WHERE author_id = ? AND created_at >= ?`,
		authorID, FormatTimestamp(since)).Scan(&count)
	if err != nil {
		return 0, MapSQLError(err)
	}

	return count, nil
}

// GetActiveBySubmission возвращает активный черновик карточки, если он есть.
func (r *AnswerRepo) GetActiveBySubmission(ctx context.Context, submissionID int64) (*AnswerDraft, error) {
	row := r.db.QueryRowContext(ctx,
		`SELECT `+answerDraftColumns+`,
		        (SELECT COUNT(*) FROM answer_comments c WHERE c.draft_id = d.id)
		 FROM answer_drafts d
		 WHERE d.submission_id = ? AND d.status IN ('OPEN','COLLECTED')`,
		submissionID)

	draft, err := scanAnswerDraft(row)

	return draft, MapSQLError(err)
}

// CountComments возвращает число комментариев черновика.
func (r *AnswerRepo) CountComments(ctx context.Context, draftID int64) (int, error) {
	var count int

	err := r.db.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM answer_comments WHERE draft_id = ?`, draftID).Scan(&count)
	if err != nil {
		return 0, MapSQLError(err)
	}

	return count, nil
}

// CreateDraftTx закрывает предыдущий активный черновик и создаёт новый.
func (r *AnswerRepo) CreateDraftTx(ctx context.Context, tx *sql.Tx, draft AnswerDraft) (*AnswerDraft, error) {
	if _, err := tx.ExecContext(ctx,
		`UPDATE answer_drafts SET status = 'CLOSED', settled_at = ?
		 WHERE submission_id = ? AND status IN ('OPEN','COLLECTED')`,
		FormatTimestamp(time.Now().UTC()), draft.SubmissionID); err != nil {
		return nil, MapSQLError(err)
	}

	row := tx.QueryRowContext(ctx,
		`INSERT INTO answer_drafts (
		    submission_id, task_id, author_id, text, attachment_url, attachment_name,
		    escrow_percent, escrow_pool_xp, status
		 ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'OPEN')
		 RETURNING `+answerDraftReturning+`, 0`,
		draft.SubmissionID, draft.TaskID, draft.AuthorID, draft.Text,
		draft.AttachmentURL, draft.AttachmentName, draft.EscrowPercent, draft.EscrowPoolXP)

	created, err := scanAnswerDraft(row)

	return created, MapSQLError(err)
}

// ListTaskOptions возвращает активные карточки ученика для выбора задачи.
func (r *AnswerRepo) ListTaskOptions(ctx context.Context, studentID int64) ([]AnswerTaskOption, error) {
	rows, err := r.db.QueryContext(ctx,
		`SELECT s.id, t.id, t.title, t.task_type, t.deadline_at, t.base_xp_computed,
		        COALESCE(d.status, '')
		 FROM submissions s
		 JOIN tasks t ON t.id = s.task_id
		 LEFT JOIN answer_drafts d
		        ON d.submission_id = s.id AND d.status IN ('OPEN','COLLECTED')
		 WHERE s.student_id = ? AND s.status = 'IN_PROGRESS'
		 ORDER BY t.deadline_at`,
		studentID)
	if err != nil {
		return nil, MapSQLError(err)
	}
	defer rows.Close()

	options := make([]AnswerTaskOption, 0)

	for rows.Next() {
		var (
			option      AnswerTaskOption
			deadlineRaw string
		)

		if err := rows.Scan(&option.SubmissionID, &option.TaskID, &option.TaskTitle,
			&option.TaskType, &deadlineRaw, &option.BaseXP, &option.DraftStatus); err != nil {
			return nil, MapSQLError(err)
		}

		option.DeadlineAt, err = parseTime(deadlineRaw)
		if err != nil {
			return nil, err
		}

		options = append(options, option)
	}

	return options, MapSQLError(rows.Err())
}

// ListAuthorDrafts возвращает черновики автора с комментариями.
func (r *AnswerRepo) ListAuthorDrafts(ctx context.Context, authorID int64) ([]AnswerDraftView, error) {
	rows, err := r.db.QueryContext(ctx,
		`SELECT `+answerDraftColumns+`, t.title, t.task_type,
		        (SELECT COUNT(*) FROM answer_comments c WHERE c.draft_id = d.id)
		 FROM answer_drafts d
		 JOIN tasks t ON t.id = d.task_id
		 WHERE d.author_id = ?
		 ORDER BY d.created_at DESC`,
		authorID)
	if err != nil {
		return nil, MapSQLError(err)
	}
	defer rows.Close()

	views := make([]AnswerDraftView, 0)

	for rows.Next() {
		var (
			draft      AnswerDraft
			title      string
			taskType   string
			createdRaw string
			settledRaw sql.NullString
		)

		if err := rows.Scan(&draft.ID, &draft.SubmissionID, &draft.TaskID, &draft.AuthorID,
			&draft.Text, &draft.AttachmentURL, &draft.AttachmentName, &draft.EscrowPercent,
			&draft.EscrowPoolXP, &draft.Status, &createdRaw, &settledRaw,
			&title, &taskType, &draft.CommentsCount); err != nil {
			return nil, MapSQLError(err)
		}

		draft.CreatedAt, err = parseTime(createdRaw)
		if err != nil {
			return nil, err
		}

		if settledRaw.Valid {
			settled, err := parseTime(settledRaw.String)
			if err != nil {
				return nil, err
			}

			draft.SettledAt = &settled
		}

		views = append(views, AnswerDraftView{Draft: draft, TaskTitle: title, TaskType: taskType})
	}

	if err := rows.Err(); err != nil {
		return nil, MapSQLError(err)
	}

	for i := range views {
		comments, err := r.ListComments(ctx, views[i].Draft.ID)
		if err != nil {
			return nil, err
		}

		views[i].Comments = comments
	}

	return views, nil
}

// ListComments возвращает комментарии черновика.
func (r *AnswerRepo) ListComments(ctx context.Context, draftID int64) ([]AnswerComment, error) {
	rows, err := r.db.QueryContext(ctx,
		`SELECT `+answerCommentColumns+`
		 FROM answer_comments c
		 WHERE c.draft_id = ?
		 ORDER BY c.created_at`,
		draftID)
	if err != nil {
		return nil, MapSQLError(err)
	}
	defer rows.Close()

	return scanAnswerComments(rows)
}

// ListCommentsTx возвращает комментарии черновика внутри транзакции.
func (r *AnswerRepo) ListCommentsTx(ctx context.Context, tx *sql.Tx, draftID int64) ([]AnswerComment, error) {
	rows, err := tx.QueryContext(ctx,
		`SELECT `+answerCommentColumns+`
		 FROM answer_comments c
		 WHERE c.draft_id = ?
		 ORDER BY c.created_at`,
		draftID)
	if err != nil {
		return nil, MapSQLError(err)
	}
	defer rows.Close()

	return scanAnswerComments(rows)
}

// ListReviewerComments возвращает проверки, которые сделал ученик.
func (r *AnswerRepo) ListReviewerComments(ctx context.Context, reviewerID int64) ([]AnswerReviewView, error) {
	rows, err := r.db.QueryContext(ctx,
		`SELECT `+answerCommentColumns+`, t.title, d.status
		 FROM answer_comments c
		 JOIN answer_drafts d ON d.id = c.draft_id
		 JOIN tasks t ON t.id = d.task_id
		 WHERE c.reviewer_id = ?
		 ORDER BY c.created_at DESC`,
		reviewerID)
	if err != nil {
		return nil, MapSQLError(err)
	}
	defer rows.Close()

	views := make([]AnswerReviewView, 0)

	for rows.Next() {
		var (
			comment     AnswerComment
			createdRaw  string
			ledgerID    sql.NullInt64
			title       string
			draftStatus string
		)

		if err := rows.Scan(&comment.ID, &comment.DraftID, &comment.ReviewerID,
			&comment.Text, &comment.Reaction, &comment.PayoutPercent, &ledgerID,
			&createdRaw, &title, &draftStatus); err != nil {
			return nil, MapSQLError(err)
		}

		comment.CreatedAt, err = parseTime(createdRaw)
		if err != nil {
			return nil, err
		}

		comment.RewardLedgerID = scanInt64Ptr(ledgerID)
		views = append(views, AnswerReviewView{
			Comment:     comment,
			TaskTitle:   title,
			DraftStatus: draftStatus,
		})
	}

	return views, MapSQLError(rows.Err())
}

// NextDraftForReviewer выбирает случайную чужую работу, у которой ещё нет двух
// комментариев и которую этот ученик ещё не проверял.
func (r *AnswerRepo) NextDraftForReviewer(ctx context.Context, reviewerID int64) (*AnswerDraftView, error) {
	row := r.db.QueryRowContext(ctx,
		`SELECT `+answerDraftColumns+`, t.title, t.task_type,
		        (SELECT COUNT(*) FROM answer_comments c WHERE c.draft_id = d.id)
		 FROM answer_drafts d
		 JOIN tasks t ON t.id = d.task_id
		 WHERE d.status = 'OPEN'
		   AND d.author_id <> ?
		   AND (SELECT COUNT(*) FROM answer_comments c WHERE c.draft_id = d.id) < 2
		   AND NOT EXISTS (
		       SELECT 1 FROM answer_comments c
		       WHERE c.draft_id = d.id AND c.reviewer_id = ?
		   )
		 ORDER BY RANDOM()
		 LIMIT 1`,
		reviewerID, reviewerID)

	var (
		draft      AnswerDraft
		title      string
		taskType   string
		createdRaw string
		settledRaw sql.NullString
	)

	err := row.Scan(&draft.ID, &draft.SubmissionID, &draft.TaskID, &draft.AuthorID,
		&draft.Text, &draft.AttachmentURL, &draft.AttachmentName, &draft.EscrowPercent,
		&draft.EscrowPoolXP, &draft.Status, &createdRaw, &settledRaw,
		&title, &taskType, &draft.CommentsCount)
	if err != nil {
		return nil, MapSQLError(err)
	}

	draft.CreatedAt, err = parseTime(createdRaw)
	if err != nil {
		return nil, err
	}

	return &AnswerDraftView{Draft: draft, TaskTitle: title, TaskType: taskType}, nil
}

// AddCommentTx добавляет комментарий и закрывает сбор после второго.
func (r *AnswerRepo) AddCommentTx(
	ctx context.Context,
	tx *sql.Tx,
	draftID, reviewerID int64,
	text string,
) (*AnswerComment, error) {
	var (
		authorID int64
		status   string
	)

	err := tx.QueryRowContext(ctx,
		`SELECT author_id, status FROM answer_drafts WHERE id = ?`, draftID).
		Scan(&authorID, &status)
	if err != nil {
		return nil, MapSQLError(err)
	}

	if authorID == reviewerID {
		return nil, domainerrors.ErrForbidden
	}

	if status != "OPEN" {
		return nil, domainerrors.ErrInvalidTransition
	}

	var count int

	if err := tx.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM answer_comments WHERE draft_id = ?`, draftID).Scan(&count); err != nil {
		return nil, MapSQLError(err)
	}

	if count >= 2 {
		return nil, domainerrors.ErrAlreadyExists
	}

	row := tx.QueryRowContext(ctx,
		`INSERT INTO answer_comments (draft_id, reviewer_id, text)
		 VALUES (?, ?, ?)
		 RETURNING `+answerCommentReturning,
		draftID, reviewerID, text)

	comment, err := scanAnswerComment(row)
	if err != nil {
		return nil, MapSQLError(err)
	}

	if count+1 >= 2 {
		if _, err := tx.ExecContext(ctx,
			`UPDATE answer_drafts SET status = 'COLLECTED' WHERE id = ?`, draftID); err != nil {
			return nil, MapSQLError(err)
		}
	}

	return comment, nil
}

// SetReactionTx сохраняет лайк/жалобу автора на комментарий.
func (r *AnswerRepo) SetReactionTx(
	ctx context.Context,
	tx *sql.Tx,
	commentID, authorID int64,
	reaction string,
) (*AnswerComment, error) {
	var (
		draftID int64
		ownerID int64
		status  string
	)

	err := tx.QueryRowContext(ctx,
		`SELECT c.draft_id, d.author_id, d.status
		 FROM answer_comments c
		 JOIN answer_drafts d ON d.id = c.draft_id
		 WHERE c.id = ?`,
		commentID).Scan(&draftID, &ownerID, &status)
	if err != nil {
		return nil, MapSQLError(err)
	}

	if ownerID != authorID {
		return nil, domainerrors.ErrForbidden
	}

	if status != "COLLECTED" {
		return nil, domainerrors.ErrInvalidTransition
	}

	row := tx.QueryRowContext(ctx,
		`UPDATE answer_comments SET reaction = ? WHERE id = ?
		 RETURNING `+answerCommentReturning,
		reaction, commentID)

	comment, err := scanAnswerComment(row)

	return comment, MapSQLError(err)
}

// GetDraftBySubmissionTx возвращает активный черновик сдачи внутри транзакции.
func (r *AnswerRepo) GetDraftBySubmissionTx(ctx context.Context, tx *sql.Tx, submissionID int64) (*AnswerDraft, error) {
	row := tx.QueryRowContext(ctx,
		`SELECT `+answerDraftColumns+`,
		        (SELECT COUNT(*) FROM answer_comments c WHERE c.draft_id = d.id)
		 FROM answer_drafts d
		 WHERE d.submission_id = ? AND d.status IN ('OPEN','COLLECTED')`,
		submissionID)

	draft, err := scanAnswerDraft(row)
	if err != nil {
		if domainerrors.IsSentinel(MapSQLError(err), domainerrors.ErrNotFound) {
			return nil, nil
		}

		return nil, MapSQLError(err)
	}

	return draft, nil
}

// MarkSettled закрывает черновик после вердикта преподавателя.
func (r *AnswerRepo) MarkSettled(
	ctx context.Context,
	tx *sql.Tx,
	draftID int64,
	status string,
	at time.Time,
) error {
	_, err := tx.ExecContext(ctx,
		`UPDATE answer_drafts SET status = ?, settled_at = ? WHERE id = ?`,
		status, FormatTimestamp(at), draftID)

	return MapSQLError(err)
}

// MarkCommentPayout сохраняет долю и проводку награды комментария.
func (r *AnswerRepo) MarkCommentPayout(
	ctx context.Context,
	tx *sql.Tx,
	commentID int64,
	percent int,
	ledgerID *int64,
) error {
	_, err := tx.ExecContext(ctx,
		`UPDATE answer_comments SET payout_percent = ?, reward_ledger_id = ? WHERE id = ?`,
		percent, ledgerID, commentID)

	return MapSQLError(err)
}

// AddWeeklyXP увеличивает недельный счётчик, сбрасывая его в новый понедельник.
func (r *AnswerRepo) AddWeeklyXP(ctx context.Context, tx *sql.Tx, userID int64, amount int, weekStart time.Time) error {
	key := weekStart.Format("2006-01-02")

	_, err := tx.ExecContext(ctx,
		`UPDATE users
		 SET weekly_xp = CASE WHEN weekly_xp_week = ? THEN weekly_xp + ? ELSE ? END,
		     weekly_xp_week = ?,
		     updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
		 WHERE id = ?`,
		key, amount, amount, key, userID)

	return MapSQLError(err)
}

// scanAnswerDraft читает строку черновика.
func scanAnswerDraft(row interface{ Scan(...any) error }) (*AnswerDraft, error) {
	var (
		draft      AnswerDraft
		createdRaw string
		settledRaw sql.NullString
	)

	err := row.Scan(&draft.ID, &draft.SubmissionID, &draft.TaskID, &draft.AuthorID,
		&draft.Text, &draft.AttachmentURL, &draft.AttachmentName, &draft.EscrowPercent,
		&draft.EscrowPoolXP, &draft.Status, &createdRaw, &settledRaw, &draft.CommentsCount)
	if err != nil {
		return nil, err
	}

	draft.CreatedAt, err = parseTime(createdRaw)
	if err != nil {
		return nil, err
	}

	if settledRaw.Valid {
		settled, err := parseTime(settledRaw.String)
		if err != nil {
			return nil, err
		}

		draft.SettledAt = &settled
	}

	return &draft, nil
}

// scanAnswerComment читает строку комментария.
func scanAnswerComment(row interface{ Scan(...any) error }) (*AnswerComment, error) {
	var (
		comment    AnswerComment
		createdRaw string
		ledgerID   sql.NullInt64
	)

	err := row.Scan(&comment.ID, &comment.DraftID, &comment.ReviewerID, &comment.Text,
		&comment.Reaction, &comment.PayoutPercent, &ledgerID, &createdRaw)
	if err != nil {
		return nil, err
	}

	comment.CreatedAt, err = parseTime(createdRaw)
	if err != nil {
		return nil, err
	}

	comment.RewardLedgerID = scanInt64Ptr(ledgerID)

	return &comment, nil
}

// scanAnswerComments читает набор комментариев.
func scanAnswerComments(rows *sql.Rows) ([]AnswerComment, error) {
	comments := make([]AnswerComment, 0)

	for rows.Next() {
		comment, err := scanAnswerComment(rows)
		if err != nil {
			return nil, MapSQLError(err)
		}

		comments = append(comments, *comment)
	}

	return comments, MapSQLError(rows.Err())
}
