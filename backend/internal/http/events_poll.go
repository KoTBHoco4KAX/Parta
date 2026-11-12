package httpapi

import (
	"context"
	"net/http"
	"strconv"
	"strings"
	"time"

	domainerrors "github.com/parta/backend/internal/domain/errors"
	"github.com/parta/backend/internal/events"
)

// defaultPollWait — сколько long-poll держит запрос по умолчанию.
const defaultPollWait = 20 * time.Second

// maxPollWait — верхняя граница timeout из запроса.
const maxPollWait = 25 * time.Second

// EventFeed — источник событий для long-polling. Его реализует ws.Hub.
type EventFeed interface {
	Poll(ctx context.Context, after uint64, rooms []string, wait time.Duration) ([]events.Event, uint64)
}

// noopFeed используется в тестах и без реалтайма: события не отдаются.
type noopFeed struct{}

// Poll возвращает пустую порцию и нулевой курсор.
func (noopFeed) Poll(context.Context, uint64, []string, time.Duration) ([]events.Event, uint64) {
	return nil, 0
}

// pollResponse — ответ long-poll: порция событий и курсор для следующего запроса.
type pollResponse struct {
	Cursor uint64         `json:"cursor"`
	Events []events.Event `json:"events"`
}

// handleEventsPoll отдаёт события пользователю по HTTP, без WebSocket.
//
// Это транспорт-фолбэк: обычный завершённый HTTP-ответ проходит через любой
// буферизующий reverse-proxy, который не умеет пробрасывать Upgrade.
func (s *Server) handleEventsPoll(w http.ResponseWriter, r *http.Request) {
	p, ok := s.principalOr401(w, r)
	if !ok {
		return
	}

	user, err := s.users.GetByID(r.Context(), p.UserID)
	if err != nil {
		writeUnauthorized(w, "user not found")

		return
	}

	query := r.URL.Query()

	after, err := strconv.ParseUint(strings.TrimSpace(query.Get("after")), 10, 64)
	if err != nil && strings.TrimSpace(query.Get("after")) != "" {
		writeError(w, domainerrors.ErrInvalidArgument)

		return
	}

	wait := defaultPollWait

	if raw := strings.TrimSpace(query.Get("timeout")); raw != "" {
		seconds, convErr := strconv.Atoi(raw)
		if convErr != nil || seconds <= 0 {
			writeError(w, domainerrors.ErrInvalidArgument)

			return
		}

		wait = time.Duration(seconds) * time.Second
		if wait > maxPollWait {
			wait = maxPollWait
		}
	}

	rooms := pollRooms(user.ID, user.Role, user.GroupID)

	evts, cursor := s.feed.Poll(r.Context(), after, rooms, wait)
	if evts == nil {
		evts = []events.Event{}
	}

	// Реалтайм не должен кэшироваться ни браузером, ни прокси.
	w.Header().Set("Cache-Control", "no-store, no-cache, must-revalidate")
	w.Header().Set("Pragma", "no-cache")

	writeJSON(w, http.StatusOK, pollResponse{Cursor: cursor, Events: evts})
}

// pollRooms повторяет базовые комнаты WebSocket-соединения.
func pollRooms(userID int64, role string, groupID *int64) []string {
	rooms := []string{events.RoomUser(userID)}

	switch role {
	case RoleStudent:
		if groupID != nil {
			rooms = append(rooms, events.RoomGroup(*groupID))
		}
	case RoleTeacher, RoleAdmin:
		rooms = append(rooms, events.RoomTeacher(userID))
	}

	return rooms
}
