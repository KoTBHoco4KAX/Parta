package tests

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"testing"
)

func maxSignature(secret, canonical string) string {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(canonical))

	return hex.EncodeToString(mac.Sum(nil))
}

func TestMaxAuthOnboardingAndReuse(t *testing.T) {
	const tokenSecret = "max-test-token"
	h := newHarnessWithMaxToken(t, tokenSecret)

	params := map[string]string{
		"auth_date":  "1700000000",
		"first_name": "Иван",
		"last_name":  "Петров",
		"user_id":    "4242",
	}
	canonical := "auth_date=1700000000\nfirst_name=Иван\nlast_name=Петров\nuser_id=4242"
	params["hash"] = maxSignature(tokenSecret, canonical)

	status, body := h.request(t, http.MethodPost, "/api/auth/max", "", map[string]any{
		"params": params,
	})
	if status != http.StatusOK || body["needs_onboarding"] != true {
		t.Fatalf("first max auth = %d %v, want onboarding", status, body)
	}

	if count := h.scalarInt(`SELECT COUNT(1) FROM users WHERE external_id = 'max:4242'`); count != 0 {
		t.Fatalf("user created before onboarding: %d", count)
	}

	status, body = h.request(t, http.MethodPost, "/api/auth/max/register", "", map[string]any{
		"params": params,
		"role":   "student",
	})
	if status != http.StatusOK {
		t.Fatalf("max register status = %d (%v)", status, body)
	}

	if body["token"] == "" {
		t.Fatal("max register returned empty token")
	}

	user := body["user"].(map[string]any)
	if user["external_id"] != "max:4242" || user["role"] != "student" {
		t.Fatalf("max user = %v", user)
	}

	userID := int64(user["id"].(float64))

	status, body = h.request(t, http.MethodPost, "/api/auth/max", "", map[string]any{
		"params": params,
	})
	if status != http.StatusOK {
		t.Fatalf("second max auth status = %d (%v)", status, body)
	}

	if got := int64(body["user"].(map[string]any)["id"].(float64)); got != userID {
		t.Fatalf("max user id = %d, want %d", got, userID)
	}
}

func TestMaxRegisterTeacherRequiresCode(t *testing.T) {
	const tokenSecret = "max-test-token"
	h := newHarnessWithMaxToken(t, tokenSecret)

	params := map[string]string{"user_id": "777", "auth_date": "1700000000"}
	params["hash"] = maxSignature(tokenSecret, "auth_date=1700000000\nuser_id=777")

	status, _ := h.request(t, http.MethodPost, "/api/auth/max/register", "", map[string]any{
		"params": params,
		"role":   "teacher",
		"code":   "wrong",
	})
	if status != http.StatusForbidden {
		t.Fatalf("wrong teacher code status = %d, want 403", status)
	}

	status, body := h.request(t, http.MethodPost, "/api/auth/max/register", "", map[string]any{
		"params": params,
		"role":   "teacher",
		"code":   "TEACHER2026",
	})
	if status != http.StatusOK {
		t.Fatalf("teacher register status = %d (%v)", status, body)
	}

	if role := body["user"].(map[string]any)["role"]; role != "teacher" {
		t.Fatalf("teacher role = %v", role)
	}
}

func TestDemoLoginOnlyFixedAccounts(t *testing.T) {
	h := newHarness(t)
	ids := h.seed()

	_, err := h.db.Exec(`
		INSERT INTO users (external_id, role, group_id, display_name) VALUES
			('max:000000001', 'student', ?, 'Демо Студент'),
			('max:000000002', 'teacher', NULL, 'Демо Преподаватель'),
			('max:000000003', 'admin', NULL, 'Демо Администратор')
	`, ids.groupIS21)
	if err != nil {
		t.Fatalf("insert demo users: %v", err)
	}

	status, body := h.request(t, http.MethodPost, "/api/auth/demo", "", map[string]any{
		"account": "student",
	})
	if status != http.StatusOK {
		t.Fatalf("student demo status = %d (%v)", status, body)
	}

	status, _ = h.request(t, http.MethodPost, "/api/auth/demo", "", map[string]any{
		"account": "teacher",
		"code":    "wrong",
	})
	if status != http.StatusForbidden {
		t.Fatalf("teacher wrong code status = %d, want 403", status)
	}

	status, body = h.request(t, http.MethodPost, "/api/auth/demo", "", map[string]any{
		"account": "teacher",
		"code":    "TEACHER2026",
	})
	if status != http.StatusOK {
		t.Fatalf("teacher demo status = %d (%v)", status, body)
	}

	status, _ = h.request(t, http.MethodPost, "/api/auth/demo", "", map[string]any{
		"account": "unknown",
	})
	if status != http.StatusUnprocessableEntity {
		t.Fatalf("unknown demo status = %d, want 422", status)
	}
}

func TestMaxAuthRejectsBadSignature(t *testing.T) {
	h := newHarnessWithMaxToken(t, "max-test-token")

	status, _ := h.request(t, http.MethodPost, "/api/auth/max", "", map[string]any{
		"params": map[string]string{
			"user_id": "1",
			"hash":    "bad-signature",
		},
	})
	if status != http.StatusUnauthorized {
		t.Fatalf("bad signature status = %d, want 401", status)
	}
}

func TestMaxAuthWithoutConfiguredToken(t *testing.T) {
	h := newHarness(t)

	status, _ := h.request(t, http.MethodPost, "/api/auth/max", "", map[string]any{
		"params": map[string]string{
			"user_id": "1",
			"hash":    "anything",
		},
	})
	if status != http.StatusUnauthorized {
		t.Fatalf("unconfigured max auth status = %d, want 401", status)
	}
}
