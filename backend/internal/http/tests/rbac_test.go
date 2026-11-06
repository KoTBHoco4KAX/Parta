package tests

import (
	"net/http"
	"testing"
	"time"

	httpapi "github.com/parta/backend/internal/http"
)

// TestStudentCannotCallStaffEndpoints фиксирует RBAC на границе маршрутов:
// роль проверяется middleware до тела запроса и бизнес-логики.
func TestStudentCannotCallStaffEndpoints(t *testing.T) {
	h := newHarness(t)
	_ = h.seed()
	token := h.login(t, "student1@parta.dev")

	cases := []struct {
		method string
		path   string
		body   any
	}{
		{http.MethodPost, "/api/tasks", map[string]any{}},
		{http.MethodPost, "/api/tasks/1/repeat", map[string]any{}},
		{http.MethodGet, "/api/task-templates", nil},
		{http.MethodPost, "/api/task-templates", map[string]any{}},
		{http.MethodDelete, "/api/task-templates/1", nil},
		{http.MethodPost, "/api/task-templates/1/issue", map[string]any{}},
		{http.MethodGet, "/api/users", nil},
		{http.MethodPost, "/api/users", map[string]any{}},
		{http.MethodDelete, "/api/users/1", nil},
		{http.MethodGet, "/api/groups", nil},
		{http.MethodPost, "/api/groups", map[string]any{}},
		{http.MethodDelete, "/api/groups/1", nil},
		{http.MethodGet, "/api/assignments", nil},
		{http.MethodPost, "/api/submissions/1/verdict", map[string]any{"verdict": "ACCEPT"}},
	}

	for _, tc := range cases {
		t.Run(tc.method+" "+tc.path, func(t *testing.T) {
			status, body := h.request(t, tc.method, tc.path, token, tc.body)
			if status != http.StatusForbidden {
				t.Fatalf("status = %d, want 403 (%v)", status, body)
			}

			if body["code"] != "forbidden" {
				t.Fatalf("code = %v, want forbidden", body["code"])
			}
		})
	}
}

// TestTeacherCannotCallStudentEndpoints проверяет обратное направление RBAC.
func TestTeacherCannotCallStudentEndpoints(t *testing.T) {
	h := newHarness(t)
	_ = h.seed()
	token := h.login(t, "teacher@parta.dev")

	cases := []struct {
		method string
		path   string
		body   any
	}{
		{http.MethodPost, "/api/submissions", map[string]any{}},
		{http.MethodPost, "/api/submissions/1/submit", nil},
		{http.MethodPatch, "/api/submissions/1/status", map[string]any{}},
		{http.MethodPost, "/api/users/me/streak-freezes/purchase", map[string]any{}},
		{http.MethodGet, "/api/answers", nil},
		{http.MethodGet, "/api/answers/queue/next", nil},
		{http.MethodPost, "/api/answers/drafts", map[string]any{}},
		{http.MethodPost, "/api/answers/drafts/1/comments", map[string]any{}},
		{http.MethodPost, "/api/answers/comments/1/reaction", map[string]any{}},
		{http.MethodPost, "/api/team-slots/1/carry-over", nil},
	}

	for _, tc := range cases {
		t.Run(tc.method+" "+tc.path, func(t *testing.T) {
			status, body := h.request(t, tc.method, tc.path, token, tc.body)
			if status != http.StatusForbidden {
				t.Fatalf("status = %d, want 403 (%v)", status, body)
			}

			if body["code"] != "forbidden" {
				t.Fatalf("code = %v, want forbidden", body["code"])
			}
		})
	}
}

// TestTeacherCannotCallAdminEndpoints: управление пользователями и удаление
// групп доступно только администратору. GET/POST /api/groups преподавателю
// разрешены отдельно: он видит и создаёт только свои группы (см. teacher_api).
func TestTeacherCannotCallAdminEndpoints(t *testing.T) {
	h := newHarness(t)
	_ = h.seed()
	token := h.login(t, "teacher@parta.dev")

	cases := []struct {
		method string
		path   string
		body   any
	}{
		{http.MethodGet, "/api/users", nil},
		{http.MethodPost, "/api/users", map[string]any{}},
		{http.MethodDelete, "/api/users/1", nil},
		{http.MethodDelete, "/api/groups/1", nil},
	}

	for _, tc := range cases {
		t.Run(tc.method+" "+tc.path, func(t *testing.T) {
			status, body := h.request(t, tc.method, tc.path, token, tc.body)
			if status != http.StatusForbidden {
				t.Fatalf("status = %d, want 403 (%v)", status, body)
			}

			if body["code"] != "forbidden" {
				t.Fatalf("code = %v, want forbidden", body["code"])
			}
		})
	}
}

// TestAPIRejectsNonUserTokens: токен с неизвестной ролью или read-only
// peer-review scope не должен проходить authenticate.
func TestAPIRejectsNonUserTokens(t *testing.T) {
	h := newHarness(t)
	_ = h.seed()

	tokens := httpapi.NewTokenService(testJWTSecret, time.Now)

	unknownRole, err := tokens.Issue(1, "superadmin", time.Hour)
	if err != nil {
		t.Fatalf("issue unknown role token: %v", err)
	}

	readOnly, err := tokens.IssuePeerReviewRead(7, 1)
	if err != nil {
		t.Fatalf("issue peer-review token: %v", err)
	}

	for name, token := range map[string]string{
		"unknown role": unknownRole,
		"peer-review":  readOnly,
	} {
		t.Run(name, func(t *testing.T) {
			status, body := h.request(t, http.MethodGet, "/api/tasks", token, nil)
			if status != http.StatusUnauthorized {
				t.Fatalf("status = %d, want 401 (%v)", status, body)
			}

			if body["code"] != "unauthorized" {
				t.Fatalf("code = %v, want unauthorized", body["code"])
			}
		})
	}
}
