package tests

import (
	"context"
	"encoding/json"
	"net/http"
	"testing"

	"github.com/parta/backend/internal/events"
	httpapi "github.com/parta/backend/internal/http"
)

// recordingPublisher запоминает опубликованные события для проверки контракта.
type recordingPublisher struct {
	ch chan events.Event
}

func newRecordingPublisher() *recordingPublisher {
	return &recordingPublisher{ch: make(chan events.Event, 16)}
}

func (p *recordingPublisher) Publish(_ context.Context, event events.Event) {
	select {
	case p.ch <- event:
	default:
	}
}

func TestCreateTaskPublishesTaskCreatedToGroup(t *testing.T) {
	publisher := newRecordingPublisher()
	h := newHarnessWith(t, "dev", httpapi.WithPublisher(publisher))
	ids := h.seed()
	token := h.login(t, "teacher@parta.dev")

	status, body := h.request(t, http.MethodPost, "/api/tasks", token, taskBody(ids.assignment21, nil))
	if status != http.StatusCreated {
		t.Fatalf("status = %d, want 201 (%v)", status, body)
	}

	taskID := int64(body["task_id"].(float64))

	var groupEvent, teacherEvent *events.Event

	for len(publisher.ch) > 0 {
		event := <-publisher.ch
		if event.EventType != events.TypeTaskCreated {
			continue
		}

		switch event.Room {
		case events.RoomGroup(ids.groupIS21):
			groupEvent = &event
		case events.RoomTeacher(ids.teacher):
			teacherEvent = &event
		}
	}

	if groupEvent == nil {
		t.Fatal("no task.created event in group room")
	}

	if teacherEvent == nil {
		t.Fatal("no task.created event in teacher room")
	}

	if groupEvent.EventID != teacherEvent.EventID {
		t.Fatalf("event ids differ: %q vs %q", groupEvent.EventID, teacherEvent.EventID)
	}

	encoded, err := json.Marshal(groupEvent.Payload)
	if err != nil {
		t.Fatalf("marshal payload: %v", err)
	}

	var payload map[string]any
	if err := json.Unmarshal(encoded, &payload); err != nil {
		t.Fatalf("decode payload: %v", err)
	}

	if int64(payload["task_id"].(float64)) != taskID {
		t.Fatalf("payload task_id = %v, want %d", payload["task_id"], taskID)
	}

	if int64(payload["group_id"].(float64)) != ids.groupIS21 {
		t.Fatalf("payload group_id = %v, want %d", payload["group_id"], ids.groupIS21)
	}
}
