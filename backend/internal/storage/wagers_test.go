package storage

import (
	"context"
	"testing"
	"time"

	domainerrors "github.com/parta/backend/internal/domain/errors"
)

func TestWagerRepoCreate(t *testing.T) {
	db := testDB(t)
	ids := seed(t, db)
	repo := NewWagerRepo(db)

	topUpXP(t, db, ids.student1, 500)

	tx := testTx(t, db)

	wager, err := repo.Create(context.Background(), tx, CreateWagerInput{
		StudentID:   ids.student1,
		TaskID:      ids.taskLab,
		StakeAmount: 100,
		DeadlineAt:  time.Date(2027, 12, 20, 18, 0, 0, 0, time.UTC),
	})
	if err != nil {
		t.Fatalf("Create: %v", err)
	}

	if wager.Status != WagerStatusPlaced {
		t.Fatalf("Status = %q, want PLACED", wager.Status)
	}

	if wager.StakeAmount != 100 {
		t.Fatalf("StakeAmount = %d, want 100", wager.StakeAmount)
	}

	if wager.EscrowLedgerID == 0 {
		t.Fatal("EscrowLedgerID must be filled with the stake ledger entry")
	}

	if err := tx.Commit(); err != nil {
		t.Fatalf("commit: %v", err)
	}

	user, err := NewUserRepo(db).GetByID(context.Background(), ids.student1)
	if err != nil {
		t.Fatalf("GetByID: %v", err)
	}

	if user.XPBalance != 400 {
		t.Fatalf("XPBalance = %d, want 400 after escrow", user.XPBalance)
	}
}

func TestWagerRepoCreateInsufficientXP(t *testing.T) {
	db := testDB(t)
	ids := seed(t, db)
	repo := NewWagerRepo(db)

	tx := testTx(t, db)

	_, err := repo.Create(context.Background(), tx, CreateWagerInput{
		StudentID:   ids.student1,
		TaskID:      ids.taskLab,
		StakeAmount: 100,
		DeadlineAt:  time.Date(2027, 12, 20, 18, 0, 0, 0, time.UTC),
	})
	if !domainerrors.IsSentinel(err, domainerrors.ErrInsufficientXP) {
		t.Fatalf("err = %v, want ErrInsufficientXP", err)
	}

	if err := tx.Rollback(); err != nil {
		t.Fatalf("rollback: %v", err)
	}

	var count int

	if err := db.QueryRow(`SELECT COUNT(1) FROM wagers`).Scan(&count); err != nil {
		t.Fatalf("count: %v", err)
	}

	if count != 0 {
		t.Fatalf("wagers count = %d, want 0 after rollback", count)
	}
}

func TestWagerRepoGetByID(t *testing.T) {
	db := testDB(t)
	ids := seed(t, db)
	repo := NewWagerRepo(db)

	topUpXP(t, db, ids.student1, 500)

	created := createWager(t, db, repo, ids.student1, ids.taskLab, 150)

	fetched, err := repo.GetByID(context.Background(), created.ID)
	if err != nil {
		t.Fatalf("GetByID: %v", err)
	}

	if fetched.StudentID != ids.student1 || fetched.TaskID != ids.taskLab {
		t.Fatalf("round trip mismatch: %+v", fetched)
	}

	if fetched.StakeAmount != 150 {
		t.Fatalf("StakeAmount = %d, want 150", fetched.StakeAmount)
	}

	if fetched.EscrowLedgerID != created.EscrowLedgerID {
		t.Fatalf("EscrowLedgerID = %d, want %d", fetched.EscrowLedgerID, created.EscrowLedgerID)
	}

	if fetched.ResolvedAt != nil {
		t.Fatalf("ResolvedAt = %v, want nil while PLACED", fetched.ResolvedAt)
	}

	if _, err := repo.GetByID(context.Background(), 999999); !domainerrors.IsSentinel(err, domainerrors.ErrNotFound) {
		t.Fatalf("err = %v, want ErrNotFound", err)
	}
}

func TestWagerRepoResolveWon(t *testing.T) {
	db := testDB(t)
	ids := seed(t, db)
	repo := NewWagerRepo(db)

	topUpXP(t, db, ids.student1, 500)

	created := createWager(t, db, repo, ids.student1, ids.taskLab, 100)

	tx := testTx(t, db)

	resolved, err := repo.Resolve(context.Background(), tx, created.ID, WagerStatusWon, "Сдано до дедлайна пари")
	if err != nil {
		t.Fatalf("Resolve: %v", err)
	}

	if resolved.Status != WagerStatusWon {
		t.Fatalf("Status = %q, want WON", resolved.Status)
	}

	if resolved.ResolvedAt == nil {
		t.Fatal("ResolvedAt must be set")
	}

	if resolved.ResolutionNote != "Сдано до дедлайна пари" {
		t.Fatalf("ResolutionNote = %q", resolved.ResolutionNote)
	}

	if err := tx.Commit(); err != nil {
		t.Fatalf("commit: %v", err)
	}

	user, err := NewUserRepo(db).GetByID(context.Background(), ids.student1)
	if err != nil {
		t.Fatalf("GetByID: %v", err)
	}

	// 500 − 100 (escrow) + 200 (2×stake) = 600
	if user.XPBalance != 600 {
		t.Fatalf("XPBalance = %d, want 600", user.XPBalance)
	}
}

func TestWagerRepoResolveLost(t *testing.T) {
	db := testDB(t)
	ids := seed(t, db)
	repo := NewWagerRepo(db)

	topUpXP(t, db, ids.student1, 500)

	created := createWager(t, db, repo, ids.student1, ids.taskLab, 100)

	tx := testTx(t, db)

	resolved, err := repo.Resolve(context.Background(), tx, created.ID, WagerStatusLost, "Просрочено")
	if err != nil {
		t.Fatalf("Resolve: %v", err)
	}

	if resolved.Status != WagerStatusLost {
		t.Fatalf("Status = %q, want LOST", resolved.Status)
	}

	if err := tx.Commit(); err != nil {
		t.Fatalf("commit: %v", err)
	}

	user, err := NewUserRepo(db).GetByID(context.Background(), ids.student1)
	if err != nil {
		t.Fatalf("GetByID: %v", err)
	}

	if user.XPBalance != 400 {
		t.Fatalf("XPBalance = %d, want 400 — проигрыш без возврата", user.XPBalance)
	}
}

func TestWagerRepoResolveCancelledRefunds(t *testing.T) {
	db := testDB(t)
	ids := seed(t, db)
	repo := NewWagerRepo(db)

	topUpXP(t, db, ids.student1, 500)

	created := createWager(t, db, repo, ids.student1, ids.taskLab, 100)

	tx := testTx(t, db)

	if _, err := repo.Resolve(context.Background(), tx, created.ID, WagerStatusCancelled, "Отменено админом"); err != nil {
		t.Fatalf("Resolve: %v", err)
	}

	if err := tx.Commit(); err != nil {
		t.Fatalf("commit: %v", err)
	}

	user, err := NewUserRepo(db).GetByID(context.Background(), ids.student1)
	if err != nil {
		t.Fatalf("GetByID: %v", err)
	}

	if user.XPBalance != 500 {
		t.Fatalf("XPBalance = %d, want 500 — отмена возвращает ставку", user.XPBalance)
	}
}

func TestWagerRepoResolveOptimisticLock(t *testing.T) {
	db := testDB(t)
	ids := seed(t, db)
	repo := NewWagerRepo(db)

	topUpXP(t, db, ids.student1, 500)

	created := createWager(t, db, repo, ids.student1, ids.taskLab, 100)

	resolveWager(t, db, repo, created.ID, WagerStatusWon)

	tx := testTx(t, db)

	if _, err := repo.Resolve(context.Background(), tx, created.ID, WagerStatusLost, "Повторный расчёт"); !domainerrors.IsSentinel(err, domainerrors.ErrNotFound) {
		t.Fatalf("err = %v, want ErrNotFound on terminal wager", err)
	}
}

func TestWagerRepoResolveInvalidResult(t *testing.T) {
	db := testDB(t)
	ids := seed(t, db)
	repo := NewWagerRepo(db)

	topUpXP(t, db, ids.student1, 500)

	created := createWager(t, db, repo, ids.student1, ids.taskLab, 100)

	tx := testTx(t, db)

	if _, err := repo.Resolve(context.Background(), tx, created.ID, "PLACED", "нет"); !domainerrors.IsSentinel(err, domainerrors.ErrInvalidArgument) {
		t.Fatalf("err = %v, want ErrInvalidArgument", err)
	}
}

func TestWagerRepoListActiveByTask(t *testing.T) {
	db := testDB(t)
	ids := seed(t, db)
	repo := NewWagerRepo(db)

	topUpXP(t, db, ids.student1, 500)

	created := createWager(t, db, repo, ids.student1, ids.taskLab, 100)

	active, err := repo.ListActiveByTask(context.Background(), ids.student1, ids.taskLab)
	if err != nil {
		t.Fatalf("ListActiveByTask: %v", err)
	}

	if len(active) != 1 || active[0].ID != created.ID {
		t.Fatalf("active = %+v, want only wager %d", active, created.ID)
	}

	resolveWager(t, db, repo, created.ID, WagerStatusLost)

	active, err = repo.ListActiveByTask(context.Background(), ids.student1, ids.taskLab)
	if err != nil {
		t.Fatalf("ListActiveByTask after resolve: %v", err)
	}

	if len(active) != 0 {
		t.Fatalf("active = %+v, want none after resolve", active)
	}
}

// createWager заводит пари в отдельной транзакции.
func createWager(t *testing.T, db *sqlDB, repo *WagerRepo, studentID, taskID int64, stake int) *Wager {
	t.Helper()

	tx := testTx(t, db)

	wager, err := repo.Create(context.Background(), tx, CreateWagerInput{
		StudentID:   studentID,
		TaskID:      taskID,
		StakeAmount: stake,
		DeadlineAt:  time.Date(2027, 12, 20, 18, 0, 0, 0, time.UTC),
	})
	if err != nil {
		t.Fatalf("Create: %v", err)
	}

	if err := tx.Commit(); err != nil {
		t.Fatalf("commit: %v", err)
	}

	return wager
}

// resolveWager закрывает пари в отдельной транзакции.
func resolveWager(t *testing.T, db *sqlDB, repo *WagerRepo, id int64, result string) *Wager {
	t.Helper()

	tx := testTx(t, db)

	wager, err := repo.Resolve(context.Background(), tx, id, result, "тест")
	if err != nil {
		t.Fatalf("Resolve(%s): %v", result, err)
	}

	if err := tx.Commit(); err != nil {
		t.Fatalf("commit: %v", err)
	}

	return wager
}
