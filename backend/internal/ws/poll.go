package ws

import (
	"context"
	"sync"
	"time"

	"github.com/parta/backend/internal/events"
)

// eventLogSize — сколько последних событий хаб помнит для long-poll.
// Клиент, отставший больше чем на весь журнал, получает актуальный курсор
// без истории: лучше догнать состояние через REST, чем отдавать гигабайты.
const eventLogSize = 512

// PollMaxWait — верхняя граница удержания long-poll запроса.
const PollMaxWait = 25 * time.Second

// loggedEvent — событие с монотонным номером для курсора long-poll.
type loggedEvent struct {
	seq   uint64
	event events.Event
}

// eventLog — кольцевой журнал событий и точка ожидания новых.
type eventLog struct {
	mu      sync.Mutex
	entries []loggedEvent
	seq     uint64
	notify  chan struct{}
}

// newEventLog создаёт пустой журнал. Нумерация начинается с 1, чтобы
// курсор 0 однозначно означал «клиент ещё не получал курсор».
func newEventLog() *eventLog {
	return &eventLog{notify: make(chan struct{}), seq: 1}
}

// append добавляет событие в журнал и будит всех ожидающих.
func (l *eventLog) append(event events.Event) {
	l.mu.Lock()

	l.seq++
	l.entries = append(l.entries, loggedEvent{seq: l.seq, event: event})

	if len(l.entries) > eventLogSize {
		l.entries = l.entries[len(l.entries)-eventLogSize:]
	}

	close(l.notify)
	l.notify = make(chan struct{})

	l.mu.Unlock()
}

// poll ждёт события из разрешённых комнат, появившиеся после курсора after.
// Возвращает порцию событий и новый курсор. Пустая порция с новым курсором —
// это heartbeat: клиент жив, просто новых событий для него нет.
func (l *eventLog) poll(
	ctx context.Context,
	after uint64,
	rooms map[string]struct{},
	wait time.Duration,
) ([]events.Event, uint64) {
	if wait <= 0 || wait > PollMaxWait {
		wait = PollMaxWait
	}

	deadline := time.Now().Add(wait)

	for {
		l.mu.Lock()
		head := l.seq

		// after == 0 — первый запрос клиента: отдаём только курсор, иначе
		// он получил бы весь журнал истории.
		if after == 0 || after > head {
			l.mu.Unlock()

			return nil, head
		}

		// Клиент отстал сильнее, чем позволяет журнал: пропускаем историю
		// и переводим его на актуальный курсор.
		if len(l.entries) > 0 && after+1 < l.entries[0].seq {
			l.mu.Unlock()

			return nil, head
		}

		matched := make([]events.Event, 0, 4)

		for _, entry := range l.entries {
			if entry.seq <= after {
				continue
			}

			if _, ok := rooms[entry.event.Room]; !ok {
				continue
			}

			matched = append(matched, entry.event)
		}

		var notify chan struct{}

		if len(matched) == 0 && time.Now().Before(deadline) {
			notify = l.notify
		}
		l.mu.Unlock()

		if len(matched) > 0 || notify == nil {
			return matched, head
		}

		timer := time.NewTimer(time.Until(deadline))

		select {
		case <-notify:
		case <-timer.C:
		case <-ctx.Done():
		}

		timer.Stop()

		if ctx.Err() != nil {
			return nil, after
		}

		if time.Now().After(deadline) {
			l.mu.Lock()
			head = l.seq
			l.mu.Unlock()

			return nil, head
		}
	}
}

// Poll реализует long-poll: отдаёт события из комнат пользователя после
// курсора after, ожидая появления новых не дольше wait.
func (h *Hub) Poll(
	ctx context.Context,
	after uint64,
	rooms []string,
	wait time.Duration,
) ([]events.Event, uint64) {
	allowed := make(map[string]struct{}, len(rooms))
	for _, room := range rooms {
		allowed[room] = struct{}{}
	}

	return h.events.poll(ctx, after, allowed, wait)
}
