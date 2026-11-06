package httpapi

import (
	"context"
	"net/http"
	"strings"
	"time"

	"github.com/parta/backend/internal/domain/economy"
	domainerrors "github.com/parta/backend/internal/domain/errors"
	"github.com/parta/backend/internal/storage"
)

// taskTemplateView — элемент GET /api/task-templates.
type taskTemplateView struct {
	ID                  int64   `json:"id"`
	TeacherID           int64   `json:"teacher_id"`
	DisciplineID        int64   `json:"discipline_id"`
	DisciplineCode      string  `json:"discipline_code"`
	DisciplineTitle     string  `json:"discipline_title"`
	Title               string  `json:"title"`
	DescriptionMD       string  `json:"description_md"`
	TaskType            string  `json:"task_type"`
	RequirementsCount   int     `json:"requirements_count"`
	ExpectedHours       float64 `json:"expected_hours"`
	SpeedrunWindowHours int     `json:"speedrun_window_hours"`
	TeamSize            int     `json:"team_size"`
	CreatedAt           string  `json:"created_at"`
}

// createTaskTemplateRequest — тело POST /api/task-templates.
type createTaskTemplateRequest struct {
	DisciplineID        int64   `json:"discipline_id"`
	DisciplineCode      string  `json:"discipline_code"`
	Title               string  `json:"title"`
	DescriptionMD       string  `json:"description_md"`
	TaskType            string  `json:"task_type"`
	RequirementsCount   int     `json:"requirements_count"`
	ExpectedHours       float64 `json:"expected_hours"`
	SpeedrunWindowHours int     `json:"speedrun_window_hours"`
	TeamSize            int     `json:"team_size"`
}

// issueTaskTemplateRequest — тело POST /api/task-templates/{id}/issue.
type issueTaskTemplateRequest struct {
	AssignmentID int64   `json:"assignment_id"`
	DeadlineAt   string  `json:"deadline_at"`
	StudentIDs   []int64 `json:"student_ids"`
}

// handleListTaskTemplates отдаёт базу заданий: преподавателю — свою, админу — всю.
func (s *Server) handleListTaskTemplates(w http.ResponseWriter, r *http.Request) {
	p, ok := s.principalOr401(w, r)
	if !ok {
		return
	}

	if !requireRole(w, p, RoleTeacher, RoleAdmin) {
		return
	}

	var (
		templates []storage.TaskTemplate
		err       error
	)

	if p.Role == RoleTeacher {
		templates, err = s.templates.ListByTeacher(r.Context(), p.UserID)
	} else {
		templates, err = s.templates.ListAll(r.Context())
	}

	if err != nil {
		writeError(w, err)

		return
	}

	views := make([]taskTemplateView, 0, len(templates))
	for i := range templates {
		views = append(views, newTaskTemplateView(&templates[i]))
	}

	writeJSON(w, http.StatusOK, views)
}

// handleCreateTaskTemplate сохраняет заготовку в личную базу преподавателя.
func (s *Server) handleCreateTaskTemplate(w http.ResponseWriter, r *http.Request) {
	p, ok := s.principalOr401(w, r)
	if !ok {
		return
	}

	if !requireRole(w, p, RoleTeacher) {
		return
	}

	var req createTaskTemplateRequest

	if !decodeJSON(w, r, &req) {
		return
	}

	if !validTaskType(req.TaskType) {
		writeError(w, domainerrors.ErrInvalidArgument)

		return
	}

	title := strings.TrimSpace(req.Title)
	if title == "" {
		writeError(w, domainerrors.ErrInvalidArgument)

		return
	}

	requirementsCount := req.RequirementsCount
	if requirementsCount <= 0 {
		requirementsCount = defaultTaskRequirements
	}

	expectedHours := req.ExpectedHours
	if expectedHours <= 0 {
		expectedHours = defaultTaskHours
	}

	speedrunWindow := req.SpeedrunWindowHours
	if speedrunWindow <= 0 {
		speedrunWindow = defaultSpeedrunWindowHours
	}

	teamSize := req.TeamSize
	if req.TaskType == string(economy.TaskTypeTeamProject) {
		if teamSize < 2 {
			writeError(w, domainerrors.ErrInvalidArgument)

			return
		}
	} else if teamSize == 0 {
		teamSize = 1
	} else if teamSize != 1 {
		writeError(w, domainerrors.ErrInvalidArgument)

		return
	}

	discipline, err := s.resolveDiscipline(r.Context(), req.DisciplineID, req.DisciplineCode)
	if err != nil {
		writeError(w, err)

		return
	}

	template, err := s.templates.Create(r.Context(), storage.CreateTaskTemplateInput{
		TeacherID:           p.UserID,
		DisciplineID:        discipline.ID,
		Title:               title,
		DescriptionMD:       req.DescriptionMD,
		TaskType:            req.TaskType,
		RequirementsCount:   requirementsCount,
		ExpectedHours:       expectedHours,
		SpeedrunWindowHours: speedrunWindow,
		TeamSize:            teamSize,
	})
	if err != nil {
		writeError(w, err)

		return
	}

	writeJSON(w, http.StatusCreated, newTaskTemplateView(template))
}

// handleDeleteTaskTemplate удаляет шаблон: преподаватель — только свой,
// администратор — любой.
func (s *Server) handleDeleteTaskTemplate(w http.ResponseWriter, r *http.Request) {
	p, ok := s.principalOr401(w, r)
	if !ok {
		return
	}

	if !requireRole(w, p, RoleTeacher, RoleAdmin) {
		return
	}

	id, err := parsePathID(r, "id")
	if err != nil {
		writeError(w, err)

		return
	}

	template, err := s.templates.GetByID(r.Context(), id)
	if err != nil {
		writeError(w, err)

		return
	}

	if p.Role == RoleTeacher && template.TeacherID != p.UserID {
		writeError(w, domainerrors.ErrForbidden)

		return
	}

	if err := s.templates.Delete(r.Context(), id); err != nil {
		writeError(w, err)

		return
	}

	writeJSON(w, http.StatusNoContent, nil)
}

// handleIssueTaskTemplate выдаёт шаблон в конкретный поток.
//
// Получатели: student_ids (только ученики группы назначения) либо вся группа.
// Задание создаётся через тот же issueTask, что и POST /api/tasks, поэтому
// карточки появляются в нормализованных submission-таблицах без обходных путей.
func (s *Server) handleIssueTaskTemplate(w http.ResponseWriter, r *http.Request) {
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

	template, err := s.templates.GetByID(r.Context(), id)
	if err != nil {
		writeError(w, err)

		return
	}

	if template.TeacherID != p.UserID {
		writeError(w, domainerrors.ErrForbidden)

		return
	}

	var req issueTaskTemplateRequest

	if !decodeJSON(w, r, &req) {
		return
	}

	if req.AssignmentID <= 0 {
		writeError(w, domainerrors.ErrInvalidArgument)

		return
	}

	teacherID, err := s.tasks.TeacherIDForAssignment(r.Context(), req.AssignmentID)
	if err != nil {
		writeError(w, err)

		return
	}

	if teacherID != p.UserID {
		writeError(w, domainerrors.ErrForbidden)

		return
	}

	groupID, err := s.tasks.GroupIDForAssignment(r.Context(), req.AssignmentID)
	if err != nil {
		writeError(w, err)

		return
	}

	deadline, err := time.Parse(time.RFC3339, strings.TrimSpace(req.DeadlineAt))
	if err != nil || !deadline.After(s.now()) {
		writeError(w, domainerrors.ErrInvalidArgument)

		return
	}

	students, err := s.resolveStudents(r.Context(), groupID, req.StudentIDs)
	if err != nil {
		writeError(w, err)

		return
	}

	response, err := s.issueTask(r.Context(), p, issueTaskInput{
		AssignmentID:      req.AssignmentID,
		GroupID:           groupID,
		Topic:             template.Title,
		Title:             template.Title,
		DescriptionMD:     template.DescriptionMD,
		TaskType:          template.TaskType,
		RequirementsCount: template.RequirementsCount,
		ExpectedHours:     template.ExpectedHours,
		Deadline:          deadline,
		SpeedrunWindow:    template.SpeedrunWindowHours,
		TeamSize:          template.TeamSize,
	}, students)
	if err != nil {
		writeError(w, err)

		return
	}

	writeJSON(w, http.StatusCreated, response)
}

// resolveDiscipline находит дисциплину по id или коду.
func (s *Server) resolveDiscipline(
	ctx context.Context,
	id int64,
	code string,
) (*storage.Discipline, error) {
	if id > 0 {
		return s.disciplines.GetByID(ctx, id)
	}

	code = strings.TrimSpace(code)
	if code == "" {
		return nil, domainerrors.ErrInvalidArgument
	}

	return s.disciplines.GetByCode(ctx, code)
}

// newTaskTemplateView собирает DTO шаблона.
func newTaskTemplateView(template *storage.TaskTemplate) taskTemplateView {
	return taskTemplateView{
		ID:                  template.ID,
		TeacherID:           template.TeacherID,
		DisciplineID:        template.DisciplineID,
		DisciplineCode:      template.DisciplineCode,
		DisciplineTitle:     template.DisciplineTitle,
		Title:               template.Title,
		DescriptionMD:       template.DescriptionMD,
		TaskType:            template.TaskType,
		RequirementsCount:   template.RequirementsCount,
		ExpectedHours:       template.ExpectedHours,
		SpeedrunWindowHours: template.SpeedrunWindowHours,
		TeamSize:            template.TeamSize,
		CreatedAt:           formatTimestamp(template.CreatedAt),
	}
}
