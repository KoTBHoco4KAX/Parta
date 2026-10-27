package httpapi

import (
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"time"

	domainerrors "github.com/parta/backend/internal/domain/errors"
	"github.com/parta/backend/internal/domain/peerreview"
	"github.com/parta/backend/internal/events"
	"github.com/parta/backend/internal/storage"
)

// checklistItem — критерий чек-листа peer-review.
type checklistItem struct {
	Code   string `json:"code"`
	Title  string `json:"title"`
	Weight int    `json:"weight"`
}

// createPeerReviewRequest — тело POST /api/peer-reviews.
type createPeerReviewRequest struct {
	SubmissionID      int64           `json:"submission_id"`
	EscrowAmount      int             `json:"escrow_amount"`
	ExpiresAt         string          `json:"expires_at"`
	CriteriaChecklist []checklistItem `json:"criteria_checklist"`
}

// createPeerReviewResponse — ответ создания peer-review.
type createPeerReviewResponse struct {
	PeerReviewID int64  `json:"peer_review_id"`
	Status       string `json:"status"`
	EscrowTxID   int64  `json:"escrow_tx_id"`
}

// claimPeerReviewResponse — ответ взятия ревью.
type claimPeerReviewResponse struct {
	PeerReviewID int64  `json:"peer_review_id"`
	Status       string `json:"status"`
	ReviewerID   int64  `json:"reviewer_id"`
	AccessToken  string `json:"access_token"`
}

// checklistResult — результат проверки одного критерия.
type checklistResult struct {
	Code   string `json:"code"`
	Passed bool   `json:"passed"`
}

// completePeerReviewRequest — тело POST /api/peer-reviews/{id}/complete.
type completePeerReviewRequest struct {
	ChecklistResults []checklistResult `json:"checklist_results"`
	Summary          string            `json:"summary"`
}

// completePeerReviewResponse — ответ завершения ревью.
type completePeerReviewResponse struct {
	PeerReviewID int64  `json:"peer_review_id"`
	Status       string `json:"status"`
	RewardXP     int    `json:"reward_xp"`
	LedgerID     int64  `json:"ledger_id"`
}

// handleCreatePeerReview создаёт sandbox-ревью и удерживает escrow автора.
func (s *Server) handleCreatePeerReview(w http.ResponseWriter, r *http.Request) {
	p, ok := s.principalOr401(w, r)
	if !ok {
		return
	}

	if !requireRole(w, p, RoleStudent) {
		return
	}

	var req createPeerReviewRequest

	if !decodeJSON(w, r, &req) {
		return
	}

	if req.SubmissionID <= 0 || req.EscrowAmount <= 0 || req.ExpiresAt == "" {
		writeError(w, domainerrors.ErrInvalidArgument)

		return
	}

	expiresAt, err := time.Parse(time.RFC3339, req.ExpiresAt)
	if err != nil {
		writeError(w, domainerrors.ErrInvalidArgument)

		return
	}

	if !expiresAt.After(s.now()) {
		writeError(w, domainerrors.ErrDeadlinePassed)

		return
	}

	if err := validateChecklist(req.CriteriaChecklist); err != nil {
		writeError(w, err)

		return
	}

	sub, err := s.submissions.GetByID(r.Context(), req.SubmissionID)
	if err != nil {
		writeError(w, err)

		return
	}

	if sub.StudentID != p.UserID {
		writeError(w, domainerrors.ErrForbidden)

		return
	}

	user, err := s.users.GetByID(r.Context(), p.UserID)
	if err != nil {
		writeError(w, err)

		return
	}

	if user.XPBalance < req.EscrowAmount {
		writeError(w, domainerrors.ErrInsufficientXP)

		return
	}

	checklistJSON, err := json.Marshal(req.CriteriaChecklist)
	if err != nil {
		writeError(w, domainerrors.ErrInvalidArgument)

		return
	}

	var created *storage.PeerReview

	err = s.withTx(r.Context(), func(tx *sql.Tx) error {
		var err error

		created, err = s.peerReviews.Create(r.Context(), tx, storage.CreatePeerReviewInput{
			SubmissionID:      sub.ID,
			AuthorID:          user.ID,
			EscrowAmount:      req.EscrowAmount,
			ExpiresAt:         expiresAt,
			CriteriaChecklist: string(checklistJSON),
		})

		return err
	})
	if err != nil {
		writeError(w, err)

		return
	}

	s.publishPeerReviewState(r.Context(), created, 0)
	s.publisher.Publish(r.Context(), events.New(
		events.TypeXPLedgerPosted,
		user.ID,
		events.RoomUser(user.ID),
		xpLedgerPostedPayload{
			LedgerID:     created.EscrowLedgerID,
			UserID:       user.ID,
			Amount:       -created.EscrowAmount,
			BalanceAfter: user.XPBalance - created.EscrowAmount,
			Reason:       storage.ReasonPenalty,
		},
	))

	writeJSON(w, http.StatusCreated, createPeerReviewResponse{
		PeerReviewID: created.ID,
		Status:       created.Status,
		EscrowTxID:   created.EscrowLedgerID,
	})
}

// handleClaimPeerReview закрепляет ревью за рецензентом и выдаёт read-only токен.
func (s *Server) handleClaimPeerReview(w http.ResponseWriter, r *http.Request) {
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

	review, err := s.peerReviews.GetByID(r.Context(), id)
	if err != nil {
		writeError(w, err)

		return
	}

	active, err := s.peerReviews.CountActiveByReviewer(r.Context(), p.UserID)
	if err != nil {
		writeError(w, err)

		return
	}

	if err := peerreview.CanClaim(
		review.AuthorID, p.UserID, peerreview.Status(review.Status), s.now(), review.ExpiresAt, active,
	); err != nil {
		writeError(w, err)

		return
	}

	var claimed *storage.PeerReview

	err = s.withTx(r.Context(), func(tx *sql.Tx) error {
		var err error

		claimed, err = s.peerReviews.Claim(r.Context(), tx, review.ID, p.UserID)

		return err
	})
	if err != nil {
		writeError(w, err)

		return
	}

	accessToken, err := s.tokens.IssuePeerReviewRead(claimed.ID, p.UserID)
	if err != nil {
		writeError(w, err)

		return
	}

	s.publishPeerReviewState(r.Context(), claimed, p.UserID)

	writeJSON(w, http.StatusOK, claimPeerReviewResponse{
		PeerReviewID: claimed.ID,
		Status:       claimed.Status,
		ReviewerID:   p.UserID,
		AccessToken:  accessToken,
	})
}

// handleCompletePeerReview закрывает ревью и платит вознаграждение рецензенту.
func (s *Server) handleCompletePeerReview(w http.ResponseWriter, r *http.Request) {
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

	var req completePeerReviewRequest

	if !decodeJSON(w, r, &req) {
		return
	}

	review, err := s.peerReviews.GetByID(r.Context(), id)
	if err != nil {
		writeError(w, err)

		return
	}

	if review.ReviewerID == nil || *review.ReviewerID != p.UserID {
		writeError(w, domainerrors.ErrForbidden)

		return
	}

	if err := peerreview.CanComplete(p.UserID, peerreview.Status(review.Status), len(req.ChecklistResults) > 0); err != nil {
		writeError(w, err)

		return
	}

	if err := validateChecklistResults(review.CriteriaChecklist, req.ChecklistResults); err != nil {
		writeError(w, err)

		return
	}

	resultsJSON, err := json.Marshal(req.ChecklistResults)
	if err != nil {
		writeError(w, domainerrors.ErrInvalidArgument)

		return
	}

	var completed *storage.PeerReview

	err = s.withTx(r.Context(), func(tx *sql.Tx) error {
		var err error

		completed, err = s.peerReviews.Complete(r.Context(), tx, review.ID, p.UserID, string(resultsJSON))

		return err
	})
	if err != nil {
		writeError(w, err)

		return
	}

	s.publishPeerReviewState(r.Context(), completed, p.UserID)

	if reviewer, err := s.users.GetByID(r.Context(), p.UserID); err == nil {
		s.publisher.Publish(r.Context(), events.New(
			events.TypeXPLedgerPosted,
			reviewer.ID,
			events.RoomUser(reviewer.ID),
			xpLedgerPostedPayload{
				LedgerID:     completed.EscrowLedgerID,
				UserID:       reviewer.ID,
				Amount:       completed.RewardAmount,
				BalanceAfter: reviewer.XPBalance,
				Reason:       storage.ReasonPeerReviewReward,
			},
		))
	}

	writeJSON(w, http.StatusOK, completePeerReviewResponse{
		PeerReviewID: completed.ID,
		Status:       completed.Status,
		RewardXP:     completed.RewardAmount,
		LedgerID:     completed.EscrowLedgerID,
	})
}

// validateChecklist проверяет, что чек-лист задан и каждый критерий корректен.
func validateChecklist(items []checklistItem) error {
	if len(items) == 0 {
		return domainerrors.ErrInvalidArgument
	}

	seen := make(map[string]struct{}, len(items))

	for _, item := range items {
		if item.Code == "" || item.Title == "" || item.Weight <= 0 {
			return domainerrors.ErrInvalidArgument
		}

		if _, duplicate := seen[item.Code]; duplicate {
			return domainerrors.ErrInvalidArgument
		}

		seen[item.Code] = struct{}{}
	}

	return nil
}

// validateChecklistResults проверяет, что результаты покрывают только свои критерии.
func validateChecklistResults(rawChecklist string, results []checklistResult) error {
	if len(results) == 0 {
		return domainerrors.ErrInvalidArgument
	}

	var checklist []checklistItem

	if err := json.Unmarshal([]byte(rawChecklist), &checklist); err != nil {
		return domainerrors.ErrInvalidArgument
	}

	known := make(map[string]struct{}, len(checklist))
	for _, item := range checklist {
		known[item.Code] = struct{}{}
	}

	seen := make(map[string]struct{}, len(results))

	for _, result := range results {
		if _, ok := known[result.Code]; !ok {
			return domainerrors.ErrInvalidArgument
		}

		if _, duplicate := seen[result.Code]; duplicate {
			return domainerrors.ErrInvalidArgument
		}

		seen[result.Code] = struct{}{}
	}

	return nil
}

// publishPeerReviewState отправляет смену состояния ревью автору и рецензенту.
func (s *Server) publishPeerReviewState(ctx context.Context, review *storage.PeerReview, reviewerID int64) {
	event := events.New(
		events.TypePeerReviewStateChanged,
		reviewerID,
		events.RoomUser(review.AuthorID),
		peerReviewStateChangedPayload{
			PeerReviewID: review.ID,
			Status:       review.Status,
			ReviewerID:   reviewerID,
			ExpiresAt:    eventTime(review.ExpiresAt),
		},
	)

	s.publisher.Publish(ctx, event)

	if reviewerID > 0 && reviewerID != review.AuthorID {
		s.publisher.Publish(ctx, event.InRoom(events.RoomUser(reviewerID)))
	}
}
