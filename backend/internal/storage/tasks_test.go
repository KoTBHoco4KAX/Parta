package storage

import (
	"context"
	"testing"
	"time"

	domainerrors "github.com/parta/backend/internal/domain/errors"
)

func TestTaskRepoGetByID(t *testing.T) {
	db := testDB(t)
	ids := seed(t, db)
	repo := NewTaskRepo(db)

	task, err := repo.GetByID(context.Background(), ids.taskLab)
	if err != nil {
		t.Fatalf("GetByID: %v", err)
	}

	if task.Title != "Лабораторная №1: нормализация схемы" {
		t.Fatalf("Title = %q", task.Title)
	}

	if task.TaskType != "LAB_CODE" {
		t.Fatalf("TaskType = %q", task.TaskType)
	}

	if task.AssignedTeacherID != ids.teacher {
		t.Fatalf("AssignedTeacherID = %d, want %d", task.AssignedTeacherID, ids.teacher)
	}

	if task.Status != "PUBLISHED" {
		t.Fatalf("Status = %q", task.Status)
	}

	if task.RequirementsCount != 8 {
		t.Fatalf("RequirementsCount = %d, want 8", task.RequirementsCount)
	}

	if task.ExpectedHours != 4.0 {
		t.Fatalf("ExpectedHours = %v, want 4.0", task.ExpectedHours)
	}

	if task.SpeedrunWindow != 48*time.Hour {
		t.Fatalf("SpeedrunWindow = %v, want 48h", task.SpeedrunWindow)
	}

	if task.BaseXP != 400 {
		t.Fatalf("BaseXP = %d, want 400", task.BaseXP)
	}

	if task.DeadlineAt.IsZero() || task.CreatedAt.IsZero() || task.UpdatedAt.IsZero() {
		t.Fatalf("timestamps not parsed: %+v", task)
	}

	if task.AssignmentID == 0 {
		t.Fatal("AssignmentID must be filled")
	}
}

func TestTaskRepoGetByIDNotFound(t *testing.T) {
	db := testDB(t)

	if _, err := NewTaskRepo(db).GetByID(context.Background(), 999999); !domainerrors.IsSentinel(err, domainerrors.ErrNotFound) {
		t.Fatalf("err = %v, want ErrNotFound", err)
	}
}

func TestTaskRepoListByGroup(t *testing.T) {
	db := testDB(t)
	ids := seed(t, db)
	repo := NewTaskRepo(db)

	tasks, err := repo.ListByGroup(context.Background(), ids.groupIS21)
	if err != nil {
		t.Fatalf("ListByGroup: %v", err)
	}

	if len(tasks) != 2 {
		t.Fatalf("len = %d, want 2 tasks for IS-21", len(tasks))
	}

	for _, task := range tasks {
		if task.AssignedTeacherID != ids.teacher {
			t.Fatalf("task %d teacher = %d, want %d", task.ID, task.AssignedTeacherID, ids.teacher)
		}
	}

	teamTasks, err := repo.ListByGroup(context.Background(), ids.groupIS22)
	if err != nil {
		t.Fatalf("ListByGroup(IS-22): %v", err)
	}

	if len(teamTasks) != 0 {
		t.Fatalf("len = %d, want 0 tasks for IS-22", len(teamTasks))
	}
}

func TestTaskRepoCreate(t *testing.T) {
	db := testDB(t)
	ids := seed(t, db)
	repo := NewTaskRepo(db)

	task, err := repo.Create(context.Background(), CreateTaskInput{
		AssignmentID:      assignmentID(t, db, "IS-21", "DB"),
		Title:             "Лабораторная №2: индексы",
		DescriptionMD:     "Описать план запроса и индексы.",
		TaskType:          "LAB_CODE",
		RequirementsCount: 5,
		ExpectedHours:     3.5,
		DeadlineAt:        "2027-11-30T18:00:00.000Z",
		SpeedrunWindow:    24,
		TeamSize:          1,
		BaseXP:            300,
		Status:            "PUBLISHED",
	})
	if err != nil {
		t.Fatalf("Create: %v", err)
	}

	if task.ID == 0 {
		t.Fatal("Create did not return an id")
	}

	if task.Title != "Лабораторная №2: индексы" {
		t.Fatalf("Title = %q", task.Title)
	}

	if task.SpeedrunWindow != 24*time.Hour {
		t.Fatalf("SpeedrunWindow = %v, want 24h", task.SpeedrunWindow)
	}

	if task.AssignedTeacherID != ids.teacher {
		t.Fatalf("AssignedTeacherID = %d, want %d", task.AssignedTeacherID, ids.teacher)
	}

	deadline, err := parseTime("2027-11-30T18:00:00.000Z")
	if err != nil {
		t.Fatalf("parseTime: %v", err)
	}

	if !task.DeadlineAt.Equal(deadline) {
		t.Fatalf("DeadlineAt = %v, want %v", task.DeadlineAt, deadline)
	}
}

func TestTaskRepoCreateInvalidType(t *testing.T) {
	db := testDB(t)
	repo := NewTaskRepo(db)

	_, err := repo.Create(context.Background(), CreateTaskInput{
		AssignmentID:      assignmentID(t, db, "IS-21", "DB"),
		Title:             "Плохой тип",
		DescriptionMD:     "x",
		TaskType:          "NOT_A_TYPE",
		RequirementsCount: 1,
		ExpectedHours:     1,
		DeadlineAt:        "2027-11-30T18:00:00.000Z",
		SpeedrunWindow:    24,
		TeamSize:          1,
		BaseXP:            100,
		Status:            "PUBLISHED",
	})
	if !domainerrors.IsSentinel(err, domainerrors.ErrGuardFailed) {
		t.Fatalf("err = %v, want ErrGuardFailed from CHECK constraint", err)
	}
}

func TestTaskRepoUpdateBaseXP(t *testing.T) {
	db := testDB(t)
	ids := seed(t, db)
	repo := NewTaskRepo(db)

	tx := testTx(t, db)

	if err := repo.UpdateBaseXP(context.Background(), tx, ids.taskLab, 512); err != nil {
		t.Fatalf("UpdateBaseXP: %v", err)
	}

	if err := tx.Commit(); err != nil {
		t.Fatalf("commit: %v", err)
	}

	task, err := repo.GetByID(context.Background(), ids.taskLab)
	if err != nil {
		t.Fatalf("GetByID: %v", err)
	}

	if task.BaseXP != 512 {
		t.Fatalf("BaseXP = %d, want 512", task.BaseXP)
	}

	tx2 := testTx(t, db)

	if err := repo.UpdateBaseXP(context.Background(), tx2, 999999, 1); !domainerrors.IsSentinel(err, domainerrors.ErrNotFound) {
		t.Fatalf("err = %v, want ErrNotFound", err)
	}
}
