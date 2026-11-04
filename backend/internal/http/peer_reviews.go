package httpapi

import (
	"context"
	"database/sql"
	"net/http"
	"strings"
	"time"

	domainerrors "github.com/parta/backend/internal/domain/errors"
	"github.com/parta/backend/internal/domain/peerreview"
	"github.com/parta/backend/internal/events"
	"github.com/parta/backend/internal/storage"
)

// peerReviewDefaultTTL — сколько живёт запрос на взаимопроверку.
const peerReviewDefaultTTL = 72 * time.Hour

// peerReviewRewardMin — нижняя граница награды рецензенту.
const peerReviewRewardMin = 10

// createPeerReviewRequest — тело POST /api/peer-reviews.
// Ученик запрашивает проверку своей работы; файлы другому ученику не уходят.
type createPeerReviewRequest struct {
	SubmissionID int64  `json:"submission_id"`
	ExpiresAt    string `json:"expires_at"`
}

// createPeerReviewResponse — ответ создания запроса на проверку.
type createPeerReviewResponse struct {
	PeerReviewID int64  `json:"peer_review_id"`
	Status       string `json:"status"`
	ExpiresAt    string `json:"expires_at"`
}

// claimPeerReviewResponse — ответ взятия проверки.
type claimPeerReviewResponse struct {
	PeerReviewID int64  `json:"peer_review_id"`
	Status       string `json:"status"`
	ReviewerID   int64  `json:"reviewer_id"`
}

// completePeerReviewRequest — тело POST /api/peer-reviews/{id}/complete:
// только оценка 1–5 звёзд и короткий комментарий.
type completePeerReviewRequest struct {
	Grade   int    `json:"grade"`
	Comment string `json:"comment"`
}

// completePeerReviewResponse — ответ завершения проверки.
type completePeerReviewResponse struct {
	PeerReviewID int64  `json:"peer_review_id"`
	Status       string `json:"status"`
	Grade        int    `json:"grade"`
	RewardXP     int    `json:"reward_xp"`
}

// authorXPMultiplier — доля XP от результата взаимопроверки автора:
// 0 звёзд не бывает, 1★ — половина, 5★ — почти полный.
func authorXPMultiplier(grade int) float64 {
	if grade < 1 {
		grade = 1
	}

	if grade > 5 {
		grade = 5
	}

	return 0.5 + 0.1*float64(grade-1)
}

// reviewerReward — сколько XP получит рецензент после приёмки работы учителем.
func reviewerReward(grade int) int {
	return peerReviewRewardMin * grade
}

// handleCreatePeerReview запрашивает проверку сданной работы другим учеником.
func (s *Server) handleCreatePeerReview(w http.ResponseWriter, r *http.Request) {
	p, ok := s.principalOr401(w, r)
	if !ok {
		return
	}

	var req createPeerReviewRequest

	if !decodeJSON(w, r, &req) {
		return
	}

	if req.SubmissionID <= 0 {
		writeError(w, domainerrors.ErrInvalidArgument)

		return
	}

	expiresAt := s.now().Add(peerReviewDefaultTTL)

	if req.ExpiresAt != "" {
		parsed, err := time.Parse(time.RFC3339, req.ExpiresAt)
		if err != nil {
			writeError(w, domainerrors.ErrInvalidArgument)

			return
		}

		if !parsed.After(s.now()) {
			writeError(w, domainerrors.ErrDeadlinePassed)

			return
		}

		expiresAt = parsed
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

	if sub.Status != "REVIEW" && sub.Status != "IN_PROGRESS" {
		writeError(w, domainerrors.ErrInvalidTransition)

		return
	}

	var created *storage.PeerReview

	err = s.withTx(r.Context(), func(tx *sql.Tx) error {
		var err error

		created, err = s.peerReviews.Create(r.Context(), tx, storage.CreatePeerReviewInput{
			SubmissionID: sub.ID,
			AuthorID:     p.UserID,
			ExpiresAt:    expiresAt,
		})

		return err
	})
	if err != nil {
		writeError(w, err)

		return
	}

	s.publishPeerReviewState(r.Context(), created, 0)

	writeJSON(w, http.StatusCreated, createPeerReviewResponse{
		PeerReviewID: created.ID,
		Status:       created.Status,
		ExpiresAt:    eventTime(created.ExpiresAt),
	})
}

// handleClaimPeerReview закрепляет проверку за рецензентом.
func (s *Server) handleClaimPeerReview(w http.ResponseWriter, r *http.Request) {
	p, ok := s.principalOr401(w, r)
	if !ok {
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

	s.publishPeerReviewState(r.Context(), claimed, p.UserID)

	writeJSON(w, http.StatusOK, claimPeerReviewResponse{
		PeerReviewID: claimed.ID,
		Status:       claimed.Status,
		ReviewerID:   p.UserID,
	})
}

// handleCompletePeerReview закрывает проверку: оценка 1–5 и комментарий.
func (s *Server) handleCompletePeerReview(w http.ResponseWriter, r *http.Request) {
	p, ok := s.principalOr401(w, r)
	if !ok {
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

	comment := normalizeComment(req.Comment)

	if !storage.ValidPeerGrade(req.Grade) || !storage.ValidPeerComment(comment) {
		writeError(w, domainerrors.ErrInvalidArgument)

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

	if err := peerreview.CanComplete(p.UserID, peerreview.Status(review.Status), true); err != nil {
		writeError(w, err)

		return
	}

	var completed *storage.PeerReview

	err = s.withTx(r.Context(), func(tx *sql.Tx) error {
		var err error

		completed, err = s.peerReviews.Complete(r.Context(), tx, review.ID, p.UserID, req.Grade, comment)

		return err
	})
	if err != nil {
		writeError(w, err)

		return
	}

	s.publishPeerReviewState(r.Context(), completed, p.UserID)

	writeJSON(w, http.StatusOK, completePeerReviewResponse{
		PeerReviewID: completed.ID,
		Status:       completed.Status,
		Grade:        req.Grade,
		RewardXP:     reviewerReward(req.Grade),
	})
}

// normalizeComment схлопывает пробелы в комментарии рецензента.
func normalizeComment(raw string) string {
	return strings.Join(strings.Fields(raw), " ")
}

// publishPeerReviewState отправляет смену состояния проверки автору и рецензенту.
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
