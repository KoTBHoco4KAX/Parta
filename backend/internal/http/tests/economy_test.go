package tests

import (
	"net/http"
	"testing"
)

func TestPurchaseFreezesInsufficientXP(t *testing.T) {
	h := newHarness(t)
	_ = h.seed()
	token := h.login(t, "student1@parta.dev")

	status, body := h.request(t, http.MethodPost, "/api/users/me/streak-freezes/purchase", token, map[string]any{
		"quantity": 1,
	})
	if status != http.StatusUnprocessableEntity {
		t.Fatalf("status = %d, want 422 (%v)", status, body)
	}

	if body["code"] != "insufficient_xp" {
		t.Fatalf("code = %v, want insufficient_xp", body["code"])
	}
}

func TestPurchaseFreezesSuccess(t *testing.T) {
	h := newHarness(t)
	ids := h.seed()

	h.topUpXP(ids.student1, 500)

	token := h.login(t, "student1@parta.dev")

	status, body := h.request(t, http.MethodPost, "/api/users/me/streak-freezes/purchase", token, map[string]any{
		"quantity": 1,
	})
	if status != http.StatusOK {
		t.Fatalf("status = %d, want 200 (%v)", status, body)
	}

	if freezes := int64(body["streak_freezes"].(float64)); freezes != 1 {
		t.Fatalf("streak_freezes = %d, want 1", freezes)
	}

	if balance := int64(body["xp_balance"].(float64)); balance != 300 {
		t.Fatalf("xp_balance = %d, want 300", balance)
	}

	if ledgerID := int64(body["ledger_id"].(float64)); ledgerID <= 0 {
		t.Fatalf("ledger_id = %d", ledgerID)
	} else {
		if got := h.scalarString(`SELECT reason FROM xp_ledger WHERE id = ?`, ledgerID); got != "FREEZE_PURCHASE" {
			t.Fatalf("reason = %q, want FREEZE_PURCHASE", got)
		}

		if got := h.scalarInt(`SELECT amount FROM xp_ledger WHERE id = ?`, ledgerID); got != -200 {
			t.Fatalf("amount = %d, want -200", got)
		}
	}
}

func TestPurchaseFreezesDefaultsToOne(t *testing.T) {
	h := newHarness(t)
	ids := h.seed()

	h.topUpXP(ids.student1, 500)

	token := h.login(t, "student1@parta.dev")

	status, body := h.request(t, http.MethodPost, "/api/users/me/streak-freezes/purchase", token, map[string]any{})
	if status != http.StatusOK {
		t.Fatalf("status = %d, want 200 (%v)", status, body)
	}

	if freezes := int64(body["streak_freezes"].(float64)); freezes != 1 {
		t.Fatalf("streak_freezes = %d, want 1", freezes)
	}

	if balance := int64(body["xp_balance"].(float64)); balance != 300 {
		t.Fatalf("xp_balance = %d, want 300", balance)
	}
}

func TestPurchaseFreezesRejectsQuantity(t *testing.T) {
	h := newHarness(t)
	ids := h.seed()

	h.topUpXP(ids.student1, 5000)

	token := h.login(t, "student1@parta.dev")

	status, body := h.request(t, http.MethodPost, "/api/users/me/streak-freezes/purchase", token, map[string]any{
		"quantity": 11,
	})
	if status != http.StatusUnprocessableEntity {
		t.Fatalf("status = %d, want 422 (%v)", status, body)
	}

	status, body = h.request(t, http.MethodPost, "/api/users/me/streak-freezes/purchase", token, map[string]any{
		"quantity": -1,
	})
	if status != http.StatusUnprocessableEntity {
		t.Fatalf("negative quantity status = %d, want 422 (%v)", status, body)
	}
}

func TestPurchaseFreezesRoleForbidden(t *testing.T) {
	h := newHarness(t)
	_ = h.seed()

	token := h.login(t, "teacher@parta.dev")

	status, body := h.request(t, http.MethodPost, "/api/users/me/streak-freezes/purchase", token, map[string]any{
		"quantity": 1,
	})
	if status != http.StatusForbidden {
		t.Fatalf("status = %d, want 403 (%v)", status, body)
	}
}
