package storage

import (
	"context"
	"database/sql"
	"time"
)

// maxPeerCommentRunes — длина комментария рецензента в рунах.
const maxPeerCommentRunes = 100

// PeerReview — взаимопроверка работы другого ученика: оценка 1–5 и короткий
// комментарий. Без файлов и без escrow: автор не платит XP за проверку.
type PeerReview struct {
	ID             int64
	SubmissionID   int64
	AuthorID       int64
	ReviewerID     *int64
	Status         string
	Grade          *int
	Comment        string
	CreatedAt      time.Time
	TakenAt        *time.Time
	CompletedAt    *time.Time
	ExpiresAt      time.Time
	RewardLedgerID *int64
}

// Состояния peer-review (CHECK в peer_reviews.status).
const (
	PeerReviewStatusCreated   = "CREATED"
	PeerReviewStatusInReview  = "IN_REVIEW"
	PeerReviewStatusCompleted = "COMPLETED"
	PeerReviewStatusExpired   = "EXPIRED"
)

// PeerReviewRepo — доступ к таблице peer_reviews.
type PeerReviewRepo struct {
	db     *sql.DB
	ledger *XPLedgerRepo
}

// NewPeerReviewRepo создаёт репозиторий взаимопроверки.
func NewPeerReviewRepo(db *sql.DB) *PeerReviewRepo {
	return &PeerReviewRepo{db: db, ledger: NewXPLedgerRepo(db)}
}

// CreatePeerReviewInput — параметры запроса на взаимопроверку.
type CreatePeerReviewInput struct {
	SubmissionID int64
	AuthorID     int64
	ExpiresAt    time.Time
}

const peerReviewColumns = `id, submission_id, author_id, reviewer_id, status, grade,
	comment, created_at, taken_at, completed_at, expires_at, reward_ledger_id`

// Create заводит запрос на взаимопроверку без списаний XP.
func (r *PeerReviewRepo) Create(ctx context.Context, tx *sql.Tx, in CreatePeerReviewInput) (*PeerReview, error) {
	row := tx.QueryRowContext(ctx,
		`INSERT INTO peer_reviews (submission_id, author_id, status, expires_at)
		 VALUES (?, ?, ?, ?)
		 RETURNING `+peerReviewColumns,
		in.SubmissionID, in.AuthorID, PeerReviewStatusCreated, formatTime(in.ExpiresAt))

	review, err := scanPeerReview(row)

	return review, MapSQLError(err)
}

// GetByID возвращает запрос на взаимопроверку по идентификатору.
func (r *PeerReviewRepo) GetByID(ctx context.Context, id int64) (*PeerReview, error) {
	row := r.db.QueryRowContext(ctx,
		`SELECT `+peerReviewColumns+` FROM peer_reviews WHERE id = ?`, id)

	review, err := scanPeerReview(row)

	return review, MapSQLError(err)
}

// Claim закрепляет проверку за рецензентом, если она ещё свободна.
func (r *PeerReviewRepo) Claim(ctx context.Context, tx *sql.Tx, reviewID, reviewerID int64) (*PeerReview, error) {
	row := tx.QueryRowContext(ctx,
		`UPDATE peer_reviews
		 SET reviewer_id = ?, status = ?, taken_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
		 WHERE id = ? AND status = ? AND reviewer_id IS NULL
		 RETURNING `+peerReviewColumns,
		reviewerID, PeerReviewStatusInReview, reviewID, PeerReviewStatusCreated)

	review, err := scanPeerReview(row)

	return review, MapSQLError(err)
}

// Complete закрывает проверку: фиксирует оценку и комментарий. XP рецензенту
// пока не начисляется — награда приходит после вердикта преподавателя.
func (r *PeerReviewRepo) Complete(
	ctx context.Context,
	tx *sql.Tx,
	reviewID, reviewerID int64,
	grade int,
	comment string,
) (*PeerReview, error) {
	row := tx.QueryRowContext(ctx,
		`UPDATE peer_reviews
		 SET status = ?, grade = ?, comment = ?,
		     completed_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
		 WHERE id = ? AND status = ? AND reviewer_id = ?
		 RETURNING `+peerReviewColumns,
		PeerReviewStatusCompleted, grade, comment, reviewID, PeerReviewStatusInReview, reviewerID)

	review, err := scanPeerReview(row)

	return review, MapSQLError(err)
}

// RewardReviewer начисляет рецензенту награду после того, как преподаватель
// принял работу. Идемпотентно: повторный вызов возвращает уже выписанную награду.
func (r *PeerReviewRepo) RewardReviewer(
	ctx context.Context,
	tx *sql.Tx,
	review *PeerReview,
	amount int,
) (*LedgerEntry, error) {
	if review.RewardLedgerID != nil {
		return r.ledger.GetByID(ctx, tx, *review.RewardLedgerID)
	}

	sourceID := review.ID

	entry, err := r.ledger.Post(ctx, tx, PostLedgerInput{
		UserID:         *review.ReviewerID,
		Amount:         amount,
		Reason:         ReasonPeerReviewReward,
		SourceType:     SourcePeerReview,
		SourceID:       &sourceID,
		IdempotencyKey: peerRewardKey(review.ID),
	})
	if err != nil {
		return nil, err
	}

	if _, err := tx.ExecContext(ctx,
		`UPDATE peer_reviews SET reward_ledger_id = ? WHERE id = ?`,
		entry.ID, review.ID); err != nil {
		return nil, MapSQLError(err)
	}

	review.RewardLedgerID = &entry.ID

	return entry, nil
}

// Expire закрывает просроченную проверку без выплат.
func (r *PeerReviewRepo) Expire(ctx context.Context, tx *sql.Tx, reviewID int64) (*PeerReview, error) {
	row := tx.QueryRowContext(ctx,
		`UPDATE peer_reviews
		 SET status = ?
		 WHERE id = ? AND status IN (?, ?)
		 RETURNING `+peerReviewColumns,
		PeerReviewStatusExpired, reviewID, PeerReviewStatusCreated, PeerReviewStatusInReview)

	review, err := scanPeerReview(row)

	return review, MapSQLError(err)
}

// CountActiveByReviewer считает проверки рецензента, взятые и ещё не закрытые.
func (r *PeerReviewRepo) CountActiveByReviewer(ctx context.Context, reviewerID int64) (int, error) {
	row := r.db.QueryRowContext(ctx,
		`SELECT COUNT(1) FROM peer_reviews WHERE reviewer_id = ? AND status = ?`,
		reviewerID, PeerReviewStatusInReview)

	var count int

	if err := row.Scan(&count); err != nil {
		return 0, MapSQLError(err)
	}

	return count, nil
}

// CountCompletedByReviewer считает завершённые проверки рецензента.
func (r *PeerReviewRepo) CountCompletedByReviewer(ctx context.Context, reviewerID int64) (int, error) {
	row := r.db.QueryRowContext(ctx,
		`SELECT COUNT(1) FROM peer_reviews WHERE reviewer_id = ? AND status = ?`,
		reviewerID, PeerReviewStatusCompleted)

	var count int

	if err := row.Scan(&count); err != nil {
		return 0, MapSQLError(err)
	}

	return count, nil
}

// GetCompletedBySubmission возвращает завершённую проверку работы. Чтение идёт
// через *sql.DB — вызывать строго до BeginTx: пул ограничен одним соединением.
func (r *PeerReviewRepo) GetCompletedBySubmission(ctx context.Context, submissionID int64) (*PeerReview, error) {
	row := r.db.QueryRowContext(ctx,
		`SELECT `+peerReviewColumns+`
		 FROM peer_reviews
		 WHERE submission_id = ? AND status = ?
		 ORDER BY id DESC
		 LIMIT 1`, submissionID, PeerReviewStatusCompleted)

	review, err := scanPeerReview(row)

	return review, MapSQLError(err)
}

// HasCompletedForSubmission сообщает, есть ли у работы завершённая проверка.
func (r *PeerReviewRepo) HasCompletedForSubmission(ctx context.Context, submissionID int64) (bool, error) {
	var exists int

	err := r.db.QueryRowContext(ctx,
		`SELECT COUNT(1) FROM peer_reviews WHERE submission_id = ? AND status = ?`,
		submissionID, PeerReviewStatusCompleted).Scan(&exists)
	if err != nil {
		return false, MapSQLError(err)
	}

	return exists > 0, nil
}

// scanPeerReview читает строку peer_reviews из row или rows.
func scanPeerReview(from row) (*PeerReview, error) {
	var (
		review         PeerReview
		reviewerID     sql.NullInt64
		grade          sql.NullInt64
		comment        sql.NullString
		createdAt      string
		expiresAt      string
		takenAt        sql.NullString
		completedAt    sql.NullString
		rewardLedgerID sql.NullInt64
	)

	if err := from.Scan(
		&review.ID,
		&review.SubmissionID,
		&review.AuthorID,
		&reviewerID,
		&review.Status,
		&grade,
		&comment,
		&createdAt,
		&takenAt,
		&completedAt,
		&expiresAt,
		&rewardLedgerID,
	); err != nil {
		return nil, err
	}

	review.ReviewerID = scanInt64Ptr(reviewerID)
	review.RewardLedgerID = scanInt64Ptr(rewardLedgerID)
	review.Comment = scanString(comment)

	if grade.Valid {
		value := int(grade.Int64)
		review.Grade = &value
	}

	var err error

	if review.CreatedAt, err = parseTime(createdAt); err != nil {
		return nil, err
	}

	if review.ExpiresAt, err = parseTime(expiresAt); err != nil {
		return nil, err
	}

	if review.TakenAt, err = scanTime(takenAt); err != nil {
		return nil, err
	}

	if review.CompletedAt, err = scanTime(completedAt); err != nil {
		return nil, err
	}

	return &review, nil
}

// ValidPeerGrade проверяет оценку взаимопроверки.
func ValidPeerGrade(grade int) bool {
	return grade >= 1 && grade <= 5
}

// ValidPeerComment проверяет комментарий: непустой и не длиннее лимита.
func ValidPeerComment(comment string) bool {
	return len([]rune(comment)) > 0 && len([]rune(comment)) <= maxPeerCommentRunes
}
