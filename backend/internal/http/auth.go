package httpapi

import (
	"net/http"
	"strings"
	"time"

	"github.com/parta/backend/internal/auth"
	"github.com/parta/backend/internal/config"
	domainerrors "github.com/parta/backend/internal/domain/errors"
	"github.com/parta/backend/internal/storage"
)

// PeerReviewTokenTTL — время жизни read-only токена рецензента (spec/02_FSM.md).
const PeerReviewTokenTTL = auth.PeerReviewTokenTTL

// ScopePeerReviewRead — scope токена доступа к sandbox-ревью.
const ScopePeerReviewRead = auth.ScopePeerReviewRead

// Claims — полезная нагрузка JWT ПАРТА. Оставлен псевдонимом для тестов и
// внешних вызовов; реализация живёт в internal/auth.
type Claims = auth.Claims

// TokenService — сервис JWT ПАРТА (псевдоним internal/auth).
type TokenService = auth.TokenService

// NewTokenService создаёт сервис токенов JWT. Псевдоним сохраняет прежний API
// пакета, пока реализация вынесена в internal/auth (нужно для internal/ws).
func NewTokenService(secret string, now func() time.Time) *auth.TokenService {
	return auth.NewTokenService(secret, now)
}

// devLoginRequest — тело POST /api/auth/dev-login.
type devLoginRequest struct {
	Email string `json:"email"`
}

// loginRequest — тело POST /api/auth/login.
// Пароль в dev-контуре не проверяется, но обязателен: экран входа не должен
// отправлять пустую форму.
type loginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
	Role     string `json:"role"`
}

// userView — публичное представление пользователя.
type userView struct {
	ID            int64  `json:"id"`
	ExternalID    string `json:"external_id"`
	Role          string `json:"role"`
	GroupID       *int64 `json:"group_id"`
	DisplayName   string `json:"display_name"`
	XPBalance     int    `json:"xp_balance"`
	OnTimeStreak  int    `json:"on_time_streak"`
	StreakFreezes int    `json:"streak_freezes"`
}

// devLoginResponse — ответ dev-входа.
type devLoginResponse struct {
	Token string   `json:"token"`
	User  userView `json:"user"`
}

// handleDevLogin выдаёт токен по email. Доступен только в PARTA_ENV=dev.
func (s *Server) handleDevLogin(w http.ResponseWriter, r *http.Request) {
	if !s.cfg.IsDev() {
		writeError(w, domainerrors.ErrForbidden)

		return
	}

	var req devLoginRequest

	if !decodeJSON(w, r, &req) {
		return
	}

	if strings.TrimSpace(req.Email) == "" {
		writeError(w, domainerrors.ErrInvalidArgument)

		return
	}

	user, err := s.users.GetByExternalID(r.Context(), req.Email)
	if err != nil {
		writeError(w, err)

		return
	}

	token, err := s.tokens.Issue(user.ID, user.Role, config.JWTTTL)
	if err != nil {
		writeError(w, err)

		return
	}

	writeJSON(w, http.StatusOK, devLoginResponse{Token: token, User: newUserView(user)})
}

// handleLogin выдаёт токен по email/паролю и выбранной роли.
// Пароль принимается любой непустой: внешний провайдер (Сферум/MAX) появится позже.
func (s *Server) handleLogin(w http.ResponseWriter, r *http.Request) {
	var req loginRequest

	if !decodeJSON(w, r, &req) {
		return
	}

	email := strings.TrimSpace(req.Email)

	if email == "" || strings.TrimSpace(req.Password) == "" || !validRole(req.Role) {
		writeError(w, domainerrors.ErrInvalidArgument)

		return
	}

	user, err := s.users.GetByExternalID(r.Context(), email)
	if err != nil {
		writeError(w, err)

		return
	}

	if user.Role != req.Role {
		writeError(w, domainerrors.ErrForbidden)

		return
	}

	token, err := s.tokens.Issue(user.ID, user.Role, config.JWTTTL)
	if err != nil {
		writeError(w, err)

		return
	}

	writeJSON(w, http.StatusOK, devLoginResponse{Token: token, User: newUserView(user)})
}

// validRole проверяет роль из формы входа.
func validRole(role string) bool {
	return role == RoleAdmin || role == RoleTeacher || role == RoleStudent
}

// newUserView собирает публичное представление пользователя.
func newUserView(user *storage.User) userView {
	return userView{
		ID:            user.ID,
		ExternalID:    user.ExternalID,
		Role:          user.Role,
		GroupID:       user.GroupID,
		DisplayName:   user.DisplayName,
		XPBalance:     user.XPBalance,
		OnTimeStreak:  user.OnTimeStreak,
		StreakFreezes: user.StreakFreezes,
	}
}
