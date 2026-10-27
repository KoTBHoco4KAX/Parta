package tests

import (
	"net/http"
	"testing"
	"time"
)

// taskBody собирает тело создания задания с дефолтами.
func taskBody(assignmentID int64, overrides map[string]any) map[string]any {
	body := map[string]any{
		"assignment_id":         assignmentID,
		"title":                 "Лабораторная №3",
		"description_md":        "Описание работы",
		"task_type":             "LAB_CODE",
		"requirements_count":    10,
		"expected_hours":        5.5,
		"deadline_at":           time.Now().Add(30 * 24 * time.Hour).UTC().Format(time.RFC3339),
		"speedrun_window_hours": 24,
		"team_size":             1,
	}

	for key, value := range overrides {
		body[key] = value
	}

	return body
}

func TestCreateTaskSuccess(t *testing.T) {
	h := newHarness(t)
	ids := h.seed()
	token := h.login(t, "teacher@parta.dev")

	status, body := h.request(t, http.MethodPost, "/api/tasks", token, taskBody(ids.assignment21, nil))
	if status != http.StatusCreated {
		t.Fatalf("status = %d, want 201 (%v)", status, body)
	}

	taskID := int64(body["task_id"].(float64))
	if taskID <= 0 {
		t.Fatalf("task_id = %v", body["task_id"])
	}

	if body["status"] != "PUBLISHED" {
		t.Fatalf("status field = %v", body["status"])
	}

	baseXP := int64(body["base_xp_computed"].(float64))
	if baseXP < 10 {
		t.Fatalf("base_xp_computed = %d, want >= 10", baseXP)
	}

	if got := h.scalarString(`SELECT status FROM tasks WHERE id = ?`, taskID); got != "PUBLISHED" {
		t.Fatalf("stored status = %q", got)
	}

	if got := h.scalarInt(`SELECT team_size FROM tasks WHERE id = ?`, taskID); got != 1 {
		t.Fatalf("stored team_size = %d, want 1", got)
	}
}

func TestCreateTaskTeamProjectCreatesSlots(t *testing.T) {
	h := newHarness(t)
	ids := h.seed()
	token := h.login(t, "teacher@parta.dev")

	status, body := h.request(t, http.MethodPost, "/api/tasks", token, taskBody(ids.assignment21, map[string]any{
		"task_type": "TEAM_PROJECT",
		"team_size": 3,
	}))
	if status != http.StatusCreated {
		t.Fatalf("status = %d, want 201 (%v)", status, body)
	}

	taskID := int64(body["task_id"].(float64))

	if got := h.scalarInt(`SELECT COUNT(1) FROM team_slots WHERE task_id = ?`, taskID); got != 3 {
		t.Fatalf("slots = %d, want 3", got)
	}

	if got := h.scalarInt(`SELECT COUNT(DISTINCT role_code) FROM team_slots WHERE task_id = ?`, taskID); got != 3 {
		t.Fatalf("distinct roles = %d, want 3", got)
	}
}

func TestCreateTaskForbiddenForStudent(t *testing.T) {
	h := newHarness(t)
	ids := h.seed()
	token := h.login(t, "student1@parta.dev")

	status, body := h.request(t, http.MethodPost, "/api/tasks", token, taskBody(ids.assignment21, nil))
	if status != http.StatusForbidden {
		t.Fatalf("status = %d, want 403 (%v)", status, body)
	}

	if body["code"] != "forbidden" {
		t.Fatalf("code = %v", body["code"])
	}
}

func TestCreateTaskForeignAssignmentForbidden(t *testing.T) {
	h := newHarness(t)
	ids := h.seed()

	foreignTeacher := h.addTeacher("teacher2@parta.dev")
	h.exec(`INSERT INTO teacher_assignments (teacher_id, group_id, discipline_id)
	        SELECT (SELECT id FROM users WHERE external_id = ?), ?, (SELECT id FROM disciplines WHERE code = 'DB')`,
		foreignTeacher, ids.groupIS22)

	foreignAssignment := h.scalarInt(`SELECT ta.id FROM teacher_assignments ta
	                                  JOIN users u ON u.id = ta.teacher_id
	                                  WHERE u.external_id = ?`, foreignTeacher)

	token := h.login(t, "teacher@parta.dev")

	status, body := h.request(t, http.MethodPost, "/api/tasks", token, taskBody(foreignAssignment, nil))
	if status != http.StatusForbidden {
		t.Fatalf("status = %d, want 403 (%v)", status, body)
	}
}

func TestCreateTaskInvalidType(t *testing.T) {
	h := newHarness(t)
	ids := h.seed()
	token := h.login(t, "teacher@parta.dev")

	status, body := h.request(t, http.MethodPost, "/api/tasks", token, taskBody(ids.assignment21, map[string]any{
		"task_type": "VIDEO",
	}))
	if status != http.StatusUnprocessableEntity {
		t.Fatalf("status = %d, want 422 (%v)", status, body)
	}

	if body["code"] != "invalid_argument" {
		t.Fatalf("code = %v, body = %v", body["code"], body)
	}
}

func TestCreateTaskPastDeadline(t *testing.T) {
	h := newHarness(t)
	ids := h.seed()
	token := h.login(t, "teacher@parta.dev")

	status, body := h.request(t, http.MethodPost, "/api/tasks", token, taskBody(ids.assignment21, map[string]any{
		"deadline_at": time.Now().Add(-time.Hour).UTC().Format(time.RFC3339),
	}))
	if status != http.StatusUnprocessableEntity {
		t.Fatalf("status = %d, want 422 (%v)", status, body)
	}
}

func TestCreateTaskTeamProjectNeedsTeam(t *testing.T) {
	h := newHarness(t)
	ids := h.seed()
	token := h.login(t, "teacher@parta.dev")

	status, body := h.request(t, http.MethodPost, "/api/tasks", token, taskBody(ids.assignment21, map[string]any{
		"task_type": "TEAM_PROJECT",
		"team_size": 1,
	}))
	if status != http.StatusUnprocessableEntity {
		t.Fatalf("status = %d, want 422 (%v)", status, body)
	}
}

func TestCreateTaskUnknownAssignment(t *testing.T) {
	h := newHarness(t)
	_ = h.seed()
	token := h.login(t, "teacher@parta.dev")

	status, body := h.request(t, http.MethodPost, "/api/tasks", token, taskBody(999999, nil))
	if status != http.StatusNotFound {
		t.Fatalf("status = %d, want 404 (%v)", status, body)
	}
}

func TestCreateTaskInvalidJSON(t *testing.T) {
	h := newHarness(t)
	_ = h.seed()
	token := h.login(t, "teacher@parta.dev")

	status, body := h.request(t, http.MethodPost, "/api/tasks", token, "[1,2,3]")
	if status != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400 (%v)", status, body)
	}
}
