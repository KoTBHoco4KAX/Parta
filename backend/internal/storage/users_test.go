package storage

import (
	"context"
	"testing"

	domainerrors "github.com/parta/backend/internal/domain/errors"
)

func TestUserRepoGetByID(t *testing.T) {
	db := testDB(t)
	ids := seed(t, db)
	repo := NewUserRepo(db)

	user, err := repo.GetByID(context.Background(), ids.student1)
	if err != nil {
		t.Fatalf("GetByID: %v", err)
	}

	if user.ExternalID != "student1@parta.dev" {
		t.Fatalf("ExternalID = %q", user.ExternalID)
	}

	if user.Role != "student" {
		t.Fatalf("Role = %q, want student", user.Role)
	}

	if user.GroupID == nil || *user.GroupID != ids.groupIS21 {
		t.Fatalf("GroupID = %v, want %d", user.GroupID, ids.groupIS21)
	}

	if user.XPBalance != 0 || user.OnTimeStreak != 0 || user.StreakFreezes != 0 {
		t.Fatalf("unexpected initial state: %+v", user)
	}

	if user.CreatedAt.IsZero() || user.UpdatedAt.IsZero() {
		t.Fatalf("timestamps not parsed: %+v", user)
	}
}

func TestUserRepoTimestampsRoundTrip(t *testing.T) {
	db := testDB(t)
	ids := seed(t, db)
	repo := NewUserRepo(db)

	user, err := repo.GetByID(context.Background(), ids.student1)
	if err != nil {
		t.Fatalf("GetByID: %v", err)
	}

	formatted := formatTime(user.CreatedAt)

	parsed, err := parseTime(formatted)
	if err != nil {
		t.Fatalf("parseTime(formatTime()) failed: %v", err)
	}

	if !parsed.Equal(user.CreatedAt) {
		t.Fatalf("timestamp round trip = %v, want %v", parsed, user.CreatedAt)
	}
}

func TestUserRepoGetByExternalID(t *testing.T) {
	db := testDB(t)
	repo := NewUserRepo(db)

	user, err := repo.GetByExternalID(context.Background(), "teacher@parta.dev")
	if err != nil {
		t.Fatalf("GetByExternalID: %v", err)
	}

	if user.Role != "teacher" {
		t.Fatalf("Role = %q, want teacher", user.Role)
	}

	if user.GroupID != nil {
		t.Fatalf("teacher must have NULL group_id, got %v", *user.GroupID)
	}

	if _, err := repo.GetByExternalID(context.Background(), "ghost@parta.dev"); !domainerrors.IsSentinel(err, domainerrors.ErrNotFound) {
		t.Fatalf("err = %v, want ErrNotFound", err)
	}
}

func TestUserRepoUpdateXPBalance(t *testing.T) {
	db := testDB(t)
	ids := seed(t, db)
	repo := NewUserRepo(db)

	tx := testTx(t, db)

	balance, err := repo.UpdateXPBalance(context.Background(), tx, ids.student1, 250)
	if err != nil {
		t.Fatalf("UpdateXPBalance: %v", err)
	}

	if balance != 250 {
		t.Fatalf("balance = %d, want 250", balance)
	}

	balance, err = repo.UpdateXPBalance(context.Background(), tx, ids.student1, -50)
	if err != nil {
		t.Fatalf("UpdateXPBalance(negative): %v", err)
	}

	if balance != 200 {
		t.Fatalf("balance = %d, want 200", balance)
	}

	if _, err := repo.UpdateXPBalance(context.Background(), tx, ids.student1, -500); !domainerrors.IsSentinel(err, domainerrors.ErrNotFound) {
		t.Fatalf("err = %v, want ErrNotFound for overdraft", err)
	}
}

func TestUserRepoUpdateStreak(t *testing.T) {
	db := testDB(t)
	ids := seed(t, db)
	repo := NewUserRepo(db)

	if err := repo.UpdateStreak(context.Background(), ids.student1, 7, 2); err != nil {
		t.Fatalf("UpdateStreak: %v", err)
	}

	user, err := repo.GetByID(context.Background(), ids.student1)
	if err != nil {
		t.Fatalf("GetByID: %v", err)
	}

	if user.OnTimeStreak != 7 || user.StreakFreezes != 2 {
		t.Fatalf("state = %+v, want streak 7 freezes 2", user)
	}

	if err := repo.UpdateStreak(context.Background(), 999999, 1, 1); !domainerrors.IsSentinel(err, domainerrors.ErrNotFound) {
		t.Fatalf("err = %v, want ErrNotFound", err)
	}
}

func TestUserRepoDecrementFreezes(t *testing.T) {
	db := testDB(t)
	ids := seed(t, db)
	repo := NewUserRepo(db)

	if _, err := repo.DecrementFreezes(context.Background(), ids.student1); !domainerrors.IsSentinel(err, domainerrors.ErrNotFound) {
		t.Fatalf("err = %v, want ErrNotFound when no freezes left", err)
	}

	if err := repo.UpdateStreak(context.Background(), ids.student1, 3, 2); err != nil {
		t.Fatalf("UpdateStreak: %v", err)
	}

	left, err := repo.DecrementFreezes(context.Background(), ids.student1)
	if err != nil {
		t.Fatalf("DecrementFreezes: %v", err)
	}

	if left != 1 {
		t.Fatalf("left = %d, want 1", left)
	}

	left, err = repo.DecrementFreezes(context.Background(), ids.student1)
	if err != nil {
		t.Fatalf("DecrementFreezes: %v", err)
	}

	if left != 0 {
		t.Fatalf("left = %d, want 0", left)
	}
}
