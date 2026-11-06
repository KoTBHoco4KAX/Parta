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

// handleMaxAuth проверяет подпись запуска MAX и выдаёт сессионный JWT.
//
// MAX присылает user_id и hash, подписанный MAX_BOT_TOKEN. Пользователь
// находится по external_id max:<user_id>; при первом входе создаётся ученик
// в служебной группе MAX.
func (s *Server) handleMaxAuth(w http.ResponseWriter, r *http.Request) {
	var body maxAuthRequest

	if !decodeJSON(w, r, &body) {
		return
	}

	params := maxParams(body)
	hash := firstNonEmpty(params["hash"], params["sign"])

	if hash == "" || firstNonEmpty(params["user_id"], params["max_user_id"], params["id"]) == "" {
		writeUnauthorized(w, "max launch parameters are incomplete")

		return
	}

	if strings.TrimSpace(s.cfg.MAXBotToken) == "" {
		writeUnauthorized(w, "max auth is not configured")

		return
	}

	if !validMaxSignature(s.cfg.MAXBotToken, params, hash) {
		writeUnauthorized(w, "invalid max signature")

		return
	}

	maxUserID := firstNonEmpty(params["user_id"], params["max_user_id"], params["id"])
	externalID := "max:" + maxUserID

	user, err := s.users.GetByExternalID(r.Context(), externalID)
	if err != nil {
		if !errors.Is(err, domainerrors.ErrNotFound) {
			writeError(w, err)

			return
		}

		group, groupErr := s.ensureMaxGroup(r.Context())
		if groupErr != nil {
			writeError(w, groupErr)

			return
		}

		user, err = s.users.Create(
			r.Context(),
			externalID,
			RoleStudent,
			&group.ID,
			maxDisplayName(params, maxUserID),
		)
		if err != nil {
			writeError(w, err)

			return
		}
	}

	token, err := s.tokens.Issue(user.ID, user.Role, config.JWTTTL)
	if err != nil {
		writeError(w, err)

		return
	}

	writeJSON(w, http.StatusOK, devLoginResponse{Token: token, User: newUserView(user)})
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
