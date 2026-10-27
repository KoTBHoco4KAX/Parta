package tests

import (
	"net/http"
	"testing"
	"time"

	httpapi "github.com/parta/backend/internal/http"
)

func TestDevLoginSuccess(t *testing.T) {
	h := newHarness(t)

	status, body := h.request(t, http.MethodPost, "/api/auth/dev-login", "", map[string]any{
		"email": "student1@parta.dev",
	})

	if status != http.StatusOK {
		t.Fatalf("status = %d, want 200 (%v)", status, body)
	}

	if body["token"] == nil || body["token"] == "" {
		t.Fatalf("token missing in %v", body)
	}

	user, ok := body["user"].(map[string]any)
	if !ok {
		t.Fatalf("user missing in %v", body)
	}

	if user["role"] != "student" {
		t.Fatalf("role = %v, want student", user["role"])
	}

	if user["external_id"] != "student1@parta.dev" {
		t.Fatalf("external_id = %v", user["external_id"])
	}

	// Токен должен проходить auth-middleware: иначе ответ был бы 401.
	status, _ = h.request(t, http.MethodPost, "/api/submissions", body["token"].(string), map[string]any{})
	if status == http.StatusUnauthorized {
		t.Fatalf("issued token rejected by middleware")
	}
}

func TestDevLoginDisabledOutsideDev(t *testing.T) {
	h := newHarnessEnv(t, "prod")

	status, body := h.request(t, http.MethodPost, "/api/auth/dev-login", "", map[string]any{
		"email": "student1@parta.dev",
	})

	if status != http.StatusForbidden {
		t.Fatalf("status = %d, want 403 (%v)", status, body)
	}

	if body["code"] != "forbidden" {
		t.Fatalf("code = %v, want forbidden", body["code"])
	}
}

func TestDevLoginUnknownEmail(t *testing.T) {
	h := newHarness(t)

	status, body := h.request(t, http.MethodPost, "/api/auth/dev-login", "", map[string]any{
		"email": "ghost@parta.dev",
	})

	if status != http.StatusNotFound {
		t.Fatalf("status = %d, want 404 (%v)", status, body)
	}

	if body["code"] != "not_found" {
		t.Fatalf("code = %v, want not_found", body["code"])
	}
}

func TestDevLoginEmptyEmail(t *testing.T) {
	h := newHarness(t)

	status, body := h.request(t, http.MethodPost, "/api/auth/dev-login", "", map[string]any{"email": "  "})
	if status != http.StatusUnprocessableEntity {
		t.Fatalf("status = %d, want 422 (%v)", status, body)
	}
}

func TestDevLoginInvalidJSON(t *testing.T) {
	h := newHarness(t)

	status, body := h.request(t, http.MethodPost, "/api/auth/dev-login", "", "not-an-object")
	if status != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400 (%v)", status, body)
	}

	if body["code"] != "invalid_json" {
		t.Fatalf("code = %v, want invalid_json", body["code"])
	}
}

func TestProtectedRouteRequiresToken(t *testing.T) {
	h := newHarness(t)

	status, body := h.request(t, http.MethodPost, "/api/tasks", "", map[string]any{})
	if status != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401 (%v)", status, body)
	}

	if body["code"] != "unauthorized" {
		t.Fatalf("code = %v, want unauthorized", body["code"])
	}
}

func TestProtectedRouteRejectsGarbageToken(t *testing.T) {
	h := newHarness(t)

	status, body := h.request(t, http.MethodPost, "/api/tasks", "not.a.jwt", map[string]any{})
	if status != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401 (%v)", status, body)
	}
}

func TestProtectedRouteRejectsExpiredToken(t *testing.T) {
	h := newHarness(t)

	tokens := httpapi.NewTokenService(testJWTSecret, time.Now)

	expired, err := tokens.Issue(1, "admin", -time.Minute)
	if err != nil {
		t.Fatalf("issue expired token: %v", err)
	}

	status, body := h.request(t, http.MethodPost, "/api/tasks", expired, map[string]any{})
	if status != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401 (%v)", status, body)
	}
}

func TestProtectedRouteRejectsForeignSecret(t *testing.T) {
	h := newHarness(t)

	tokens := httpapi.NewTokenService("another-secret", time.Now)

	foreign, err := tokens.Issue(1, "admin", time.Hour)
	if err != nil {
		t.Fatalf("issue foreign token: %v", err)
	}

	status, body := h.request(t, http.MethodPost, "/api/tasks", foreign, map[string]any{})
	if status != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401 (%v)", status, body)
	}
}

func TestUnknownRoute(t *testing.T) {
	h := newHarness(t)
	ids := h.seed()
	token := h.login(t, "admin@parta.dev")

	_ = ids

	status, body := h.request(t, http.MethodGet, "/api/unknown", token, nil)
	if status != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", status)
	}

	if body["code"] != "not_found" {
		t.Fatalf("code = %v, want not_found", body["code"])
	}
}
