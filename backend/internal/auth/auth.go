// Package auth выпускает и проверяет JWT ПАРТА (HS256 на stdlib).
//
// Пакет не зависит от HTTP и WebSocket: им пользуются и REST-слой
// (internal/http), и реалтайм-слой (internal/ws). Это исключает цикл импортов
// и второй парсер токенов.
package auth

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"strings"
	"time"

	"github.com/parta/backend/internal/config"
)

// PeerReviewTokenTTL — время жизни read-only токена рецензента (spec/02_FSM.md).
const PeerReviewTokenTTL = 15 * time.Minute

// ScopePeerReviewRead — scope токена доступа к sandbox-ревью.
const ScopePeerReviewRead = "peer_review:read"

// ErrInvalidToken — токен не разбирается, не подписан или просрочен.
var ErrInvalidToken = errors.New("invalid token")

// jwtHeader — заголовок JWT. Поддерживается только HS256.
type jwtHeader struct {
	Alg string `json:"alg"`
	Typ string `json:"typ"`
}

// Claims — полезная нагрузка JWT ПАРТА.
type Claims struct {
	Sub          int64  `json:"sub"`
	Role         string `json:"role,omitempty"`
	Issuer       string `json:"iss"`
	ExpiresAt    int64  `json:"exp"`
	IssuedAt     int64  `json:"iat"`
	Scope        string `json:"scope,omitempty"`
	PeerReviewID int64  `json:"peer_review_id,omitempty"`
}

// TokenService выпускает и проверяет JWT (HS256) на stdlib.
type TokenService struct {
	secret []byte
	now    func() time.Time
}

// NewTokenService создаёт сервис токенов с общим для сервера источником времени.
func NewTokenService(secret string, now func() time.Time) *TokenService {
	if now == nil {
		now = time.Now
	}

	return &TokenService{secret: []byte(secret), now: now}
}

// Issue выпускает пользовательский токен с ролью.
func (t *TokenService) Issue(userID int64, role string, ttl time.Duration) (string, error) {
	now := t.now()

	return t.sign(Claims{
		Sub:       userID,
		Role:      role,
		Issuer:    config.JWTIssuer,
		ExpiresAt: now.Add(ttl).Unix(),
		IssuedAt:  now.Unix(),
	})
}

// IssuePeerReviewRead выпускает короткоживущий read-only токен рецензента.
func (t *TokenService) IssuePeerReviewRead(peerReviewID, reviewerID int64) (string, error) {
	now := t.now()

	return t.sign(Claims{
		Sub:          reviewerID,
		Issuer:       config.JWTIssuer,
		ExpiresAt:    now.Add(PeerReviewTokenTTL).Unix(),
		IssuedAt:     now.Unix(),
		Scope:        ScopePeerReviewRead,
		PeerReviewID: peerReviewID,
	})
}

// sign собирает и подписывает токен.
func (t *TokenService) sign(claims Claims) (string, error) {
	header, err := json.Marshal(jwtHeader{Alg: "HS256", Typ: "JWT"})
	if err != nil {
		return "", err
	}

	payload, err := json.Marshal(claims)
	if err != nil {
		return "", err
	}

	signingInput := base64.RawURLEncoding.EncodeToString(header) + "." +
		base64.RawURLEncoding.EncodeToString(payload)

	return signingInput + "." + t.signature(signingInput), nil
}

// Parse проверяет подпись, срок и издателя токена.
func (t *TokenService) Parse(raw string) (Claims, error) {
	parts := strings.Split(raw, ".")
	if len(parts) != 3 {
		return Claims{}, ErrInvalidToken
	}

	signingInput := parts[0] + "." + parts[1]

	expected := t.signature(signingInput)
	if !hmac.Equal([]byte(expected), []byte(parts[2])) {
		return Claims{}, ErrInvalidToken
	}

	payload, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return Claims{}, ErrInvalidToken
	}

	var claims Claims

	if err := json.Unmarshal(payload, &claims); err != nil {
		return Claims{}, ErrInvalidToken
	}

	if claims.Issuer != config.JWTIssuer {
		return Claims{}, ErrInvalidToken
	}

	if claims.Sub <= 0 {
		return Claims{}, ErrInvalidToken
	}

	if claims.ExpiresAt <= t.now().Unix() {
		return Claims{}, ErrInvalidToken
	}

	return claims, nil
}

// signature считает HMAC-SHA256 в base64url без паддинга.
func (t *TokenService) signature(signingInput string) string {
	mac := hmac.New(sha256.New, t.secret)
	mac.Write([]byte(signingInput))

	return base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}
