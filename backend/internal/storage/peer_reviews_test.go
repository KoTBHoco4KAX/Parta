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

	sub := createSubmission(t, db, ids.taskLab, ids.student2)

	created := createPeerReview(t, db, repo, sub.ID, ids.student1)

	if created.Status != PeerReviewStatusCreated {
		t.Fatalf("Status = %q, want CREATED", created.Status)
	}

	// Взаимопроверка больше не списывает XP у автора.
	author, err := NewUserRepo(db).GetByID(context.Background(), ids.student1)
	if err != nil {
		t.Fatalf("GetByID(author): %v", err)
	}

	if author.XPBalance != 0 {
		t.Fatalf("author balance = %d, want 0 (no escrow)", author.XPBalance)
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

	// IN_REVIEW → COMPLETED: только оценка и комментарий.
	tx2 := testTx(t, db)

	completed, err := repo.Complete(context.Background(), tx2, created.ID, ids.student3, 4, "Хорошая работа, но не хватает тестов")
	if err != nil {
		t.Fatalf("Complete: %v", err)
	}

	if completed.Status != PeerReviewStatusCompleted {
		t.Fatalf("Status = %q, want COMPLETED", completed.Status)
	}

	if completed.Grade == nil || *completed.Grade != 4 {
		t.Fatalf("Grade = %v, want 4", completed.Grade)
	}

	if completed.Comment == "" {
		t.Fatal("Comment must be stored")
	}

	if completed.CompletedAt == nil {
		t.Fatal("CompletedAt must be set")
	}

	if err := tx2.Commit(); err != nil {
		t.Fatalf("commit complete: %v", err)
	}

	// Награда рецензенту появляется только после приёмки работы учителем.
	reviewer, err := NewUserRepo(db).GetByID(context.Background(), ids.student3)
	if err != nil {
		t.Fatalf("GetByID(reviewer): %v", err)
	}

	if reviewer.XPBalance != 0 {
		t.Fatalf("reviewer balance = %d, want 0 before teacher verdict", reviewer.XPBalance)
	}

	tx3 := testTx(t, db)

	if _, err := repo.RewardReviewer(context.Background(), tx3, completed, 40); err != nil {
		t.Fatalf("RewardReviewer: %v", err)
	}

	if err := tx3.Commit(); err != nil {
		t.Fatalf("commit reward: %v", err)
	}

	reviewer, err = NewUserRepo(db).GetByID(context.Background(), ids.student3)
	if err != nil {
		t.Fatalf("GetByID(reviewer): %v", err)
	}

	if reviewer.XPBalance != 40 {
		t.Fatalf("reviewer balance = %d, want reward 40", reviewer.XPBalance)
	}

	// Повторная награда идемпотентна: completed уже знает reward_ledger_id.
	tx4 := testTx(t, db)

	if _, err := repo.RewardReviewer(context.Background(), tx4, completed, 40); err != nil {
		t.Fatalf("RewardReviewer repeat: %v", err)
	}

	if err := tx4.Commit(); err != nil {
		t.Fatalf("commit repeat: %v", err)
	}

	reviewer, err = NewUserRepo(db).GetByID(context.Background(), ids.student3)
	if err != nil {
		t.Fatalf("GetByID(reviewer): %v", err)
	}

	if reviewer.XPBalance != 40 {
		t.Fatalf("reviewer balance = %d, want 40 after repeat reward", reviewer.XPBalance)
	}
}

func TestPeerReviewRepoCreateIsFree(t *testing.T) {
	db := testDB(t)
	ids := seed(t, db)
	repo := NewPeerReviewRepo(db)

	sub := createSubmission(t, db, ids.taskLab, ids.student2)

	created := createPeerReview(t, db, repo, sub.ID, ids.student1)

	if created.ID <= 0 {
		t.Fatalf("created id = %d", created.ID)
	}

	var ledgerCount int
	if err := db.QueryRow(`SELECT COUNT(1) FROM xp_ledger`).Scan(&ledgerCount); err != nil {
		t.Fatalf("count ledger: %v", err)
	}

	if ledgerCount != 0 {
		t.Fatalf("ledger rows = %d, want 0: взаимопроверка без списаний", ledgerCount)
	}
}

func TestPeerReviewRepoClaimTwiceFails(t *testing.T) {
	db := testDB(t)
	ids := seed(t, db)
	repo := NewPeerReviewRepo(db)

	sub := createSubmission(t, db, ids.taskLab, ids.student2)
	created := createPeerReview(t, db, repo, sub.ID, ids.student1)

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

	sub := createSubmission(t, db, ids.taskLab, ids.student2)
	created := createPeerReview(t, db, repo, sub.ID, ids.student1)

	claimReview(t, db, repo, created.ID, ids.student3)

	tx := testTx(t, db)

	if _, err := repo.Complete(context.Background(), tx, created.ID, ids.student2, 5, "чужой рецензент"); !domainerrors.IsSentinel(err, domainerrors.ErrNotFound) {
		t.Fatalf("err = %v, want ErrNotFound when another student completes", err)
	}
}

func TestPeerReviewRepoExpireWithoutRefund(t *testing.T) {
	db := testDB(t)
	ids := seed(t, db)
	repo := NewPeerReviewRepo(db)

	sub := createSubmission(t, db, ids.taskLab, ids.student2)
	created := createPeerReview(t, db, repo, sub.ID, ids.student1)

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

	if author.XPBalance != 0 {
		t.Fatalf("author balance = %d, want 0", author.XPBalance)
	}
}

func TestPeerReviewRepoExpireTerminalFails(t *testing.T) {
	db := testDB(t)
	ids := seed(t, db)
	repo := NewPeerReviewRepo(db)

	sub := createSubmission(t, db, ids.taskLab, ids.student2)
	created := createPeerReview(t, db, repo, sub.ID, ids.student1)

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

	sub := createSubmission(t, db, ids.taskLab, ids.student2)
	created := createPeerReview(t, db, repo, sub.ID, ids.student1)

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

func TestPeerGradeAndCommentValidation(t *testing.T) {
	if ValidPeerGrade(0) || ValidPeerGrade(6) {
		t.Fatal("grade must be 1..5")
	}

	if !ValidPeerGrade(3) {
		t.Fatal("grade 3 must be valid")
	}

	if ValidPeerComment("") {
		t.Fatal("empty comment must be rejected")
	}

	if !ValidPeerComment("коротко и по делу") {
		t.Fatal("short comment must be valid")
	}

	long := make([]rune, 101)
	for i := range long {
		long[i] = 'а'
	}

	if ValidPeerComment(string(long)) {
		t.Fatal("comment longer than 100 runes must be rejected")
	}
}

// createPeerReview заводит взаимопроверку в отдельной транзакции.
func createPeerReview(t *testing.T, db *sqlDB, repo *PeerReviewRepo, submissionID, authorID int64) *PeerReview {
	t.Helper()

	tx := testTx(t, db)

	review, err := repo.Create(context.Background(), tx, CreatePeerReviewInput{
		SubmissionID: submissionID,
		AuthorID:     authorID,
		ExpiresAt:    time.Date(2027, 12, 20, 18, 0, 0, 0, time.UTC),
	})
	if err != nil {
		t.Fatalf("Create peer review: %v", err)
	}

	if err := tx.Commit(); err != nil {
		t.Fatalf("commit: %v", err)
	}

	return review
}

// claimReview закрепляет проверку за рецензентом в отдельной транзакции.
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

// expireReview закрывает проверку по сроку в отдельной транзакции.
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
