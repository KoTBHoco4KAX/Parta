package storage

import (
	"context"
	"testing"

	domainerrors "github.com/parta/backend/internal/domain/errors"
)

func TestXPLedgerRepoPost(t *testing.T) {
	db := testDB(t)
	ids := seed(t, db)
	repo := NewXPLedgerRepo(db)

	tx := testTx(t, db)

	entry, err := repo.Post(context.Background(), tx, PostLedgerInput{
		UserID:         ids.student1,
		Amount:         420,
		Reason:         ReasonTaskBase,
		SourceType:     SourceSubmission,
		IdempotencyKey: "test:post:1",
	})
	if err != nil {
		t.Fatalf("Post: %v", err)
	}

	if entry.ID == 0 {
		t.Fatal("Post did not return an id")
	}

	if entry.Amount != 420 || entry.BalanceAfter != 420 {
		t.Fatalf("entry = %+v, want amount 420 balance 420", entry)
	}

	if entry.Reason != ReasonTaskBase || entry.SourceType != SourceSubmission {
		t.Fatalf("entry = %+v", entry)
	}

	if entry.CreatedAt.IsZero() {
		t.Fatal("CreatedAt must be parsed")
	}

	if err := tx.Commit(); err != nil {
		t.Fatalf("commit: %v", err)
	}

	user, err := NewUserRepo(db).GetByID(context.Background(), ids.student1)
	if err != nil {
		t.Fatalf("GetByID: %v", err)
	}

	if user.XPBalance != 420 {
		t.Fatalf("XPBalance = %d, want 420", user.XPBalance)
	}
}

func TestXPLedgerRepoPostInsufficientXP(t *testing.T) {
	db := testDB(t)
	ids := seed(t, db)
	repo := NewXPLedgerRepo(db)

	tx := testTx(t, db)

	_, err := repo.Post(context.Background(), tx, PostLedgerInput{
		UserID:         ids.student1,
		Amount:         -50,
		Reason:         ReasonWagerPlace,
		SourceType:     SourceWager,
		IdempotencyKey: "test:post:negative",
	})
	if !domainerrors.IsSentinel(err, domainerrors.ErrInsufficientXP) {
		t.Fatalf("err = %v, want ErrInsufficientXP", err)
	}

	if err := tx.Rollback(); err != nil {
		t.Fatalf("rollback: %v", err)
	}

	user, err := NewUserRepo(db).GetByID(context.Background(), ids.student1)
	if err != nil {
		t.Fatalf("GetByID: %v", err)
	}

	if user.XPBalance != 0 {
		t.Fatalf("XPBalance = %d, want 0 after rollback", user.XPBalance)
	}
}

func TestXPLedgerRepoPostIdempotency(t *testing.T) {
	db := testDB(t)
	ids := seed(t, db)
	repo := NewXPLedgerRepo(db)

	in := PostLedgerInput{
		UserID:         ids.student1,
		Amount:         100,
		Reason:         ReasonTaskBase,
		SourceType:     SourceSubmission,
		IdempotencyKey: "test:post:idem",
	}

	tx := testTx(t, db)

	first, err := repo.Post(context.Background(), tx, in)
	if err != nil {
		t.Fatalf("first Post: %v", err)
	}

	second, err := repo.Post(context.Background(), tx, in)
	if err != nil {
		t.Fatalf("second Post: %v", err)
	}

	if second.ID != first.ID {
		t.Fatalf("second Post returned id %d, want %d", second.ID, first.ID)
	}

	if second.BalanceAfter != first.BalanceAfter {
		t.Fatalf("second BalanceAfter = %d, want %d", second.BalanceAfter, first.BalanceAfter)
	}

	if err := tx.Commit(); err != nil {
		t.Fatalf("commit: %v", err)
	}

	user, err := NewUserRepo(db).GetByID(context.Background(), ids.student1)
	if err != nil {
		t.Fatalf("GetByID: %v", err)
	}

	if user.XPBalance != 100 {
		t.Fatalf("XPBalance = %d, want 100 — повторная проводка не должна начислять XP", user.XPBalance)
	}
}

func TestXPLedgerRepoPostZeroAmount(t *testing.T) {
	db := testDB(t)
	ids := seed(t, db)
	repo := NewXPLedgerRepo(db)

	tx := testTx(t, db)

	if _, err := repo.Post(context.Background(), tx, PostLedgerInput{
		UserID:         ids.student1,
		Amount:         0,
		Reason:         ReasonTaskBase,
		SourceType:     SourceSubmission,
		IdempotencyKey: "test:post:zero",
	}); !domainerrors.IsSentinel(err, domainerrors.ErrInvalidArgument) {
		t.Fatalf("err = %v, want ErrInvalidArgument", err)
	}
}

func TestXPLedgerRepoPostInvalidReason(t *testing.T) {
	db := testDB(t)
	ids := seed(t, db)
	repo := NewXPLedgerRepo(db)

	tx := testTx(t, db)

	if _, err := repo.Post(context.Background(), tx, PostLedgerInput{
		UserID:         ids.student1,
		Amount:         10,
		Reason:         "NOT_A_REASON",
		SourceType:     SourceSubmission,
		IdempotencyKey: "test:post:reason",
	}); !domainerrors.IsSentinel(err, domainerrors.ErrGuardFailed) {
		t.Fatalf("err = %v, want ErrGuardFailed from CHECK constraint", err)
	}
}

func TestXPLedgerRepoGetByIdempotencyKey(t *testing.T) {
	db := testDB(t)
	ids := seed(t, db)
	repo := NewXPLedgerRepo(db)

	tx := testTx(t, db)

	if _, err := repo.GetByIdempotencyKey(context.Background(), tx, "missing-key"); !domainerrors.IsSentinel(err, domainerrors.ErrNotFound) {
		t.Fatalf("err = %v, want ErrNotFound", err)
	}

	if _, err := repo.Post(context.Background(), tx, PostLedgerInput{
		UserID:         ids.student1,
		Amount:         30,
		Reason:         ReasonTaskBase,
		SourceType:     SourceSubmission,
		IdempotencyKey: "test:post:lookup",
	}); err != nil {
		t.Fatalf("Post: %v", err)
	}

	entry, err := repo.GetByIdempotencyKey(context.Background(), tx, "test:post:lookup")
	if err != nil {
		t.Fatalf("GetByIdempotencyKey: %v", err)
	}

	if entry.Amount != 30 {
		t.Fatalf("Amount = %d, want 30", entry.Amount)
	}
}

func TestXPLedgerRepoListByUser(t *testing.T) {
	db := testDB(t)
	ids := seed(t, db)
	repo := NewXPLedgerRepo(db)

	tx := testTx(t, db)

	for _, amount := range []int{10, 20, 30} {
		if _, err := repo.Post(context.Background(), tx, PostLedgerInput{
			UserID:         ids.student1,
			Amount:         amount,
			Reason:         ReasonTaskBase,
			SourceType:     SourceSubmission,
			IdempotencyKey: "test:list:" + itoa(int64(amount)),
		}); err != nil {
			t.Fatalf("Post(%d): %v", amount, err)
		}
	}

	entries, err := repo.ListByUser(context.Background(), tx, ids.student1)
	if err != nil {
		t.Fatalf("ListByUser: %v", err)
	}

	if len(entries) != 3 {
		t.Fatalf("len = %d, want 3", len(entries))
	}

	if entries[0].Amount != 30 || entries[2].Amount != 10 {
		t.Fatalf("entries are not newest-first: %+v", entries)
	}
}
