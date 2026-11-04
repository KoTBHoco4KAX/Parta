package tests

import (
	"net/http"
	"testing"
	"time"
)

// peerReviewBody собирает тело запроса на взаимопроверку.
func peerReviewBody(submissionID int64) map[string]any {
	return map[string]any{
		"submission_id": submissionID,
		"expires_at":    time.Now().Add(7 * 24 * time.Hour).UTC().Format(time.RFC3339),
	}
}

// createPeerReview создаёт запрос на взаимопроверку через HTTP и возвращает id.
func (h *harness) createPeerReview(token string, subID int64) int64 {
	h.t.Helper()

	status, body := h.request(h.t, http.MethodPost, "/api/peer-reviews", token, peerReviewBody(subID))
	if status != http.StatusCreated {
		h.t.Fatalf("create peer review: status = %d (%v)", status, body)
	}

	return int64(body["peer_review_id"].(float64))
}

func TestCreatePeerReviewSuccess(t *testing.T) {
	h := newHarness(t)
	ids := h.seed()

	subID := h.createSubmission(ids.taskLab, ids.student1, "REVIEW")
	token := h.login(t, "student1@parta.dev")

	status, body := h.request(t, http.MethodPost, "/api/peer-reviews", token, peerReviewBody(subID))
	if status != http.StatusCreated {
		t.Fatalf("status = %d, want 201 (%v)", status, body)
	}

	if body["status"] != "CREATED" {
		t.Fatalf("status = %v, want CREATED", body["status"])
	}

	if expires, _ := body["expires_at"].(string); expires == "" {
		t.Fatalf("expires_at missing: %v", body)
	}

	// Взаимопроверка бесплатна: баланс не меняется.
	if balance := h.scalarInt(`SELECT xp_balance FROM users WHERE id = ?`, ids.student1); balance != 0 {
		t.Fatalf("balance = %d, want 0", balance)
	}
}

func TestCreatePeerReviewNotAuthor(t *testing.T) {
	h := newHarness(t)
	ids := h.seed()

	subID := h.createSubmission(ids.taskLab, ids.student1, "REVIEW")
	token := h.login(t, "student2@parta.dev")

	status, body := h.request(t, http.MethodPost, "/api/peer-reviews", token, peerReviewBody(subID))
	if status != http.StatusForbidden {
		t.Fatalf("status = %d, want 403 (%v)", status, body)
	}
}

func TestCreatePeerReviewExpiredExpiry(t *testing.T) {
	h := newHarness(t)
	ids := h.seed()

	subID := h.createSubmission(ids.taskLab, ids.student1, "REVIEW")
	token := h.login(t, "student1@parta.dev")

	status, body := h.request(t, http.MethodPost, "/api/peer-reviews", token, map[string]any{
		"submission_id": subID,
		"expires_at":    time.Now().Add(-time.Hour).UTC().Format(time.RFC3339),
	})
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

	subID := h.createSubmission(ids.taskLab, ids.student1, "REVIEW")
	token := h.login(t, "student1@parta.dev")

	h.createPeerReview(token, subID)

	status, body := h.request(t, http.MethodPost, "/api/peer-reviews", token, peerReviewBody(subID))
	if status != http.StatusConflict {
		t.Fatalf("status = %d, want 409 (%v)", status, body)
	}
}

func TestCreatePeerReviewBeforeSending(t *testing.T) {
	h := newHarness(t)
	ids := h.seed()

	subID := h.createSubmission(ids.taskLab, ids.student1, "TODO")
	token := h.login(t, "student1@parta.dev")

	status, body := h.request(t, http.MethodPost, "/api/peer-reviews", token, peerReviewBody(subID))
	if status != http.StatusConflict {
		t.Fatalf("status = %d, want 409 (%v)", status, body)
	}
}

func TestClaimPeerReviewSuccess(t *testing.T) {
	h := newHarness(t)
	ids := h.seed()

	subID := h.createSubmission(ids.taskLab, ids.student1, "REVIEW")
	authorToken := h.login(t, "student1@parta.dev")

	reviewID := h.createPeerReview(authorToken, subID)

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
}

func TestClaimPeerReviewOwn(t *testing.T) {
	h := newHarness(t)
	ids := h.seed()

	subID := h.createSubmission(ids.taskLab, ids.student1, "REVIEW")
	token := h.login(t, "student1@parta.dev")

	reviewID := h.createPeerReview(token, subID)

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

	subID := h.createSubmission(ids.taskLab, ids.student1, "REVIEW")
	authorToken := h.login(t, "student1@parta.dev")

	reviewID := h.createPeerReview(authorToken, subID)

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

	subID := h.createSubmission(ids.taskLab, ids.student1, "REVIEW")
	authorToken := h.login(t, "student1@parta.dev")

	reviewID := h.createPeerReview(authorToken, subID)

	reviewerToken := h.login(t, "student2@parta.dev")

	if status, body := h.request(t, http.MethodPost, peerReviewClaimPath(reviewID), reviewerToken, nil); status != http.StatusOK {
		t.Fatalf("claim status = %d (%v)", status, body)
	}

	status, body := h.request(t, http.MethodPost, peerReviewCompletePath(reviewID), reviewerToken, map[string]any{
		"grade":   4,
		"comment": "Хорошая работа: всё компилируется, но тестов мало",
	})
	if status != http.StatusOK {
		t.Fatalf("status = %d, want 200 (%v)", status, body)
	}

	if body["status"] != "COMPLETED" {
		t.Fatalf("status = %v, want COMPLETED", body["status"])
	}

	if grade := int64(body["grade"].(float64)); grade != 4 {
		t.Fatalf("grade = %d, want 4", grade)
	}

	// Награда — только после приёмки работы учителем.
	if balance := h.scalarInt(`SELECT xp_balance FROM users WHERE id = ?`, ids.student2); balance != 0 {
		t.Fatalf("reviewer balance = %d, want 0 before teacher verdict", balance)
	}
}

func TestCompletePeerReviewByAuthorForbidden(t *testing.T) {
	h := newHarness(t)
	ids := h.seed()

	subID := h.createSubmission(ids.taskLab, ids.student1, "REVIEW")
	authorToken := h.login(t, "student1@parta.dev")

	reviewID := h.createPeerReview(authorToken, subID)

	status, body := h.request(t, http.MethodPost, peerReviewCompletePath(reviewID), authorToken, map[string]any{
		"grade": 5, "comment": "сам себя не похвалишь",
	})
	if status != http.StatusForbidden {
		t.Fatalf("status = %d, want 403 (%v)", status, body)
	}
}

func TestCompletePeerReviewBeforeClaim(t *testing.T) {
	h := newHarness(t)
	ids := h.seed()

	subID := h.createSubmission(ids.taskLab, ids.student1, "REVIEW")
	authorToken := h.login(t, "student1@parta.dev")

	reviewID := h.createPeerReview(authorToken, subID)

	reviewerToken := h.login(t, "student2@parta.dev")

	status, body := h.request(t, http.MethodPost, peerReviewCompletePath(reviewID), reviewerToken, map[string]any{
		"grade": 3, "comment": "работа не взята",
	})
	if status != http.StatusForbidden {
		t.Fatalf("status = %d, want 403 (%v)", status, body)
	}
}

// TestCompletePeerReviewRejectsBadFeedback: оценка строго 1–5, комментарий
// непустой и не длиннее 100 символов.
func TestCompletePeerReviewRejectsBadFeedback(t *testing.T) {
	h := newHarness(t)
	ids := h.seed()

	subID := h.createSubmission(ids.taskLab, ids.student1, "REVIEW")
	authorToken := h.login(t, "student1@parta.dev")

	reviewID := h.createPeerReview(authorToken, subID)

	reviewerToken := h.login(t, "student2@parta.dev")

	if status, body := h.request(t, http.MethodPost, peerReviewClaimPath(reviewID), reviewerToken, nil); status != http.StatusOK {
		t.Fatalf("claim status = %d (%v)", status, body)
	}

	long := make([]rune, 101)
	for i := range long {
		long[i] = 'я'
	}

	cases := map[string]map[string]any{
		"grade zero":   {"grade": 0, "comment": "норм"},
		"grade six":    {"grade": 6, "comment": "норм"},
		"empty body":   {},
		"no comment":   {"grade": 3},
		"long comment": {"grade": 3, "comment": string(long)},
	}

	for name, payload := range cases {
		t.Run(name, func(t *testing.T) {
			status, body := h.request(t, http.MethodPost, peerReviewCompletePath(reviewID), reviewerToken, payload)
			if status != http.StatusUnprocessableEntity {
				t.Fatalf("status = %d, want 422 (%v)", status, body)
			}
		})
	}
}

// TestVerdictUsesPeerGradeForAuthorXP: оценка рецензента занижает XP автора,
// а рецензент получает награду после приёмки учителем.
func TestVerdictUsesPeerGradeForAuthorXP(t *testing.T) {
	h := newHarness(t)
	ids := h.seed()

	subID := h.createSubmission(ids.taskLab, ids.student1, "REVIEW")
	authorToken := h.login(t, "student1@parta.dev")

	reviewID := h.createPeerReview(authorToken, subID)

	reviewerToken := h.login(t, "student2@parta.dev")

	if status, body := h.request(t, http.MethodPost, peerReviewClaimPath(reviewID), reviewerToken, nil); status != http.StatusOK {
		t.Fatalf("claim status = %d (%v)", status, body)
	}

	if status, body := h.request(t, http.MethodPost, peerReviewCompletePath(reviewID), reviewerToken, map[string]any{
		"grade": 1, "comment": "не хватает тестов",
	}); status != http.StatusOK {
		t.Fatalf("complete status = %d (%v)", status, body)
	}

	teacherToken := h.login(t, "teacher@parta.dev")

	status, body := h.request(t, http.MethodPost, verdictPath(subID), teacherToken, map[string]any{"verdict": "ACCEPT"})
	if status != http.StatusOK {
		t.Fatalf("verdict status = %d (%v)", status, body)
	}

	baseXP := h.scalarInt(`SELECT base_xp_computed FROM tasks WHERE id = ?`, ids.taskLab)
	authorXP := int64(body["xp_awarded"].(float64))

	// 1★ — половина XP за сдачу (эта сдача прошла в спидран-окно: ×1.5).
	if want := baseXP * 3 / 4; authorXP < want-1 || authorXP > want+1 {
		t.Fatalf("xp_awarded = %d, want ≈ %d (×1.5 спидран, затем ×0.5 за 1★)", authorXP, want)
	}

	if reward := int64(body["reward_xp"].(float64)); reward != 10 {
		t.Fatalf("reward_xp = %d, want 10 (10 × 1★)", reward)
	}

	if balance := h.scalarInt(`SELECT xp_balance FROM users WHERE id = ?`, ids.student2); balance != 10 {
		t.Fatalf("reviewer balance = %d, want 10", balance)
	}
}

// peerReviewClaimPath собирает путь взятия проверки.
func peerReviewClaimPath(id int64) string {
	return "/api/peer-reviews/" + itoa64(id) + "/claim"
}

// peerReviewCompletePath собирает путь завершения проверки.
func peerReviewCompletePath(id int64) string {
	return "/api/peer-reviews/" + itoa64(id) + "/complete"
}
