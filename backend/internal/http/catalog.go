package httpapi

import (
	"encoding/json"
	"net/http"
	"strings"
	"time"

	domainerrors "github.com/parta/backend/internal/domain/errors"
	"github.com/parta/backend/internal/domain/submission"
	"github.com/parta/backend/internal/storage"
)

// peerReviewTokenTTLSeconds — TTL read-only токена P2P-ревью в секундах.
const peerReviewTokenTTLSeconds = 900

// taskListView — элемент GET /api/tasks.
type taskListView struct {
	ID                  int64   `json:"id"`
	AssignmentID        int64   `json:"assignment_id"`
	Title               string  `json:"title"`
	DescriptionMD       string  `json:"description_md"`
	TaskType            string  `json:"task_type"`
	RequirementsCount   int     `json:"requirements_count"`
	ExpectedHours       float64 `json:"expected_hours"`
	DeadlineAt          string  `json:"deadline_at"`
	SpeedrunWindowHours int     `json:"speedrun_window_hours"`
	TeamSize            int     `json:"team_size"`
	BaseXP              int     `json:"base_xp_computed"`
	GroupID             int64   `json:"group_id"`
	AssignedTeacherID   int64   `json:"assigned_teacher_id"`
	Status              string  `json:"status"`
	CreatedAt           string  `json:"created_at"`
	UpdatedAt           string  `json:"updated_at"`
}

// revisionView — запись журнала доработок в ответе по работам.
type revisionView struct {
	At      string `json:"at"`
	ActorID int64  `json:"actor_id"`
	Comment string `json:"comment"`
}

// submissionListView — элемент GET /api/submissions.
type submissionListView struct {
	ID                  int64          `json:"id"`
	TaskID              int64          `json:"task_id"`
	StudentID           int64          `json:"student_id"`
	TeamSlotID          *int64         `json:"team_slot_id"`
	Status              string         `json:"status"`
	ArtifactURL         string         `json:"artifact_url"`
	ArtifactHash        string         `json:"artifact_hash"`
	SubmittedAt         *string        `json:"submitted_at"`
	FinalSubmittedAt    *string        `json:"final_submitted_at"`
	ReviewedAt          *string        `json:"reviewed_at"`
	ReviewerID          *int64         `json:"reviewer_id"`
	RevisionLog         []revisionView `json:"revision_log"`
	TaskTitle           string         `json:"task_title"`
	TaskType            string         `json:"task_type"`
	DeadlineAt          string         `json:"deadline_at"`
	SpeedrunWindowHours int            `json:"speedrun_window_hours"`
	BaseXP              int            `json:"base_xp_computed"`
	GroupID             int64          `json:"group_id"`
	GroupCode           string         `json:"group_code"`
	StudentName         string         `json:"student_name"`
	TeamSlotRole        *string        `json:"team_slot_role"`
	Attempt             int            `json:"attempt"`
}

// wagerListView — элемент GET /api/wagers.
type wagerListView struct {
	ID             int64   `json:"id"`
	TaskID         int64   `json:"task_id"`
	TaskTitle      string  `json:"task_title"`
	TaskDueAt      string  `json:"task_deadline_at"`
	StakeAmount    int     `json:"stake_amount"`
	DeadlineAt     string  `json:"deadline_at"`
	Status         string  `json:"status"`
	CreatedAt      string  `json:"created_at"`
	ResolvedAt     *string `json:"resolved_at"`
	ResolutionNote string  `json:"resolution_note"`
}

// peerReviewListView — элемент GET /api/peer-reviews.
type peerReviewListView struct {
	ID                   int64             `json:"id"`
	SubmissionID         int64             `json:"submission_id"`
	TaskID               int64             `json:"task_id"`
	TaskTitle            string            `json:"task_title"`
	GroupCode            string            `json:"group_code"`
	AuthorID             int64             `json:"author_id"`
	AuthorName           string            `json:"author_name"`
	ReviewerID           *int64            `json:"reviewer_id"`
	ReviewerName         *string           `json:"reviewer_name"`
	Status               string            `json:"status"`
	EscrowAmount         int               `json:"escrow_amount"`
	RewardAmount         int               `json:"reward_amount"`
	CreatedAt            string            `json:"created_at"`
	TakenAt              *string           `json:"taken_at"`
	CompletedAt          *string           `json:"completed_at"`
	ExpiresAt            string            `json:"expires_at"`
	Checklist            []checklistItem   `json:"checklist"`
	ChecklistResults     []checklistResult `json:"checklist_results"`
	Summary              string            `json:"summary"`
	AccessTokenTTLSecond int               `json:"access_token_ttl_seconds"`
}

// assignmentListView — элемент GET /api/assignments.
type assignmentListView struct {
	ID              int64  `json:"id"`
	GroupCode       string `json:"group_code"`
	GroupTitle      string `json:"group_title"`
	DisciplineCode  string `json:"discipline_code"`
	DisciplineTitle string `json:"discipline_title"`
	TeacherName     string `json:"teacher_name"`
}

// handleListTasks отдаёт задания с учётом роли: студент — свои группы,
// преподаватель — свои назначения, админ — все.
func (s *Server) handleListTasks(w http.ResponseWriter, r *http.Request) {
	p, ok := s.principalOr401(w, r)
	if !ok {
		return
	}

	var (
		tasks []submission.Task
		err   error
	)

	switch p.Role {
	case RoleStudent:
		var user *storage.User

		user, err = s.users.GetByID(r.Context(), p.UserID)
		if err == nil && user.GroupID != nil {
			tasks, err = s.tasks.ListByGroup(r.Context(), *user.GroupID)
		}
	case RoleTeacher:
		tasks, err = s.tasks.ListByTeacher(r.Context(), p.UserID)
	case RoleAdmin:
		tasks, err = s.tasks.ListAll(r.Context())
	default:
		writeError(w, domainerrors.ErrForbidden)

		return
	}

	if err != nil {
		writeError(w, err)

		return
	}

	views := make([]taskListView, 0, len(tasks))
	for _, task := range tasks {
		views = append(views, newTaskListView(task))
	}

	writeJSON(w, http.StatusOK, views)
}

// handleListSubmissions отдаёт карточки работ с учётом роли и фильтра status.
func (s *Server) handleListSubmissions(w http.ResponseWriter, r *http.Request) {
	p, ok := s.principalOr401(w, r)
	if !ok {
		return
	}

	filter := strings.ToUpper(strings.TrimSpace(r.URL.Query().Get("status")))
	if filter != "" && !validSubmissionStatus(filter) {
		writeError(w, domainerrors.ErrInvalidArgument)

		return
	}

	var (
		items []storage.SubmissionView
		err   error
	)

	switch p.Role {
	case RoleStudent:
		items, err = s.submissions.ListViewsByStudent(r.Context(), p.UserID)
	case RoleTeacher:
		items, err = s.submissions.ListViewsForTeacher(r.Context(), p.UserID)
	case RoleAdmin:
		items, err = s.submissions.ListViewsAll(r.Context())
	default:
		writeError(w, domainerrors.ErrForbidden)

		return
	}

	if err != nil {
		writeError(w, err)

		return
	}

	views := make([]submissionListView, 0, len(items))
	for _, item := range items {
		if filter != "" && string(item.Status) != filter {
			continue
		}

		views = append(views, newSubmissionListView(item))
	}

	writeJSON(w, http.StatusOK, views)
}

// handleListWagers отдаёт пари текущего студента.
func (s *Server) handleListWagers(w http.ResponseWriter, r *http.Request) {
	p, ok := s.principalOr401(w, r)
	if !ok {
		return
	}

	if !requireRole(w, p, RoleStudent) {
		return
	}

	items, err := s.wagers.ListViewsByStudent(r.Context(), p.UserID)
	if err != nil {
		writeError(w, err)

		return
	}

	views := make([]wagerListView, 0, len(items))
	for _, item := range items {
		views = append(views, wagerListView{
			ID:             item.ID,
			TaskID:         item.TaskID,
			TaskTitle:      item.TaskTitle,
			TaskDueAt:      formatTimestamp(item.TaskDueAt),
			StakeAmount:    item.StakeAmount,
			DeadlineAt:     formatTimestamp(item.DeadlineAt),
			Status:         item.Status,
			CreatedAt:      formatTimestamp(item.CreatedAt),
			ResolvedAt:     formatTimePtr(item.ResolvedAt),
			ResolutionNote: item.ResolutionNote,
		})
	}

	writeJSON(w, http.StatusOK, views)
}

// handleListPeerReviews отдаёт P2P-сессии преподавателя или админа.
func (s *Server) handleListPeerReviews(w http.ResponseWriter, r *http.Request) {
	p, ok := s.principalOr401(w, r)
	if !ok {
		return
	}

	if !requireRole(w, p, RoleTeacher, RoleAdmin) {
		return
	}

	var (
		items []storage.PeerReviewView
		err   error
	)

	if p.Role == RoleAdmin {
		items, err = s.peerReviews.ListViewsAll(r.Context())
	} else {
		items, err = s.peerReviews.ListViewsForTeacher(r.Context(), p.UserID)
	}

	if err != nil {
		writeError(w, err)

		return
	}

	views := make([]peerReviewListView, 0, len(items))
	for _, item := range items {
		views = append(views, newPeerReviewListView(item))
	}

	writeJSON(w, http.StatusOK, views)
}

// handleListAssignments отдаёт назначения для админки и кабинета преподавателя.
func (s *Server) handleListAssignments(w http.ResponseWriter, r *http.Request) {
	p, ok := s.principalOr401(w, r)
	if !ok {
		return
	}

	if !requireRole(w, p, RoleTeacher, RoleAdmin) {
		return
	}

	teacherID := int64(0)
	if p.Role == RoleTeacher {
		teacherID = p.UserID
	}

	items, err := s.tasks.ListAssignments(r.Context(), teacherID)
	if err != nil {
		writeError(w, err)

		return
	}

	views := make([]assignmentListView, 0, len(items))
	for _, item := range items {
		views = append(views, assignmentListView{
			ID:              item.ID,
			GroupCode:       item.GroupCode,
			GroupTitle:      item.GroupTitle,
			DisciplineCode:  item.DisciplineCode,
			DisciplineTitle: item.DisciplineTitle,
			TeacherName:     item.TeacherName,
		})
	}

	writeJSON(w, http.StatusOK, views)
}

// validSubmissionStatus проверяет статус фильтра канбана.
func validSubmissionStatus(status string) bool {
	switch status {
	case "TODO", "IN_PROGRESS", "REVIEW", "DONE", "REJECTED":
		return true
	default:
		return false
	}
}

// formatTimestamp приводит время к RFC3339Nano.
func formatTimestamp(value time.Time) string {
	return value.UTC().Format(time.RFC3339Nano)
}

// newTaskListView собирает DTO задания.
func newTaskListView(task submission.Task) taskListView {
	return taskListView{
		ID:                  task.ID,
		AssignmentID:        task.AssignmentID,
		Title:               task.Title,
		DescriptionMD:       task.DescriptionMD,
		TaskType:            task.TaskType,
		RequirementsCount:   task.RequirementsCount,
		ExpectedHours:       task.ExpectedHours,
		DeadlineAt:          formatTimestamp(task.DeadlineAt),
		SpeedrunWindowHours: int(task.SpeedrunWindow.Hours()),
		TeamSize:            task.TeamSize,
		BaseXP:              task.BaseXP,
		GroupID:             task.GroupID,
		AssignedTeacherID:   task.AssignedTeacherID,
		Status:              task.Status,
		CreatedAt:           formatTimestamp(task.CreatedAt),
		UpdatedAt:           formatTimestamp(task.UpdatedAt),
	}
}

// newSubmissionListView собирает DTO карточки работы.
func newSubmissionListView(item storage.SubmissionView) submissionListView {
	revisions := make([]revisionView, 0, len(item.RevisionLog))
	for _, revision := range item.RevisionLog {
		revisions = append(revisions, revisionView{
			At:      formatTimestamp(revision.At),
			ActorID: revision.ActorID,
			Comment: revision.Comment,
		})
	}

	return submissionListView{
		ID:                  item.ID,
		TaskID:              item.TaskID,
		StudentID:           item.StudentID,
		TeamSlotID:          item.TeamSlotID,
		Status:              string(item.Status),
		ArtifactURL:         item.ArtifactURL,
		ArtifactHash:        item.ArtifactHash,
		SubmittedAt:         formatTimePtr(item.SubmittedAt),
		FinalSubmittedAt:    formatTimePtr(item.FinalSubmittedAt),
		ReviewedAt:          formatTimePtr(item.ReviewedAt),
		ReviewerID:          item.ReviewerID,
		RevisionLog:         revisions,
		TaskTitle:           item.TaskTitle,
		TaskType:            item.TaskType,
		DeadlineAt:          formatTimestamp(item.DeadlineAt),
		SpeedrunWindowHours: item.SpeedrunWindowHours,
		BaseXP:              item.BaseXP,
		GroupID:             item.GroupID,
		GroupCode:           item.GroupCode,
		StudentName:         item.StudentName,
		TeamSlotRole:        item.TeamSlotRole,
		Attempt:             item.Attempt,
	}
}

// newPeerReviewListView собирает DTO P2P-сессии и разбирает JSON чек-листа.
func newPeerReviewListView(item storage.PeerReviewView) peerReviewListView {
	checklist := make([]checklistItem, 0)
	if err := json.Unmarshal([]byte(item.CriteriaChecklist), &checklist); err != nil {
		checklist = make([]checklistItem, 0)
	}

	results := make([]checklistResult, 0)
	if item.Comments != "" {
		if err := json.Unmarshal([]byte(item.Comments), &results); err != nil {
			results = make([]checklistResult, 0)
		}
	}

	return peerReviewListView{
		ID:                   item.ID,
		SubmissionID:         item.SubmissionID,
		TaskID:               item.TaskID,
		TaskTitle:            item.TaskTitle,
		GroupCode:            item.GroupCode,
		AuthorID:             item.AuthorID,
		AuthorName:           item.AuthorName,
		ReviewerID:           item.ReviewerID,
		ReviewerName:         item.ReviewerName,
		Status:               item.Status,
		EscrowAmount:         item.EscrowAmount,
		RewardAmount:         item.RewardAmount,
		CreatedAt:            formatTimestamp(item.CreatedAt),
		TakenAt:              formatTimePtr(item.TakenAt),
		CompletedAt:          formatTimePtr(item.CompletedAt),
		ExpiresAt:            formatTimestamp(item.ExpiresAt),
		Checklist:            checklist,
		ChecklistResults:     results,
		Summary:              "",
		AccessTokenTTLSecond: peerReviewTokenTTLSeconds,
	}
}
