package tests

import (
	"context"
	"fmt"
	"net/http"
	"testing"

	"github.com/parta/backend/internal/events"
	httpapi "github.com/parta/backend/internal/http"
	"github.com/parta/backend/internal/ws"
)

// TestEventsPollInitialCursor проверяет, что первый запрос отдаёт только курсор.
func TestEventsPollInitialCursor(t *testing.T) {
	hub := ws.NewHub()
	defer hub.Close()

	h := newHarnessWith(t, "dev", httpapi.WithEventFeed(hub))
	h.seed()

	token := h.login(t, "student1@parta.dev")

	status, body := h.request(t, http.MethodGet, "/api/events/poll?after=0&timeout=1", token, nil)
	if status != http.StatusOK {
		t.Fatalf("poll status = %d, want 200", status)
	}

	if cursor := body["cursor"].(float64); cursor < 1 {
		t.Fatalf("cursor = %v, want >= 1", cursor)
	}

	if evts := body["events"].([]any); len(evts) != 0 {
		t.Fatalf("initial poll returned %d events, want 0", len(evts))
	}
}

// TestEventsPollDeliversRoomEvents проверяет доставку события из комнаты
// студента и отсутствие чужих событий.
func TestEventsPollDeliversRoomEvents(t *testing.T) {
	hub := ws.NewHub()
	defer hub.Close()

	h := newHarnessWith(t, "dev", httpapi.WithEventFeed(hub))
	ids := h.seed()

	token := h.login(t, "student1@parta.dev")

	_, body := h.request(t, http.MethodGet, "/api/events/poll?after=0&timeout=1", token, nil)
	cursor := uint64(body["cursor"].(float64))

	hub.Publish(context.Background(), events.New(
		events.TypeXPLedgerPosted,
		ids.student1,
		events.RoomUser(ids.student1),
		map[string]any{"user_id": ids.student1, "balance_after": 10},
	))

	path := fmt.Sprintf("/api/events/poll?after=%d&timeout=5", cursor)

	status, body := h.request(t, http.MethodGet, path, token, nil)
	if status != http.StatusOK {
		t.Fatalf("poll status = %d, want 200", status)
	}

	evts := body["events"].([]any)
	if len(evts) != 1 {
		t.Fatalf("poll returned %d events, want 1", len(evts))
	}

	first := evts[0].(map[string]any)
	if first["event_type"] != events.TypeXPLedgerPosted {
		t.Fatalf("event_type = %v", first["event_type"])
	}

	next := uint64(body["cursor"].(float64))

	// Событие чужой комнаты не должно попасть в выдачу.
	hub.Publish(context.Background(), events.New(
		events.TypeReviewInboxCreated,
		ids.teacher,
		events.RoomTeacher(ids.teacher),
		nil,
	))

	path = fmt.Sprintf("/api/events/poll?after=%d&timeout=1", next)

	_, body = h.request(t, http.MethodGet, path, token, nil)
	if evts := body["events"].([]any); len(evts) != 0 {
		t.Fatalf("foreign room events leaked: %d", len(evts))
	}
}

// TestEventsPollRequiresAuth проверяет, что без токена эндпоинт закрыт.
func TestEventsPollRequiresAuth(t *testing.T) {
	hub := ws.NewHub()
	defer hub.Close()

	h := newHarnessWith(t, "dev", httpapi.WithEventFeed(hub))
	h.seed()

	status, _ := h.request(t, http.MethodGet, "/api/events/poll?after=0", "", nil)
	if status != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401", status)
	}
}

