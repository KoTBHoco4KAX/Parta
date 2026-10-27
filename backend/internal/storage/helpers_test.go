package storage

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"testing"
	"time"

	domainerrors "github.com/parta/backend/internal/domain/errors"
	"github.com/parta/backend/internal/domain/submission"
)

func TestMapSQLError(t *testing.T) {
	cases := []struct {
		name    string
		err     error
		want    error
		notSent bool
	}{
		{name: "nil stays nil", err: nil},
		{name: "no rows to not found", err: sql.ErrNoRows, want: domainerrors.ErrNotFound},
		{name: "wrapped no rows", err: fmt.Errorf("query: %w", sql.ErrNoRows), want: domainerrors.ErrNotFound},
		{name: "unique constraint", err: errors.New("UNIQUE constraint failed: users.external_id"), want: domainerrors.ErrAlreadyExists},
		{name: "check constraint", err: errors.New("CHECK constraint failed: role_check"), want: domainerrors.ErrGuardFailed},
		{name: "foreign key", err: errors.New("FOREIGN KEY constraint failed"), want: domainerrors.ErrGuardFailed},
		{name: "generic constraint failed", err: errors.New("constraint failed: idx_users_group_role"), want: domainerrors.ErrAlreadyExists},
		{name: "unknown error is wrapped", err: errors.New("disk I/O error"), notSent: true},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := MapSQLError(tc.err)

			if tc.err == nil {
				if got != nil {
					t.Fatalf("MapSQLError(nil) = %v, want nil", got)
				}
				return
			}

			if tc.notSent {
				if !errors.Is(got, tc.err) {
					t.Fatalf("MapSQLError() = %v, want it to wrap %v", got, tc.err)
				}
				return
			}

			if !domainerrors.IsSentinel(got, tc.want) {
				t.Fatalf("MapSQLError(%v) = %v, want %v", tc.err, got, tc.want)
			}
		})
	}
}

// sqlDB — псевдоним для краткости подписей тестовых хелперов.
type sqlDB = sql.DB

// testDB поднимает изолированную БД в temp-файле и применяет миграции с сидом.
// :memory: не используется: с SetMaxOpenConns(1) и WAL pragma из spec
// открытие in-memory базы упирается в «database is locked».
func testDB(t *testing.T) *sql.DB {
	t.Helper()

	path := filepath.Join(t.TempDir(), "parta_test.db")

	db, err := Open(path)
	if err != nil {
		t.Fatalf("storage.Open: %v", err)
	}

	t.Cleanup(func() {
		_ = db.Close()
		_ = os.Remove(path)
	})

	if err := Migrate(context.Background(), db); err != nil {
		t.Fatalf("storage.Migrate: %v", err)
	}

	return db
}

// testTx запускает транзакцию и откатывает её по завершении теста, если она не закоммичена.
func testTx(t *testing.T, db *sql.DB) *sql.Tx {
	t.Helper()

	tx, err := db.BeginTx(context.Background(), nil)
	if err != nil {
		t.Fatalf("begin tx: %v", err)
	}

	t.Cleanup(func() {
		_ = tx.Rollback()
	})

	return tx
}

// seedIDs возвращает идентификаторы сид-данных миграции 002.
type seedIDs struct {
	groupIS21  int64
	groupIS22  int64
	admin      int64
	teacher    int64
	student1   int64
	student2   int64
	student3   int64
	taskLab    int64
	taskTeam   int64
	discipline int64
}

// seed загружает идентификаторы сид-данных.
func seed(t *testing.T, db *sql.DB) seedIDs {
	t.Helper()

	var ids seedIDs

	cases := []struct {
		query string
		dest  *int64
		arg   any
	}{
		{`SELECT id FROM groups WHERE code = ?`, &ids.groupIS21, "IS-21"},
		{`SELECT id FROM groups WHERE code = ?`, &ids.groupIS22, "IS-22"},
		{`SELECT id FROM users WHERE external_id = ?`, &ids.admin, "admin@parta.dev"},
		{`SELECT id FROM users WHERE external_id = ?`, &ids.teacher, "teacher@parta.dev"},
		{`SELECT id FROM users WHERE external_id = ?`, &ids.student1, "student1@parta.dev"},
		{`SELECT id FROM users WHERE external_id = ?`, &ids.student2, "student2@parta.dev"},
		{`SELECT id FROM users WHERE external_id = ?`, &ids.student3, "student3@parta.dev"},
		{`SELECT id FROM tasks WHERE task_type = 'LAB_CODE'`, &ids.taskLab, nil},
		{`SELECT id FROM tasks WHERE task_type = 'TEAM_PROJECT'`, &ids.taskTeam, nil},
		{`SELECT id FROM disciplines WHERE code = ?`, &ids.discipline, "DB"},
	}

	for _, c := range cases {
		var err error

		if c.arg == nil {
			err = db.QueryRow(c.query).Scan(c.dest)
		} else {
			err = db.QueryRow(c.query, c.arg).Scan(c.dest)
		}

		if err != nil {
			t.Fatalf("seed query %q: %v", c.query, err)
		}
	}

	return ids
}

// topUpXP начисляет студенту XP, чтобы тесты не упирались в нулевой баланс.
func topUpXP(t *testing.T, db *sql.DB, userID int64, amount int) {
	t.Helper()

	tx := testTx(t, db)

	_, err := NewXPLedgerRepo(db).Post(context.Background(), tx, PostLedgerInput{
		UserID:         userID,
		Amount:         amount,
		Reason:         ReasonAdminAdjustment,
		SourceType:     SourceSystem,
		IdempotencyKey: fmt.Sprintf("test:topup:%d", time.Now().UnixNano()),
	})
	if err != nil {
		t.Fatalf("topUpXP: %v", err)
	}

	if err := tx.Commit(); err != nil {
		t.Fatalf("topUpXP commit: %v", err)
	}
}

// assignmentID возвращает id назначения преподавателя по коду группы и дисциплины.
func assignmentID(t *testing.T, db *sql.DB, groupCode, disciplineCode string) int64 {
	t.Helper()

	var id int64

	err := db.QueryRow(
		`SELECT ta.id
		 FROM teacher_assignments ta
		 JOIN groups g ON g.id = ta.group_id
		 JOIN disciplines d ON d.id = ta.discipline_id
		 WHERE g.code = ? AND d.code = ?`, groupCode, disciplineCode).Scan(&id)
	if err != nil {
		t.Fatalf("assignmentID(%s, %s): %v", groupCode, disciplineCode, err)
	}

	return id
}

// createSubmission создаёт индивидуальную карточку работы студента.
func createSubmission(t *testing.T, db *sql.DB, taskID, studentID int64) *submission.Submission {
	t.Helper()

	sub, _, err := NewSubmissionRepo(db).CreateIfNotExists(context.Background(), taskID, studentID)
	if err != nil {
		t.Fatalf("createSubmission: %v", err)
	}

	return sub
}

// teamSlotByRole возвращает слот командного проекта по коду роли.
func teamSlotByRole(t *testing.T, db *sql.DB, taskID int64, roleCode string) *TeamSlot {
	t.Helper()

	slots, err := NewTeamSlotRepo(db).ListByTask(context.Background(), taskID)
	if err != nil {
		t.Fatalf("ListByTask: %v", err)
	}

	for _, slot := range slots {
		if slot.RoleCode == roleCode {
			return &slot
		}
	}

	t.Fatalf("slot %q not found for task %d", roleCode, taskID)

	return nil
}
