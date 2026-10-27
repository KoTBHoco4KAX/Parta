package ws

import (
	"context"
	"encoding/json"
	"log"
	"sync"
	"time"

	"github.com/parta/backend/internal/events"
	"nhooyr.io/websocket"
)

// sendBuffer — очередь исходящих событий одного соединения.
const sendBuffer = 64

// writeTimeout ограничивает одну запись в сокет.
const writeTimeout = 10 * time.Second

// pingInterval — период keep-alive ping.
const pingInterval = 30 * time.Second

// Hub — реестр комнат и соединений. Реализует events.Publisher.
type Hub struct {
	mu    sync.RWMutex
	rooms map[string]map[*client]struct{}
	conns map[*client]struct{}
}

// NewHub создаёт пустой хаб.
func NewHub() *Hub {
	return &Hub{
		rooms: make(map[string]map[*client]struct{}),
		conns: make(map[*client]struct{}),
	}
}

// Publish доставляет событие всем подписчикам комнаты.
// Медленное соединение не блокирует остальных: оно закрывается, чтобы клиент
// переподключился, а публикующий хендлер не зависел от сети.
func (h *Hub) Publish(_ context.Context, event events.Event) {
	payload, err := json.Marshal(event)
	if err != nil {
		log.Printf("ws: encode event %s: %v", event.EventType, err)
		return
	}

	h.mu.RLock()
	targets := make([]*client, 0, len(h.rooms[event.Room]))

	for c := range h.rooms[event.Room] {
		targets = append(targets, c)
	}
	h.mu.RUnlock()

	for _, c := range targets {
		select {
		case c.send <- payload:
		default:
			log.Printf("ws: dropping slow connection user=%d room=%s", c.userID, event.Room)
			c.close(websocket.StatusPolicyViolation, "slow consumer")
		}
	}
}

// Connections сообщает число активных соединений.
func (h *Hub) Connections() int {
	h.mu.RLock()
	defer h.mu.RUnlock()

	return len(h.conns)
}

// HasRoom сообщает, подписано ли соединение на комнату (для тестов).
func (h *Hub) HasRoom(c *client, room string) bool {
	h.mu.RLock()
	defer h.mu.RUnlock()

	_, ok := h.rooms[room][c]

	return ok
}

// add регистрирует соединение и его комнаты.
func (h *Hub) add(c *client, rooms []string) {
	h.mu.Lock()
	defer h.mu.Unlock()

	h.conns[c] = struct{}{}

	for _, room := range rooms {
		h.addLocked(c, room)
	}
}

// addRoom подписывает соединение на комнату.
func (h *Hub) addRoom(c *client, room string) {
	h.mu.Lock()
	defer h.mu.Unlock()

	h.addLocked(c, room)
}

func (h *Hub) addLocked(c *client, room string) {
	members, ok := h.rooms[room]
	if !ok {
		members = make(map[*client]struct{})
		h.rooms[room] = members
	}

	members[c] = struct{}{}
	c.rooms[room] = struct{}{}
}

// removeRoom отписывает соединение от комнаты.
func (h *Hub) removeRoom(c *client, room string) {
	h.mu.Lock()
	defer h.mu.Unlock()

	h.removeLocked(c, room)
}

func (h *Hub) removeLocked(c *client, room string) {
	members, ok := h.rooms[room]
	if !ok {
		return
	}

	delete(members, c)

	if len(members) == 0 {
		delete(h.rooms, room)
	}

	delete(c.rooms, room)
}

// remove убирает соединение из всех комнат.
func (h *Hub) remove(c *client) {
	h.mu.Lock()
	defer h.mu.Unlock()

	if _, ok := h.conns[c]; !ok {
		return
	}

	delete(h.conns, c)

	for room := range c.rooms {
		h.removeLocked(c, room)
	}
}

// Close закрывает все соединения — вызывается при graceful shutdown.
func (h *Hub) Close() {
	h.mu.RLock()
	conns := make([]*client, 0, len(h.conns))

	for c := range h.conns {
		conns = append(conns, c)
	}
	h.mu.RUnlock()

	for _, c := range conns {
		c.close(websocket.StatusGoingAway, "server shutting down")
	}
}

// roomsSnapshot возвращает подписки соединения (для тестов и логов).
func (h *Hub) roomsSnapshot(c *client) []string {
	h.mu.RLock()
	defer h.mu.RUnlock()

	rooms := make([]string, 0, len(c.rooms))

	for room := range c.rooms {
		rooms = append(rooms, room)
	}

	return rooms
}
