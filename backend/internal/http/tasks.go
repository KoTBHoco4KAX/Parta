package httpapi

import (
	"database/sql"
	"net/http"
	"strconv"
	"time"

	"github.com/parta/backend/internal/domain/economy"
	domainerrors "github.com/parta/backend/internal/domain/errors"
	"github.com/parta/backend/internal/domain/xp"
	"github.com/parta/backend/internal/storage"
)

// teamRoles — ролевые слоты командного проекта (spec/00_ARCHITECTURE.md §IV.1).
var teamRoles = []storage.TeamSlotSeed{
	{RoleCode: "DB", RoleTitle: "Схема и миграции"},
	{RoleCode: "BIZ", RoleTitle: "Бизнес-логика и API"},
	{RoleCode: "QA_DOC", RoleTitle: "Тесты и документация"},
	{RoleCode: "DEVOPS", RoleTitle: "Сборка, CI и окружение"},
}

// createTaskRequest — тело POST /api/tasks (spec/04_API.md).
type createTaskRequest struct {
	AssignmentID        int64   `json:"assignment_id"`
	Title               string  `json:"title"`
	DescriptionMD       string  `json:"description_md"`
	TaskType            string  `json:"task_type"`
	RequirementsCount   int     `json:"requirements_count"`
	ExpectedHours       float64 `json:"expected_hours"`
	DeadlineAt          string  `json:"deadline_at"`
	SpeedrunWindowHours int     `json:"speedrun_window_hours"`
	TeamSize            int     `json:"team_size"`
}

// createTaskResponse — ответ на создание задания.
type createTaskResponse struct {
	TaskID     int64  `json:"task_id"`
	BaseXP     int    `json:"base_xp_computed"`
	Status     string `json:"status"`
	SlotsCount int    `json:"slots_count,omitempty"`
}

// handleCreateTask создаёт задание и, для командного проекта, его слоты.
func (s *Server) handleCreateTask(w http.ResponseWriter, r *http.Request) {
	p, ok := s.principalOr401(w, r)
	if !ok {
		return
	}

	if !requireRole(w, p, RoleTeacher) {
		return
	}

	var req createTaskRequest

	if !decodeJSON(w, r, &req) {
		return
	}

	deadline, groupID, err := s.validateCreateTask(r, p, &req)
	if err != nil {
		writeError(w, err)

		return
	}

	// Список студентов читается до транзакции: внутри withTx нельзя ходить в *sql.DB.
	students, err := s.users.ListByGroup(r.Context(), groupID)
	if err != nil {
		writeError(w, err)

		return
	}

	now := s.now()

	baseXP := xp.ComputeBaseXP(xp.BaseXPInput{
		TaskType:          economy.TaskType(req.TaskType),
		RequirementsCount: req.RequirementsCount,
		ExpectedHours:     req.ExpectedHours,
		CreatedAt:         now,
		DeadlineAt:        deadline,
		TeamSize:          req.TeamSize,
	})

	in := storage.CreateTaskInput{
		AssignmentID:      req.AssignmentID,
		Title:             req.Title,
		DescriptionMD:     req.DescriptionMD,
		TaskType:          req.TaskType,
		RequirementsCount: req.RequirementsCount,
		ExpectedHours:     req.ExpectedHours,
		DeadlineAt:        storage.FormatTimestamp(deadline),
		SpeedrunWindow:    req.SpeedrunWindowHours,
		TeamSize:          req.TeamSize,
		BaseXP:            baseXP,
		Status:            "PUBLISHED",
	}

	seeds := teamSlotSeeds(req.TaskType, req.TeamSize)

	var taskID int64

	err = s.withTx(r.Context(), func(tx *sql.Tx) error {
		task, err := s.tasks.CreateTx(r.Context(), tx, in)
		if err != nil {
			return err
		}

		taskID = task.ID

		// Каждый студент группы сразу получает карточку TODO: студент не создаёт
		// задачи и не вводит id вручную.
		for i := range students {
			if err := s.submissions.CreateTodoTx(r.Context(), tx, task.ID, students[i].ID); err != nil {
				return err
			}
		}

		if len(seeds) == 0 {
			return nil
		}

		return s.teamSlots.CreateSlots(r.Context(), tx, task.ID, seeds)
	})
	if err != nil {
		writeError(w, err)

		return
	}

	writeJSON(w, http.StatusCreated, createTaskResponse{
		TaskID:     taskID,
		BaseXP:     baseXP,
		Status:     "PUBLISHED",
		SlotsCount: len(seeds),
	})
}

// validateCreateTask проверяет права на назначение и корректность полей.
func (s *Server) validateCreateTask(r *http.Request, p principal, req *createTaskRequest) (time.Time, int64, error) {
	if req.AssignmentID <= 0 || req.Title == "" {
		return time.Time{}, 0, domainerrors.ErrInvalidArgument
	}

	if !validTaskType(req.TaskType) {
		return time.Time{}, 0, domainerrors.ErrInvalidArgument
	}

	if req.RequirementsCount <= 0 || req.ExpectedHours <= 0 || req.SpeedrunWindowHours <= 0 {
		return time.Time{}, 0, domainerrors.ErrInvalidArgument
	}

	if req.TaskType == string(economy.TaskTypeTeamProject) {
		if req.TeamSize < 2 {
			return time.Time{}, 0, domainerrors.ErrInvalidArgument
		}
	} else if req.TeamSize == 0 {
		req.TeamSize = 1
	} else if req.TeamSize != 1 {
		return time.Time{}, 0, domainerrors.ErrInvalidArgument
	}

	teacherID, err := s.tasks.TeacherIDForAssignment(r.Context(), req.AssignmentID)
	if err != nil {
		return time.Time{}, 0, err
	}

	if p.Role == RoleTeacher && teacherID != p.UserID {
		return time.Time{}, 0, domainerrors.ErrForbidden
	}

	groupID, err := s.tasks.GroupIDForAssignment(r.Context(), req.AssignmentID)
	if err != nil {
		return time.Time{}, 0, err
	}

	deadline, err := time.Parse(time.RFC3339, req.DeadlineAt)
	if err != nil {
		return time.Time{}, 0, domainerrors.ErrInvalidArgument
	}

	if !deadline.After(s.now()) {
		return time.Time{}, 0, domainerrors.ErrInvalidArgument
	}

	return deadline, groupID, nil
}

// validTaskType проверяет тип задания по CHECK в tasks.task_type.
func validTaskType(taskType string) bool {
	switch economy.TaskType(taskType) {
	case economy.TaskTypeTest, economy.TaskTypeEssay, economy.TaskTypeLabCode, economy.TaskTypeTeamProject:
		return true
	default:
		return false
	}
}

// teamSlotSeeds строит слоты командного проекта: ровно team_size штук.
func teamSlotSeeds(taskType string, teamSize int) []storage.TeamSlotSeed {
	if taskType != string(economy.TaskTypeTeamProject) || teamSize < 2 {
		return nil
	}

	seeds := make([]storage.TeamSlotSeed, 0, teamSize)

	for i := 0; i < teamSize; i++ {
		role := teamRoles[i%len(teamRoles)]

		if i >= len(teamRoles) {
			role.RoleCode = role.RoleCode + "_" + strconv.Itoa(i/len(teamRoles)+1)
		}

		seeds = append(seeds, role)
	}

	return seeds
}
