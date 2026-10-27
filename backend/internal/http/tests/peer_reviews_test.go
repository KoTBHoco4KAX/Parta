package tests

import (
	"net/http"
	"strings"
	"testing"
	"time"

	httpapi "github.com/parta/backend/internal/http"
)

// peerReviewBody собирает тело создания peer-review.
func peerReviewBody(submissionID int64, escrow int, expires time.Time) map[string]any {
	return map[string]any{
		"submission_id": submissionID,
		"escrow_amount": escrow,
		"expires_at":    expires.UTC().Format(time.RFC3339),
		"criteria_checklist": []map[string]any{
			{"code": "C1", "title": "Компилируется", "weight": 1},
			{"code": "C2", "title": "Есть тесты", "weight": 2},
		},
	}
}

// createPeerReview создаёт ревью через HTTP и возвращает его id.
func (h *harness) createPeerReview(token string, subID int64, escrow int) int64 {
	h.t.Helper()

	status, body := h.request(h.t, http.MethodPost, "/api/peer-reviews", token,
		peerReviewBody(subID, escrow, time.Now().Add(7*24*time.Hour)))
	if status != http.StatusCreated {
		h.t.Fatalf("create peer review: status = %d (%v)", status, body)
	}

	return int64(body["peer_review_id"].(float64))
}

func TestCreatePeerReviewSuccess(t *testing.T) {
	h := newHarness(t)
	ids := h.seed()

	h.topUpXP(ids.student1, 500)

	subID := h.createSubmission(ids.taskLab, ids.student1, "REVIEW")
	token := h.login(t, "student1@parta.dev")

	status, body := h.request(t, http.MethodPost, "/api/peer-reviews", token,
		peerReviewBody(subID, 100, time.Now().Add(7*24*time.Hour)))
	if status != http.StatusCreated {
		t.Fatalf("status = %d, want 201 (%v)", status, body)
	}

	if body["status"] != "CREATED" {
		t.Fatalf("status = %v, want CREATED", body["status"])
	}

	if escrow := int64(body["escrow_tx_id"].(float64)); escrow <= 0 {
		t.Fatalf("escrow_tx_id = %d", escrow)
	}

	if balance := h.scalarInt(`SELECT xp_balance FROM users WHERE id = ?`, ids.student1); balance != 400 {
		t.Fatalf("balance = %d, want 400", balance)
	}
}

func TestCreatePeerReviewInsufficientXP(t *testing.T) {
	h := newHarness(t)
	ids := h.seed()

	h.topUpXP(ids.student1, 50)

	subID := h.createSubmission(ids.taskLab, ids.student1, "REVIEW")
	token := h.login(t, "student1@parta.dev")

	status, body := h.request(t, http.MethodPost, "/api/peer-reviews", token,
		peerReviewBody(subID, 100, time.Now().Add(7*24*time.Hour)))
	if status != http.StatusUnprocessableEntity {
		t.Fatalf("status = %d, want 422 (%v)", status, body)
	}

	if body["code"] != "insufficient_xp" {
		t.Fatalf("code = %v, want insufficient_xp", body["code"])
	}
}

func TestCreatePeerReviewNotAuthor(t *testing.T) {
	h := newHarness(t)
	ids := h.seed()

	h.topUpXP(ids.student2, 500)

	subID := h.createSubmission(ids.taskLab, ids.student1, "REVIEW")
	token := h.login(t, "student2@parta.dev")

	status, body := h.request(t, http.MethodPost, "/api/peer-reviews", token,
		peerReviewBody(subID, 100, time.Now().Add(7*24*time.Hour)))
	if status != http.StatusForbidden {
		t.Fatalf("status = %d, want 403 (%v)", status, body)
	}
}

func TestCreatePeerReviewEmptyChecklist(t *testing.T) {
	h := newHarness(t)
	ids := h.seed()

	h.topUpXP(ids.student1, 500)

	subID := h.createSubmission(ids.taskLab, ids.student1, "REVIEW")
	token := h.login(t, "student1@parta.dev")

	body := peerReviewBody(subID, 100, time.Now().Add(7*24*time.Hour))
	body["criteria_checklist"] = []map[string]any{}

	status, resp := h.request(t, http.MethodPost, "/api/peer-reviews", token, body)
	if status != http.StatusUnprocessableEntity {
		t.Fatalf("status = %d, want 422 (%v)", status, resp)
	}
}

func TestCreatePeerReviewExpiredExpiry(t *testing.T) {
	h := newHarness(t)
	ids := h.seed()

	h.topUpXP(ids.student1, 500)

	subID := h.createSubmission(ids.taskLab, ids.student1, "REVIEW")
	token := h.login(t, "student1@parta.dev")

	status, body := h.request(t, http.MethodPost, "/api/peer-reviews", token,
		peerReviewBody(subID, 100, time.Now().Add(-time.Hour)))
	if status != http.StatusUnprocessableEntity {
		t.Fatalf("status = %d, want 422 (%v)", status, body)
	}

	if body["code"] != "deadline_passed" {
		t.Fatalf("code = %v, want deadline_passed", body["code"])
	}
}

func TestCreatePeerReviewDuplicateActive(t *testing.T) {
	h := newHarness(t)
	ids := h.seed()

	h.topUpXP(ids.student1, 500)

	subID := h.createSubmission(ids.taskLab, ids.student1, "REVIEW")
	token := h.login(t, "student1@parta.dev")

	h.createPeerReview(token, subID, 100)

	status, body := h.request(t, http.MethodPost, "/api/peer-reviews", token,
		peerReviewBody(subID, 100, time.Now().Add(7*24*time.Hour)))
	if status != http.StatusConflict {
		t.Fatalf("status = %d, want 409 (%v)", status, body)
	}
}

func TestClaimPeerReviewSuccess(t *testing.T) {
	h := newHarness(t)
	ids := h.seed()

	h.topUpXP(ids.student1, 500)

	subID := h.createSubmission(ids.taskLab, ids.student1, "REVIEW")
	authorToken := h.login(t, "student1@parta.dev")

	reviewID := h.createPeerReview(authorToken, subID, 100)

	reviewerToken := h.login(t, "student2@parta.dev")

	status, body := h.request(t, http.MethodPost, peerReviewClaimPath(reviewID), reviewerToken, nil)
	if status != http.StatusOK {
		t.Fatalf("status = %d, want 200 (%v)", status, body)
	}

	if body["status"] != "IN_REVIEW" {
		t.Fatalf("status = %v, want IN_REVIEW", body["status"])
	}

	if int64(body["reviewer_id"].(float64)) != ids.student2 {
		t.Fatalf("reviewer_id = %v, want %d", body["reviewer_id"], ids.student2)
	}

	accessToken, ok := body["access_token"].(string)
	if !ok || strings.Count(accessToken, ".") != 2 {
		t.Fatalf("access_token is not a JWT: %v", body["access_token"])
	}

	claims, err := httpapi.NewTokenService(testJWTSecret, time.Now).Parse(accessToken)
	if err != nil {
		t.Fatalf("parse access token: %v", err)
	}

	if claims.Scope != httpapi.ScopePeerReviewRead || claims.PeerReviewID != reviewID {
		t.Fatalf("access token claims = %+v", claims)
	}
}

func TestClaimPeerReviewOwn(t *testing.T) {
	h := newHarness(t)
	ids := h.seed()

	h.topUpXP(ids.student1, 500)

	subID := h.createSubmission(ids.taskLab, ids.student1, "REVIEW")
	token := h.login(t, "student1@parta.dev")

	reviewID := h.createPeerReview(token, subID, 100)

	status, body := h.request(t, http.MethodPost, peerReviewClaimPath(reviewID), token, nil)
	if status != http.StatusUnprocessableEntity {
		t.Fatalf("status = %d, want 422 (%v)", status, body)
	}

	if body["code"] != "guard_failed" {
		t.Fatalf("code = %v, want guard_failed", body["code"])
	}
}

func TestClaimPeerReviewTwice(t *testing.T) {
	h := newHarness(t)
	ids := h.seed()

	h.topUpXP(ids.student1, 500)

	subID := h.createSubmission(ids.taskLab, ids.student1, "REVIEW")
	authorToken := h.login(t, "student1@parta.dev")

	reviewID := h.createPeerReview(authorToken, subID, 100)

	reviewerToken := h.login(t, "student2@parta.dev")

	if status, body := h.request(t, http.MethodPost, peerReviewClaimPath(reviewID), reviewerToken, nil); status != http.StatusOK {
		t.Fatalf("first claim status = %d (%v)", status, body)
	}

	status, body := h.request(t, http.MethodPost, peerReviewClaimPath(reviewID), reviewerToken, nil)
	if status != http.StatusConflict {
		t.Fatalf("second claim status = %d, want 409 (%v)", status, body)
	}
}

func TestClaimPeerReviewNotFound(t *testing.T) {
	h := newHarness(t)
	_ = h.seed()

	token := h.login(t, "student2@parta.dev")

	status, body := h.request(t, http.MethodPost, peerReviewClaimPath(999999), token, nil)
	if status != http.StatusNotFound {
		t.Fatalf("status = %d, want 404 (%v)", status, body)
	}
}

func TestCompletePeerReviewSuccess(t *testing.T) {
	h := newHarness(t)
	ids := h.seed()

	h.topUpXP(ids.student1, 500)

	subID := h.createSubmission(ids.taskLab, ids.student1, "REVIEW")
	authorToken := h.login(t, "student1@parta.dev")

	reviewID := h.createPeerReview(authorToken, subID, 100)

	reviewerToken := h.login(t, "student2@parta.dev")

	if status, body := h.request(t, http.MethodPost, peerReviewClaimPath(reviewID), reviewerToken, nil); status != http.StatusOK {
		t.Fatalf("claim status = %d (%v)", status, body)
	}

	status, body := h.request(t, http.MethodPost, peerReviewCompletePath(reviewID), reviewerToken, map[string]any{
		"checklist_results": []map[string]any{
			{"code": "C1", "passed": true},
			{"code": "C2", "passed": false},
		},
		"summary": "В целом неплохо",
	})
	if status != http.StatusOK {
		t.Fatalf("status = %d, want 200 (%v)", status, body)
	}

	if body["status"] != "COMPLETED" {
		t.Fatalf("status = %v, want COMPLETED", body["status"])
	}

	if reward := int64(body["reward_xp"].(float64)); reward != 100 {
		t.Fatalf("reward_xp = %d, want 100", reward)
	}

	if balance := h.scalarInt(`SELECT xp_balance FROM users WHERE id = ?`, ids.student2); balance != 100 {
		t.Fatalf("reviewer balance = %d, want 100", balance)
	}
}

func TestCompletePeerReviewByAuthorForbidden(t *testing.T) {
	h := newHarness(t)
	ids := h.seed()

	h.topUpXP(ids.student1, 500)

	subID := h.createSubmission(ids.taskLab, ids.student1, "REVIEW")
	authorToken := h.login(t, "student1@parta.dev")

	reviewID := h.createPeerReview(authorToken, subID, 100)

	status, body := h.request(t, http.MethodPost, peerReviewCompletePath(reviewID), authorToken, map[string]any{
		"checklist_results": []map[string]any{{"code": "C1", "passed": true}},
	})
	if status != http.StatusForbidden {
		t.Fatalf("status = %d, want 403 (%v)", status, body)
	}
}

func TestCompletePeerReviewBeforeClaim(t *testing.T) {
	h := newHarness(t)
	ids := h.seed()

	h.topUpXP(ids.student1, 500)

	subID := h.createSubmission(ids.taskLab, ids.student1, "REVIEW")
	authorToken := h.login(t, "student1@parta.dev")

	reviewID := h.createPeerReview(authorToken, subID, 100)

	reviewerToken := h.login(t, "student2@parta.dev")

	status, body := h.request(t, http.MethodPost, peerReviewCompletePath(reviewID), reviewerToken, map[string]any{
		"checklist_results": []map[string]any{{"code": "C1", "passed": true}},
	})
	if status != http.StatusForbidden {
		t.Fatalf("status = %d, want 403 (%v)", status, body)
	}
}

func TestCompletePeerReviewUnknownCriterion(t *testing.T) {
	h := newHarness(t)
	ids := h.seed()

	h.topUpXP(ids.student1, 500)

	subID := h.createSubmission(ids.taskLab, ids.student1, "REVIEW")
	authorToken := h.login(t, "student1@parta.dev")

	reviewID := h.createPeerReview(authorToken, subID, 100)

	reviewerToken := h.login(t, "student2@parta.dev")

	if status, body := h.request(t, http.MethodPost, peerReviewClaimPath(reviewID), reviewerToken, nil); status != http.StatusOK {
		t.Fatalf("claim status = %d (%v)", status, body)
	}

	status, body := h.request(t, http.MethodPost, peerReviewCompletePath(reviewID), reviewerToken, map[string]any{
		"checklist_results": []map[string]any{{"code": "C9", "passed": true}},
	})
	if status != http.StatusUnprocessableEntity {
		t.Fatalf("status = %d, want 422 (%v)", status, body)
	}
}

func TestCompletePeerReviewEmptyResults(t *testing.T) {
	h := newHarness(t)
	ids := h.seed()

	h.topUpXP(ids.student1, 500)

	subID := h.createSubmission(ids.taskLab, ids.student1, "REVIEW")
	authorToken := h.login(t, "student1@parta.dev")

	reviewID := h.createPeerReview(authorToken, subID, 100)

	reviewerToken := h.login(t, "student2@parta.dev")

	if status, body := h.request(t, http.MethodPost, peerReviewClaimPath(reviewID), reviewerToken, nil); status != http.StatusOK {
		t.Fatalf("claim status = %d (%v)", status, body)
	}

	status, body := h.request(t, http.MethodPost, peerReviewCompletePath(reviewID), reviewerToken, map[string]any{})
	if status != http.StatusUnprocessableEntity {
		t.Fatalf("status = %d, want 422 (%v)", status, body)
	}
}

// peerReviewClaimPath собирает путь взятия ревью.
func peerReviewClaimPath(id int64) string {
	return "/api/peer-reviews/" + itoa64(id) + "/claim"
}

// peerReviewCompletePath собирает путь завершения ревью.
func peerReviewCompletePath(id int64) string {
	return "/api/peer-reviews/" + itoa64(id) + "/complete"
}
