package httpapi

import (
	"context"
	"time"

	"github.com/parta/backend/internal/events"
)

// Payload-структуры конвертов из spec/00_ARCHITECTURE.md §V.
// Поля — ровно те, что перечислены в спецификации.

type submissionCardMovedPayload struct {
	SubmissionID int64   `json:"submission_id"`
	TaskID       int64   `json:"task_id"`
	StudentID    int64   `json:"student_id"`
	From         string  `json:"from"`
	To           string  `json:"to"`
	SubmittedAt  *string `json:"submitted_at"`
}

type reviewInboxCreatedPayload struct {
	SubmissionID   int64  `json:"submission_id"`
	TaskID         int64  `json:"task_id"`
	StudentID      int64  `json:"student_id"`
	GroupID        int64  `json:"group_id"`
	SubmittedAt    string `json:"submitted_at"`
	WaitingSeconds int64  `json:"waiting_seconds"`
}

type submissionVerdictIssuedPayload struct {
	SubmissionID int64  `json:"submission_id"`
	Verdict      string `json:"verdict"`
	XPAwarded    int    `json:"xp_awarded"`
	StreakDelta  int    `json:"streak_delta"`
	ReviewedAt   string `json:"reviewed_at"`
}

type xpLedgerPostedPayload struct {
	LedgerID     int64  `json:"ledger_id"`
	UserID       int64  `json:"user_id"`
	Amount       int    `json:"amount"`
	BalanceAfter int    `json:"balance_after"`
	Reason       string `json:"reason"`
}

type streakUpdatedPayload struct {
	UserID        int64  `json:"user_id"`
	OnTimeStreak  int    `json:"on_time_streak"`
	StreakFreezes int    `json:"streak_freezes"`
	Reason        string `json:"reason"`
}

type wagerResolvedPayload struct {
	WagerID     int64  `json:"wager_id"`
	Status      string `json:"status"`
	StakeAmount int    `json:"stake_amount"`
	Payout      int    `json:"payout"`
}

type peerReviewStateChangedPayload struct {
	PeerReviewID int64  `json:"peer_review_id"`
	Status       string `json:"status"`
	ReviewerID   int64  `json:"reviewer_id"`
	ExpiresAt    string `json:"expires_at"`
}

type teamSlotStateChangedPayload struct {
	TeamSlotID     int64  `json:"team_slot_id"`
	TaskID         int64  `json:"task_id"`
	Status         string `json:"status"`
	AssignedUserID int64  `json:"assigned_user_id"`
}

// eventTime форматирует время в формате конверта (RFC3339 с миллисекундами).
func eventTime(t time.Time) string {
	return t.UTC().Format(events.TimestampFormat)
}

// eventTimePtr сериализует необязательное время для payload события.
func eventTimePtr(t *time.Time) *string {
	if t == nil {
		return nil
	}

	formatted := eventTime(*t)

	return &formatted
}

// studentRoom возвращает основную комнату студента: его группу, а если группы
// нет — личную комнату. Публикация в user:{id} всё равно остаётся возможной
// для персональных событий (XP, стрик, пари).
func (s *Server) studentRoom(ctx context.Context, studentID int64) string {
	user, err := s.users.GetByID(ctx, studentID)
	if err != nil || user.GroupID == nil {
		return events.RoomUser(studentID)
	}

	return events.RoomGroup(*user.GroupID)
}

// publishCardEvent отправляет событие в комнату студента и в комнату задания.
// Копия для task:{id} сохраняет event_id, поэтому клиент дедуплицирует её.
func (s *Server) publishCardEvent(ctx context.Context, event events.Event, taskID int64) {
	s.publisher.Publish(ctx, event)

	if taskID > 0 {
		s.publisher.Publish(ctx, event.InRoom(events.RoomTask(taskID)))
	}
}
