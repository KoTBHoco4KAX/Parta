// Package events задаёт конверт реалтайм-событий ПАРТА и контракт публикации.
//
// Пакет — единственная точка, где живёт форма конверта из
// spec/00_ARCHITECTURE.md §V. Его импортируют и HTTP-слой (публикация после
// коммита), и WebSocket-слой (доставка), поэтому здесь нет ни HTTP, ни WS.
package events

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"time"
)

// Типы событий из spec/00_ARCHITECTURE.md §V.
const (
	TypeSubmissionCardMoved     = "submission.card.moved"
	TypeReviewInboxCreated      = "review.inbox.created"
	TypeSubmissionVerdictIssued = "submission.verdict.issued"
	TypeXPLedgerPosted          = "xp.ledger.posted"
	TypeStreakUpdated           = "streak.updated"
	TypeWagerResolved           = "wager.resolved"
	TypePeerReviewStateChanged  = "peer_review.state_changed"
	TypeTeamSlotStateChanged    = "team_slot.state_changed"
)

// TimestampFormat — формат поля timestamp конверта (RFC3339 с миллисекундами).
const TimestampFormat = "2006-01-02T15:04:05.000Z"

// Event — конверт события. Форму менять нельзя: её читает клиент.
type Event struct {
	EventID   string `json:"event_id"`
	EventType string `json:"event_type"`
	Timestamp string `json:"timestamp"`
	ActorID   int64  `json:"actor_id"`
	Room      string `json:"room"`
	Payload   any    `json:"payload"`
}

// Publisher — контракт публикации событий.
//
// Реализация обязана быть неблокирующей: публикация — уведомление, а не
// источник истины, и её сбой не откатывает уже зафиксированную транзакцию.
type Publisher interface {
	Publish(ctx context.Context, event Event)
}

// NoopPublisher используется в тестах и там, где реалтайм не сконфигурирован.
type NoopPublisher struct{}

// Publish ничего не делает.
func (NoopPublisher) Publish(context.Context, Event) {}

// New собирает конверт: UUID события и текущий timestamp.
func New(eventType string, actorID int64, room string, payload any) Event {
	return Event{
		EventID:   NewUUID(),
		EventType: eventType,
		Timestamp: time.Now().UTC().Format(TimestampFormat),
		ActorID:   actorID,
		Room:      room,
		Payload:   payload,
	}
}

// InRoom возвращает копию события для другой комнаты с тем же event_id.
// Так одно событие уходит в несколько комнат, а клиент дедуплицирует его.
func (e Event) InRoom(room string) Event {
	e.Room = room

	return e
}

// RoomUser — личная комната пользователя.
func RoomUser(id int64) string { return "user:" + itoa(id) }

// RoomGroup — комната группы студентов.
func RoomGroup(id int64) string { return "group:" + itoa(id) }

// RoomTeacher — комната преподавателя (инбокс).
func RoomTeacher(id int64) string { return "teacher:" + itoa(id) }

// RoomTask — комната задания.
func RoomTask(id int64) string { return "task:" + itoa(id) }

// NewUUID возвращает UUID v4 без внешних зависимостей.
func NewUUID() string {
	var raw [16]byte

	if _, err := rand.Read(raw[:]); err != nil {
		// crypto/rand на практике не падает; при сбое остаётся уникальный
		// по времени запасной вариант, чтобы событие не потерялось.
		now := time.Now().UnixNano()

		for i := 0; i < 8; i++ {
			raw[i] = byte(now >> (8 * i))
		}
	}

	raw[6] = raw[6]&0x0f | 0x40 // version 4
	raw[8] = raw[8]&0x3f | 0x80 // variant RFC 4122

	buf := make([]byte, 36)
	hex.Encode(buf[0:8], raw[0:4])
	buf[8] = '-'
	hex.Encode(buf[9:13], raw[4:6])
	buf[13] = '-'
	hex.Encode(buf[14:18], raw[6:8])
	buf[18] = '-'
	hex.Encode(buf[19:23], raw[8:10])
	buf[23] = '-'
	hex.Encode(buf[24:36], raw[10:16])

	return string(buf)
}

// itoa — минимальный положительный int64 в десятичном виде.
func itoa(value int64) string {
	if value == 0 {
		return "0"
	}

	var digits [20]byte

	pos := len(digits)

	for value > 0 {
		pos--
		digits[pos] = byte('0' + value%10)
		value /= 10
	}

	return string(digits[pos:])
}
