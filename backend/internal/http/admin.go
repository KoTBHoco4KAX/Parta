package httpapi

import (
	"net/http"
	"strings"

	domainerrors "github.com/parta/backend/internal/domain/errors"
	"github.com/parta/backend/internal/storage"
)

// userListView — элемент GET /api/users.
type userListView struct {
	ID            int64  `json:"id"`
	ExternalID    string `json:"external_id"`
	Role          string `json:"role"`
	GroupID       *int64 `json:"group_id"`
	DisplayName   string `json:"display_name"`
	XPBalance     int    `json:"xp_balance"`
	OnTimeStreak  int    `json:"on_time_streak"`
	StreakFreezes int    `json:"streak_freezes"`
}

// createUserRequest — тело POST /api/users.
type createUserRequest struct {
	ExternalID  string `json:"external_id"`
	DisplayName string `json:"display_name"`
	Role        string `json:"role"`
	GroupID     *int64 `json:"group_id"`
}

// groupListView — элемент GET /api/groups.
type groupListView struct {
	ID    int64  `json:"id"`
	Code  string `json:"code"`
	Title string `json:"title"`
}

// handleListUsers отдаёт всех пользователей администратору.
func (s *Server) handleListUsers(w http.ResponseWriter, r *http.Request) {
	p, ok := s.principalOr401(w, r)
	if !ok {
		return
	}

	if !requireRole(w, p, RoleAdmin) {
		return
	}

	users, err := s.users.ListAll(r.Context())
	if err != nil {
		writeError(w, err)

		return
	}

	views := make([]userListView, 0, len(users))
	for i := range users {
		views = append(views, newUserListView(&users[i]))
	}

	writeJSON(w, http.StatusOK, views)
}

// handleCreateUser заводит пользователя (студента — обязательно с группой).
func (s *Server) handleCreateUser(w http.ResponseWriter, r *http.Request) {
	p, ok := s.principalOr401(w, r)
	if !ok {
		return
	}

	if !requireRole(w, p, RoleAdmin) {
		return
	}

	var req createUserRequest

	if !decodeJSON(w, r, &req) {
		return
	}

	externalID := strings.TrimSpace(req.ExternalID)
	displayName := strings.TrimSpace(req.DisplayName)

	if externalID == "" || displayName == "" || !validRole(req.Role) {
		writeError(w, domainerrors.ErrInvalidArgument)

		return
	}

	if req.Role == RoleStudent {
		if req.GroupID == nil {
			writeError(w, domainerrors.ErrInvalidArgument)

			return
		}

		if _, err := s.groups.GetByID(r.Context(), *req.GroupID); err != nil {
			writeError(w, err)

			return
		}
	} else if req.GroupID != nil {
		writeError(w, domainerrors.ErrInvalidArgument)

		return
	}

	user, err := s.users.Create(r.Context(), externalID, req.Role, req.GroupID, displayName)
	if err != nil {
		writeError(w, err)

		return
	}

	// Новый студент сразу видит опубликованные задания своей группы в TODO.
	if user.Role == RoleStudent && user.GroupID != nil {
		if err := s.submissions.CreateTodoForPublishedGroupTasks(r.Context(), user.ID, *user.GroupID); err != nil {
			writeError(w, err)

			return
		}
	}

	writeJSON(w, http.StatusCreated, newUserListView(user))
}

// handleDeleteUser удаляет пользователя; себя удалить нельзя.
func (s *Server) handleDeleteUser(w http.ResponseWriter, r *http.Request) {
	p, ok := s.principalOr401(w, r)
	if !ok {
		return
	}

	if !requireRole(w, p, RoleAdmin) {
		return
	}

	id, err := parsePathID(r, "id")
	if err != nil {
		writeError(w, err)

		return
	}

	if id == p.UserID {
		writeError(w, domainerrors.ErrInvalidArgument)

		return
	}

	if err := s.users.Delete(r.Context(), id); err != nil {
		writeError(w, err)

		return
	}

	writeJSON(w, http.StatusNoContent, nil)
}

// handleListGroups отдаёт группы администратору.
func (s *Server) handleListGroups(w http.ResponseWriter, r *http.Request) {
	p, ok := s.principalOr401(w, r)
	if !ok {
		return
	}

	if !requireRole(w, p, RoleAdmin) {
		return
	}

	groups, err := s.groups.List(r.Context())
	if err != nil {
		writeError(w, err)

		return
	}

	views := make([]groupListView, 0, len(groups))
	for i := range groups {
		views = append(views, groupListView{
			ID:    groups[i].ID,
			Code:  groups[i].Code,
			Title: groups[i].Title,
		})
	}

	writeJSON(w, http.StatusOK, views)
}

// handleCreateGroup заводит учебную группу.
func (s *Server) handleCreateGroup(w http.ResponseWriter, r *http.Request) {
	p, ok := s.principalOr401(w, r)
	if !ok {
		return
	}

	if !requireRole(w, p, RoleAdmin) {
		return
	}

	var req groupListView

	if !decodeJSON(w, r, &req) {
		return
	}

	code := strings.TrimSpace(req.Code)
	title := strings.TrimSpace(req.Title)

	if code == "" || title == "" {
		writeError(w, domainerrors.ErrInvalidArgument)

		return
	}

	group, err := s.groups.Create(r.Context(), code, title)
	if err != nil {
		writeError(w, err)

		return
	}

	writeJSON(w, http.StatusCreated, groupListView{
		ID:    group.ID,
		Code:  group.Code,
		Title: group.Title,
	})
}

// handleDeleteGroup удаляет группу, если на неё нет ссылок.
func (s *Server) handleDeleteGroup(w http.ResponseWriter, r *http.Request) {
	p, ok := s.principalOr401(w, r)
	if !ok {
		return
	}

	if !requireRole(w, p, RoleAdmin) {
		return
	}

	id, err := parsePathID(r, "id")
	if err != nil {
		writeError(w, err)

		return
	}

	if err := s.groups.Delete(r.Context(), id); err != nil {
		writeError(w, err)

		return
	}

	writeJSON(w, http.StatusNoContent, nil)
}

// newUserListView собирает DTO пользователя.
func newUserListView(user *storage.User) userListView {
	return userListView{
		ID:            user.ID,
		ExternalID:    user.ExternalID,
		Role:          user.Role,
		GroupID:       user.GroupID,
		DisplayName:   user.DisplayName,
		XPBalance:     user.XPBalance,
		OnTimeStreak:  user.OnTimeStreak,
		StreakFreezes: user.StreakFreezes,
	}
}
