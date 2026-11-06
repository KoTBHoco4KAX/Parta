package tests

import (
	"net/http"
	"testing"
	"time"
)

// teacher_tasks_test.go — управление группами и базой заданий преподавателя.

func TestTeacherListsAndCreatesOwnGroups(t *testing.T) {
	h := newHarness(t)
	ids := h.seed()

	teacherToken := h.login(t, "teacher@parta.dev")
	adminToken := h.login(t, "admin@parta.dev")

	status, groups := h.getArray(t, "/api/groups", teacherToken)
	if status != http.StatusOK || len(groups) != 2 {
		t.Fatalf("teacher groups = %d (status %d), want 2", len(groups), status)
	}

	disciplineID := h.scalarInt(`SELECT id FROM disciplines WHERE code = 'DB'`)

	status, body := h.request(t, http.MethodPost, "/api/groups", teacherToken, map[string]any{
		"code":          "IS-77",
		"title":         "Новый поток преподавателя",
		"discipline_id": disciplineID,
	})
	if status != http.StatusCreated {
		t.Fatalf("create group status = %d, want 201 (%v)", status, body)
	}

	groupID := int64(body["id"].(float64))

	// Новая группа сразу есть в списке преподавателя и в назначениях.
	status, groups = h.getArray(t, "/api/groups", teacherToken)
	if status != http.StatusOK || len(groups) != 3 {
		t.Fatalf("teacher groups after create = %d (status %d), want 3", len(groups), status)
	}

	status, assignments := h.getArray(t, "/api/assignments", teacherToken)
	if status != http.StatusOK {
		t.Fatalf("assignments status = %d", status)
	}

	found := false
	for _, assignment := range assignments {
		if int64(assignment["group_id"].(float64)) == groupID &&
			int64(assignment["discipline_id"].(float64)) == disciplineID {
			found = true
		}
	}

	if !found {
		t.Fatalf("created group has no assignment with discipline: %v", assignments)
	}

	// Состав пустой, но эндпоинт доступен преподавателю.
	status, body = h.request(t, http.MethodGet,
		"/api/users?group_id="+itoa64(groupID), teacherToken, nil)
	if status != http.StatusOK {
		t.Fatalf("new group members status = %d (%v)", status, body)
	}

	if items := body["items"].([]any); len(items) != 0 {
		t.Fatalf("new group members = %d, want 0", len(items))
	}

	// Перевод ученика своей группы в новую свою группу разрешён.
	status, body = h.request(t, http.MethodPatch, userPath(ids.student1), teacherToken, map[string]any{
		"group_id": groupID,
	})
	if status != http.StatusOK {
		t.Fatalf("move own student status = %d, want 200 (%v)", status, body)
	}

	status, body = h.request(t, http.MethodGet,
		"/api/users?group_id="+itoa64(groupID), teacherToken, nil)
	if status != http.StatusOK || len(body["items"].([]any)) != 1 {
		t.Fatalf("group members after move = %v (status %d)", body["items"], status)
	}

	// Исключение из группы (group_id = null) разрешено.
	status, body = h.request(t, http.MethodPatch, userPath(ids.student1), teacherToken, map[string]any{
		"group_id": nil,
	})
	if status != http.StatusOK {
		t.Fatalf("unassign own student status = %d, want 200 (%v)", status, body)
	}

	// Ученик без группы уже не «свой»: вернуть его может только админ.
	status, body = h.request(t, http.MethodPatch, userPath(ids.student1), teacherToken, map[string]any{
		"group_id": groupID,
	})
	if status != http.StatusForbidden {
		t.Fatalf("move unassigned student status = %d, want 403 (%v)", status, body)
	}

	// Чужая группа администратора: перевод в неё запрещён.
	status, foreign := h.request(t, http.MethodPost, "/api/groups", adminToken, map[string]any{
		"code":  "IS-76",
		"title": "Чужая группа",
	})
	if status != http.StatusCreated {
		t.Fatalf("admin create group status = %d (%v)", status, foreign)
	}

	foreignID := int64(foreign["id"].(float64))

	status, body = h.request(t, http.MethodPatch, userPath(ids.student2), teacherToken, map[string]any{
		"group_id": foreignID,
	})
	if status != http.StatusForbidden {
		t.Fatalf("move to foreign group status = %d, want 403 (%v)", status, body)
	}

	// discipline_code — второй допустимый способ указать дисциплину.
	status, body = h.request(t, http.MethodPost, "/api/groups", teacherToken, map[string]any{
		"code":            "IS-75",
		"title":           "Поток по коду дисциплины",
		"discipline_code": "DB",
	})
	if status != http.StatusCreated {
		t.Fatalf("create group by discipline_code status = %d, want 201 (%v)", status, body)
	}
}

func TestTaskTemplatesBaseAndIndividualIssue(t *testing.T) {
	h := newHarness(t)
	ids := h.seed()

	teacherToken := h.login(t, "teacher@parta.dev")
	disciplineID := h.scalarInt(`SELECT id FROM disciplines WHERE code = 'DB'`)

	status, template := h.request(t, http.MethodPost, "/api/task-templates", teacherToken, map[string]any{
		"discipline_id":         disciplineID,
		"title":                 "Шаблон: нормализация схемы",
		"description_md":        "Привести схему к 3НФ",
		"task_type":             "LAB_CODE",
		"requirements_count":    9,
		"expected_hours":        5.5,
		"speedrun_window_hours": 24,
		"team_size":             1,
	})
	if status != http.StatusCreated {
		t.Fatalf("create template status = %d, want 201 (%v)", status, template)
	}

	templateID := int64(template["id"].(float64))

	status, templates := h.getArray(t, "/api/task-templates", teacherToken)
	if status != http.StatusOK || len(templates) != 1 {
		t.Fatalf("templates = %d (status %d), want 1", len(templates), status)
	}

	if templates[0]["discipline_code"] != "DB" {
		t.Fatalf("template discipline = %v, want DB", templates[0]["discipline_code"])
	}

	deadline := time.Now().Add(14 * 24 * time.Hour).UTC().Format(time.RFC3339)

	// Выдача только одному ученику: карточка создаётся лишь ему.
	status, issued := h.request(t, http.MethodPost,
		"/api/task-templates/"+itoa64(templateID)+"/issue", teacherToken, map[string]any{
			"assignment_id": ids.assignment21,
			"deadline_at":   deadline,
			"student_ids":   []int64{ids.student1},
		})
	if status != http.StatusCreated {
		t.Fatalf("issue template status = %d, want 201 (%v)", status, issued)
	}

	taskID := int64(issued["task_id"].(float64))

	if got := h.scalarInt(`SELECT COUNT(1) FROM submissions WHERE task_id = ?`, taskID); got != 1 {
		t.Fatalf("template submissions = %d, want 1", got)
	}

	if got := h.scalarInt(`SELECT student_id FROM submissions WHERE task_id = ?`, taskID); got != ids.student1 {
		t.Fatalf("template submission student = %d, want %d", got, ids.student1)
	}

	// Чужой ученик (другая группа) — 422, а не частичная выдача.
	status, body := h.request(t, http.MethodPost,
		"/api/task-templates/"+itoa64(templateID)+"/issue", teacherToken, map[string]any{
			"assignment_id": ids.assignment21,
			"deadline_at":   deadline,
			"student_ids":   []int64{ids.student3},
		})
	if status != http.StatusUnprocessableEntity {
		t.Fatalf("foreign student issue status = %d, want 422 (%v)", status, body)
	}

	// POST /api/tasks с student_ids — индивидуальная выдача без шаблона.
	status, body = h.request(t, http.MethodPost, "/api/tasks", teacherToken, taskBody(ids.assignment21, map[string]any{
		"student_ids": []int64{ids.student2},
	}))
	if status != http.StatusCreated {
		t.Fatalf("task with student_ids status = %d, want 201 (%v)", status, body)
	}

	directTaskID := int64(body["task_id"].(float64))

	if got := h.scalarInt(`SELECT COUNT(1) FROM submissions WHERE task_id = ?`, directTaskID); got != 1 {
		t.Fatalf("direct task submissions = %d, want 1", got)
	}

	if got := h.scalarInt(`SELECT student_id FROM submissions WHERE task_id = ?`, directTaskID); got != ids.student2 {
		t.Fatalf("direct task submission student = %d, want %d", got, ids.student2)
	}

	// Повтор задания с новым дедлайном и другим получателем.
	status, repeated := h.request(t, http.MethodPost,
		"/api/tasks/"+itoa64(taskID)+"/repeat", teacherToken, map[string]any{
			"deadline_at": deadline,
			"student_ids": []int64{ids.student2},
		})
	if status != http.StatusCreated {
		t.Fatalf("repeat task status = %d, want 201 (%v)", status, repeated)
	}

	repeatedID := int64(repeated["task_id"].(float64))

	if repeatedID == taskID {
		t.Fatalf("repeat returned the same task id")
	}

	if got := h.scalarInt(`SELECT student_id FROM submissions WHERE task_id = ?`, repeatedID); got != ids.student2 {
		t.Fatalf("repeat submission student = %d, want %d", got, ids.student2)
	}

	// Чужой преподаватель не может удалить шаблон.
	h.addTeacher("teacher2@parta.dev")
	foreignToken := h.login(t, "teacher2@parta.dev")

	status, body = h.request(t, http.MethodDelete,
		"/api/task-templates/"+itoa64(templateID), foreignToken, nil)
	if status != http.StatusForbidden {
		t.Fatalf("foreign delete status = %d, want 403 (%v)", status, body)
	}

	status, body = h.request(t, http.MethodDelete,
		"/api/task-templates/"+itoa64(templateID), teacherToken, nil)
	if status != http.StatusNoContent {
		t.Fatalf("delete template status = %d, want 204 (%v)", status, body)
	}

	status, templates = h.getArray(t, "/api/task-templates", teacherToken)
	if status != http.StatusOK || len(templates) != 0 {
		t.Fatalf("templates after delete = %d (status %d), want 0", len(templates), status)
	}
}
