package tests

import (
	"context"
	"net/http"
	"testing"
	"time"

	leaderboarddomain "github.com/parta/backend/internal/domain/leaderboard"
)

// addStudent добавляет ученика в группу и возвращает его id.
func (h *harness) addStudent(t *testing.T, externalID, name string, groupID int64) int64 {
	t.Helper()

	var id int64

	if err := h.db.QueryRowContext(context.Background(),
		`INSERT INTO users (external_id, role, group_id, display_name)
		 VALUES (?, 'student', ?, ?) RETURNING id`,
		externalID, groupID, name).Scan(&id); err != nil {
		t.Fatalf("add student: %v", err)
	}

	return id
}

func (h *harness) setWeeklyXP(t *testing.T, userID int64, amount int, week string) {
	t.Helper()

	if _, err := h.db.ExecContext(context.Background(),
		`UPDATE users SET weekly_xp = ?, weekly_xp_week = ? WHERE id = ?`,
		amount, week, userID); err != nil {
		t.Fatalf("set weekly xp: %v", err)
	}
}

func TestLeaderboardRanksWithinGroupAndResetsStaleWeek(t *testing.T) {
	h := newHarness(t)
	ids := h.seed()

	token := h.login(t, "student2@parta.dev")
	currentWeek := leaderboarddomain.WeekKey(time.Now())

	third := h.addStudent(t, "leader3@parta.dev", "Третий Ученик", ids.groupIS21)
	stale := h.addStudent(t, "leader4@parta.dev", "Забытый Ученик", ids.groupIS21)
	outsider := h.addStudent(t, "leader5@parta.dev", "Чужой Ученик", ids.groupIS22)

	h.setWeeklyXP(t, ids.student1, 120, currentWeek)
	h.setWeeklyXP(t, ids.student2, 80, currentWeek)
	h.setWeeklyXP(t, third, 80, currentWeek)
	h.setWeeklyXP(t, stale, 50, "2000-01-03")
	h.setWeeklyXP(t, outsider, 999, currentWeek)

	status, body := h.request(t, http.MethodGet, "/api/leaderboard", token, nil)
	if status != http.StatusOK {
		t.Fatalf("leaderboard = %d %v", status, body)
	}

	top, ok := body["top"].([]any)
	if !ok || len(top) != 4 {
		t.Fatalf("top = %v, want 4 members", body["top"])
	}

	ranks := make(map[int64]int)

	for _, raw := range top {
		entry := raw.(map[string]any)
		ranks[int64(entry["user_id"].(float64))] = int(entry["rank"].(float64))
	}

	if ranks[ids.student1] != 1 {
		t.Fatalf("student1 rank = %d, want 1", ranks[ids.student1])
	}

	if ranks[ids.student2] != 2 || ranks[third] != 2 {
		t.Fatalf("tie ranks = %d/%d, want 2/2", ranks[ids.student2], ranks[third])
	}

	if ranks[stale] != 3 {
		t.Fatalf("stale rank = %d, want 3 (weekly_xp reset)", ranks[stale])
	}

	if _, found := ranks[outsider]; found {
		t.Fatalf("outsider from another group is in leaderboard")
	}

	me, ok := body["me"].(map[string]any)
	if !ok {
		t.Fatalf("me = %v", body["me"])
	}

	if int(me["rank"].(float64)) != 2 {
		t.Fatalf("me rank = %v, want 2", me["rank"])
	}

	if int(me["weekly_xp"].(float64)) != 80 {
		t.Fatalf("me weekly_xp = %v, want 80", me["weekly_xp"])
	}

	if int(me["xp_to_next_rank"].(float64)) != 41 {
		t.Fatalf("xp_to_next_rank = %v, want 41", me["xp_to_next_rank"])
	}
}

func TestLeaderboardForbiddenForTeacher(t *testing.T) {
	h := newHarness(t)
	_ = h.seed()

	token := h.login(t, "teacher@parta.dev")

	status, body := h.request(t, http.MethodGet, "/api/leaderboard", token, nil)
	if status != http.StatusForbidden {
		t.Fatalf("leaderboard as teacher = %d %v, want 403", status, body)
	}
}
