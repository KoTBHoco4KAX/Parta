package tests

import (
	"net/http"
	"testing"
)

func TestLoginChecksRole(t *testing.T) {
	h := newHarness(t)
	_ = h.seed()

	status, body := h.request(t, http.MethodPost, "/api/auth/login", "", map[string]any{
		"email":    "student1@parta.dev",
		"password": "anything",
		"role":     "teacher",
	})
	if status != http.StatusForbidden {
		t.Fatalf("role mismatch status = %d, want 403 (%v)", status, body)
	}

	status, body = h.request(t, http.MethodPost, "/api/auth/login", "", map[string]any{
		"email":    "student1@parta.dev",
		"password": "anything",
		"role":     "student",
	})
	if status != http.StatusOK {
		t.Fatalf("login status = %d, want 200 (%v)", status, body)
	}

	if token, _ := body["token"].(string); token == "" {
		t.Fatalf("login returned no token: %v", body)
	}

	status, _ = h.request(t, http.MethodPost, "/api/auth/login", "", map[string]any{
		"email":    "student1@parta.dev",
		"password": "",
		"role":     "student",
	})
	if status != http.StatusUnprocessableEntity {
		t.Fatalf("empty password status = %d, want 422", status)
	}
}

func TestCreateTaskAutoCreatesTodoSubmissions(t *testing.T) {
	h := newHarness(t)
	ids := h.seed()
	token := h.login(t, "teacher@parta.dev")

	status, body := h.request(t, http.MethodPost, "/api/tasks", token, taskBody(ids.assignment21, nil))
	if status != http.StatusCreated {
		t.Fatalf("status = %d, want 201 (%v)", status, body)
	}

	taskID := int64(body["task_id"].(float64))

	// В IS-21 сид-данными заведены два студента.
	if got := h.scalarInt(`SELECT COUNT(1) FROM submissions WHERE task_id = ? AND status = 'TODO'`, taskID); got != 2 {
		t.Fatalf("auto submissions = %d, want 2", got)
	}

	studentToken := h.login(t, "student1@parta.dev")
	status, items := h.getArray(t, "/api/tasks", studentToken)
	if status != http.StatusOK {
		t.Fatalf("student tasks status = %d", status)
	}

	found := false
	for _, item := range items {
		if int64(item["id"].(float64)) == taskID {
			found = true
		}
	}

	if !found {
		t.Fatalf("student does not see new task %d in /api/tasks", taskID)
	}
}

func TestAdminCannotCreateTask(t *testing.T) {
	h := newHarness(t)
	ids := h.seed()
	token := h.login(t, "admin@parta.dev")

	status, body := h.request(t, http.MethodPost, "/api/tasks", token, taskBody(ids.assignment21, nil))
	if status != http.StatusForbidden {
		t.Fatalf("status = %d, want 403 (%v)", status, body)
	}
}

func TestAdminManagesUsersAndGroups(t *testing.T) {
	h := newHarness(t)
	_ = h.seed()

	adminToken := h.login(t, "admin@parta.dev")

	status, group := h.request(t, http.MethodPost, "/api/groups", adminToken, map[string]any{
		"code":  "IS-99",
		"title": "Тестовая группа",
	})
	if status != http.StatusCreated {
		t.Fatalf("create group = %d (%v)", status, group)
	}

	groupID := int64(group["id"].(float64))

	status, user := h.request(t, http.MethodPost, "/api/users", adminToken, map[string]any{
		"external_id":  "new.student@parta.dev",
		"display_name": "Новый Студент",
		"role":         "student",
		"group_id":     groupID,
	})
	if status != http.StatusCreated {
		t.Fatalf("create user = %d (%v)", status, user)
	}

	userID := int64(user["id"].(float64))

	status, users := h.getArray(t, "/api/users", adminToken)
	if status != http.StatusOK {
		t.Fatalf("list users = %d", status)
	}

	if len(users) < 6 {
		t.Fatalf("users = %d, want at least 6", len(users))
	}

	status, _ = h.request(t, http.MethodDelete, "/api/users/"+itoa64(userID), adminToken, nil)
	if status != http.StatusNoContent {
		t.Fatalf("delete user = %d, want 204", status)
	}

	status, _ = h.request(t, http.MethodDelete, "/api/groups/"+itoa64(groupID), adminToken, nil)
	if status != http.StatusNoContent {
		t.Fatalf("delete group = %d, want 204", status)
	}

	studentToken := h.login(t, "student1@parta.dev")
	status, _ = h.getArray(t, "/api/users", studentToken)
	if status != http.StatusForbidden {
		t.Fatalf("student list users = %d, want 403", status)
	}
}
