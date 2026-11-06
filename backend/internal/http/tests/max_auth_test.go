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

func TestMaxAuthCreatesUserAndReusesIt(t *testing.T) {
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
	if status != http.StatusOK {
		t.Fatalf("max auth status = %d (%v)", status, body)
	}

	if body["token"] == "" {
		t.Fatal("max auth returned empty token")
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

	if count := h.scalarInt(`SELECT COUNT(1) FROM users WHERE external_id = 'max:4242'`); count != 1 {
		t.Fatalf("max users = %d, want 1", count)
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
