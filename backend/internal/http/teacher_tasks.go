package httpapi

import (
	"context"
	"net/http"
	"strconv"
	"strings"
	"time"

	domainerrors "github.com/parta/backend/internal/domain/errors"
	"github.com/parta/backend/internal/storage"
)

// repeatTaskRequest — тело POST /api/tasks/{id}/repeat.
type repeatTaskRequest struct {
	DeadlineAt string  `json:"deadline_at"`
	StudentIDs []int64 `json:"student_ids"`
}

// handleRepeatTask создаёт копию выданного задания с новым дедлайном.
// Карточки получают выбранные ученики группы (по умолчанию — вся группа).
func (s *Server) handleRepeatTask(w http.ResponseWriter, r *http.Request) {
	p, ok := s.principalOr401(w, r)
	if !ok {
		return
	}

	if !requireRole(w, p, RoleTeacher) {
		return
	}

	id, err := parsePathID(r, "id")
	if err != nil {
		writeError(w, err)

		return
	}

	task, err := s.tasks.GetByID(r.Context(), id)
	if err != nil {
		writeError(w, err)

		return
	}

	if task.AssignedTeacherID != p.UserID {
		writeError(w, domainerrors.ErrForbidden)

		return
	}

	var req repeatTaskRequest

	if !decodeJSON(w, r, &req) {
		return
	}

	deadline, err := time.Parse(time.RFC3339, strings.TrimSpace(req.DeadlineAt))
	if err != nil || !deadline.After(s.now()) {
		writeError(w, domainerrors.ErrInvalidArgument)

		return
	}

	students, err := s.resolveStudents(r.Context(), task.GroupID, req.StudentIDs)
	if err != nil {
		writeError(w, err)

		return
	}

	response, err := s.issueTask(r.Context(), p, issueTaskInput{
		AssignmentID:      task.AssignmentID,
		GroupID:           task.GroupID,
		Topic:             task.Topic,
		Title:             task.Title,
		DescriptionMD:     task.DescriptionMD,
		TaskType:          task.TaskType,
		RequirementsCount: task.RequirementsCount,
		ExpectedHours:     task.ExpectedHours,
		Deadline:          deadline,
		SpeedrunWindow:    int(task.SpeedrunWindow.Hours()),
		Attachments:       task.Attachments,
		TeamSize:          task.TeamSize,
		// Сохраняем назначенный преподавателем XP: повтор — та же работа.
		XP: task.BaseXP,
	}, students)
	if err != nil {
		writeError(w, err)

		return
	}

	writeJSON(w, http.StatusCreated, response)
}

// resolveStudents возвращает получателей задания.
//
// Пустой student_ids означает всю группу назначения. Если список задан,
// каждый id должен принадлежать этой группе и роли student: чужой ученик —
// invalid_argument (422), а не частичная выдача.
func (s *Server) resolveStudents(
	ctx context.Context,
	groupID int64,
	requested []int64,
) ([]storage.User, error) {
	members, err := s.users.ListByGroup(ctx, groupID)
	if err != nil {
		return nil, err
	}

	students := make([]storage.User, 0, len(members))
	byID := make(map[int64]storage.User, len(members))

	for i := range members {
		if members[i].Role != RoleStudent {
			continue
		}

		students = append(students, members[i])
		byID[members[i].ID] = members[i]
	}

	if len(requested) == 0 {
		return students, nil
	}

	selected := make([]storage.User, 0, len(requested))
	seen := make(map[int64]struct{}, len(requested))

	for _, studentID := range requested {
		if studentID <= 0 {
			return nil, domainerrors.ErrInvalidArgument
		}

		if _, duplicate := seen[studentID]; duplicate {
			continue
		}

		student, found := byID[studentID]
		if !found {
			return nil, domainerrors.ErrInvalidArgument
		}

		seen[studentID] = struct{}{}
		selected = append(selected, student)
	}

	if len(selected) == 0 {
		return nil, domainerrors.ErrInvalidArgument
	}

	return selected, nil
}

// parseStudentIDs разбирает multipart-поле student_ids. Поле может повторяться
// (form.append для каждого ученика) или содержать CSV-список.
func parseStudentIDs(values []string) ([]int64, error) {
	ids := make([]int64, 0, len(values))

	for _, raw := range values {
		for _, part := range strings.Split(raw, ",") {
			part = strings.TrimSpace(part)
			if part == "" {
				continue
			}

			value, err := strconv.ParseInt(part, 10, 64)
			if err != nil || value <= 0 {
				return nil, domainerrors.ErrInvalidArgument
			}

			ids = append(ids, value)
		}
	}

	return ids, nil
}
