package tests

import (
	"net/http"
	"testing"
)

func TestCarryOverOpenSlot(t *testing.T) {
	h := newHarness(t)
	ids := h.seed()

	token := h.login(t, "student1@parta.dev")

	status, body := h.request(t, http.MethodPost, carryOverPath(ids.slotBIZ), token, nil)
	if status != http.StatusOK {
		t.Fatalf("status = %d, want 200 (%v)", status, body)
	}

	if body["status"] != "CLAIMED" {
		t.Fatalf("status = %v, want CLAIMED", body["status"])
	}

	if int64(body["assigned_user_id"].(float64)) != ids.student1 {
		t.Fatalf("assigned_user_id = %v, want %d", body["assigned_user_id"], ids.student1)
	}

	if bonus := int64(body["bonus_xp"].(float64)); bonus <= 0 {
		t.Fatalf("bonus_xp = %d, want > 0", bonus)
	}

	if owner := h.scalarInt(`SELECT assigned_user_id FROM team_slots WHERE id = ?`, ids.slotBIZ); owner != ids.student1 {
		t.Fatalf("stored owner = %d, want %d", owner, ids.student1)
	}
}

func TestCarryOverClaimedSlotConflict(t *testing.T) {
	h := newHarness(t)
	ids := h.seed()

	h.exec(`UPDATE team_slots SET assigned_user_id = ?, status = 'CLAIMED' WHERE id = ?`, ids.student1, ids.slotDB)

	token := h.login(t, "student2@parta.dev")

	status, body := h.request(t, http.MethodPost, carryOverPath(ids.slotDB), token, nil)
	if status != http.StatusConflict {
		t.Fatalf("status = %d, want 409 (%v)", status, body)
	}

	if body["code"] != "invalid_transition" {
		t.Fatalf("code = %v, want invalid_transition", body["code"])
	}
}

func TestCarryOverForeignGroupForbidden(t *testing.T) {
	h := newHarness(t)
	ids := h.seed()

	token := h.login(t, "student3@parta.dev")

	status, body := h.request(t, http.MethodPost, carryOverPath(ids.slotBIZ), token, nil)
	if status != http.StatusForbidden {
		t.Fatalf("status = %d, want 403 (%v)", status, body)
	}
}

func TestCarryOverNotFound(t *testing.T) {
	h := newHarness(t)
	_ = h.seed()

	token := h.login(t, "student1@parta.dev")

	status, body := h.request(t, http.MethodPost, carryOverPath(999999), token, nil)
	if status != http.StatusNotFound {
		t.Fatalf("status = %d, want 404 (%v)", status, body)
	}
}

func TestCarryOverRoleForbidden(t *testing.T) {
	h := newHarness(t)
	ids := h.seed()

	token := h.login(t, "teacher@parta.dev")

	status, body := h.request(t, http.MethodPost, carryOverPath(ids.slotBIZ), token, nil)
	if status != http.StatusForbidden {
		t.Fatalf("status = %d, want 403 (%v)", status, body)
	}
}

func TestCarryOverBadSlotID(t *testing.T) {
	h := newHarness(t)
	_ = h.seed()

	token := h.login(t, "student1@parta.dev")

	status, body := h.request(t, http.MethodPost, "/api/team-slots/abc/carry-over", token, nil)
	if status != http.StatusUnprocessableEntity {
		t.Fatalf("status = %d, want 422 (%v)", status, body)
	}
}

// carryOverPath собирает путь перехвата слота.
func carryOverPath(id int64) string {
	return "/api/team-slots/" + itoa64(id) + "/carry-over"
}
