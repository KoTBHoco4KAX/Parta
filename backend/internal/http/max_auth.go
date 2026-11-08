package httpapi

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"errors"
	"net/http"
	"sort"
	"strconv"
	"strings"

	"github.com/parta/backend/internal/config"
	domainerrors "github.com/parta/backend/internal/domain/errors"
	"github.com/parta/backend/internal/storage"
)

// maxAuthRequest — параметры запуска MAX. Клиент может прислать их как
// вложенный объект params или плоским JSON.
type maxAuthRequest map[string]any

// maxLaunch — проверенные параметры запуска MAX.
type maxLaunch struct {
	params      map[string]string
	userID      string
	externalID  string
	displayName string
}

// maxOnboardingResponse — ответ для первого входа: пользователь ещё не создан.
type maxOnboardingResponse struct {
	NeedsOnboarding bool   `json:"needs_onboarding"`
	MaxUserID       string `json:"max_user_id"`
	DisplayName     string `json:"display_name"`
}

// handleMaxAuth проверяет подпись запуска MAX.
//
// Если пользователь уже есть — выдаёт JWT. Если это первый вход, ничего не
// создаёт, а возвращает needs_onboarding: фронтенд покажет выбор роли.
func (s *Server) handleMaxAuth(w http.ResponseWriter, r *http.Request) {
	_, launch, ok := s.readMaxLaunch(w, r)
	if !ok {
		return
	}

	user, err := s.users.GetByExternalID(r.Context(), launch.externalID)
	if err != nil {
		if errors.Is(err, domainerrors.ErrNotFound) {
			writeJSON(w, http.StatusOK, maxOnboardingResponse{
				NeedsOnboarding: true,
				MaxUserID:       launch.userID,
				DisplayName:     launch.displayName,
			})

			return
		}

		writeError(w, err)

		return
	}

	s.writeSession(w, user)
}

// handleMaxRegister создаёт пользователя MAX с выбранной ролью.
//
// Студент регистрируется без кода. Преподаватель и администратор обязаны
// прислать соответствующий инвайт-код.
func (s *Server) handleMaxRegister(w http.ResponseWriter, r *http.Request) {
	body, launch, ok := s.readMaxLaunch(w, r)
	if !ok {
		return
	}

	role := firstNonEmpty(bodyString(body, "role"), launch.params["role"])
	code := firstNonEmpty(bodyString(body, "code"), launch.params["code"])

	if !validRole(role) {
		writeError(w, domainerrors.ErrInvalidArgument)

		return
	}

	if !s.validInviteCode(role, code) {
		writeError(w, domainerrors.ErrForbidden)

		return
	}

	// Повторный register после успешного создания просто логинит пользователя.
	if user, err := s.users.GetByExternalID(r.Context(), launch.externalID); err == nil {
		s.writeSession(w, user)

		return
	} else if !errors.Is(err, domainerrors.ErrNotFound) {
		writeError(w, err)

		return
	}

	var groupID *int64

	if role == RoleStudent {
		group, err := s.ensureMaxGroup(r.Context())
		if err != nil {
			writeError(w, err)

			return
		}

		groupID = &group.ID
	}

	user, err := s.users.Create(
		r.Context(),
		launch.externalID,
		role,
		groupID,
		launch.displayName,
	)
	if err != nil {
		writeError(w, err)

		return
	}

	s.writeSession(w, user)
}

// demoLoginRequest — вход в демо-режиме браузера. Разрешены только три
// фиксированных аккаунта из начального сида.
type demoLoginRequest struct {
	Account string `json:"account"`
	Code    string `json:"code"`
}

var demoExternalIDs = map[string]string{
	"student": "max:000000001",
	"teacher": "max:000000002",
	"admin":   "max:000000003",
}

// handleDemoLogin выдаёт сессию одному из трёх демо-аккаунтов.
func (s *Server) handleDemoLogin(w http.ResponseWriter, r *http.Request) {
	var req demoLoginRequest

	if !decodeJSON(w, r, &req) {
		return
	}

	externalID, ok := demoExternalIDs[strings.TrimSpace(req.Account)]
	if !ok {
		writeError(w, domainerrors.ErrInvalidArgument)

		return
	}

	if !s.validInviteCode(strings.TrimSpace(req.Account), req.Code) {
		writeError(w, domainerrors.ErrForbidden)

		return
	}

	user, err := s.users.GetByExternalID(r.Context(), externalID)
	if err != nil {
		writeUnauthorized(w, "demo account is not seeded")

		return
	}

	s.writeSession(w, user)
}

// readMaxLaunch декодирует тело, проверяет подпись и собирает launch.
func (s *Server) readMaxLaunch(w http.ResponseWriter, r *http.Request) (maxAuthRequest, *maxLaunch, bool) {
	var body maxAuthRequest

	if !decodeJSON(w, r, &body) {
		return nil, nil, false
	}

	params := maxParams(body)
	hash := firstNonEmpty(params["hash"], params["sign"])

	if hash == "" || firstNonEmpty(params["user_id"], params["max_user_id"], params["id"]) == "" {
		writeUnauthorized(w, "max launch parameters are incomplete")

		return nil, nil, false
	}

	if strings.TrimSpace(s.cfg.MAXBotToken) == "" {
		writeUnauthorized(w, "max auth is not configured")

		return nil, nil, false
	}

	if !validMaxSignature(s.cfg.MAXBotToken, params, hash) {
		writeUnauthorized(w, "invalid max signature")

		return nil, nil, false
	}

	userID := firstNonEmpty(params["user_id"], params["max_user_id"], params["id"])

	return body, &maxLaunch{
		params:      params,
		userID:      userID,
		externalID:  "max:" + userID,
		displayName: maxDisplayName(params, userID),
	}, true
}

// writeSession выпускает JWT и возвращает стандартный ответ входа.
func (s *Server) writeSession(w http.ResponseWriter, user *storage.User) {
	token, err := s.tokens.Issue(user.ID, user.Role, config.JWTTTL)
	if err != nil {
		writeError(w, err)

		return
	}

	writeJSON(w, http.StatusOK, devLoginResponse{Token: token, User: newUserView(user)})
}

func (s *Server) validInviteCode(role, code string) bool {
	switch role {
	case RoleStudent:
		return true
	case RoleTeacher:
		expected := strings.TrimSpace(s.cfg.TeacherInviteCode)
		if expected == "" {
			return false
		}

		return subtle.ConstantTimeCompare(
			[]byte(strings.TrimSpace(code)),
			[]byte(expected),
		) == 1
	case RoleAdmin:
		expected := strings.TrimSpace(s.cfg.AdminInviteCode)
		if expected == "" {
			return false
		}

		return subtle.ConstantTimeCompare(
			[]byte(strings.TrimSpace(code)),
			[]byte(expected),
		) == 1
	default:
		return false
	}
}

// maxParams разворачивает вложенный params или плоское тело в строковую карту.
func maxParams(body maxAuthRequest) map[string]string {
	source := body

	if nested, ok := body["params"].(map[string]any); ok {
		source = nested
	}

	params := make(map[string]string, len(source))

	for key, value := range source {
		switch typed := value.(type) {
		case string:
			params[key] = typed
		case float64:
			params[key] = strconv.FormatFloat(typed, 'f', -1, 64)
		}
	}

	return params
}

// validMaxSignature принимает две распространённые канонизации: строки через
// перевод строки и через амперсанд. Обе подписываются HMAC-SHA256 секретом бота.
func validMaxSignature(secret string, params map[string]string, actual string) bool {
	keys := make([]string, 0, len(params))

	for key := range params {
		if key == "hash" || key == "sign" {
			continue
		}

		keys = append(keys, key)
	}

	sort.Strings(keys)

	values := make([]string, 0, len(keys))
	for _, key := range keys {
		values = append(values, key+"="+params[key])
	}

	for _, canonical := range []string{
		strings.Join(values, "\n"),
		strings.Join(values, "&"),
	} {
		mac := hmac.New(sha256.New, []byte(secret))
		mac.Write([]byte(canonical))
		expected := hex.EncodeToString(mac.Sum(nil))

		if subtle.ConstantTimeCompare([]byte(expected), []byte(actual)) == 1 {
			return true
		}
	}

	return false
}

// ensureMaxGroup находит или создаёт служебную группу для пользователей MAX.
func (s *Server) ensureMaxGroup(ctx context.Context) (*storage.Group, error) {
	groups, err := s.groups.List(ctx)
	if err != nil {
		return nil, err
	}

	for _, group := range groups {
		if group.Code == "MAX" {
			return &group, nil
		}
	}

	group, err := s.groups.Create(ctx, "MAX", "MAX")
	if err == nil {
		return group, nil
	}

	if errors.Is(err, domainerrors.ErrAlreadyExists) {
		groups, listErr := s.groups.List(ctx)
		if listErr != nil {
			return nil, listErr
		}

		for _, existing := range groups {
			if existing.Code == "MAX" {
				return &existing, nil
			}
		}
	}

	return nil, err
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}

	return ""
}

func bodyString(body maxAuthRequest, key string) string {
	value, _ := body[key].(string)

	return value
}

func maxDisplayName(params map[string]string, userID string) string {
	first := strings.TrimSpace(params["first_name"])
	last := strings.TrimSpace(params["last_name"])

	if name := strings.TrimSpace(first + " " + last); name != "" {
		return name
	}

	if name := strings.TrimSpace(params["name"]); name != "" {
		return name
	}

	if name := strings.TrimSpace(params["display_name"]); name != "" {
		return name
	}

	return "MAX " + userID
}
