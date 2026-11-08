package httpapi

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"net/url"
	"testing"
)

func TestParseMaxInitData(t *testing.T) {
	const botToken = "bot-token"

	userJSON := `{"id":12345,"first_name":"Иван","last_name":"Петров"}`
	canonical := "auth_date=1700000000\nquery_id=abc\nuser=" + userJSON

	secretMAC := hmac.New(sha256.New, []byte("WebAppData"))
	secretMAC.Write([]byte(botToken))
	signatureMAC := hmac.New(sha256.New, secretMAC.Sum(nil))
	signatureMAC.Write([]byte(canonical))
	hash := hex.EncodeToString(signatureMAC.Sum(nil))

	values := url.Values{
		"auth_date": {"1700000000"},
		"query_id":  {"abc"},
		"user":      {userJSON},
		"hash":      {hash},
	}

	userID, displayName, err := parseMaxInitData(botToken, values.Encode())
	if err != nil {
		t.Fatalf("parseMaxInitData: %v", err)
	}

	if userID != "12345" || displayName != "Иван Петров" {
		t.Fatalf("got userID=%q display=%q", userID, displayName)
	}

	values.Set("hash", "bad")
	if _, _, err := parseMaxInitData(botToken, values.Encode()); err == nil {
		t.Fatal("tampered init data accepted")
	}
}

func TestValidMaxSignature(t *testing.T) {
	params := map[string]string{
		"user_id":   "42",
		"auth_date": "1700000000",
		"query_id":  "abc",
	}
	canonical := "auth_date=1700000000\nquery_id=abc\nuser_id=42"

	mac := hmac.New(sha256.New, []byte("max-secret"))
	mac.Write([]byte(canonical))
	hash := hex.EncodeToString(mac.Sum(nil))

	if !validMaxSignature("max-secret", params, hash) {
		t.Fatal("valid signature rejected")
	}

	if validMaxSignature("other-secret", params, hash) {
		t.Fatal("signature accepted with wrong secret")
	}
}

func TestMaxParamsNestedAndFlat(t *testing.T) {
	nested := maxParams(maxAuthRequest{
		"params": map[string]any{
			"user_id": "42",
			"hash":    "abc",
		},
	})

	if nested["user_id"] != "42" || nested["hash"] != "abc" {
		t.Fatalf("nested params = %#v", nested)
	}

	flat := maxParams(maxAuthRequest{"user_id": "7", "max_user_id": "8"})

	if flat["user_id"] != "7" || flat["max_user_id"] != "8" {
		t.Fatalf("flat params = %#v", flat)
	}
}

func TestMaxDisplayName(t *testing.T) {
	if got := maxDisplayName(map[string]string{"first_name": "Иван", "last_name": "Петров"}, "42"); got != "Иван Петров" {
		t.Fatalf("display name = %q", got)
	}

	if got := maxDisplayName(nil, "42"); got != "MAX 42" {
		t.Fatalf("fallback display name = %q", got)
	}
}
