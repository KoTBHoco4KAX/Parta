package tests

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strconv"
	"sync/atomic"
	"testing"
	"time"

	"github.com/parta/backend/internal/config"
	httpapi "github.com/parta/backend/internal/http"
	"github.com/parta/backend/internal/storage"
)

// topUpSeq делает ключи идемпотентности тестовых начислений уникальными.
var topUpSeq int64

// testJWTSecret — секрет, которым подписаны токены тестового сервера.
const testJWTSecret = "test-secret"

// harness — поднятый httptest-сервер поверх изолированной БД с миграциями и сидом.
type harness struct {
	t      *testing.T
	db     *sql.DB
	server *httptest.Server
	cfg    config.Config
	client *http.Client
}

// seedIDs — идентификаторы сид-данных миграции 002.
type seedIDs struct {
	admin        int64
	teacher      int64
	student1     int64
	student2     int64
	student3     int64
	groupIS21    int64
	groupIS22    int64
	taskLab      int64
	taskTeam     int64
	assignment21 int64
	slotDB       int64
	slotBIZ      int64
}

// newHarness поднимает сервер в dev-окружении.
func newHarness(t *testing.T) *harness {
	t.Helper()

	return newHarnessEnv(t, "dev")
}

// newHarnessEnv поднимает сервер с заданным PARTA_ENV.
func newHarnessEnv(t *testing.T, env string) *harness {
	t.Helper()

	return newHarnessWith(t, env)
}

// newHarnessWith поднимает сервер с заданным PARTA_ENV и опциями httpapi.New.
func newHarnessWith(t *testing.T, env string, opts ...httpapi.Option) *harness {
	t.Helper()

	path := filepath.Join(t.TempDir(), "parta_http.db")

	db, err := storage.Open(path)
	if err != nil {
		t.Fatalf("storage.Open: %v", err)
	}

	if err := storage.Migrate(context.Background(), db); err != nil {
		t.Fatalf("storage.Migrate: %v", err)
	}

	cfg := config.Config{JWTSecret: testJWTSecret, Env: env, DBPath: path}

	server := httptest.NewServer(httpapi.New(cfg, db, opts...).Handler())

	t.Cleanup(func() {
		server.Close()
		_ = db.Close()
	})

	return &harness{t: t, db: db, server: server, cfg: cfg, client: server.Client()}
}

// request отправляет JSON-запрос и возвращает статус и разобранное тело.
func (h *harness) request(t *testing.T, method, path, token string, body any) (int, map[string]any) {
	t.Helper()

	var reader io.Reader

	if body != nil {
		payload, err := json.Marshal(body)
		if err != nil {
			t.Fatalf("marshal request: %v", err)
		}

		reader = bytes.NewReader(payload)
	}

	req, err := http.NewRequest(method, h.server.URL+path, reader)
	if err != nil {
		t.Fatalf("new request: %v", err)
	}

	req.Header.Set("Content-Type", "application/json")

	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}

	resp, err := h.client.Do(req)
	if err != nil {
		t.Fatalf("%s %s: %v", method, path, err)
	}
	defer resp.Body.Close()

	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatalf("read body: %v", err)
	}

	payload := map[string]any{}

	if len(bytes.TrimSpace(raw)) > 0 {
		if err := json.Unmarshal(raw, &payload); err != nil {
			t.Fatalf("%s %s: body is not JSON: %q", method, path, string(raw))
		}
	}

	return resp.StatusCode, payload
}

// login выполняет dev-login и возвращает токен.
func (h *harness) login(t *testing.T, email string) string {
	t.Helper()

	status, body := h.request(t, http.MethodPost, "/api/auth/dev-login", "", map[string]any{"email": email})
	if status != http.StatusOK {
		t.Fatalf("dev-login(%s) = %d %v, want 200", email, status, body)
	}

	token, ok := body["token"].(string)
	if !ok || token == "" {
		t.Fatalf("dev-login(%s): no token in %v", email, body)
	}

	return token
}

// seed читает идентификаторы сид-данных.
func (h *harness) seed() seedIDs {
	h.t.Helper()

	var ids seedIDs

	queries := []struct {
		query string
		dest  *int64
		arg   any
	}{
		{`SELECT id FROM users WHERE external_id = ?`, &ids.admin, "admin@parta.dev"},
		{`SELECT id FROM users WHERE external_id = ?`, &ids.teacher, "teacher@parta.dev"},
		{`SELECT id FROM users WHERE external_id = ?`, &ids.student1, "student1@parta.dev"},
		{`SELECT id FROM users WHERE external_id = ?`, &ids.student2, "student2@parta.dev"},
		{`SELECT id FROM users WHERE external_id = ?`, &ids.student3, "student3@parta.dev"},
		{`SELECT id FROM groups WHERE code = ?`, &ids.groupIS21, "IS-21"},
		{`SELECT id FROM groups WHERE code = ?`, &ids.groupIS22, "IS-22"},
		{`SELECT id FROM tasks WHERE task_type = 'LAB_CODE'`, &ids.taskLab, nil},
		{`SELECT id FROM tasks WHERE task_type = 'TEAM_PROJECT'`, &ids.taskTeam, nil},
		{`SELECT ta.id FROM teacher_assignments ta
		  JOIN groups g ON g.id = ta.group_id
		  WHERE g.code = 'IS-21'`, &ids.assignment21, nil},
		{`SELECT ts.id FROM team_slots ts JOIN tasks t ON t.id = ts.task_id
		  WHERE t.task_type = 'TEAM_PROJECT' AND ts.role_code = 'DB'`, &ids.slotDB, nil},
		{`SELECT ts.id FROM team_slots ts JOIN tasks t ON t.id = ts.task_id
		  WHERE t.task_type = 'TEAM_PROJECT' AND ts.role_code = 'BIZ'`, &ids.slotBIZ, nil},
	}

	for _, q := range queries {
		var err error

		if q.arg == nil {
			err = h.db.QueryRow(q.query).Scan(q.dest)
		} else {
			err = h.db.QueryRow(q.query, q.arg).Scan(q.dest)
		}

		if err != nil {
			h.t.Fatalf("seed query %q: %v", q.query, err)
		}
	}

	return ids
}

// exec выполняет запись в БД харнесса.
func (h *harness) exec(query string, args ...any) {
	h.t.Helper()

	if _, err := h.db.Exec(query, args...); err != nil {
		h.t.Fatalf("exec %q: %v", query, err)
	}
}

// scalarInt читает одно целое из БД.
func (h *harness) scalarInt(query string, args ...any) int64 {
	h.t.Helper()

	var value int64

	if err := h.db.QueryRow(query, args...).Scan(&value); err != nil {
		h.t.Fatalf("scalarInt %q: %v", query, err)
	}

	return value
}

// scalarString читает одну строку из БД.
func (h *harness) scalarString(query string, args ...any) string {
	h.t.Helper()

	var value string

	if err := h.db.QueryRow(query, args...).Scan(&value); err != nil {
		h.t.Fatalf("scalarString %q: %v", query, err)
	}

	return value
}

// topUpXP начисляет студенту XP через журнал.
func (h *harness) topUpXP(userID int64, amount int) {
	h.t.Helper()

	tx, err := h.db.BeginTx(context.Background(), nil)
	if err != nil {
		h.t.Fatalf("begin tx: %v", err)
	}

	_, err = storage.NewXPLedgerRepo(h.db).Post(context.Background(), tx, storage.PostLedgerInput{
		UserID:         userID,
		Amount:         amount,
		Reason:         storage.ReasonAdminAdjustment,
		SourceType:     storage.SourceSystem,
		IdempotencyKey: "test:topup:" + strconv.FormatInt(atomic.AddInt64(&topUpSeq, 1), 10),
	})
	if err != nil {
		_ = tx.Rollback()
		h.t.Fatalf("topUpXP: %v", err)
	}

	if err := tx.Commit(); err != nil {
		h.t.Fatalf("topUpXP commit: %v", err)
	}
}

// createSubmission ставит карточку студента в нужный статус.
func (h *harness) createSubmission(taskID, studentID int64, target string) int64 {
	h.t.Helper()

	ctx := context.Background()

	sub, _, err := storage.NewSubmissionRepo(h.db).CreateIfNotExists(ctx, taskID, studentID)
	if err != nil {
		h.t.Fatalf("create submission: %v", err)
	}

	if target == "TODO" {
		return sub.ID
	}

	h.advanceSubmission(sub.ID, studentID, "IN_PROGRESS")
	if target == "IN_PROGRESS" {
		return sub.ID
	}

	h.advanceSubmission(sub.ID, studentID, "REVIEW")

	return sub.ID
}

// advanceSubmission двигает карточку в нужный статус в обход HTTP.
func (h *harness) advanceSubmission(subID, studentID int64, target string) {
	h.t.Helper()

	ctx := context.Background()
	repo := storage.NewSubmissionRepo(h.db)

	tx, err := h.db.BeginTx(ctx, nil)
	if err != nil {
		h.t.Fatalf("begin tx: %v", err)
	}

	defer func() { _ = tx.Rollback() }()

	now := time.Now()

	url, hash := "https://parta.local/artifact.zip", "sha256:deadbeef"

	switch target {
	case "IN_PROGRESS":
		_, err = repo.UpdateStatus(ctx, tx, storage.UpdateStatusInput{
			ID:           subID,
			ExpectedFrom: "TODO",
			To:           "IN_PROGRESS",
			ActorID:      studentID,
			Now:          now,
		})
	case "REVIEW":
		_, err = repo.UpdateStatus(ctx, tx, storage.UpdateStatusInput{
			ID:           subID,
			ExpectedFrom: "IN_PROGRESS",
			To:           "REVIEW",
			ActorID:      studentID,
			Now:          now,
			ArtifactURL:  &url,
			ArtifactHash: &hash,
		})
	default:
		h.t.Fatalf("unsupported target status %q", target)
	}

	if err != nil {
		h.t.Fatalf("advance submission to %s: %v", target, err)
	}

	if err := tx.Commit(); err != nil {
		h.t.Fatalf("advance submission commit: %v", err)
	}
}

// addTeacher заводит второго преподавателя и возвращает его email.
func (h *harness) addTeacher(email string) string {
	h.t.Helper()

	h.exec(`INSERT INTO users (external_id, role, group_id, display_name) VALUES (?, 'teacher', NULL, 'Второй преподаватель')`, email)

	return email
}

// itoa64 печатает идентификатор для путей запросов.
func itoa64(value int64) string {
	return strconv.FormatInt(value, 10)
}
