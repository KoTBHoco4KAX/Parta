package tests

import (
	"strings"
	"testing"
	"time"

	httpapi "github.com/parta/backend/internal/http"
)

func TestTokenRoundTrip(t *testing.T) {
	tokens := httpapi.NewTokenService(testJWTSecret, time.Now)

	raw, err := tokens.Issue(42, "teacher", time.Hour)
	if err != nil {
		t.Fatalf("Issue: %v", err)
	}

	claims, err := tokens.Parse(raw)
	if err != nil {
		t.Fatalf("Parse: %v", err)
	}

	if claims.Sub != 42 || claims.Role != "teacher" {
		t.Fatalf("claims = %+v", claims)
	}

	if claims.Scope != "" || claims.PeerReviewID != 0 {
		t.Fatalf("user token must not carry peer-review scope: %+v", claims)
	}
}

func TestPeerReviewReadToken(t *testing.T) {
	tokens := httpapi.NewTokenService(testJWTSecret, time.Now)

	raw, err := tokens.IssuePeerReviewRead(701, 42)
	if err != nil {
		t.Fatalf("IssuePeerReviewRead: %v", err)
	}

	claims, err := tokens.Parse(raw)
	if err != nil {
		t.Fatalf("Parse: %v", err)
	}

	if claims.Scope != httpapi.ScopePeerReviewRead {
		t.Fatalf("scope = %q", claims.Scope)
	}

	if claims.PeerReviewID != 701 || claims.Sub != 42 {
		t.Fatalf("claims = %+v", claims)
	}

	lifetime := time.Until(time.Unix(claims.ExpiresAt, 0))
	if lifetime > httpapi.PeerReviewTokenTTL+time.Minute || lifetime < httpapi.PeerReviewTokenTTL-time.Minute {
		t.Fatalf("lifetime = %s, want %s", lifetime, httpapi.PeerReviewTokenTTL)
	}
}

func TestTokenRejectsTamperedSignature(t *testing.T) {
	tokens := httpapi.NewTokenService(testJWTSecret, time.Now)

	raw, err := tokens.Issue(42, "student", time.Hour)
	if err != nil {
		t.Fatalf("Issue: %v", err)
	}

	parts := strings.Split(raw, ".")
	tampered := parts[0] + "." + parts[1] + "." + strings.Repeat("A", len(parts[2]))

	if _, err := tokens.Parse(tampered); err == nil {
		t.Fatalf("tampered token accepted")
	}
}

func TestTokenRejectsMalformedInput(t *testing.T) {
	tokens := httpapi.NewTokenService(testJWTSecret, time.Now)

	for _, raw := range []string{"", "one", "one.two", "one.two.three.four", "...."} {
		if _, err := tokens.Parse(raw); err == nil {
			t.Fatalf("Parse(%q) accepted malformed token", raw)
		}
	}
}

func TestTokenRejectsExpired(t *testing.T) {
	tokens := httpapi.NewTokenService(testJWTSecret, time.Now)

	raw, err := tokens.Issue(42, "student", -time.Second)
	if err != nil {
		t.Fatalf("Issue: %v", err)
	}

	if _, err := tokens.Parse(raw); err == nil {
		t.Fatalf("expired token accepted")
	}
}
