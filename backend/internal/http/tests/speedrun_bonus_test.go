package tests

import (
	"net/http"
	"testing"
	"time"
)

// TestCreateTaskDefaultSpeedrunBonus проверяет автоматическую границу бонуса:
// без явной даты она равна deadline − speedrun-окно.
func TestCreateTaskDefaultSpeedrunBonus(t *testing.T) {
	h := newHarness(t)
	ids := h.seed()
	token := h.login(t, "teacher@parta.dev")

	deadline := time.Now().Add(20 * 24 * time.Hour).UTC().Truncate(time.Second)

	status, body := h.request(t, http.MethodPost, "/api/tasks", token, taskBody(ids.assignment21, map[string]any{
		"deadline_at":           deadline.Format(time.RFC3339),
		"speedrun_window_hours": 48,
	}))
	if status != http.StatusCreated {
		t.Fatalf("status = %d, want 201 (%v)", status, body)
	}

	want := deadline.Add(-48 * time.Hour).UTC().Format("2006-01-02T15:04:05.000Z")

	if got := body["speedrun_bonus_until"]; got != want {
		t.Fatalf("speedrun_bonus_until = %v, want %v", got, want)
	}

	taskID := int64(body["task_id"].(float64))

	status, tasks := h.getArray(t, "/api/tasks", token)
	if status != http.StatusOK {
		t.Fatalf("list status = %d", status)
	}

	for _, item := range tasks {
		if int64(item["id"].(float64)) == taskID {
			listed, ok := item["speedrun_bonus_until"].(string)
			if !ok {
				t.Fatalf("list speedrun_bonus_until missing: %v", item["speedrun_bonus_until"])
			}

			parsed, err := time.Parse(time.RFC3339, listed)
			if err != nil {
				t.Fatalf("parse list speedrun_bonus_until %q: %v", listed, err)
			}

			if parsed.Unix() != deadline.Add(-48*time.Hour).Unix() {
				t.Fatalf("list speedrun_bonus_until = %v, want %v", listed, want)
			}

			return
		}
	}

	t.Fatalf("task %d not found in list", taskID)
}

// TestCreateTaskExplicitSpeedrunBonus проверяет дату, назначенную преподавателем.
func TestCreateTaskExplicitSpeedrunBonus(t *testing.T) {
	h := newHarness(t)
	ids := h.seed()
	token := h.login(t, "teacher@parta.dev")

	deadline := time.Now().Add(20 * 24 * time.Hour).UTC().Truncate(time.Second)
	bonus := deadline.Add(-72 * time.Hour)

	status, body := h.request(t, http.MethodPost, "/api/tasks", token, taskBody(ids.assignment21, map[string]any{
		"deadline_at":           deadline.Format(time.RFC3339),
		"speedrun_window_hours": 48,
		"speedrun_bonus_until":  bonus.Format(time.RFC3339),
	}))
	if status != http.StatusCreated {
		t.Fatalf("status = %d, want 201 (%v)", status, body)
	}

	want := bonus.UTC().Format("2006-01-02T15:04:05.000Z")

	if got := body["speedrun_bonus_until"]; got != want {
		t.Fatalf("speedrun_bonus_until = %v, want %v", got, want)
	}
}

// TestCreateTaskRejectsBadSpeedrunBonus проверяет границы валидации.
func TestCreateTaskRejectsBadSpeedrunBonus(t *testing.T) {
	h := newHarness(t)
	ids := h.seed()
	token := h.login(t, "teacher@parta.dev")

	deadline := time.Now().Add(20 * 24 * time.Hour).UTC().Truncate(time.Second)

	cases := map[string]string{
		"after deadline": deadline.Add(time.Hour).Format(time.RFC3339),
		"in the past":    time.Now().Add(-time.Hour).UTC().Format(time.RFC3339),
		"not a date":     "soon",
	}

	for name, bonus := range cases {
		t.Run(name, func(t *testing.T) {
			status, body := h.request(t, http.MethodPost, "/api/tasks", token, taskBody(ids.assignment21, map[string]any{
				"deadline_at":          deadline.Format(time.RFC3339),
				"speedrun_bonus_until": bonus,
			}))
			if status != http.StatusUnprocessableEntity {
				t.Fatalf("status = %d, want 422 (%v)", status, body)
			}
		})
	}
}
