package httpapi

import (
	"encoding/json"
	"errors"
	"io"
	"log"
	"net/http"

	domainerrors "github.com/parta/backend/internal/domain/errors"
)

// Коды ответов, у которых нет доменного сентинела.
const (
	// CodeInvalidJSON — тело запроса не разбирается как JSON.
	CodeInvalidJSON = "invalid_json"
	// CodeUnauthorized — отсутствующий, битый или просроченный токен.
	CodeUnauthorized = "unauthorized"
	// CodeInternal — непредвиденная ошибка сервера.
	CodeInternal = "internal"
)

// maxBodyBytes ограничивает тело запроса, чтобы не читать гигабайты в память.
const maxBodyBytes = 1 << 20

// errorBody — единый формат ошибки REST API.
type errorBody struct {
	Error string `json:"error"`
	Code  string `json:"code"`
}

// writeJSON пишет JSON-ответ с заданным HTTP-статусом.
func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)

	if payload == nil {
		return
	}

	if err := json.NewEncoder(w).Encode(payload); err != nil {
		// Заголовки уже отправлены: остаётся только зафиксировать сбой в логе.
		log.Printf("http: encode response: %v", err)
	}
}

// writeError переводит доменную ошибку в HTTP-статус и JSON-конверт.
func writeError(w http.ResponseWriter, err error) {
	status, code := mapError(err)

	message := err.Error()
	if status >= http.StatusInternalServerError {
		log.Printf("http: internal error: %v", err)
		message = "internal server error"
	}

	writeJSON(w, status, errorBody{Error: message, Code: code})
}

// writeUnauthorized отвечает 401 в общем формате ошибки.
func writeUnauthorized(w http.ResponseWriter, message string) {
	writeJSON(w, http.StatusUnauthorized, errorBody{Error: message, Code: CodeUnauthorized})
}

// mapError сопоставляет доменные сентинелы кодам HTTP по правилам Фазы 5.1.
func mapError(err error) (int, string) {
	switch {
	case errors.Is(err, domainerrors.ErrInvalidTransition):
		return http.StatusConflict, "invalid_transition"
	case errors.Is(err, domainerrors.ErrAlreadyExists):
		return http.StatusConflict, "already_exists"
	case errors.Is(err, domainerrors.ErrForbidden):
		return http.StatusForbidden, "forbidden"
	case errors.Is(err, domainerrors.ErrNotFound):
		return http.StatusNotFound, "not_found"
	case errors.Is(err, domainerrors.ErrGuardFailed):
		return http.StatusUnprocessableEntity, "guard_failed"
	case errors.Is(err, domainerrors.ErrDeadlinePassed):
		return http.StatusUnprocessableEntity, "deadline_passed"
	case errors.Is(err, domainerrors.ErrInsufficientXP):
		return http.StatusUnprocessableEntity, "insufficient_xp"
	case errors.Is(err, domainerrors.ErrInvalidArgument):
		return http.StatusUnprocessableEntity, "invalid_argument"
	default:
		return http.StatusInternalServerError, CodeInternal
	}
}

// decodeJSON читает тело запроса в dst. При ошибке сам пишет 400 и возвращает false.
func decodeJSON(w http.ResponseWriter, r *http.Request, dst any) bool {
	decoder := json.NewDecoder(io.LimitReader(r.Body, maxBodyBytes))

	if err := decoder.Decode(dst); err != nil {
		writeJSON(w, http.StatusBadRequest, errorBody{Error: "invalid json body", Code: CodeInvalidJSON})

		return false
	}

	return true
}
