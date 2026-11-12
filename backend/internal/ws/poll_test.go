package ws_test

import (
	"context"
	"testing"
	"time"

	"github.com/parta/backend/internal/events"
	"github.com/parta/backend/internal/ws"
)

// pollCursor делает первый запрос: история не отдаётся, только курсор.
func pollCursor(t *testing.T, hub *ws.Hub, rooms []string) uint64 {
	t.Helper()

	evts, cursor := hub.Poll(context.Background(), 0, rooms, 10*time.Millisecond)
	if len(evts) != 0 {
		t.Fatalf("initial poll returned %d events, want 0", len(evts))
	}

	return cursor
}

// TestPollDeliversRoomEvents проверяет выдачу событий после курсора.
func TestPollDeliversRoomEvents(t *testing.T) {
	hub := ws.NewHub()
	rooms := []string{events.RoomUser(1)}

	cursor := pollCursor(t, hub, rooms)

	hub.Publish(context.Background(), events.New(events.TypeXPLedgerPosted, 1, events.RoomUser(1), nil))

	evts, next := hub.Poll(context.Background(), cursor, rooms, 50*time.Millisecond)
	if len(evts) != 1 {
		t.Fatalf("poll returned %d events, want 1", len(evts))
	}

	if evts[0].EventType != events.TypeXPLedgerPosted {
		t.Fatalf("event type = %q", evts[0].EventType)
	}

	if next <= cursor {
		t.Fatalf("cursor did not advance: %d -> %d", cursor, next)
	}

	// Повторный запрос с новым курсором ничего не отдаёт.
	evts, _ = hub.Poll(context.Background(), next, rooms, 10*time.Millisecond)
	if len(evts) != 0 {
		t.Fatalf("second poll returned %d events, want 0", len(evts))
	}
}

// TestPollFiltersForeignRooms проверяет, что чужие комнаты не утекают.
func TestPollFiltersForeignRooms(t *testing.T) {
	hub := ws.NewHub()
	rooms := []string{events.RoomUser(1)}

	cursor := pollCursor(t, hub, rooms)

	hub.Publish(context.Background(), events.New(events.TypeTaskCreated, 2, events.RoomGroup(99), nil))

	evts, next := hub.Poll(context.Background(), cursor, rooms, 20*time.Millisecond)
	if len(evts) != 0 {
		t.Fatalf("foreign room event leaked: %d events", len(evts))
	}

	if next != cursor+1 {
		t.Fatalf("cursor = %d, want %d (heartbeat advances past foreign events)", next, cursor+1)
	}
}

// TestPollWaitsForEvent проверяет, что запрос не возвращается раньше события.
func TestPollWaitsForEvent(t *testing.T) {
	hub := ws.NewHub()
	rooms := []string{events.RoomGroup(7)}

	cursor := pollCursor(t, hub, rooms)

	go func() {
		time.Sleep(30 * time.Millisecond)
		hub.Publish(context.Background(), events.New(events.TypeSubmissionCardMoved, 1, events.RoomGroup(7), nil))
	}()

	started := time.Now()

	evts, _ := hub.Poll(context.Background(), cursor, rooms, time.Second)
	if len(evts) != 1 {
		t.Fatalf("poll returned %d events, want 1", len(evts))
	}

	if elapsed := time.Since(started); elapsed < 20*time.Millisecond {
		t.Fatalf("poll returned too early: %s", elapsed)
	}
}

// TestPollResetsStaleCursor проверяет поведение после перезапуска сервера:
// курсор клиента больше головы журнала.
func TestPollResetsStaleCursor(t *testing.T) {
	hub := ws.NewHub()
	rooms := []string{events.RoomUser(1)}

	hub.Publish(context.Background(), events.New(events.TypeXPLedgerPosted, 1, events.RoomUser(1), nil))

	evts, cursor := hub.Poll(context.Background(), 100500, rooms, 10*time.Millisecond)
	if len(evts) != 0 {
		t.Fatalf("stale cursor returned %d events, want 0", len(evts))
	}

	// База нумерации — 1, после одного события голова журнала равна 2.
	if cursor != 2 {
		t.Fatalf("cursor = %d, want head 2", cursor)
	}
}
