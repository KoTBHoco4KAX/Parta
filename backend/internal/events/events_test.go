package events_test

import (
	"context"
	"encoding/json"
	"regexp"
	"testing"

	"github.com/parta/backend/internal/events"
)

// uuidV4 — формат UUID v4 из конверта.
var uuidV4 = regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`)

func TestNewBuildsEnvelope(t *testing.T) {
	payload := map[string]any{"submission_id": 42}

	event := events.New(events.TypeSubmissionCardMoved, 7, events.RoomGroup(10), payload)

	if !uuidV4.MatchString(event.EventID) {
		t.Fatalf("event_id = %q, want UUID v4", event.EventID)
	}

	if event.EventType != events.TypeSubmissionCardMoved {
		t.Fatalf("event_type = %q", event.EventType)
	}

	if event.ActorID != 7 {
		t.Fatalf("actor_id = %d, want 7", event.ActorID)
	}

	if event.Room != "group:10" {
		t.Fatalf("room = %q, want group:10", event.Room)
	}

	if event.Timestamp == "" {
		t.Fatal("timestamp is empty")
	}

	raw, err := json.Marshal(event)
	if err != nil {
		t.Fatalf("marshal event: %v", err)
	}

	var decoded map[string]any

	if err := json.Unmarshal(raw, &decoded); err != nil {
		t.Fatalf("unmarshal event: %v", err)
	}

	for _, key := range []string{"event_id", "event_type", "timestamp", "actor_id", "room", "payload"} {
		if _, ok := decoded[key]; !ok {
			t.Fatalf("envelope lost key %q: %s", key, raw)
		}
	}
}

func TestNewUUIDIsUnique(t *testing.T) {
	seen := make(map[string]struct{}, 1000)

	for i := 0; i < 1000; i++ {
		id := events.NewUUID()

		if !uuidV4.MatchString(id) {
			t.Fatalf("uuid %q is not v4", id)
		}

		if _, duplicate := seen[id]; duplicate {
			t.Fatalf("duplicate uuid %q", id)
		}

		seen[id] = struct{}{}
	}
}

func TestInRoomKeepsEventID(t *testing.T) {
	event := events.New(events.TypeSubmissionVerdictIssued, 1, events.RoomGroup(3), nil)
	copied := event.InRoom(events.RoomTask(9))

	if copied.EventID != event.EventID {
		t.Fatalf("InRoom changed event_id: %q -> %q", event.EventID, copied.EventID)
	}

	if copied.Room != "task:9" {
		t.Fatalf("room = %q, want task:9", copied.Room)
	}

	if event.Room != "group:3" {
		t.Fatalf("original room mutated: %q", event.Room)
	}
}

func TestRoomNames(t *testing.T) {
	cases := map[string]string{
		events.RoomUser(5):    "user:5",
		events.RoomGroup(12):  "group:12",
		events.RoomTeacher(3): "teacher:3",
		events.RoomTask(99):   "task:99",
	}

	for got, want := range cases {
		if got != want {
			t.Fatalf("room = %q, want %q", got, want)
		}
	}
}

func TestNoopPublisher(t *testing.T) {
	var publisher events.Publisher = events.NoopPublisher{}
	publisher.Publish(context.Background(), events.New(events.TypeXPLedgerPosted, 1, "user:1", nil))
}
