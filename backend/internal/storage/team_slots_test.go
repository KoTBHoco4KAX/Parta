package storage

import (
	"context"
	"testing"
	"time"

	domainerrors "github.com/parta/backend/internal/domain/errors"
)

func TestTeamSlotRepoGetByID(t *testing.T) {
	db := testDB(t)
	ids := seed(t, db)
	repo := NewTeamSlotRepo(db)

	slot := teamSlotByRole(t, db, ids.taskTeam, "DB")

	fetched, err := repo.GetByID(context.Background(), slot.ID)
	if err != nil {
		t.Fatalf("GetByID: %v", err)
	}

	if fetched.TaskID != ids.taskTeam {
		t.Fatalf("TaskID = %d, want %d", fetched.TaskID, ids.taskTeam)
	}

	if fetched.RoleCode != "DB" || fetched.RoleTitle != "Схема и миграции" {
		t.Fatalf("slot = %+v", fetched)
	}

	if fetched.Status != TeamSlotStatusOpen {
		t.Fatalf("Status = %q, want OPEN", fetched.Status)
	}

	if fetched.AssignedUserID != nil {
		t.Fatalf("AssignedUserID = %v, want nil for OPEN slot", *fetched.AssignedUserID)
	}

	if _, err := repo.GetByID(context.Background(), 999999); !domainerrors.IsSentinel(err, domainerrors.ErrNotFound) {
		t.Fatalf("err = %v, want ErrNotFound", err)
	}
}

func TestTeamSlotRepoListByTask(t *testing.T) {
	db := testDB(t)
	ids := seed(t, db)
	repo := NewTeamSlotRepo(db)

	slots, err := repo.ListByTask(context.Background(), ids.taskTeam)
	if err != nil {
		t.Fatalf("ListByTask: %v", err)
	}

	if len(slots) != 2 {
		t.Fatalf("len = %d, want 2 slots", len(slots))
	}

	if slots[0].RoleCode != "BIZ" || slots[1].RoleCode != "DB" {
		t.Fatalf("slots are not ordered by role_code: %+v", slots)
	}

	empty, err := repo.ListByTask(context.Background(), ids.taskLab)
	if err != nil {
		t.Fatalf("ListByTask(lab): %v", err)
	}

	if len(empty) != 0 {
		t.Fatalf("len = %d, want 0 slots for an individual task", len(empty))
	}
}

func TestTeamSlotRepoClaim(t *testing.T) {
	db := testDB(t)
	ids := seed(t, db)
	repo := NewTeamSlotRepo(db)

	slot := teamSlotByRole(t, db, ids.taskTeam, "DB")

	claimed := claimSlot(t, db, repo, slot.ID, ids.student1)

	if claimed.Status != TeamSlotStatusClaimed {
		t.Fatalf("Status = %q, want CLAIMED", claimed.Status)
	}

	if claimed.AssignedUserID == nil || *claimed.AssignedUserID != ids.student1 {
		t.Fatalf("AssignedUserID = %v, want %d", claimed.AssignedUserID, ids.student1)
	}
}

func TestTeamSlotRepoClaimTwiceFails(t *testing.T) {
	db := testDB(t)
	ids := seed(t, db)
	repo := NewTeamSlotRepo(db)

	slot := teamSlotByRole(t, db, ids.taskTeam, "DB")

	claimSlot(t, db, repo, slot.ID, ids.student1)

	tx := testTx(t, db)

	if _, err := repo.Claim(context.Background(), tx, slot.ID, ids.student2); !domainerrors.IsSentinel(err, domainerrors.ErrNotFound) {
		t.Fatalf("err = %v, want ErrNotFound on optimistic lock miss", err)
	}
}

func TestTeamSlotRepoClaimOnlyAllowedStatuses(t *testing.T) {
	db := testDB(t)
	ids := seed(t, db)
	repo := NewTeamSlotRepo(db)

	slot := teamSlotByRole(t, db, ids.taskTeam, "BIZ")

	// CLAIMED → SUBMITTED, после чего CLAIM запрещён.
	tx := testTx(t, db)

	if _, err := repo.Claim(context.Background(), tx, slot.ID, ids.student1); err != nil {
		t.Fatalf("Claim: %v", err)
	}

	ready := time.Date(2027, 12, 1, 12, 0, 0, 0, time.UTC)

	if _, err := repo.MarkSubmitted(context.Background(), tx, slot.ID, ids.student1, "https://parta.local/slot.zip", "sha256:s", ready); err != nil {
		t.Fatalf("MarkSubmitted: %v", err)
	}

	if err := tx.Commit(); err != nil {
		t.Fatalf("commit: %v", err)
	}

	submitted, err := repo.GetByID(context.Background(), slot.ID)
	if err != nil {
		t.Fatalf("GetByID: %v", err)
	}

	if submitted.Status != TeamSlotStatusSubmitted {
		t.Fatalf("Status = %q, want SUBMITTED", submitted.Status)
	}

	if submitted.ArtifactURL == "" || submitted.ReadyAt == nil {
		t.Fatalf("artifact not stored: %+v", submitted)
	}

	tx2 := testTx(t, db)

	if _, err := repo.Claim(context.Background(), tx2, slot.ID, ids.student2); !domainerrors.IsSentinel(err, domainerrors.ErrNotFound) {
		t.Fatalf("err = %v, want ErrNotFound for SUBMITTED slot", err)
	}
}

func TestTeamSlotRepoCarryOver(t *testing.T) {
	db := testDB(t)
	ids := seed(t, db)
	repo := NewTeamSlotRepo(db)

	slot := teamSlotByRole(t, db, ids.taskTeam, "DB")

	// Слот занят первым студентом и затем брошен: по spec/00_ARCHITECTURE.md §IV.3
	// перехват разрешён только для OPEN/ABANDONED/REJECTED, не для CLAIMED.
	claimSlot(t, db, repo, slot.ID, ids.student1)
	abandonSlot(t, db, slot.ID)

	// Перехват отдаёт слот второму и возвращает прежнего владельца.
	tx := testTx(t, db)

	updated, previous, err := repo.CarryOver(context.Background(), tx, slot.ID, ids.student2)
	if err != nil {
		t.Fatalf("CarryOver: %v", err)
	}

	if updated.Status != TeamSlotStatusClaimed {
		t.Fatalf("Status = %q, want CLAIMED", updated.Status)
	}

	if updated.AssignedUserID == nil || *updated.AssignedUserID != ids.student2 {
		t.Fatalf("AssignedUserID = %v, want %d", updated.AssignedUserID, ids.student2)
	}

	if previous == nil || *previous != ids.student1 {
		t.Fatalf("previous = %v, want %d", previous, ids.student1)
	}

	if err := tx.Commit(); err != nil {
		t.Fatalf("commit: %v", err)
	}
}

func TestTeamSlotRepoCarryOverClaimedSlotFails(t *testing.T) {
	db := testDB(t)
	ids := seed(t, db)
	repo := NewTeamSlotRepo(db)

	slot := teamSlotByRole(t, db, ids.taskTeam, "DB")
	claimSlot(t, db, repo, slot.ID, ids.student1)

	tx := testTx(t, db)

	if _, _, err := repo.CarryOver(context.Background(), tx, slot.ID, ids.student2); !domainerrors.IsSentinel(err, domainerrors.ErrNotFound) {
		t.Fatalf("err = %v, want ErrNotFound for CLAIMED slot", err)
	}
}

func TestTeamSlotRepoCarryOverOpenSlotHasNoPreviousOwner(t *testing.T) {
	db := testDB(t)
	ids := seed(t, db)
	repo := NewTeamSlotRepo(db)

	slot := teamSlotByRole(t, db, ids.taskTeam, "BIZ")

	tx := testTx(t, db)

	updated, previous, err := repo.CarryOver(context.Background(), tx, slot.ID, ids.student1)
	if err != nil {
		t.Fatalf("CarryOver: %v", err)
	}

	if updated.AssignedUserID == nil || *updated.AssignedUserID != ids.student1 {
		t.Fatalf("AssignedUserID = %v, want %d", updated.AssignedUserID, ids.student1)
	}

	if previous != nil {
		t.Fatalf("previous = %v, want nil for a free slot", *previous)
	}
}

func TestTeamSlotRepoCarryOverTerminalSlotFails(t *testing.T) {
	db := testDB(t)
	ids := seed(t, db)
	repo := NewTeamSlotRepo(db)

	slot := teamSlotByRole(t, db, ids.taskTeam, "DB")

	// Доводим слот до ACCEPTED.
	tx := testTx(t, db)

	if _, err := repo.Claim(context.Background(), tx, slot.ID, ids.student1); err != nil {
		t.Fatalf("Claim: %v", err)
	}

	ready := time.Date(2027, 12, 1, 12, 0, 0, 0, time.UTC)

	if _, err := repo.MarkSubmitted(context.Background(), tx, slot.ID, ids.student1, "https://parta.local/s.mp4", "sha256:x", ready); err != nil {
		t.Fatalf("MarkSubmitted: %v", err)
	}

	if _, err := tx.ExecContext(context.Background(),
		`UPDATE team_slots SET status = 'ACCEPTED' WHERE id = ?`, slot.ID); err != nil {
		t.Fatalf("accept: %v", err)
	}

	if err := tx.Commit(); err != nil {
		t.Fatalf("commit: %v", err)
	}

	tx2 := testTx(t, db)

	if _, _, err := repo.CarryOver(context.Background(), tx2, slot.ID, ids.student2); !domainerrors.IsSentinel(err, domainerrors.ErrNotFound) {
		t.Fatalf("err = %v, want ErrNotFound for ACCEPTED slot", err)
	}
}

// abandonSlot бросает занятый слот в отдельной транзакции. Владелец остаётся
// в assigned_user_id: этого требует CHECK для статуса ABANDONED.
func abandonSlot(t *testing.T, db *sqlDB, slotID int64) {
	t.Helper()

	tx := testTx(t, db)

	if _, err := tx.ExecContext(context.Background(),
		`UPDATE team_slots SET status = 'ABANDONED' WHERE id = ?`, slotID); err != nil {
		t.Fatalf("abandon: %v", err)
	}

	if err := tx.Commit(); err != nil {
		t.Fatalf("commit: %v", err)
	}
}

// claimSlot занимает слот в отдельной транзакции.
func claimSlot(t *testing.T, db *sqlDB, repo *TeamSlotRepo, slotID, userID int64) *TeamSlot {
	t.Helper()

	tx := testTx(t, db)

	slot, err := repo.Claim(context.Background(), tx, slotID, userID)
	if err != nil {
		t.Fatalf("Claim: %v", err)
	}

	if err := tx.Commit(); err != nil {
		t.Fatalf("commit: %v", err)
	}

	return slot
}
