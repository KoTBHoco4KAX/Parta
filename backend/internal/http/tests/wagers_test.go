package tests

import (
	"net/http"
	"testing"
	"time"
)

// wagerBody собирает тело создания пари.
func wagerBody(taskID int64, stake int, deadline time.Time) map[string]any {
	return map[string]any{
		"task_id":      taskID,
		"stake_amount": stake,
		"deadline_at":  deadline.UTC().Format(time.RFC3339),
	}
}

func TestCreateWagerSuccess(t *testing.T) {
	h := newHarness(t)
	ids := h.seed()

	h.topUpXP(ids.student1, 500)

	token := h.login(t, "student1@parta.dev")

	status, body := h.request(t, http.MethodPost, "/api/wagers", token,
		wagerBody(ids.taskLab, 100, time.Now().Add(72*time.Hour)))
	if status != http.StatusCreated {
		t.Fatalf("status = %d, want 201 (%v)", status, body)
	}

	if body["status"] != "PLACED" {
		t.Fatalf("status = %v, want PLACED", body["status"])
	}

	if escrow := int64(body["escrow_tx_id"].(float64)); escrow <= 0 {
		t.Fatalf("escrow_tx_id = %d", escrow)
	}

	if balance := h.scalarInt(`SELECT xp_balance FROM users WHERE id = ?`, ids.student1); balance != 400 {
		t.Fatalf("balance = %d, want 400", balance)
	}

	if got := h.scalarString(`SELECT reason FROM xp_ledger WHERE user_id = ? ORDER BY id DESC LIMIT 1`, ids.student1); got != "WAGER_PLACE" {
		t.Fatalf("reason = %q, want WAGER_PLACE", got)
	}
}

func TestCreateWagerInsufficientXP(t *testing.T) {
	h := newHarness(t)
	ids := h.seed()

	h.topUpXP(ids.student1, 50)

	token := h.login(t, "student1@parta.dev")

	status, body := h.request(t, http.MethodPost, "/api/wagers", token,
		wagerBody(ids.taskLab, 100, time.Now().Add(72*time.Hour)))
	if status != http.StatusUnprocessableEntity {
		t.Fatalf("status = %d, want 422 (%v)", status, body)
	}

	if body["code"] != "insufficient_xp" {
		t.Fatalf("code = %v, want insufficient_xp", body["code"])
	}
}

func TestCreateWagerAfterTaskDeadline(t *testing.T) {
	h := newHarness(t)
	ids := h.seed()

	h.topUpXP(ids.student1, 500)

	token := h.login(t, "student1@parta.dev")

	status, body := h.request(t, http.MethodPost, "/api/wagers", token,
		wagerBody(ids.taskLab, 100, time.Now().Add(3*365*24*time.Hour)))
	if status != http.StatusUnprocessableEntity {
		t.Fatalf("status = %d, want 422 (%v)", status, body)
	}

	if body["code"] != "guard_failed" {
		t.Fatalf("code = %v, want guard_failed", body["code"])
	}
}

func TestCreateWagerPastDeadline(t *testing.T) {
	h := newHarness(t)
	ids := h.seed()

	h.topUpXP(ids.student1, 500)

	token := h.login(t, "student1@parta.dev")

	status, body := h.request(t, http.MethodPost, "/api/wagers", token,
		wagerBody(ids.taskLab, 100, time.Now().Add(-time.Hour)))
	if status != http.StatusUnprocessableEntity {
		t.Fatalf("status = %d, want 422 (%v)", status, body)
	}

	if body["code"] != "deadline_passed" {
		t.Fatalf("code = %v, want deadline_passed", body["code"])
	}
}

func TestCreateWagerDuplicateActive(t *testing.T) {
	h := newHarness(t)
	ids := h.seed()

	h.topUpXP(ids.student1, 500)

	token := h.login(t, "student1@parta.dev")

	body := wagerBody(ids.taskLab, 50, time.Now().Add(72*time.Hour))

	if status, resp := h.request(t, http.MethodPost, "/api/wagers", token, body); status != http.StatusCreated {
		t.Fatalf("first wager status = %d (%v)", status, resp)
	}

	status, resp := h.request(t, http.MethodPost, "/api/wagers", token, body)
	if status != http.StatusConflict {
		t.Fatalf("second wager status = %d, want 409 (%v)", status, resp)
	}

	if resp["code"] != "already_exists" {
		t.Fatalf("code = %v, want already_exists", resp["code"])
	}
}

func TestCreateWagerForeignGroupForbidden(t *testing.T) {
	h := newHarness(t)
	ids := h.seed()

	h.topUpXP(ids.student3, 500)

	token := h.login(t, "student3@parta.dev")

	status, body := h.request(t, http.MethodPost, "/api/wagers", token,
		wagerBody(ids.taskLab, 100, time.Now().Add(72*time.Hour)))
	if status != http.StatusForbidden {
		t.Fatalf("status = %d, want 403 (%v)", status, body)
	}
}

func TestCreateWagerRoleForbidden(t *testing.T) {
	h := newHarness(t)
	ids := h.seed()

	token := h.login(t, "admin@parta.dev")

	status, body := h.request(t, http.MethodPost, "/api/wagers", token,
		wagerBody(ids.taskLab, 100, time.Now().Add(72*time.Hour)))
	if status != http.StatusForbidden {
		t.Fatalf("status = %d, want 403 (%v)", status, body)
	}
}

func TestCreateWagerInvalidStake(t *testing.T) {
	h := newHarness(t)
	ids := h.seed()

	h.topUpXP(ids.student1, 500)

	token := h.login(t, "student1@parta.dev")

	status, body := h.request(t, http.MethodPost, "/api/wagers", token,
		wagerBody(ids.taskLab, 0, time.Now().Add(72*time.Hour)))
	if status != http.StatusUnprocessableEntity {
		t.Fatalf("status = %d, want 422 (%v)", status, body)
	}
}
