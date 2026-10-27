package storage

import (
	"context"
	"database/sql"
	"testing"
	"time"

	domainerrors "github.com/parta/backend/internal/domain/errors"
	"github.com/parta/backend/internal/domain/submission"
)

func TestSubmissionRepoCreateIfNotExists(t *testing.T) {
	db := testDB(t)
	ids := seed(t, db)
	repo := NewSubmissionRepo(db)

	created, isNew, err := repo.CreateIfNotExists(context.Background(), ids.taskLab, ids.student1)
	if err != nil {
		t.Fatalf("CreateIfNotExists: %v", err)
	}

	if !isNew {
		t.Fatal("first call must report created=true")
	}

	if created.Status != submission.StatusTodo {
		t.Fatalf("Status = %q, want TODO", created.Status)
	}

	again, isNew, err := repo.CreateIfNotExists(context.Background(), ids.taskLab, ids.student1)
	if err != nil {
		t.Fatalf("CreateIfNotExists(second): %v", err)
	}

	if isNew {
		t.Fatal("second call must report created=false")
	}

	if again.ID != created.ID {
		t.Fatalf("second call returned id %d, want %d", again.ID, created.ID)
	}

	var count int

	if err := db.QueryRow(
		`SELECT COUNT(1) FROM submissions WHERE task_id = ? AND student_id = ?`,
		ids.taskLab, ids.student1).Scan(&count); err != nil {
		t.Fatalf("count: %v", err)
	}

	if count != 1 {
		t.Fatalf("submissions count = %d, want 1", count)
	}
}

func TestSubmissionRepoGetByID(t *testing.T) {
	db := testDB(t)
	ids := seed(t, db)
	repo := NewSubmissionRepo(db)

	created := createSubmission(t, db, ids.taskLab, ids.student1)

	fetched, err := repo.GetByID(context.Background(), created.ID)
	if err != nil {
		t.Fatalf("GetByID: %v", err)
	}

	if fetched.TaskID != ids.taskLab || fetched.StudentID != ids.student1 {
		t.Fatalf("round trip mismatch: %+v", fetched)
	}

	if fetched.TeamSlotID != nil {
		t.Fatalf("TeamSlotID = %v, want nil", *fetched.TeamSlotID)
	}

	if fetched.ArtifactURL != "" || fetched.ArtifactHash != "" {
		t.Fatalf("artifact fields must be empty: %+v", fetched)
	}

	if fetched.RevisionLog == nil {
		t.Fatal("RevisionLog must be an empty slice, not nil")
	}

	if len(fetched.RevisionLog) != 0 {
		t.Fatalf("RevisionLog = %+v, want empty", fetched.RevisionLog)
	}

	if _, err := repo.GetByID(context.Background(), 999999); !domainerrors.IsSentinel(err, domainerrors.ErrNotFound) {
		t.Fatalf("err = %v, want ErrNotFound", err)
	}
}

func TestSubmissionRepoGetByStudentAndTask(t *testing.T) {
	db := testDB(t)
	ids := seed(t, db)
	repo := NewSubmissionRepo(db)

	created := createSubmission(t, db, ids.taskLab, ids.student2)

	fetched, err := repo.GetByStudentAndTask(context.Background(), ids.student2, ids.taskLab)
	if err != nil {
		t.Fatalf("GetByStudentAndTask: %v", err)
	}

	if fetched.ID != created.ID {
		t.Fatalf("id = %d, want %d", fetched.ID, created.ID)
	}

	if _, err := repo.GetByStudentAndTask(context.Background(), ids.student3, ids.taskLab); !domainerrors.IsSentinel(err, domainerrors.ErrNotFound) {
		t.Fatalf("err = %v, want ErrNotFound", err)
	}
}

func TestSubmissionRepoUpdateStatusHappyPath(t *testing.T) {
	db := testDB(t)
	ids := seed(t, db)
	repo := NewSubmissionRepo(db)

	sub := createSubmission(t, db, ids.taskLab, ids.student1)
	now := time.Date(2026, 10, 10, 12, 0, 0, 0, time.UTC)

	// TODO → IN_PROGRESS
	started := updateStatus(t, db, repo, UpdateStatusInput{
		ID:           sub.ID,
		ExpectedFrom: submission.StatusTodo,
		To:           submission.StatusInProgress,
		ActorID:      ids.student1,
		Now:          now,
	})

	if started.Status != submission.StatusInProgress {
		t.Fatalf("Status = %q, want IN_PROGRESS", started.Status)
	}

	// IN_PROGRESS → REVIEW
	url, hash := "https://parta.local/artifact.zip", "sha256:abc"

	review := updateStatus(t, db, repo, UpdateStatusInput{
		ID:           sub.ID,
		ExpectedFrom: submission.StatusInProgress,
		To:           submission.StatusReview,
		ActorID:      ids.student1,
		Now:          now,
		ArtifactURL:  &url,
		ArtifactHash: &hash,
	})

	if review.Status != submission.StatusReview {
		t.Fatalf("Status = %q, want REVIEW", review.Status)
	}

	if review.ArtifactURL != url || review.ArtifactHash != hash {
		t.Fatalf("artifact not stored: %+v", review)
	}

	if review.SubmittedAt == nil || !review.SubmittedAt.Equal(now) {
		t.Fatalf("SubmittedAt = %v, want %v", review.SubmittedAt, now)
	}

	// REVIEW → DONE
	comment := "Зачтено"

	done := updateStatus(t, db, repo, UpdateStatusInput{
		ID:            sub.ID,
		ExpectedFrom:  submission.StatusReview,
		To:            submission.StatusDone,
		ActorID:       ids.teacher,
		Now:           now.Add(time.Hour),
		ReviewComment: &comment,
	})

	if done.Status != submission.StatusDone {
		t.Fatalf("Status = %q, want DONE", done.Status)
	}

	if done.ReviewedAt == nil {
		t.Fatal("ReviewedAt must be set")
	}

	if done.ReviewerID == nil || *done.ReviewerID != ids.teacher {
		t.Fatalf("ReviewerID = %v, want %d", done.ReviewerID, ids.teacher)
	}

	if done.FinalSubmittedAt == nil || !done.FinalSubmittedAt.Equal(now) {
		t.Fatalf("FinalSubmittedAt = %v, want first submitted_at %v", done.FinalSubmittedAt, now)
	}
}

func TestSubmissionRepoUpdateStatusOptimisticLock(t *testing.T) {
	db := testDB(t)
	ids := seed(t, db)
	repo := NewSubmissionRepo(db)

	sub := createSubmission(t, db, ids.taskLab, ids.student1)
	now := time.Date(2026, 10, 10, 12, 0, 0, 0, time.UTC)

	// Карточка в TODO, а ждём IN_PROGRESS: строк не найдено.
	tx := testTx(t, db)

	_, err := repo.UpdateStatus(context.Background(), tx, UpdateStatusInput{
		ID:           sub.ID,
		ExpectedFrom: submission.StatusInProgress,
		To:           submission.StatusReview,
		ActorID:      ids.student1,
		Now:          now,
	})
	if !domainerrors.IsSentinel(err, domainerrors.ErrNotFound) {
		t.Fatalf("err = %v, want ErrNotFound on optimistic lock miss", err)
	}
}

func TestSubmissionRepoUpdateStatusRejectsTerminalSource(t *testing.T) {
	db := testDB(t)
	ids := seed(t, db)
	repo := NewSubmissionRepo(db)

	sub := createSubmission(t, db, ids.taskLab, ids.student1)
	now := time.Date(2026, 10, 10, 12, 0, 0, 0, time.UTC)
	comment := "Зачтено"

	// Доводим карточку до DONE.
	updateStatus(t, db, repo, UpdateStatusInput{ID: sub.ID, ExpectedFrom: submission.StatusTodo, To: submission.StatusInProgress, ActorID: ids.student1, Now: now})
	updateStatus(t, db, repo, UpdateStatusInput{ID: sub.ID, ExpectedFrom: submission.StatusInProgress, To: submission.StatusReview, ActorID: ids.student1, Now: now})
	updateStatus(t, db, repo, UpdateStatusInput{ID: sub.ID, ExpectedFrom: submission.StatusReview, To: submission.StatusDone, ActorID: ids.teacher, Now: now, ReviewComment: &comment})

	// Из DONE переходов нет (FSM-триггер + optimistic lock).
	tx := testTx(t, db)

	_, err := repo.UpdateStatus(context.Background(), tx, UpdateStatusInput{
		ID:           sub.ID,
		ExpectedFrom: submission.StatusDone,
		To:           submission.StatusInProgress,
		ActorID:      ids.student1,
		Now:          now,
	})
	if err == nil {
		t.Fatal("transition out of DONE must fail")
	}
}

func TestSubmissionRepoUpdateStatusRejected(t *testing.T) {
	db := testDB(t)
	ids := seed(t, db)
	repo := NewSubmissionRepo(db)

	sub := createSubmission(t, db, ids.taskLab, ids.student1)
	now := time.Date(2026, 10, 10, 12, 0, 0, 0, time.UTC)
	url, hash := "https://parta.local/a.zip", "sha256:a"

	updateStatus(t, db, repo, UpdateStatusInput{ID: sub.ID, ExpectedFrom: submission.StatusTodo, To: submission.StatusInProgress, ActorID: ids.student1, Now: now})
	updateStatus(t, db, repo, UpdateStatusInput{ID: sub.ID, ExpectedFrom: submission.StatusInProgress, To: submission.StatusReview, ActorID: ids.student1, Now: now, ArtifactURL: &url, ArtifactHash: &hash})

	comment := "Переделать"

	rejected := updateStatus(t, db, repo, UpdateStatusInput{
		ID:            sub.ID,
		ExpectedFrom:  submission.StatusReview,
		To:            submission.StatusRejected,
		ActorID:       ids.teacher,
		Now:           now,
		ReviewComment: &comment,
	})

	if rejected.Status != submission.StatusRejected {
		t.Fatalf("Status = %q, want REJECTED", rejected.Status)
	}

	var lockedAt sql.NullString

	if err := db.QueryRow(`SELECT locked_at FROM submissions WHERE id = ?`, sub.ID).Scan(&lockedAt); err != nil {
		t.Fatalf("select locked_at: %v", err)
	}

	if lockedAt.Valid {
		t.Fatalf("locked_at = %q, want NULL after reject", lockedAt.String)
	}
}

func TestSubmissionRepoRecordRevisionAppends(t *testing.T) {
	db := testDB(t)
	ids := seed(t, db)
	repo := NewSubmissionRepo(db)

	sub := createSubmission(t, db, ids.taskLab, ids.student1)
	at := time.Date(2026, 10, 11, 9, 30, 0, 0, time.UTC)

	appendRevision(t, db, repo, sub.ID, submission.RevisionEntry{At: at, ActorID: ids.teacher, Comment: "Первая правка"})
	appendRevision(t, db, repo, sub.ID, submission.RevisionEntry{At: at.Add(time.Hour), ActorID: ids.teacher, Comment: "Вторая правка"})

	fetched, err := repo.GetByID(context.Background(), sub.ID)
	if err != nil {
		t.Fatalf("GetByID: %v", err)
	}

	if len(fetched.RevisionLog) != 2 {
		t.Fatalf("len(RevisionLog) = %d, want 2", len(fetched.RevisionLog))
	}

	if fetched.RevisionLog[0].Comment != "Первая правка" || fetched.RevisionLog[1].Comment != "Вторая правка" {
		t.Fatalf("RevisionLog = %+v", fetched.RevisionLog)
	}

	if fetched.RevisionLog[0].ActorID != ids.teacher {
		t.Fatalf("ActorID = %d, want %d", fetched.RevisionLog[0].ActorID, ids.teacher)
	}

	var raw string

	if err := db.QueryRow(`SELECT revision_log FROM submissions WHERE id = ?`, sub.ID).Scan(&raw); err != nil {
		t.Fatalf("select revision_log: %v", err)
	}

	var valid int

	if err := db.QueryRow(`SELECT json_valid(?)`, raw).Scan(&valid); err != nil {
		t.Fatalf("json_valid: %v", err)
	}

	if valid != 1 {
		t.Fatalf("revision_log is not valid JSON: %s", raw)
	}
}

func TestSubmissionRepoListByStudent(t *testing.T) {
	db := testDB(t)
	ids := seed(t, db)
	repo := NewSubmissionRepo(db)

	createSubmission(t, db, ids.taskLab, ids.student1)
	createSubmission(t, db, ids.taskTeam, ids.student1)
	createSubmission(t, db, ids.taskLab, ids.student2)

	list, err := repo.ListByStudent(context.Background(), ids.student1)
	if err != nil {
		t.Fatalf("ListByStudent: %v", err)
	}

	if len(list) != 2 {
		t.Fatalf("len = %d, want 2", len(list))
	}
}

func TestSubmissionRepoListReviewInbox(t *testing.T) {
	db := testDB(t)
	ids := seed(t, db)
	repo := NewSubmissionRepo(db)

	now := time.Date(2026, 10, 10, 12, 0, 0, 0, time.UTC)
	url, hash := "https://parta.local/a.zip", "sha256:a"

	sub := createSubmission(t, db, ids.taskLab, ids.student1)

	updateStatus(t, db, repo, UpdateStatusInput{ID: sub.ID, ExpectedFrom: submission.StatusTodo, To: submission.StatusInProgress, ActorID: ids.student1, Now: now})
	updateStatus(t, db, repo, UpdateStatusInput{ID: sub.ID, ExpectedFrom: submission.StatusInProgress, To: submission.StatusReview, ActorID: ids.student1, Now: now, ArtifactURL: &url, ArtifactHash: &hash})

	inbox, err := repo.ListReviewInbox(context.Background(), ids.teacher)
	if err != nil {
		t.Fatalf("ListReviewInbox: %v", err)
	}

	if len(inbox) != 1 {
		t.Fatalf("len = %d, want 1", len(inbox))
	}

	if inbox[0].ID != sub.ID || inbox[0].Status != submission.StatusReview {
		t.Fatalf("inbox entry = %+v", inbox[0])
	}

	other, err := repo.ListReviewInbox(context.Background(), ids.admin)
	if err != nil {
		t.Fatalf("ListReviewInbox(admin): %v", err)
	}

	if len(other) != 0 {
		t.Fatalf("len = %d, want 0 for a user without assignments", len(other))
	}
}

// updateStatus выполняет переход в транзакции и возвращает карточку.
func updateStatus(t *testing.T, db *sqlDB, repo *SubmissionRepo, in UpdateStatusInput) *submission.Submission {
	t.Helper()

	tx := testTx(t, db)

	sub, err := repo.UpdateStatus(context.Background(), tx, in)
	if err != nil {
		t.Fatalf("UpdateStatus(%s → %s): %v", in.ExpectedFrom, in.To, err)
	}

	if err := tx.Commit(); err != nil {
		t.Fatalf("commit: %v", err)
	}

	return sub
}

// appendRevision пишет запись журнала доработок в транзакции.
func appendRevision(t *testing.T, db *sqlDB, repo *SubmissionRepo, id int64, entry submission.RevisionEntry) {
	t.Helper()

	tx := testTx(t, db)

	if err := repo.RecordRevision(context.Background(), tx, id, entry); err != nil {
		t.Fatalf("RecordRevision: %v", err)
	}

	if err := tx.Commit(); err != nil {
		t.Fatalf("commit: %v", err)
	}
}
