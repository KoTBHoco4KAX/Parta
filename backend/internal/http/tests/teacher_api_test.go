package tests

import (
	"net/http"
	"testing"
)

// teacher_api_test.go — контракты MVP teacher/admin (BUG-001..005).

// userPath собирает путь пользователя.
func userPath(userID int64) string {
	return "/api/users/" + itoa64(userID)
}

// attachmentPath собирает путь MVP-вложения.
func attachmentPath(submissionID int64) string {
	return "/api/attachments/artifact-" + itoa64(submissionID)
}

func TestUserGroupPatchAdminMoveAndUnassign(t *testing.T) {
	h := newHarness(t)
	ids := h.seed()

	adminToken := h.login(t, "admin@parta.dev")

	status, body := h.request(t, http.MethodPatch, userPath(ids.student1), adminToken, map[string]any{
		"group_id": ids.groupIS22,
	})
	if status != http.StatusOK {
		t.Fatalf("patch status = %d, want 200 (%v)", status, body)
	}

	if got := int64(body["group_id"].(float64)); got != ids.groupIS22 {
		t.Fatalf("group_id = %d, want %d", got, ids.groupIS22)
	}

	if group := h.scalarInt(`SELECT group_id FROM users WHERE id = ?`, ids.student1); group != ids.groupIS22 {
		t.Fatalf("db group_id = %d, want %d", group, ids.groupIS22)
	}

	status, body = h.request(t, http.MethodPatch, userPath(ids.student1), adminToken, map[string]any{
		"group_id": nil,
	})
	if status != http.StatusOK {
		t.Fatalf("unassign status = %d, want 200 (%v)", status, body)
	}

	if value, exists := body["group_id"]; exists && value != nil {
		t.Fatalf("group_id = %v, want null", value)
	}

	if group := h.scalarInt(`SELECT COUNT(1) FROM users WHERE id = ? AND group_id IS NULL`, ids.student1); group != 1 {
		t.Fatalf("student was not unassigned")
	}
}

func TestUserGroupPatchTeacherRestrictions(t *testing.T) {
	h := newHarness(t)
	ids := h.seed()

	adminToken := h.login(t, "admin@parta.dev")
	teacherToken := h.login(t, "teacher@parta.dev")

	status, group := h.request(t, http.MethodPost, "/api/groups", adminToken, map[string]any{
		"code":  "IS-99",
		"title": "Чужая группа",
	})
	if status != http.StatusCreated {
		t.Fatalf("create group status = %d (%v)", status, group)
	}

	foreignGroupID := int64(group["id"].(float64))

	status, body := h.request(t, http.MethodPatch, userPath(ids.student1), teacherToken, map[string]any{
		"group_id": foreignGroupID,
	})
	if status != http.StatusForbidden {
		t.Fatalf("foreign group status = %d, want 403 (%v)", status, body)
	}

	// Teacher assigned to IS-21/IS-22: перевод внутри своих групп разрешён.
	status, body = h.request(t, http.MethodPatch, userPath(ids.student3), teacherToken, map[string]any{
		"group_id": ids.groupIS21,
	})
	if status != http.StatusOK {
		t.Fatalf("own group status = %d, want 200 (%v)", status, body)
	}

	// non-student с group_id запрещён.
	status, body = h.request(t, http.MethodPatch, userPath(ids.admin), adminToken, map[string]any{
		"group_id": ids.groupIS21,
	})
	if status != http.StatusUnprocessableEntity {
		t.Fatalf("non-student status = %d, want 422 (%v)", status, body)
	}

	// Для преподавателя чужой контур (даже не студент) — 403.
	status, body = h.request(t, http.MethodPatch, userPath(ids.admin), teacherToken, map[string]any{
		"group_id": ids.groupIS21,
	})
	if status != http.StatusForbidden {
		t.Fatalf("teacher patch non-student status = %d, want 403 (%v)", status, body)
	}
}

func TestUserGroupPatchMissingField(t *testing.T) {
	h := newHarness(t)
	ids := h.seed()

	adminToken := h.login(t, "admin@parta.dev")

	status, body := h.request(t, http.MethodPatch, userPath(ids.student1), adminToken, map[string]any{
		"comment": "no group",
	})
	if status != http.StatusUnprocessableEntity {
		t.Fatalf("status = %d, want 422 (%v)", status, body)
	}
}

func TestUsersListFiltered(t *testing.T) {
	h := newHarness(t)
	ids := h.seed()

	adminToken := h.login(t, "admin@parta.dev")
	teacherToken := h.login(t, "teacher@parta.dev")

	status, body := h.request(t, http.MethodGet,
		"/api/users?group_id="+itoa64(ids.groupIS21)+"&unassigned=true", adminToken, nil)
	if status != http.StatusBadRequest {
		t.Fatalf("both params status = %d, want 400 (%v)", status, body)
	}

	if body["code"] != "invalid_argument" {
		t.Fatalf("code = %v, want invalid_argument", body["code"])
	}

	status, body = h.request(t, http.MethodGet,
		"/api/users?group_id="+itoa64(ids.groupIS21), adminToken, nil)
	if status != http.StatusOK {
		t.Fatalf("group list status = %d, want 200 (%v)", status, body)
	}

	items := body["items"].([]any)
	if len(items) != 2 {
		t.Fatalf("group items = %d, want 2", len(items))
	}

	first := items[0].(map[string]any)
	if first["email"] == "" || first["full_name"] == "" {
		t.Fatalf("filtered item missing email/full_name: %v", first)
	}

	status, body = h.request(t, http.MethodGet, "/api/users?unassigned=true", adminToken, nil)
	if status != http.StatusOK {
		t.Fatalf("unassigned status = %d, want 200 (%v)", status, body)
	}

	for _, item := range body["items"].([]any) {
		if item.(map[string]any)["group_id"] != nil {
			t.Fatalf("unassigned returned grouped user: %v", item)
		}
	}

	status, body = h.request(t, http.MethodGet,
		"/api/users?group_id="+itoa64(ids.groupIS21), teacherToken, nil)
	if status != http.StatusOK {
		t.Fatalf("teacher own group status = %d, want 200 (%v)", status, body)
	}
}

func TestUsersListFilteredForeignGroupForbidden(t *testing.T) {
	h := newHarness(t)
	_ = h.seed()

	adminToken := h.login(t, "admin@parta.dev")
	teacherToken := h.login(t, "teacher@parta.dev")

	status, group := h.request(t, http.MethodPost, "/api/groups", adminToken, map[string]any{
		"code":  "IS-98",
		"title": "Не назначена преподавателю",
	})
	if status != http.StatusCreated {
		t.Fatalf("create group status = %d (%v)", status, group)
	}

	groupID := int64(group["id"].(float64))

	status, body := h.request(t, http.MethodGet,
		"/api/users?group_id="+itoa64(groupID), teacherToken, nil)
	if status != http.StatusForbidden {
		t.Fatalf("status = %d, want 403 (%v)", status, body)
	}

	status, body = h.request(t, http.MethodGet, "/api/users?unassigned=true", teacherToken, nil)
	if status != http.StatusForbidden {
		t.Fatalf("teacher unassigned status = %d, want 403 (%v)", status, body)
	}
}

func TestAttachmentsListAndDownload(t *testing.T) {
	h := newHarness(t)
	ids := h.seed()

	subID := h.createSubmission(ids.taskLab, ids.student1, "REVIEW")

	studentToken := h.login(t, "student1@parta.dev")
	teacherToken := h.login(t, "teacher@parta.dev")

	status, body := h.request(t, http.MethodGet,
		"/api/attachments?submission_id="+itoa64(subID), studentToken, nil)
	if status != http.StatusOK {
		t.Fatalf("list status = %d, want 200 (%v)", status, body)
	}

	items := body["items"].([]any)
	if len(items) != 1 {
		t.Fatalf("items = %d, want 1", len(items))
	}

	item := items[0].(map[string]any)
	if item["id"] != "artifact-"+itoa64(subID) {
		t.Fatalf("id = %v", item["id"])
	}

	if item["url"] != "https://parta.local/artifact.zip" {
		t.Fatalf("url = %v", item["url"])
	}

	status, body = h.request(t, http.MethodGet,
		"/api/attachments?submission_id="+itoa64(subID), teacherToken, nil)
	if status != http.StatusOK {
		t.Fatalf("teacher list status = %d, want 200 (%v)", status, body)
	}

	// Проверяем именно 302 без перехода по внешнему URL.
	req, err := http.NewRequest(http.MethodGet, h.server.URL+attachmentPath(subID), nil)
	if err != nil {
		t.Fatalf("new request: %v", err)
	}

	req.Header.Set("Authorization", "Bearer "+teacherToken)

	client := &http.Client{
		CheckRedirect: func(*http.Request, []*http.Request) error {
			return http.ErrUseLastResponse
		},
	}

	resp, err := client.Do(req)
	if err != nil {
		t.Fatalf("download: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusFound {
		t.Fatalf("download status = %d, want 302", resp.StatusCode)
	}

	if location := resp.Header.Get("Location"); location != "https://parta.local/artifact.zip" {
		t.Fatalf("Location = %q", location)
	}

	if disposition := resp.Header.Get("Content-Disposition"); disposition != "" {
		t.Fatalf("Content-Disposition must be empty, got %q", disposition)
	}
}

func TestAttachmentsAccessAndEmpty(t *testing.T) {
	h := newHarness(t)
	ids := h.seed()

	subID := h.createSubmission(ids.taskLab, ids.student1, "REVIEW")

	foreignToken := h.login(t, "student3@parta.dev")

	status, body := h.request(t, http.MethodGet,
		"/api/attachments?submission_id="+itoa64(subID), foreignToken, nil)
	if status != http.StatusForbidden {
		t.Fatalf("foreign status = %d, want 403 (%v)", status, body)
	}

	// Сдача без artifact_url: список пуст, скачивание — 404.
	emptySubID := h.createSubmission(ids.taskTeam, ids.student1, "TODO")

	studentToken := h.login(t, "student1@parta.dev")

	status, body = h.request(t, http.MethodGet,
		"/api/attachments?submission_id="+itoa64(emptySubID), studentToken, nil)
	if status != http.StatusOK {
		t.Fatalf("empty list status = %d, want 200 (%v)", status, body)
	}

	if items := body["items"].([]any); len(items) != 0 {
		t.Fatalf("empty list items = %d, want 0", len(items))
	}

	status, body = h.request(t, http.MethodGet, attachmentPath(emptySubID), studentToken, nil)
	if status != http.StatusNotFound {
		t.Fatalf("empty download status = %d, want 404 (%v)", status, body)
	}
}

func TestAttachmentsUnauthorizedAndMissing(t *testing.T) {
	h := newHarness(t)
	_ = h.seed()

	status, body := h.request(t, http.MethodGet, "/api/attachments?submission_id=1", "", nil)
	if status != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401 (%v)", status, body)
	}

	token := h.login(t, "teacher@parta.dev")

	status, body = h.request(t, http.MethodGet, "/api/attachments?submission_id=999999", token, nil)
	if status != http.StatusNotFound {
		t.Fatalf("missing submission status = %d, want 404 (%v)", status, body)
	}

	status, body = h.request(t, http.MethodGet, "/api/attachments/artifact-999999", token, nil)
	if status != http.StatusNotFound {
		t.Fatalf("missing attachment status = %d, want 404 (%v)", status, body)
	}
}
