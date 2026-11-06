package httpapi

import (
	"context"
	"database/sql"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/parta/backend/internal/domain/economy"
	domainerrors "github.com/parta/backend/internal/domain/errors"
	"github.com/parta/backend/internal/domain/xp"
	"github.com/parta/backend/internal/events"
	"github.com/parta/backend/internal/storage"
)

// teamRoles — ролевые слоты командного проекта (spec/00_ARCHITECTURE.md §IV.1).
var teamRoles = []storage.TeamSlotSeed{
	{RoleCode: "DB", RoleTitle: "Схема и миграции"},
	{RoleCode: "BIZ", RoleTitle: "Бизнес-логика и API"},
	{RoleCode: "QA_DOC", RoleTitle: "Тесты и документация"},
	{RoleCode: "DEVOPS", RoleTitle: "Сборка, CI и окружение"},
}

const (
	// defaultTaskRequirements / defaultTaskHours — базовая сложность задания,
	// когда преподаватель не задал требований и часов.
	defaultTaskRequirements = 8
	defaultTaskHours        = 4.0
	// defaultSpeedrunWindowHours — бонусное окно по умолчанию.
	defaultSpeedrunWindowHours = 48
	// maxTaskXP — верхняя граница назначенного преподавателем XP.
	maxTaskXP = 100_000
)

// createTaskRequest — тело POST /api/tasks (spec/04_API.md).
//
// Требования и ожидаемые часы необязательны: форма выдачи их не спрашивает,
// и тогда XP считается по базовой сложности типа задания.
type createTaskRequest struct {
	AssignmentID int64 `json:"assignment_id"`
	// Topic — короткое ТЗ задания.
	Topic               string  `json:"topic"`
	Title               string  `json:"title"`
	DescriptionMD       string  `json:"description_md"`
	TaskType            string  `json:"task_type"`
	RequirementsCount   int     `json:"requirements_count"`
	ExpectedHours       float64 `json:"expected_hours"`
	DeadlineAt          string  `json:"deadline_at"`
	SpeedrunWindowHours int     `json:"speedrun_window_hours"`
	// SpeedrunBonusUntil — необязательная дата окончания бонуса за спидран.
	// Пусто — граница считается автоматически: deadline − speedrun-окно.
	SpeedrunBonusUntil string `json:"speedrun_bonus_until"`
	// XP — XP за задание, назначенный преподавателем. 0 — расчёт по формуле.
	XP       int `json:"xp"`
	TeamSize int `json:"team_size"`
	// StudentIDs — индивидуальная выдача: пусто — вся группа назначения.
	StudentIDs []int64 `json:"student_ids"`
}

// createTaskResponse — ответ на создание задания.
type createTaskResponse struct {
	TaskID             int64  `json:"task_id"`
	BaseXP             int    `json:"base_xp_computed"`
	Status             string `json:"status"`
	SlotsCount         int    `json:"slots_count,omitempty"`
	SpeedrunBonusUntil string `json:"speedrun_bonus_until,omitempty"`
	AttachmentsCount   int    `json:"attachments_count,omitempty"`
}

// handleCreateTask создаёт задание (JSON или multipart с вложениями).
func (s *Server) handleCreateTask(w http.ResponseWriter, r *http.Request) {
	p, ok := s.principalOr401(w, r)
	if !ok {
		return
	}

	if !requireRole(w, p, RoleTeacher) {
		return
	}

	if strings.HasPrefix(r.Header.Get("Content-Type"), "multipart/form-data") {
		s.handleCreateTaskMultipart(w, r, p)

		return
	}

	var req createTaskRequest

	if !decodeJSON(w, r, &req) {
		return
	}

	s.createTaskResponse(w, r, p, req, "[]")
}

// handleCreateTaskMultipart создаёт задание вместе с приложенными файлами.
// Поля формы: assignment_id, topic, title, description_md, task_type,
// deadline_at (datetime-local), speedrun_bonus_until (datetime-local),
// speedrun_window_hours, xp, team_size и файлы file[].
func (s *Server) handleCreateTaskMultipart(w http.ResponseWriter, r *http.Request, p principal) {
	if err := r.ParseMultipartForm(4 << 20); err != nil {
		writeJSON(w, http.StatusBadRequest, errorBody{
			Error: "invalid multipart form",
			Code:  CodeInvalidMultipart,
		})

		return
	}

	form := r.MultipartForm
	if form != nil {
		defer func() {
			_ = form.RemoveAll()
		}()
	}

	value := func(key string) string {
		if form == nil {
			return ""
		}

		return form.Value[key][0]
	}

	deadline, ok := formTime(value("deadline_at"))
	if !ok {
		writeError(w, domainerrors.ErrInvalidArgument)

		return
	}

	studentIDs, err := parseStudentIDs(form.Value["student_ids"])
	if err != nil {
		writeError(w, domainerrors.ErrInvalidArgument)

		return
	}

	req := createTaskRequest{
		AssignmentID:        parseInt64OrZero(value("assignment_id")),
		Topic:               value("topic"),
		Title:               value("title"),
		DescriptionMD:       value("description_md"),
		TaskType:            value("task_type"),
		RequirementsCount:   int(parseInt64OrZero(value("requirements_count"))),
		ExpectedHours:       parseFloatOrZero(value("expected_hours")),
		DeadlineAt:          deadline.UTC().Format(time.RFC3339),
		SpeedrunWindowHours: int(parseInt64OrZero(value("speedrun_window_hours"))),
		SpeedrunBonusUntil:  value("speedrun_bonus_until"),
		XP:                  int(parseInt64OrZero(value("xp"))),
		TeamSize:            int(parseInt64OrZero(value("team_size"))),
		StudentIDs:          studentIDs,
	}

	// Дата бонуса из формы (datetime-local) приводится к RFC3339.
	if req.SpeedrunBonusUntil != "" {
		if parsed, ok := formTime(req.SpeedrunBonusUntil); ok {
			req.SpeedrunBonusUntil = parsed.UTC().Format(time.RFC3339)
		}
	}

	s.createTaskResponse(w, r, p, req, "")
}

// createTaskResponse проверяет запрос, сохраняет задание и отвечает 201.
// attachmentsJSON = "" означает: файлы приходят в multipart-форме.
func (s *Server) createTaskResponse(
	w http.ResponseWriter,
	r *http.Request,
	p principal,
	req createTaskRequest,
	attachmentsJSON string,
) {
	deadline, bonusUntil, groupID, err := s.validateCreateTask(r, p, &req)
	if err != nil {
		writeError(w, err)

		return
	}

	if attachmentsJSON == "" {
		var ok bool

		attachmentsJSON, ok = s.uploadTaskAttachments(w, r, groupID)
		if !ok {
			return
		}
	}

	// Список учеников читается до транзакции: внутри withTx нельзя ходить в *sql.DB.
	students, err := s.resolveStudents(r.Context(), groupID, req.StudentIDs)
	if err != nil {
		writeError(w, err)

		return
	}

	response, err := s.issueTask(r.Context(), p, issueTaskInput{
		AssignmentID:       req.AssignmentID,
		GroupID:            groupID,
		Topic:              req.Topic,
		Title:              req.Title,
		DescriptionMD:      req.DescriptionMD,
		TaskType:           req.TaskType,
		RequirementsCount:  req.RequirementsCount,
		ExpectedHours:      req.ExpectedHours,
		Deadline:           deadline,
		SpeedrunWindow:     req.SpeedrunWindowHours,
		SpeedrunBonusUntil: bonusUntil,
		Attachments:        attachmentsJSON,
		TeamSize:           req.TeamSize,
		XP:                 req.XP,
	}, students)
	if err != nil {
		writeError(w, err)

		return
	}

	writeJSON(w, http.StatusCreated, response)
}

// issueTaskInput — проверенные параметры создания задания и карточек учеников.
// Используется и обычной выдачей, и базой заданий, и повтором.
type issueTaskInput struct {
	AssignmentID       int64
	GroupID            int64
	Topic              string
	Title              string
	DescriptionMD      string
	TaskType           string
	RequirementsCount  int
	ExpectedHours      float64
	Deadline           time.Time
	SpeedrunWindow     int
	SpeedrunBonusUntil *string
	Attachments        string
	TeamSize           int
	XP                 int
}

// issueTask создаёт задание, карточки TODO выбранным ученикам и слоты
// командного проекта. Возвращает DTO ответа POST /api/tasks.
func (s *Server) issueTask(
	ctx context.Context,
	p principal,
	in issueTaskInput,
	students []storage.User,
) (*createTaskResponse, error) {
	now := s.now()

	if in.SpeedrunWindow <= 0 {
		in.SpeedrunWindow = defaultSpeedrunWindowHours
	}

	baseXP := xp.ComputeBaseXP(xp.BaseXPInput{
		TaskType:          economy.TaskType(in.TaskType),
		RequirementsCount: in.RequirementsCount,
		ExpectedHours:     in.ExpectedHours,
		CreatedAt:         now,
		DeadlineAt:        in.Deadline,
		TeamSize:          in.TeamSize,
	})

	// Преподаватель может назначить XP сам — оно важнее расчётного.
	if in.XP > 0 {
		baseXP = in.XP
	}

	requirementsCount := in.RequirementsCount
	if requirementsCount <= 0 {
		requirementsCount = defaultTaskRequirements
	}

	expectedHours := in.ExpectedHours
	if expectedHours <= 0 {
		expectedHours = defaultTaskHours
	}

	storageInput := storage.CreateTaskInput{
		AssignmentID:       in.AssignmentID,
		Topic:              in.Topic,
		Title:              in.Title,
		DescriptionMD:      in.DescriptionMD,
		TaskType:           in.TaskType,
		RequirementsCount:  requirementsCount,
		ExpectedHours:      expectedHours,
		DeadlineAt:         storage.FormatTimestamp(in.Deadline),
		SpeedrunWindow:     in.SpeedrunWindow,
		SpeedrunBonusUntil: in.SpeedrunBonusUntil,
		Attachments:        in.Attachments,
		TeamSize:           in.TeamSize,
		BaseXP:             baseXP,
		Status:             "PUBLISHED",
	}

	seeds := teamSlotSeeds(in.TaskType, in.TeamSize)

	var taskID int64

	err := s.withTx(ctx, func(tx *sql.Tx) error {
		task, err := s.tasks.CreateTx(ctx, tx, storageInput)
		if err != nil {
			return err
		}

		taskID = task.ID

		// Каждый получатель сразу получает карточку TODO: ученик не создаёт
		// задачи и не вводит id вручную.
		for i := range students {
			if err := s.submissions.CreateTodoTx(ctx, tx, task.ID, students[i].ID); err != nil {
				return err
			}
		}

		if len(seeds) == 0 {
			return nil
		}

		return s.teamSlots.CreateSlots(ctx, tx, task.ID, seeds)
	})
	if err != nil {
		return nil, err
	}

	// Публикация после Commit: ученики группы получают карточку без ручного
	// обновления доски, преподаватель — сигнал для своего экрана заданий.
	event := events.New(
		events.TypeTaskCreated,
		p.UserID,
		events.RoomGroup(in.GroupID),
		taskCreatedPayload{
			TaskID:     taskID,
			GroupID:    in.GroupID,
			Title:      in.Title,
			DeadlineAt: eventTime(in.Deadline),
			Status:     "PUBLISHED",
		},
	)
	s.publisher.Publish(ctx, event)
	s.publisher.Publish(ctx, event.InRoom(events.RoomTeacher(p.UserID)))

	return &createTaskResponse{
		TaskID:             taskID,
		BaseXP:             baseXP,
		Status:             "PUBLISHED",
		SlotsCount:         len(seeds),
		SpeedrunBonusUntil: formatSpeedrunBonus(in.Deadline, in.SpeedrunBonusUntil, time.Duration(in.SpeedrunWindow)*time.Hour),
		AttachmentsCount:   len(parseTaskAttachments(in.Attachments)),
	}, nil
}

// formatSpeedrunBonus возвращает дату окончания бонуса для ответа API.
func formatSpeedrunBonus(deadline time.Time, bonusUntil *string, window time.Duration) string {
	if bonusUntil != nil {
		return *bonusUntil
	}

	return eventTime(deadline.Add(-window))
}

// validateCreateTask проверяет права на назначение и корректность полей.
// Возвращает дедлайн, необязательную дату окончания бонуса и группу задания.
func (s *Server) validateCreateTask(
	r *http.Request,
	p principal,
	req *createTaskRequest,
) (time.Time, *string, int64, error) {
	invalid := func() (time.Time, *string, int64, error) {
		return time.Time{}, nil, 0, domainerrors.ErrInvalidArgument
	}

	if req.AssignmentID <= 0 || req.Title == "" {
		return invalid()
	}

	if !validTaskType(req.TaskType) {
		return invalid()
	}

	if req.RequirementsCount < 0 || req.ExpectedHours < 0 {
		return invalid()
	}

	if req.SpeedrunWindowHours <= 0 {
		req.SpeedrunWindowHours = defaultSpeedrunWindowHours
	}

	if req.XP < 0 || req.XP > maxTaskXP {
		return invalid()
	}

	if req.TaskType == string(economy.TaskTypeTeamProject) {
		if req.TeamSize < 2 {
			return invalid()
		}
	} else if req.TeamSize == 0 {
		req.TeamSize = 1
	} else if req.TeamSize != 1 {
		return invalid()
	}

	teacherID, err := s.tasks.TeacherIDForAssignment(r.Context(), req.AssignmentID)
	if err != nil {
		return time.Time{}, nil, 0, err
	}

	if p.Role == RoleTeacher && teacherID != p.UserID {
		return time.Time{}, nil, 0, domainerrors.ErrForbidden
	}

	groupID, err := s.tasks.GroupIDForAssignment(r.Context(), req.AssignmentID)
	if err != nil {
		return time.Time{}, nil, 0, err
	}

	deadline, err := time.Parse(time.RFC3339, req.DeadlineAt)
	if err != nil {
		return invalid()
	}

	if !deadline.After(s.now()) {
		return invalid()
	}

	bonusUntil, err := parseSpeedrunBonus(req.SpeedrunBonusUntil, deadline, s.now())
	if err != nil {
		return invalid()
	}

	return deadline, bonusUntil, groupID, nil
}

// parseSpeedrunBonus разбирает явную дату окончания бонуса от преподавателя.
// Пустая строка — автоматический режим (nil). Дата должна быть в будущем и
// строго раньше дедлайна задания.
func parseSpeedrunBonus(raw string, deadline, now time.Time) (*string, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil, nil
	}

	parsed, err := time.Parse(time.RFC3339, raw)
	if err != nil {
		return nil, domainerrors.ErrInvalidArgument
	}

	if !parsed.After(now) || !parsed.Before(deadline) {
		return nil, domainerrors.ErrInvalidArgument
	}

	formatted := storage.FormatTimestamp(parsed)

	return &formatted, nil
}

// validTaskType проверяет тип задания по CHECK в tasks.task_type.
func validTaskType(taskType string) bool {
	switch economy.TaskType(taskType) {
	case economy.TaskTypeTest, economy.TaskTypeNotes, economy.TaskTypeEssay,
		economy.TaskTypeLabCode, economy.TaskTypeTeamProject:
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
