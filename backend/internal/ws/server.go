// Package ws реализует реалтайм-слой ПАРТА: Hub комнат и WebSocket-хендлер.
//
// Подключение: GET /ws?token=<jwt> (spec/00_ARCHITECTURE.md §V). Доставка
// at-least-once, клиент дедуплицирует по event_id. Пакет зависит от events,
// auth и storage, но не от internal/http — цикла импортов нет.
package ws

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/parta/backend/internal/auth"
	"github.com/parta/backend/internal/domain/submission"
	"github.com/parta/backend/internal/events"
	"github.com/parta/backend/internal/storage"
	"nhooyr.io/websocket"
)

// Роли из spec/01_SCHEMA.sql.
const (
	RoleAdmin   = "admin"
	RoleTeacher = "teacher"
	RoleStudent = "student"
)

// validRole принимает только роли, известные RBAC.
func validRole(role string) bool {
	return role == RoleAdmin || role == RoleTeacher || role == RoleStudent
}

// UserDirectory — чтение пользователя для проверки прав на комнаты.
type UserDirectory interface {
	GetByID(ctx context.Context, id int64) (*storage.User, error)
}

// TaskDirectory — чтение задания для проверки прав на комнату task:{id}.
type TaskDirectory interface {
	GetByID(ctx context.Context, id int64) (*submission.Task, error)
}

// Server принимает WebSocket-подключения и регистрирует их в хабе.
type Server struct {
	hub     *Hub
	tokens  *auth.TokenService
	users   UserDirectory
	tasks   TaskDirectory
	origins []string
	now     func() time.Time
}

// Option настраивает Server.
type Option func(*Server)

// WithOriginPatterns задаёт разрешённые Origin для браузерного клиента.
// Нужно только в dev, когда фронт живёт на другом порту (Vite).
func WithOriginPatterns(patterns ...string) Option {
	return func(s *Server) {
		s.origins = patterns
	}
}

// NewServer собирает WebSocket-хендлер.
func NewServer(tokens *auth.TokenService, hub *Hub, users UserDirectory, tasks TaskDirectory, opts ...Option) *Server {
	server := &Server{
		hub:    hub,
		tokens: tokens,
		users:  users,
		tasks:  tasks,
		now:    time.Now,
	}

	for _, opt := range opts {
		opt(server)
	}

	return server
}

// ServeHTTP аутентифицирует по query-токену и поднимает соединение.
func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	raw := strings.TrimSpace(r.URL.Query().Get("token"))
	if raw == "" {
		writeWSError(w, http.StatusUnauthorized, "missing token", "unauthorized")

		return
	}

	claims, err := s.tokens.Parse(raw)
	if err != nil || !validRole(claims.Role) || claims.Scope != "" {
		writeWSError(w, http.StatusUnauthorized, "invalid or expired token", "unauthorized")

		return
	}

	user, err := s.users.GetByID(r.Context(), claims.Sub)
	if err != nil {
		writeWSError(w, http.StatusUnauthorized, "user not found", "unauthorized")

		return
	}

	options := &websocket.AcceptOptions{
		OriginPatterns: s.origins,
	}

	conn, err := websocket.Accept(w, r, options)
	if err != nil {
		// Accept уже записал HTTP-ошибку (например, 403 по Origin).
		log.Printf("ws: accept user=%d: %v", user.ID, err)

		return
	}

	c := newClient(s, conn, user.ID, user.Role, user.GroupID)

	rooms := baseRooms(user.ID, user.Role, user.GroupID)
	s.hub.add(c, rooms)

	ready, _ := json.Marshal(ackMessage{Type: "ready", Rooms: rooms})
	c.send <- ready

	log.Printf("ws: connect user=%d role=%s (active=%d)", user.ID, user.Role, s.hub.Connections())

	go c.writeLoop()
	c.readLoop()
}

// authorizeRoom проверяет, вправе ли пользователь подписаться на комнату.
func (s *Server) authorizeRoom(ctx context.Context, userID int64, role string, groupID *int64, room string) error {
	kind, rawID, ok := splitRoom(room)
	if !ok {
		return errForbiddenRoom
	}

	id, err := strconv.ParseInt(rawID, 10, 64)
	if err != nil || id <= 0 {
		return errForbiddenRoom
	}

	if role == RoleAdmin {
		return nil
	}

	switch kind {
	case "user":
		if id != userID {
			return errForbiddenRoom
		}
	case "teacher":
		if id != userID || role != RoleTeacher {
			return errForbiddenRoom
		}
	case "group":
		if groupID == nil || *groupID != id {
			return errForbiddenRoom
		}
	case "task":
		return s.authorizeTaskRoom(ctx, userID, role, groupID, id)
	default:
		return errForbiddenRoom
	}

	return nil
}

// authorizeTaskRoom разрешает комнату задания только своей группе/преподавателю.
func (s *Server) authorizeTaskRoom(ctx context.Context, userID int64, role string, groupID *int64, taskID int64) error {
	lookupCtx, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()

	task, err := s.tasks.GetByID(lookupCtx, taskID)
	if err != nil {
		return errForbiddenRoom
	}

	switch role {
	case RoleStudent:
		if groupID == nil || *groupID != task.GroupID {
			return errForbiddenRoom
		}
	case RoleTeacher:
		if task.AssignedTeacherID != userID {
			return errForbiddenRoom
		}
	default:
		return errForbiddenRoom
	}

	return nil
}

// splitRoom разбирает "kind:id".
func splitRoom(room string) (string, string, bool) {
	kind, rawID, ok := strings.Cut(room, ":")
	if !ok || kind == "" || rawID == "" {
		return "", "", false
	}

	return kind, rawID, true
}

// roomError — отказ в подписке на комнату.
type roomError struct{}

func (roomError) Error() string { return "forbidden room" }

var errForbiddenRoom = roomError{}

// writeWSError пишет ошибку рукопожатия в общем JSON-формате REST API.
func writeWSError(w http.ResponseWriter, status int, message, code string) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)

	_ = json.NewEncoder(w).Encode(map[string]string{"error": message, "code": code})
}

// compile-time проверки контрактов.
var (
	_ http.Handler     = (*Server)(nil)
	_ events.Publisher = (*Hub)(nil)
)
