package storage

import (
	"context"
	"testing"

	domainerrors "github.com/parta/backend/internal/domain/errors"
)

func TestGroupRepoCreateGetByID(t *testing.T) {
	db := testDB(t)
	repo := NewGroupRepo(db)

	created, err := repo.Create(context.Background(), "IS-23", "ИС-23 Информационные системы")
	if err != nil {
		t.Fatalf("Create: %v", err)
	}

	if created.ID == 0 {
		t.Fatal("Create did not return an id")
	}

	if created.Code != "IS-23" || created.Title != "ИС-23 Информационные системы" {
		t.Fatalf("created = %+v", created)
	}

	if created.CreatedAt.IsZero() || created.UpdatedAt.IsZero() {
		t.Fatalf("timestamps not parsed: %+v", created)
	}

	fetched, err := repo.GetByID(context.Background(), created.ID)
	if err != nil {
		t.Fatalf("GetByID: %v", err)
	}

	if fetched.Code != created.Code || fetched.Title != created.Title {
		t.Fatalf("round trip mismatch: %+v vs %+v", fetched, created)
	}
}

func TestGroupRepoDuplicateCode(t *testing.T) {
	db := testDB(t)
	repo := NewGroupRepo(db)

	if _, err := repo.Create(context.Background(), "IS-21", "Дубликат кода"); !domainerrors.IsSentinel(err, domainerrors.ErrAlreadyExists) {
		t.Fatalf("err = %v, want ErrAlreadyExists", err)
	}
}

func TestGroupRepoGetByIDNotFound(t *testing.T) {
	db := testDB(t)
	repo := NewGroupRepo(db)

	if _, err := repo.GetByID(context.Background(), 999999); !domainerrors.IsSentinel(err, domainerrors.ErrNotFound) {
		t.Fatalf("err = %v, want ErrNotFound", err)
	}
}

func TestGroupRepoList(t *testing.T) {
	db := testDB(t)
	repo := NewGroupRepo(db)

	groups, err := repo.List(context.Background())
	if err != nil {
		t.Fatalf("List: %v", err)
	}

	if len(groups) != 2 {
		t.Fatalf("len = %d, want 2 seed groups", len(groups))
	}

	if groups[0].Code != "IS-21" || groups[1].Code != "IS-22" {
		t.Fatalf("list is not ordered by code: %+v", groups)
	}
}

func TestGroupRepoUpdate(t *testing.T) {
	db := testDB(t)
	ids := seed(t, db)
	repo := NewGroupRepo(db)

	updated, err := repo.Update(context.Background(), ids.groupIS22, "IS-22", "ИС-22 (обновлено)")
	if err != nil {
		t.Fatalf("Update: %v", err)
	}

	if updated.Title != "ИС-22 (обновлено)" {
		t.Fatalf("Title = %q", updated.Title)
	}

	if _, err := repo.Update(context.Background(), 999999, "X", "Y"); !domainerrors.IsSentinel(err, domainerrors.ErrNotFound) {
		t.Fatalf("err = %v, want ErrNotFound", err)
	}
}

func TestGroupRepoDelete(t *testing.T) {
	db := testDB(t)
	repo := NewGroupRepo(db)

	group, err := repo.Create(context.Background(), "IS-99", "Временная группа")
	if err != nil {
		t.Fatalf("Create: %v", err)
	}

	if err := repo.Delete(context.Background(), group.ID); err != nil {
		t.Fatalf("Delete: %v", err)
	}

	if _, err := repo.GetByID(context.Background(), group.ID); !domainerrors.IsSentinel(err, domainerrors.ErrNotFound) {
		t.Fatalf("err = %v, want ErrNotFound after delete", err)
	}

	if err := repo.Delete(context.Background(), group.ID); !domainerrors.IsSentinel(err, domainerrors.ErrNotFound) {
		t.Fatalf("err = %v, want ErrNotFound on second delete", err)
	}
}

func TestGroupRepoDeleteReferencedGroup(t *testing.T) {
	db := testDB(t)
	ids := seed(t, db)
	repo := NewGroupRepo(db)

	if err := repo.Delete(context.Background(), ids.groupIS21); !domainerrors.IsSentinel(err, domainerrors.ErrGuardFailed) {
		t.Fatalf("err = %v, want ErrGuardFailed for FK violation", err)
	}
}
