package tests

import (
	"context"
	"database/sql"
	"encoding/json"
	"sync"
	"testing"

	"github.com/parta/backend/internal/events"
	httpapi "github.com/parta/backend/internal/http"
)

// capturePublisher запоминает события и может прочитать БД в момент публикации,
// доказывая, что событие уходит после Commit.
type capturePublisher struct {
	mu       sync.Mutex
	captured []events.Event
	db       *sql.DB
	statusAt map[string]string
}

func newCapturePublisher(db *sql.DB) *capturePublisher {
	return &capturePublisher{db: db, statusAt: make(map[string]string)}
}

func (p *capturePublisher) Publish(_ context.Context, event events.Event) {
	p.mu.Lock()
	p.captured = append(p.captured, event)
	p.mu.Unlock()

	if p.db == nil {
		return
	}

	var id int64

	raw, err := json.Marshal(event.Payload)
	if err != nil {
		return
	}

	var payload map[string]any

	if err := json.Unmarshal(raw, &payload); err != nil {
		return
	}

	switch event.EventType {
	case events.TypeSubmissionCardMoved, events.TypeSubmissionVerdictIssued:
		value, ok := payload["submission_id"].(float64)
		if !ok {
			return
		}

		id = int64(value)
	default:
		return
	}

	var status string

	if err := p.db.QueryRow(`SELECT status FROM submissions WHERE id = ?`, id).Scan(&status); err != nil {
		p.mu.Lock()
		p.statusAt[event.EventType] = "query error: " + err.Error()
		p.mu.Unlock()

		return
	}

	p.mu.Lock()
	p.statusAt[event.EventType] = status
	p.mu.Unlock()
}

func (p *capturePublisher) byType(eventType string) []events.Event {
	p.mu.Lock()
	defer p.mu.Unlock()

	matched := make([]events.Event, 0)

	for _, event := range p.captured {
		if event.EventType == eventType {
			matched = append(matched, event)
		}
	}

	return matched
}

func (p *capturePublisher) statusDuring(eventType string) string {
	p.mu.Lock()
	defer p.mu.Unlock()

	return p.statusAt[eventType]
}

func TestCardEventsPublishedAfterCommit(t *testing.T) {
	publisher := newCapturePublisher(nil)

	h := newHarnessWith(t, "dev", httpapi.WithPublisher(publisher))
	ids := h.seed()

	studentToken := h.login(t, "student1@parta.dev")

	h.exec(`DELETE FROM submissions WHERE task_id = ? AND student_id = ?`, ids.taskLab, ids.student1)

	status, body := h.request(t, "POST", "/api/submissions", studentToken, map[string]any{"task_id": ids.taskLab})
	if status != 201 {
		t.Fatalf("create submission = %d %v", status, body)
	}

	submissionID := int64(body["submission_id"].(float64))

	status, body = h.request(t, "PATCH", "/api/submissions/"+itoa64(submissionID)+"/status", studentToken, map[string]any{
		"event": "START",
	})
	if status != 200 {
		t.Fatalf("START = %d %v", status, body)
	}

	status, body = h.request(t, "PATCH", "/api/submissions/"+itoa64(submissionID)+"/status", studentToken, map[string]any{
		"event":         "SUBMIT",
		"artifact_url":  "https://parta.local/artifact.zip",
		"artifact_hash": "sha256:deadbeef",
	})
	if status != 200 {
		t.Fatalf("SUBMIT = %d %v", status, body)
	}

	moved := publisher.byType(events.TypeSubmissionCardMoved)
	if len(moved) != 4 { // два перехода × (group + task)
		t.Fatalf("card.moved events = %d, want 4", len(moved))
	}

	// Копии для group и task несут один event_id.
	seen := make(map[string]string)

	for _, event := range moved {
		previous, ok := seen[event.EventID]
		if !ok {
			seen[event.EventID] = event.Room
			continue
		}

		if previous == event.Room {
			t.Fatalf("duplicate delivery into the same room %q", event.Room)
		}
	}

	if len(seen) != 2 {
		t.Fatalf("unique event ids = %d, want 2", len(seen))
	}

	inbox := publisher.byType(events.TypeReviewInboxCreated)
	if len(inbox) != 1 {
		t.Fatalf("review.inbox.created = %d, want 1", len(inbox))
	}

	if inbox[0].Room != events.RoomTeacher(ids.teacher) {
		t.Fatalf("inbox room = %q, want teacher:%d", inbox[0].Room, ids.teacher)
	}
}

// TestPublishSeesCommittedState — прямой тест инварианта «событие после Commit»:
// публикатор читает БД в момент Publish и должен увидеть уже зафиксированный статус.
func TestPublishSeesCommittedState(t *testing.T) {
	publisher := newCapturePublisher(nil)

	h := newHarnessWith(t, "dev", httpapi.WithPublisher(publisher))
	publisher.db = h.db

	ids := h.seed()
	teacherToken := h.login(t, "teacher@parta.dev")

	submissionID := h.createSubmission(ids.taskLab, ids.student1, "REVIEW")

	status, body := h.request(t, "POST", "/api/submissions/"+itoa64(submissionID)+"/verdict", teacherToken, map[string]any{
		"verdict": "ACCEPT",
	})
	if status != 200 {
		t.Fatalf("verdict = %d %v", status, body)
	}

	if got := publisher.statusDuring(events.TypeSubmissionVerdictIssued); got != "DONE" {
		t.Fatalf("status during verdict publish = %q, want DONE", got)
	}

	verdict := publisher.byType(events.TypeSubmissionVerdictIssued)
	if len(verdict) == 0 {
		t.Fatal("no verdict event")
	}

	if verdict[0].Room != events.RoomGroup(ids.groupIS21) {
		t.Fatalf("verdict room = %q, want group:%d", verdict[0].Room, ids.groupIS21)
	}

	xpEvents := publisher.byType(events.TypeXPLedgerPosted)
	if len(xpEvents) != 1 {
		t.Fatalf("xp.ledger.posted = %d, want 1", len(xpEvents))
	}

	if xpEvents[0].Room != events.RoomUser(ids.student1) {
		t.Fatalf("xp room = %q", xpEvents[0].Room)
	}

	streakEvents := publisher.byType(events.TypeStreakUpdated)
	if len(streakEvents) != 1 {
		t.Fatalf("streak.updated = %d, want 1", len(streakEvents))
	}
}
