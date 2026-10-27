package storage

import (
	"context"
	"testing"
	"time"

	domainerrors "github.com/parta/backend/internal/domain/errors"
)

func TestPeerReviewRepoFullCycle(t *testing.T) {
	db := testDB(t)
	ids := seed(t, db)
	repo := NewPeerReviewRepo(db)
	submissions := NewSubmissionRepo(db)

	topUpXP(t, db, ids.student1, 500)

	sub := createSubmission(t, db, ids.taskLab, ids.student2)

	created := createPeerReview(t, db, repo, sub.ID, ids.student1, 80)

	if created.Status != PeerReviewStatusCreated {
		t.Fatalf("Status = %q, want CREATED", created.Status)
	}

	if created.EscrowAmount != 80 || created.RewardAmount != 80 {
		t.Fatalf("escrow/reward = %d/%d, want 80/80", created.EscrowAmount, created.RewardAmount)
	}

	if created.EscrowLedgerID == 0 {
		t.Fatal("EscrowLedgerID must reference the escrow hold")
	}

	author, err := NewUserRepo(db).GetByID(context.Background(), ids.student1)
	if err != nil {
		t.Fatalf("GetByID(author): %v", err)
	}

	if author.XPBalance != 420 {
		t.Fatalf("author balance = %d, want 420 after escrow", author.XPBalance)
	}

	if _, err := submissions.GetByID(context.Background(), sub.ID); err != nil {
		t.Fatalf("submission must remain readable: %v", err)
	}

	// CREATED → IN_REVIEW
	tx := testTx(t, db)

	claimed, err := repo.Claim(context.Background(), tx, created.ID, ids.student3)
	if err != nil {
		t.Fatalf("Claim: %v", err)
	}

	if claimed.Status != PeerReviewStatusInReview {
		t.Fatalf("Status = %q, want IN_REVIEW", claimed.Status)
	}

	if claimed.ReviewerID == nil || *claimed.ReviewerID != ids.student3 {
		t.Fatalf("ReviewerID = %v, want %d", claimed.ReviewerID, ids.student3)
	}

	if claimed.TakenAt == nil {
		t.Fatal("TakenAt must be set")
	}

	if err := tx.Commit(); err != nil {
		t.Fatalf("commit claim: %v", err)
	}

	// IN_REVIEW → COMPLETED
	tx2 := testTx(t, db)

	completed, err := repo.Complete(context.Background(), tx2, created.ID, ids.student3,
		`[{"code":"C1","passed":true}]`)
	if err != nil {
		t.Fatalf("Complete: %v", err)
	}

	if completed.Status != PeerReviewStatusCompleted {
		t.Fatalf("Status = %q, want COMPLETED", completed.Status)
	}

	if completed.CompletedAt == nil {
		t.Fatal("CompletedAt must be set")
	}

	if err := tx2.Commit(); err != nil {
		t.Fatalf("commit complete: %v", err)
	}

	reviewer, err := NewUserRepo(db).GetByID(context.Background(), ids.student3)
	if err != nil {
		t.Fatalf("GetByID(reviewer): %v", err)
	}

	if reviewer.XPBalance != 80 {
		t.Fatalf("reviewer balance = %d, want reward 80", reviewer.XPBalance)
	}
}

func TestPeerReviewRepoCreateWithoutXP(t *testing.T) {
	db := testDB(t)
	ids := seed(t, db)
	repo := NewPeerReviewRepo(db)

	sub := createSubmission(t, db, ids.taskLab, ids.student2)

	tx := testTx(t, db)

	_, err := repo.Create(context.Background(), tx, CreatePeerReviewInput{
		SubmissionID:      sub.ID,
		AuthorID:          ids.student1,
		EscrowAmount:      80,
		ExpiresAt:         time.Date(2027, 12, 20, 18, 0, 0, 0, time.UTC),
		CriteriaChecklist: `[]`,
	})
	if !domainerrors.IsSentinel(err, domainerrors.ErrInsufficientXP) {
		t.Fatalf("err = %v, want ErrInsufficientXP", err)
	}

	if err := tx.Rollback(); err != nil {
		t.Fatalf("rollback: %v", err)
	}
}

func TestPeerReviewRepoClaimTwiceFails(t *testing.T) {
	db := testDB(t)
	ids := seed(t, db)
	repo := NewPeerReviewRepo(db)

	topUpXP(t, db, ids.student1, 500)

	sub := createSubmission(t, db, ids.taskLab, ids.student2)
	created := createPeerReview(t, db, repo, sub.ID, ids.student1, 80)

	claimReview(t, db, repo, created.ID, ids.student3)

	tx := testTx(t, db)

	if _, err := repo.Claim(context.Background(), tx, created.ID, ids.student2); !domainerrors.IsSentinel(err, domainerrors.ErrNotFound) {
		t.Fatalf("err = %v, want ErrNotFound for an already claimed review", err)
	}
}

func TestPeerReviewRepoClaimByWrongReviewerFails(t *testing.T) {
	db := testDB(t)
	ids := seed(t, db)
	repo := NewPeerReviewRepo(db)

	topUpXP(t, db, ids.student1, 500)

	sub := createSubmission(t, db, ids.taskLab, ids.student2)
	created := createPeerReview(t, db, repo, sub.ID, ids.student1, 80)

	claimReview(t, db, repo, created.ID, ids.student3)

	tx := testTx(t, db)

	if _, err := repo.Complete(context.Background(), tx, created.ID, ids.student2, `[]`); !domainerrors.IsSentinel(err, domainerrors.ErrNotFound) {
		t.Fatalf("err = %v, want ErrNotFound when another student completes", err)
	}
}

func TestPeerReviewRepoExpireRefundsAuthor(t *testing.T) {
	db := testDB(t)
	ids := seed(t, db)
	repo := NewPeerReviewRepo(db)

	topUpXP(t, db, ids.student1, 500)

	sub := createSubmission(t, db, ids.taskLab, ids.student2)
	created := createPeerReview(t, db, repo, sub.ID, ids.student1, 80)

	tx := testTx(t, db)

	expired, err := repo.Expire(context.Background(), tx, created.ID)
	if err != nil {
		t.Fatalf("Expire: %v", err)
	}

	if expired.Status != PeerReviewStatusExpired {
		t.Fatalf("Status = %q, want EXPIRED", expired.Status)
	}

	if err := tx.Commit(); err != nil {
		t.Fatalf("commit: %v", err)
	}

	author, err := NewUserRepo(db).GetByID(context.Background(), ids.student1)
	if err != nil {
		t.Fatalf("GetByID(author): %v", err)
	}

	if author.XPBalance != 500 {
		t.Fatalf("author balance = %d, want 500 after refund", author.XPBalance)
	}
}

func TestPeerReviewRepoExpireTerminalFails(t *testing.T) {
	db := testDB(t)
	ids := seed(t, db)
	repo := NewPeerReviewRepo(db)

	topUpXP(t, db, ids.student1, 500)

	sub := createSubmission(t, db, ids.taskLab, ids.student2)
	created := createPeerReview(t, db, repo, sub.ID, ids.student1, 80)

	expireReview(t, db, repo, created.ID)

	tx := testTx(t, db)

	if _, err := repo.Expire(context.Background(), tx, created.ID); !domainerrors.IsSentinel(err, domainerrors.ErrNotFound) {
		t.Fatalf("err = %v, want ErrNotFound on already expired review", err)
	}
}

func TestPeerReviewRepoCountActiveByReviewer(t *testing.T) {
	db := testDB(t)
	ids := seed(t, db)
	repo := NewPeerReviewRepo(db)

	topUpXP(t, db, ids.student1, 500)

	sub := createSubmission(t, db, ids.taskLab, ids.student2)
	created := createPeerReview(t, db, repo, sub.ID, ids.student1, 80)

	count, err := repo.CountActiveByReviewer(context.Background(), ids.student3)
	if err != nil {
		t.Fatalf("CountActiveByReviewer: %v", err)
	}

	if count != 0 {
		t.Fatalf("count = %d, want 0 before claim", count)
	}

	claimReview(t, db, repo, created.ID, ids.student3)

	count, err = repo.CountActiveByReviewer(context.Background(), ids.student3)
	if err != nil {
		t.Fatalf("CountActiveByReviewer: %v", err)
	}

	if count != 1 {
		t.Fatalf("count = %d, want 1 after claim", count)
	}
}

// createPeerReview заводит peer-review в отдельной транзакции.
func createPeerReview(t *testing.T, db *sqlDB, repo *PeerReviewRepo, submissionID, authorID int64, escrow int) *PeerReview {
	t.Helper()

	tx := testTx(t, db)

	review, err := repo.Create(context.Background(), tx, CreatePeerReviewInput{
		SubmissionID:      submissionID,
		AuthorID:          authorID,
		EscrowAmount:      escrow,
		ExpiresAt:         time.Date(2027, 12, 20, 18, 0, 0, 0, time.UTC),
		CriteriaChecklist: `[{"code":"C1","title":"Компилируется","weight":1}]`,
	})
	if err != nil {
		t.Fatalf("Create peer review: %v", err)
	}

	if err := tx.Commit(); err != nil {
		t.Fatalf("commit: %v", err)
	}

	return review
}

// claimReview закрепляет ревью за рецензентом в отдельной транзакции.
func claimReview(t *testing.T, db *sqlDB, repo *PeerReviewRepo, reviewID, reviewerID int64) *PeerReview {
	t.Helper()

	tx := testTx(t, db)

	review, err := repo.Claim(context.Background(), tx, reviewID, reviewerID)
	if err != nil {
		t.Fatalf("Claim: %v", err)
	}

	if err := tx.Commit(); err != nil {
		t.Fatalf("commit: %v", err)
	}

	return review
}

// expireReview закрывает ревью по сроку в отдельной транзакции.
func expireReview(t *testing.T, db *sqlDB, repo *PeerReviewRepo, reviewID int64) *PeerReview {
	t.Helper()

	tx := testTx(t, db)

	review, err := repo.Expire(context.Background(), tx, reviewID)
	if err != nil {
		t.Fatalf("Expire: %v", err)
	}

	if err := tx.Commit(); err != nil {
		t.Fatalf("commit: %v", err)
	}

	return review
}
