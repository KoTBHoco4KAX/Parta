package httpapi

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	domainerrors "github.com/parta/backend/internal/domain/errors"
)

// TestRecovererReturnsJSON500 доказывает, что паника хендлера не роняет
// процесс и превращается в единый JSON-конверт 500.
func TestRecovererReturnsJSON500(t *testing.T) {
	s := &Server{}
	handler := s.recoverer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
		panic("boom")
	}))

	for attempt := 0; attempt < 2; attempt++ {
		recorder := httptest.NewRecorder()
		request := httptest.NewRequest(http.MethodGet, "/api/tasks", nil)

		handler.ServeHTTP(recorder, request)

		if recorder.Code != http.StatusInternalServerError {
			t.Fatalf("attempt %d: status = %d, want 500", attempt, recorder.Code)
		}

		if contentType := recorder.Header().Get("Content-Type"); !strings.HasPrefix(contentType, "application/json") {
			t.Fatalf("attempt %d: content-type = %q", attempt, contentType)
		}

		var body errorBody
		if err := json.Unmarshal(recorder.Body.Bytes(), &body); err != nil {
			t.Fatalf("attempt %d: body is not JSON: %q (%v)", attempt, recorder.Body.String(), err)
		}

		if body.Code != CodeInternal || body.Error != "internal server error" {
			t.Fatalf("attempt %d: body = %+v", attempt, body)
		}
	}
}

// TestWriteErrorHidesInternalDetails проверяет, что 500 не утекает наружу.
func TestWriteErrorHidesInternalDetails(t *testing.T) {
	recorder := httptest.NewRecorder()

	writeError(recorder, errors.New("dial tcp: secret db address leaked"))

	if recorder.Code != http.StatusInternalServerError {
		t.Fatalf("status = %d, want 500", recorder.Code)
	}

	var body errorBody
	if err := json.Unmarshal(recorder.Body.Bytes(), &body); err != nil {
		t.Fatalf("body is not JSON: %v", err)
	}

	if body.Code != CodeInternal || body.Error != "internal server error" {
		t.Fatalf("body = %+v", body)
	}

	if strings.Contains(body.Error, "secret") {
		t.Fatalf("internal details leaked: %+v", body)
	}
}

// TestMapErrorStatuses фиксирует контракт HTTP-кодов для доменных ошибок.
func TestMapErrorStatuses(t *testing.T) {
	cases := []struct {
		name   string
		err    error
		status int
		code   string
	}{
		{"invalid transition", domainerrors.ErrInvalidTransition, http.StatusConflict, "invalid_transition"},
		{"already exists", domainerrors.ErrAlreadyExists, http.StatusConflict, "already_exists"},
		{"forbidden", domainerrors.ErrForbidden, http.StatusForbidden, "forbidden"},
		{"not found", domainerrors.ErrNotFound, http.StatusNotFound, "not_found"},
		{"guard failed", domainerrors.ErrGuardFailed, http.StatusUnprocessableEntity, "guard_failed"},
		{"deadline passed", domainerrors.ErrDeadlinePassed, http.StatusUnprocessableEntity, "deadline_passed"},
		{"insufficient xp", domainerrors.ErrInsufficientXP, http.StatusUnprocessableEntity, "insufficient_xp"},
		{"invalid argument", domainerrors.ErrInvalidArgument, http.StatusUnprocessableEntity, "invalid_argument"},
		{"unknown", errors.New("disk on fire"), http.StatusInternalServerError, "internal"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			status, code := mapError(tc.err)
			if status != tc.status || code != tc.code {
				t.Fatalf("mapError = (%d, %q), want (%d, %q)", status, code, tc.status, tc.code)
			}
		})
	}
}
