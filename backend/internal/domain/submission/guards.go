package submission

import (
	"time"

	domainerrors "github.com/parta/backend/internal/domain/errors"
)

// lateWindowDays — мягкое окно приёма артефакта после дедлайна, в днях.
const lateWindowDays = 7

// Submission — карточка работы студента.
type Submission struct {
	ID               int64
	TaskID           int64
	StudentID        int64
	TeamSlotID       *int64
	Status           Status
	ArtifactURL      string
	ArtifactHash     string
	SubmittedAt      *time.Time
	FinalSubmittedAt *time.Time
	ReviewedAt       *time.Time
	ReviewerID       *int64
	RevisionLog      []RevisionEntry
}

// Task — задание в объёме, который нужен guard-функциям и репозиторию задач.
type Task struct {
	ID                int64
	AssignmentID      int64
	Title             string
	DescriptionMD     string
	TaskType          string
	RequirementsCount int
	ExpectedHours     float64
	DeadlineAt        time.Time
	SpeedrunWindow    time.Duration
	TeamSize          int
	BaseXP            int
	AssignedTeacherID int64
	GroupID           int64
	Status            string
	CreatedAt         time.Time
	UpdatedAt         time.Time
}

// RevisionEntry — запись журнала доработок после отказа преподавателя.
type RevisionEntry struct {
	At      time.Time
	ActorID int64
	Comment string
}

// Actor — инициатор перехода.
type Actor struct {
	UserID int64
	Role   string
}

// GuardStart проверяет право студента взять задание в работу и статус задачи.
func GuardStart(actor Actor, s Submission, t Task) error {
	if actor.Role != "student" || actor.UserID != s.StudentID {
		return domainerrors.ErrForbidden
	}

	if t.Status != "PUBLISHED" {
		return domainerrors.ErrGuardFailed
	}

	if s.Status != StatusTodo {
		return domainerrors.ErrInvalidTransition
	}

	return nil
}

// GuardSubmit проверяет право студента отправить артефакт в мягком late-окне.
func GuardSubmit(actor Actor, s Submission, t Task, artifactURL, artifactHash string, now time.Time) error {
	if actor.Role != "student" || actor.UserID != s.StudentID {
		return domainerrors.ErrForbidden
	}

	if s.Status != StatusInProgress {
		return domainerrors.ErrInvalidTransition
	}

	if artifactURL == "" || artifactHash == "" {
		return domainerrors.ErrInvalidArgument
	}

	if now.After(t.DeadlineAt.AddDate(0, 0, lateWindowDays)) {
		return domainerrors.ErrDeadlinePassed
	}

	return nil
}

// GuardTeacherAccept проверяет право назначенного преподавателя принять работу.
func GuardTeacherAccept(actor Actor, s Submission, t Task) error {
	if actor.Role != "teacher" && actor.Role != "admin" {
		return domainerrors.ErrForbidden
	}

	if actor.Role == "teacher" && actor.UserID != t.AssignedTeacherID {
		return domainerrors.ErrForbidden
	}

	if s.Status != StatusReview {
		return domainerrors.ErrInvalidTransition
	}

	if s.SubmittedAt == nil {
		return domainerrors.ErrGuardFailed
	}

	return nil
}

// GuardTeacherReject проверяет право назначенного преподавателя отклонить работу с комментарием.
func GuardTeacherReject(actor Actor, s Submission, t Task, comment string, _ time.Time) error {
	if actor.Role != "teacher" && actor.Role != "admin" {
		return domainerrors.ErrForbidden
	}

	if actor.Role == "teacher" && actor.UserID != t.AssignedTeacherID {
		return domainerrors.ErrForbidden
	}

	if s.Status != StatusReview {
		return domainerrors.ErrInvalidTransition
	}

	if comment == "" {
		return domainerrors.ErrInvalidArgument
	}

	return nil
}

// GuardReopen проверяет право студента-владельца вернуть отклонённую работу в работу.
func GuardReopen(actor Actor, s Submission, t Task) error {
	if actor.Role != "student" || actor.UserID != s.StudentID {
		return domainerrors.ErrForbidden
	}

	if s.Status != StatusRejected {
		return domainerrors.ErrInvalidTransition
	}

	return nil
}
