package tests

import (
	"encoding/json"
	"io"
	"net/http"
	"testing"
)

// getArray выполняет GET и разбирает JSON-массив (harness.request рассчитан на объекты).
func (h *harness) getArray(t *testing.T, path, token string) (int, []map[string]any) {
	t.Helper()

	req, err := http.NewRequest(http.MethodGet, h.server.URL+path, nil)
	if err != nil {
		t.Fatalf("new request: %v", err)
	}

	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}

	resp, err := h.client.Do(req)
	if err != nil {
		t.Fatalf("GET %s: %v", path, err)
	}
	defer resp.Body.Close()

	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatalf("read body: %v", err)
	}

	items := make([]map[string]any, 0)

	if resp.StatusCode == http.StatusOK && len(raw) > 0 {
		if err := json.Unmarshal(raw, &items); err != nil {
			t.Fatalf("GET %s: body is not JSON array: %q", path, string(raw))
		}
	}

	return resp.StatusCode, items
}

func TestListTasksRoleScoped(t *testing.T) {
	h := newHarness(t)
	_ = h.seed()

	adminToken := h.login(t, "admin@parta.dev")
	teacherToken := h.login(t, "teacher@parta.dev")
	studentToken := h.login(t, "student1@parta.dev")

	cases := []struct {
		name  string
		token string
		want  int
	}{
		{name: "admin sees all", token: adminToken, want: 2},
		{name: "teacher sees assigned", token: teacherToken, want: 2},
		{name: "student sees own group", token: studentToken, want: 2},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			status, items := h.getArray(t, "/api/tasks", tc.token)
			if status != http.StatusOK {
				t.Fatalf("status = %d, want 200", status)
			}

			if len(items) != tc.want {
				t.Fatalf("tasks = %d, want %d", len(items), tc.want)
			}

			if _, ok := items[0]["base_xp_computed"]; !ok {
				t.Fatalf("task DTO has no base_xp_computed: %v", items[0])
			}
		})
	}
}

func TestListSubmissionsEnriched(t *testing.T) {
	h := newHarness(t)
	ids := h.seed()

	h.createSubmission(ids.taskLab, ids.student1, "REVIEW")

	teacherToken := h.login(t, "teacher@parta.dev")
	status, inbox := h.getArray(t, "/api/submissions?status=REVIEW", teacherToken)
	if status != http.StatusOK {
		t.Fatalf("status = %d, want 200", status)
	}

	if len(inbox) != 1 {
		t.Fatalf("inbox = %d, want 1", len(inbox))
	}

	if got, _ := inbox[0]["task_title"].(string); got == "" {
		t.Fatalf("task_title is empty: %v", inbox[0])
	}

	if got, _ := inbox[0]["student_name"].(string); got == "" {
		t.Fatalf("student_name is empty: %v", inbox[0])
	}

	if got, _ := inbox[0]["attempt"].(float64); got != 1 {
		t.Fatalf("attempt = %v, want 1", inbox[0]["attempt"])
	}

	studentToken := h.login(t, "student1@parta.dev")
	status, own := h.getArray(t, "/api/submissions", studentToken)
	if status != http.StatusOK || len(own) != 2 {
		t.Fatalf("student submissions = %d (status %d), want 2 (seed tasks)", len(own), status)
	}
}

func TestListAssignmentsAndEmptyCollections(t *testing.T) {
	h := newHarness(t)
	_ = h.seed()

	adminToken := h.login(t, "admin@parta.dev")
	status, assignments := h.getArray(t, "/api/assignments", adminToken)
	if status != http.StatusOK || len(assignments) != 2 {
		t.Fatalf("assignments = %d (status %d), want 2", len(assignments), status)
	}

	studentToken := h.login(t, "student1@parta.dev")
	status, wagers := h.getArray(t, "/api/wagers", studentToken)
	if status != http.StatusOK || len(wagers) != 0 {
		t.Fatalf("wagers = %d (status %d), want empty array", len(wagers), status)
	}

	teacherToken := h.login(t, "teacher@parta.dev")
	status, peers := h.getArray(t, "/api/peer-reviews", teacherToken)
	if status != http.StatusOK || len(peers) != 0 {
		t.Fatalf("peer reviews = %d (status %d), want empty array", len(peers), status)
	}
}

func TestListTasksRequiresAuth(t *testing.T) {
	h := newHarness(t)
	_ = h.seed()

	status, _ := h.getArray(t, "/api/tasks", "")
	if status != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401", status)
	}
}
