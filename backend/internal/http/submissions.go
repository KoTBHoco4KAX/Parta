package httpapi

import (
	"context"
	"database/sql"
	"net/http"
	"strconv"
	"time"

	domainerrors "github.com/parta/backend/internal/domain/errors"
	"github.com/parta/backend/internal/domain/streak"
	"github.com/parta/backend/internal/domain/submission"
	"github.com/parta/backend/internal/domain/xp"
	"github.com/parta/backend/internal/storage"
)

// createSubmissionRequest — тело POST /api/submissions.
type createSubmissionRequest struct {
	TaskID     int64  `json:"task_id"`
	TeamSlotID *int64 `json:"team_slot_id"`
}

// createSubmissionResponse — ответ на постановку работы на канбан.
type createSubmissionResponse struct {
	SubmissionID int64  `json:"submission_id"`
	Status       string `json:"status"`
}

// statusRequest — тело PATCH /api/submissions/{id}/status.
type statusRequest struct {
	Event        string `json:"event"`
	ArtifactURL  string `json:"artifact_url"`
	ArtifactHash string `json:"artifact_hash"`
}

// statusResponse — ответ на движение по канбану.
type statusResponse struct {
	SubmissionID int64   `json:"submission_id"`
	Status       string  `json:"status"`
	SubmittedAt  *string `json:"submitted_at"`
}

// verdictRequest — тело POST /api/submissions/{id}/verdict.
type verdictRequest struct {
	Verdict string `json:"verdict"`
	Comment string `json:"comment"`
}

// verdictResponse — ответ преподавательского вердикта.
type verdictResponse struct {
	SubmissionID int64  `json:"submission_id"`
	Status       string `json:"status"`
	XPAwarded    int    `json:"xp_awarded,omitempty"`
	StreakAfter  int    `json:"streak_after,omitempty"`
	LedgerID     int64  `json:"ledger_id,omitempty"`
}

// handleCreateSubmission создаёт карточку TODO идемпотентно.
func (s *Server) handleCreateSubmission(w http.ResponseWriter, r *http.Request) {
	p, ok := s.principalOr401(w, r)
	if !ok {
		return
	}

	if !requireRole(w, p, RoleStudent) {
		return
	}

	var req createSubmissionRequest

	if !decodeJSON(w, r, &req) {
		return
	}

	if req.TaskID <= 0 {
		writeError(w, domainerrors.ErrInvalidArgument)

		return
	}

	user, err := s.users.GetByID(r.Context(), p.UserID)
	if err != nil {
		writeError(w, err)

		return
	}

	task, err := s.tasks.GetByID(r.Context(), req.TaskID)
	if err != nil {
		writeError(w, err)

		return
	}

	if err := s.ensureTaskAvailable(user, task); err != nil {
		writeError(w, err)

		return
	}

	var (
		sub     *submission.Submission
		created bool
	)

	if req.TeamSlotID == nil {
		sub, created, err = s.submissions.CreateIfNotExists(r.Context(), task.ID, user.ID)
	} else {
		if task.TaskType != "TEAM_PROJECT" {
			writeError(w, domainerrors.ErrInvalidArgument)

			return
		}

		if err := s.ensureSlotOwner(r, *req.TeamSlotID, task.ID, user.ID); err != nil {
			writeError(w, err)

			return
		}

		sub, created, err = s.submissions.CreateForTeamSlot(r.Context(), task.ID, user.ID, *req.TeamSlotID)
	}

	if err != nil {
		writeError(w, err)

		return
	}

	status := http.StatusOK
	if created {
		status = http.StatusCreated
	}

	writeJSON(w, status, createSubmissionResponse{
		SubmissionID: sub.ID,
		Status:       string(sub.Status),
	})
}

// ensureTaskAvailable проверяет, что задача опубликована и назначена группе студента.
func (s *Server) ensureTaskAvailable(user *storage.User, task *submission.Task) error {
	if task.Status != "PUBLISHED" {
		return domainerrors.ErrGuardFailed
	}

	if user.GroupID == nil || *user.GroupID != task.GroupID {
		return domainerrors.ErrForbidden
	}

	return nil
}

// ensureSlotOwner проверяет, что слот относится к задаче и занят этим студентом.
func (s *Server) ensureSlotOwner(r *http.Request, slotID, taskID, userID int64) error {
	slot, err := s.teamSlots.GetByID(r.Context(), slotID)
	if err != nil {
		return err
	}

	if slot.TaskID != taskID {
		return domainerrors.ErrInvalidArgument
	}

	if slot.AssignedUserID == nil || *slot.AssignedUserID != userID {
		return domainerrors.ErrForbidden
	}

	return nil
}

// handleSubmissionStatus двигает карточку событиями START, SUBMIT и REOPEN.
func (s *Server) handleSubmissionStatus(w http.ResponseWriter, r *http.Request) {
	p, ok := s.principalOr401(w, r)
	if !ok {
		return
	}

	if !requireRole(w, p, RoleStudent) {
		return
	}

	id, err := parsePathID(r, "id")
	if err != nil {
		writeError(w, err)

		return
	}

	var req statusRequest

	if !decodeJSON(w, r, &req) {
		return
	}

	sub, err := s.submissions.GetByID(r.Context(), id)
	if err != nil {
		writeError(w, err)

		return
	}

	task, err := s.tasks.GetByID(r.Context(), sub.TaskID)
	if err != nil {
		writeError(w, err)

		return
	}

	now := s.now()
	actor := submission.Actor{UserID: p.UserID, Role: p.Role}

	event, target, guardErr := s.planStatusEvent(actor, sub, task, req, now)
	if guardErr != nil {
		writeError(w, guardErr)

		return
	}

	in := storage.UpdateStatusInput{
		ID:           sub.ID,
		ExpectedFrom: sub.Status,
		To:           target,
		ActorID:      p.UserID,
		Now:          now,
	}

	if event == submission.EventSubmit {
		in.ArtifactURL = &req.ArtifactURL
		in.ArtifactHash = &req.ArtifactHash
	}

	var updated *submission.Submission

	err = s.withTx(r.Context(), func(tx *sql.Tx) error {
		var err error

		updated, err = s.submissions.UpdateStatus(r.Context(), tx, in)

		return err
	})
	if err != nil {
		writeError(w, err)

		return
	}

	writeJSON(w, http.StatusOK, statusResponse{
		SubmissionID: updated.ID,
		Status:       string(updated.Status),
		SubmittedAt:  formatTimePtr(updated.SubmittedAt),
	})
}

// planStatusEvent проверяет guard события и возвращает целевую статус-модель.
func (s *Server) planStatusEvent(
	actor submission.Actor,
	sub *submission.Submission,
	task *submission.Task,
	req statusRequest,
	now time.Time,
) (submission.Event, submission.Status, error) {
	event := submission.Event(req.Event)

	switch event {
	case submission.EventStart:
		if err := submission.GuardStart(actor, *sub, *task); err != nil {
			return event, "", err
		}
	case submission.EventSubmit:
		if err := submission.GuardSubmit(actor, *sub, *task, req.ArtifactURL, req.ArtifactHash, now); err != nil {
			return event, "", err
		}
	case submission.EventReopen:
		if err := submission.GuardReopen(actor, *sub, *task); err != nil {
			return event, "", err
		}
	default:
		return event, "", domainerrors.ErrInvalidTransition
	}

	target, err := submission.NextStatus(sub.Status, event)
	if err != nil {
		return event, "", err
	}

	return event, target, nil
}

// handleVerdict принимает или отклоняет работу преподавателем.
func (s *Server) handleVerdict(w http.ResponseWriter, r *http.Request) {
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

	var req verdictRequest

	if !decodeJSON(w, r, &req) {
		return
	}

	if req.Verdict != "ACCEPT" && req.Verdict != "REJECT" {
		writeError(w, domainerrors.ErrInvalidArgument)

		return
	}

	sub, err := s.submissions.GetByID(r.Context(), id)
	if err != nil {
		writeError(w, err)

		return
	}

	task, err := s.tasks.GetByID(r.Context(), sub.TaskID)
	if err != nil {
		writeError(w, err)

		return
	}

	actor := submission.Actor{UserID: p.UserID, Role: p.Role}
	now := s.now()

	if req.Verdict == "REJECT" {
		if err := submission.GuardTeacherReject(actor, *sub, *task, req.Comment, now); err != nil {
			writeError(w, err)

			return
		}

		s.rejectSubmission(w, r, sub, req.Comment, p.UserID, now)

		return
	}

	if err := submission.GuardTeacherAccept(actor, *sub, *task); err != nil {
		writeError(w, err)

		return
	}

	s.acceptSubmission(w, r, sub, task, now)
}

// rejectSubmission переводит работу в REJECTED и пишет журнал доработок.
func (s *Server) rejectSubmission(w http.ResponseWriter, r *http.Request, sub *submission.Submission, comment string, reviewerID int64, now time.Time) {
	err := s.withTx(r.Context(), func(tx *sql.Tx) error {
		if _, err := s.submissions.UpdateStatus(r.Context(), tx, storage.UpdateStatusInput{
			ID:            sub.ID,
			ExpectedFrom:  sub.Status,
			To:            submission.StatusRejected,
			ActorID:       reviewerID,
			Now:           now,
			ReviewComment: &comment,
		}); err != nil {
			return err
		}

		return s.submissions.RecordRevision(r.Context(), tx, sub.ID, submission.RevisionEntry{
			At:      now,
			ActorID: reviewerID,
			Comment: comment,
		})
	})
	if err != nil {
		writeError(w, err)

		return
	}

	writeJSON(w, http.StatusOK, verdictResponse{
		SubmissionID: sub.ID,
		Status:       string(submission.StatusRejected),
	})
}

// acceptSubmission начисляет XP, двигает стрик и закрывает активные пари.
func (s *Server) acceptSubmission(w http.ResponseWriter, r *http.Request, sub *submission.Submission, task *submission.Task, now time.Time) {
	user, err := s.users.GetByID(r.Context(), sub.StudentID)
	if err != nil {
		writeError(w, err)

		return
	}

	activeWagers, err := s.wagers.ListActiveByTask(r.Context(), sub.StudentID, task.ID)
	if err != nil {
		writeError(w, err)

		return
	}

	finalAt := now
	if sub.SubmittedAt != nil {
		finalAt = *sub.SubmittedAt
	}

	finalXP := xp.ComputeFinalXP(task.BaseXP, finalAt, task.DeadlineAt, task.SpeedrunWindow)
	reason := storage.ReasonTaskBase

	if !finalAt.After(task.DeadlineAt.Add(-task.SpeedrunWindow)) {
		reason = storage.ReasonSpeedrunBonus
	}

	decision := streak.Decide(streak.UserStreak{
		OnTimeStreak: user.OnTimeStreak,
		Freezes:      user.StreakFreezes,
	}, task.DeadlineAt, now, true, &finalAt)

	var (
		ledgerID    int64
		streakAfter int
	)

	err = s.withTx(r.Context(), func(tx *sql.Tx) error {
		if _, err := s.submissions.UpdateStatus(r.Context(), tx, storage.UpdateStatusInput{
			ID:           sub.ID,
			ExpectedFrom: sub.Status,
			To:           submission.StatusDone,
			ActorID:      user.ID,
			Now:          now,
		}); err != nil {
			return err
		}

		sourceID := sub.ID

		entry, err := s.ledger.Post(r.Context(), tx, storage.PostLedgerInput{
			UserID:         sub.StudentID,
			Amount:         finalXP,
			Reason:         reason,
			SourceType:     storage.SourceSubmission,
			SourceID:       &sourceID,
			IdempotencyKey: "submission:" + strconv.FormatInt(sub.ID, 10) + ":accept:" + reason,
		})
		if err != nil {
			return err
		}

		ledgerID = entry.ID

		if err := applyStreak(r.Context(), tx, s, user.ID, decision); err != nil {
			return err
		}

		streakAfter = decision.NewStreak

		for i := range activeWagers {
			wager := activeWagers[i]
			result := storage.WagerStatusLost
			note := "работа принята после дедлайна пари"

			if !finalAt.After(wager.DeadlineAt) {
				result = storage.WagerStatusWon
				note = "работа принята в срок пари"
			}

			if _, err := s.wagers.Resolve(r.Context(), tx, wager.ID, result, note); err != nil {
				return err
			}
		}

		return nil
	})
	if err != nil {
		writeError(w, err)

		return
	}

	writeJSON(w, http.StatusOK, verdictResponse{
		SubmissionID: sub.ID,
		Status:       string(submission.StatusDone),
		XPAwarded:    finalXP,
		StreakAfter:  streakAfter,
		LedgerID:     ledgerID,
	})
}

// applyStreak применяет решение domain/streak внутри транзакции.
func applyStreak(ctx context.Context, tx *sql.Tx, s *Server, userID int64, decision streak.StreakDecision) error {
	switch decision.Action {
	case streak.ActionIncrement, streak.ActionReset, streak.ActionNoop:
		return s.users.UpdateStreakTx(ctx, tx, userID, decision.NewStreak, decision.NewFreezes)
	case streak.ActionFreeze:
		_, err := s.users.DecrementFreezesTx(ctx, tx, userID)

		return err
	default:
		return nil
	}
}

// formatTimePtr сериализует необязательное время в строку ответа.
func formatTimePtr(value *time.Time) *string {
	if value == nil {
		return nil
	}

	formatted := value.UTC().Format(time.RFC3339Nano)

	return &formatted
}
