package storage

import (
	"context"
	"database/sql"
	"time"
)

// PeerReview — sandbox-ревью работы другого студента.
type PeerReview struct {
	ID                int64
	SubmissionID      int64
	AuthorID          int64
	ReviewerID        *int64
	CriteriaChecklist string
	Comments          string
	Status            string
	EscrowAmount      int
	RewardAmount      int
	CreatedAt         time.Time
	TakenAt           *time.Time
	CompletedAt       *time.Time
	ExpiresAt         time.Time
	EscrowLedgerID    int64
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

// NewPeerReviewRepo создаёт репозиторий peer-review.
func NewPeerReviewRepo(db *sql.DB) *PeerReviewRepo {
	return &PeerReviewRepo{db: db, ledger: NewXPLedgerRepo(db)}
}

// CreatePeerReviewInput — параметры вызова peer-review.
type CreatePeerReviewInput struct {
	SubmissionID      int64
	AuthorID          int64
	EscrowAmount      int
	ExpiresAt         time.Time
	CriteriaChecklist string
}

const peerReviewColumns = `id, submission_id, author_id, reviewer_id, criteria_checklist,
	comments, status, escrow_amount, reward_amount, created_at, taken_at, completed_at,
	expires_at`

// Create заводит peer-review и удерживает escrow автора.
// reward_amount приравнивается к escrow_amount: иной формулы в spec нет.
func (r *PeerReviewRepo) Create(ctx context.Context, tx *sql.Tx, in CreatePeerReviewInput) (*PeerReview, error) {
	row := tx.QueryRowContext(ctx,
		`INSERT INTO peer_reviews (submission_id, author_id, criteria_checklist, status,
		                           escrow_amount, reward_amount, expires_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?)
		 RETURNING `+peerReviewColumns,
		in.SubmissionID, in.AuthorID, in.CriteriaChecklist, PeerReviewStatusCreated,
		in.EscrowAmount, in.EscrowAmount, formatTime(in.ExpiresAt))

	review, err := scanPeerReview(row)
	if err != nil {
		return nil, MapSQLError(err)
	}

	sourceID := review.ID

	entry, err := r.ledger.Post(ctx, tx, PostLedgerInput{
		UserID:         in.AuthorID,
		Amount:         -in.EscrowAmount,
		Reason:         ReasonPenalty,
		SourceType:     SourcePeerReview,
		SourceID:       &sourceID,
		IdempotencyKey: peerEscrowKey(review.ID),
	})
	if err != nil {
		return nil, err
	}

	review.EscrowLedgerID = entry.ID

	return review, nil
}

// GetByID возвращает peer-review по идентификатору.
func (r *PeerReviewRepo) GetByID(ctx context.Context, id int64) (*PeerReview, error) {
	row := r.db.QueryRowContext(ctx,
		`SELECT `+peerReviewColumns+` FROM peer_reviews WHERE id = ?`, id)

	review, err := scanPeerReview(row)

	return review, MapSQLError(err)
}

// Claim закрепляет ревью за рецензентом, если оно ещё свободно и не истекло.
func (r *PeerReviewRepo) Claim(ctx context.Context, tx *sql.Tx, reviewID, reviewerID int64) (*PeerReview, error) {
	row := tx.QueryRowContext(ctx,
		`UPDATE peer_reviews
		 SET reviewer_id = ?, status = ?, taken_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
		 WHERE id = ? AND status = ? AND reviewer_id IS NULL
		 RETURNING `+peerReviewColumns,
		reviewerID, PeerReviewStatusInReview, reviewID, PeerReviewStatusCreated)

	review, err := scanPeerReview(row)
	if err != nil {
		return nil, MapSQLError(err)
	}

	return review, nil
}

// Complete закрывает ревью и выплачивает вознаграждение рецензенту.
func (r *PeerReviewRepo) Complete(ctx context.Context, tx *sql.Tx, reviewID, reviewerID int64, results string) (*PeerReview, error) {
	row := tx.QueryRowContext(ctx,
		`UPDATE peer_reviews
		 SET status = ?, comments = ?, completed_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
		 WHERE id = ? AND status = ? AND reviewer_id = ?
		 RETURNING `+peerReviewColumns,
		PeerReviewStatusCompleted, results, reviewID, PeerReviewStatusInReview, reviewerID)

	review, err := scanPeerReview(row)
	if err != nil {
		return nil, MapSQLError(err)
	}

	sourceID := review.ID

	entry, err := r.ledger.Post(ctx, tx, PostLedgerInput{
		UserID:         reviewerID,
		Amount:         review.RewardAmount,
		Reason:         ReasonPeerReviewReward,
		SourceType:     SourcePeerReview,
		SourceID:       &sourceID,
		IdempotencyKey: peerRewardKey(review.ID),
	})
	if err != nil {
		return nil, err
	}

	review.EscrowLedgerID = entry.ID

	return review, nil
}

// Expire закрывает просроченное ревью и возвращает escrow автору.
func (r *PeerReviewRepo) Expire(ctx context.Context, tx *sql.Tx, reviewID int64) (*PeerReview, error) {
	row := tx.QueryRowContext(ctx,
		`UPDATE peer_reviews
		 SET status = ?
		 WHERE id = ? AND status IN (?, ?)
		 RETURNING `+peerReviewColumns,
		PeerReviewStatusExpired, reviewID, PeerReviewStatusCreated, PeerReviewStatusInReview)

	review, err := scanPeerReview(row)
	if err != nil {
		return nil, MapSQLError(err)
	}

	sourceID := review.ID

	entry, err := r.ledger.Post(ctx, tx, PostLedgerInput{
		UserID:         review.AuthorID,
		Amount:         review.EscrowAmount,
		Reason:         ReasonAdminAdjustment,
		SourceType:     SourcePeerReview,
		SourceID:       &sourceID,
		IdempotencyKey: peerRefundKey(review.ID),
	})
	if err != nil {
		return nil, err
	}

	review.EscrowLedgerID = entry.ID

	return review, nil
}

// CountActiveByReviewer считает ревью рецензента, взятые и ещё не закрытые.
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

// scanPeerReview читает строку peer_reviews из row или rows.
func scanPeerReview(from row) (*PeerReview, error) {
	var (
		review               PeerReview
		reviewerID           sql.NullInt64
		comments             sql.NullString
		createdAt, expiresAt string
		takenAt, completedAt sql.NullString
	)

	if err := from.Scan(
		&review.ID,
		&review.SubmissionID,
		&review.AuthorID,
		&reviewerID,
		&review.CriteriaChecklist,
		&comments,
		&review.Status,
		&review.EscrowAmount,
		&review.RewardAmount,
		&createdAt,
		&takenAt,
		&completedAt,
		&expiresAt,
	); err != nil {
		return nil, err
	}

	review.ReviewerID = scanInt64Ptr(reviewerID)
	review.Comments = scanString(comments)

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
