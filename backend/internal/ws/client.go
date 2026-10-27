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

// maxClientMessageBytes ограничивает входящее сообщение подписки.
const maxClientMessageBytes = 32 << 10

// client — одно WebSocket-соединение.
type client struct {
	server *Server
	conn   *websocket.Conn

	userID  int64
	role    string
	groupID *int64

	send chan []byte
	done chan struct{}

	closeOnce sync.Once

	// rooms принадлежит хабу и защищён его мьютексом; читать/писать
	// напрямую можно только под h.mu (см. Hub).
	rooms map[string]struct{}
}

// newClient создаёт соединение поверх принятого WebSocket.
func newClient(server *Server, conn *websocket.Conn, userID int64, role string, groupID *int64) *client {
	return &client{
		server:  server,
		conn:    conn,
		userID:  userID,
		role:    role,
		groupID: groupID,
		send:    make(chan []byte, sendBuffer),
		done:    make(chan struct{}),
		rooms:   make(map[string]struct{}),
	}
}

// close инициирует закрытие соединения ровно один раз.
func (c *client) close(code websocket.StatusCode, reason string) {
	c.closeOnce.Do(func() {
		close(c.done)

		// Close ждёт close-handshake; выносим в горутину, чтобы закрытие
		// одного медленного клиента не задерживало остальных.
		go func() {
			_ = c.conn.Close(code, reason)
		}()
	})
}

// writeLoop сериализует все записи в сокет и шлёт keep-alive ping.
func (c *client) writeLoop() {
	ticker := time.NewTicker(pingInterval)
	defer ticker.Stop()

	for {
		select {
		case <-c.done:
			return
		case payload := <-c.send:
			ctx, cancel := context.WithTimeout(context.Background(), writeTimeout)
			err := c.conn.Write(ctx, websocket.MessageText, payload)
			cancel()

			if err != nil {
				c.close(websocket.StatusInternalError, "write failed")

				return
			}
		case <-ticker.C:
			ctx, cancel := context.WithTimeout(context.Background(), writeTimeout)
			err := c.conn.Ping(ctx)
			cancel()

			if err != nil {
				c.close(websocket.StatusPolicyViolation, "ping timeout")

				return
			}
		}
	}
}

// readLoop читает команды подписки и завершает соединение при ошибке.
func (c *client) readLoop() {
	defer func() {
		c.server.hub.remove(c)
		c.close(websocket.StatusNormalClosure, "bye")

		log.Printf("ws: disconnect user=%d (active=%d)", c.userID, c.server.hub.Connections())
	}()

	c.conn.SetReadLimit(maxClientMessageBytes)

	for {
		_, data, err := c.conn.Read(context.Background())
		if err != nil {
			return
		}

		c.handleMessage(data)
	}
}

// clientMessage — команда клиента: subscribe/unsubscribe со списком комнат.
type clientMessage struct {
	Action string   `json:"action"`
	Rooms  []string `json:"rooms"`
}

// ackMessage — служебный ответ сервера (не событие конверта).
type ackMessage struct {
	Type  string   `json:"type"`
	Rooms []string `json:"rooms,omitempty"`
	Error string   `json:"error,omitempty"`
}

// handleMessage разбирает команду, проверяет права на комнаты и применяет её.
func (c *client) handleMessage(data []byte) {
	var msg clientMessage

	if err := json.Unmarshal(data, &msg); err != nil {
		c.reply(ackMessage{Type: "error", Error: "invalid json"})

		return
	}

	if msg.Action != "subscribe" && msg.Action != "unsubscribe" {
		c.reply(ackMessage{Type: "error", Error: "unknown action"})

		return
	}

	if len(msg.Rooms) == 0 {
		c.reply(ackMessage{Type: "error", Error: "empty rooms"})

		return
	}

	for _, room := range msg.Rooms {
		if err := c.server.authorizeRoom(context.Background(), c.userID, c.role, c.groupID, room); err != nil {
			c.reply(ackMessage{Type: "error", Error: "forbidden room: " + room})

			continue
		}

		if msg.Action == "subscribe" {
			c.server.hub.addRoom(c, room)
		} else {
			c.server.hub.removeRoom(c, room)
		}
	}

	c.reply(ackMessage{Type: "ack", Rooms: c.server.hub.roomsSnapshot(c)})
}

// reply ставит служебное сообщение в очередь записи.
func (c *client) reply(msg ackMessage) {
	payload, err := json.Marshal(msg)
	if err != nil {
		return
	}

	select {
	case c.send <- payload:
	case <-c.done:
	default:
		c.close(websocket.StatusPolicyViolation, "slow consumer")
	}
}

// baseRooms — комнаты, на которые соединение подписано сразу после входа.
func baseRooms(userID int64, role string, groupID *int64) []string {
	rooms := []string{events.RoomUser(userID)}

	switch role {
	case RoleStudent:
		if groupID != nil {
			rooms = append(rooms, events.RoomGroup(*groupID))
		}
	case RoleTeacher:
		rooms = append(rooms, events.RoomTeacher(userID))
	case RoleAdmin:
		rooms = append(rooms, events.RoomTeacher(userID))
	}

	return rooms
}
