package tests

import (
	"context"
	"math"
	"net/http"
	"testing"
	"time"
)

// answerTask создаёт задание с большим дедлайном и карточку ученика.
func (h *harness) answerTask(t *testing.T, teacherToken string, ids seedIDs, studentID int64) (taskID, submissionID int64, baseXP int) {
	t.Helper()

	deadline := time.Now().Add(20 * 24 * time.Hour).UTC().Format(time.RFC3339)

	status, body := h.request(t, http.MethodPost, "/api/tasks", teacherToken, taskBody(ids.assignment21, map[string]any{
		"task_type":   "LAB_CODE",
		"deadline_at": deadline,
	}))
	if status != http.StatusCreated {
		t.Fatalf("create task = %d %v", status, body)
	}

	taskID = int64(body["task_id"].(float64))
	baseXP = int(body["base_xp_computed"].(float64))
	submissionID = h.createSubmission(taskID, studentID, "IN_PROGRESS")

	return taskID, submissionID, baseXP
}

func (h *harness) userBalance(t *testing.T, userID int64) (balance, weekly int) {
	t.Helper()

	if err := h.db.QueryRowContext(context.Background(),
		`SELECT xp_balance, weekly_xp FROM users WHERE id = ?`, userID).
		Scan(&balance, &weekly); err != nil {
		t.Fatalf("read balance: %v", err)
	}

	return balance, weekly
}

func TestAnswerEscrowPoolUsesTimeAndSpamBonuses(t *testing.T) {
	h := newHarness(t)
	ids := h.seed()
	studentToken := h.login(t, "student1@parta.dev")
	teacherToken := h.login(t, "teacher@parta.dev")

	_, submissionID, baseXP := h.answerTask(t, teacherToken, ids, ids.student1)

	status, body := h.request(t, http.MethodPost, "/api/answers/drafts", studentToken, map[string]any{
		"submission_id": submissionID,
		"text":          "Черновик с вопросом по нормализации",
	})
	if status != http.StatusCreated {
		t.Fatalf("create draft = %d %v", status, body)
	}

	// Дедлайн больше 48 часов, первый запрос за неделю: 25%.
	if body["escrow_percent"] != float64(25) {
		t.Fatalf("escrow_percent = %v, want 25", body["escrow_percent"])
	}

	wantPool := int(math.Round(float64(baseXP) * 0.25))
	if body["escrow_pool_xp"] != float64(wantPool) {
		t.Fatalf("escrow_pool_xp = %v, want %d", body["escrow_pool_xp"], wantPool)
	}

	status, overview := h.request(t, http.MethodGet, "/api/answers", studentToken, nil)
	if status != http.StatusOK {
		t.Fatalf("answers overview = %d %v", status, overview)
	}
}

func TestAnswerTwoCommentsAndAcceptPaysReviewers(t *testing.T) {
	h := newHarness(t)
	ids := h.seed()

	authorToken := h.login(t, "student1@parta.dev")
	reviewerToken := h.login(t, "student2@parta.dev")
	secondToken := h.login(t, "student3@parta.dev")
	teacherToken := h.login(t, "teacher@parta.dev")

	_, submissionID, baseXP := h.answerTask(t, teacherToken, ids, ids.student1)

	status, body := h.request(t, http.MethodPost, "/api/answers/drafts", authorToken, map[string]any{
		"submission_id": submissionID,
		"text":          "Черновик",
	})
	if status != http.StatusCreated {
		t.Fatalf("create draft = %d %v", status, body)
	}

	poolXP := int(body["escrow_pool_xp"].(float64))

	// Проверяющий не может взять собственную работу.
	status, own := h.request(t, http.MethodGet, "/api/answers/queue/next", authorToken, nil)
	if status != http.StatusOK || own["draft"] != nil {
		t.Fatalf("author queue = %d %v, want empty", status, own)
	}

	status, queue := h.request(t, http.MethodGet, "/api/answers/queue/next", reviewerToken, nil)
	if status != http.StatusOK {
		t.Fatalf("queue = %d %v", status, queue)
	}

	draft, ok := queue["draft"].(map[string]any)
	if !ok || draft == nil {
		t.Fatalf("queue draft = %v, want object", queue["draft"])
	}

	draftID := int64(draft["id"].(float64))

	status, body = h.request(t, http.MethodPost, "/api/answers/drafts/"+itoa64(draftID)+"/comments", reviewerToken, map[string]any{
		"text": "Добавьте миграции",
	})
	if status != http.StatusCreated {
		t.Fatalf("first comment = %d %v", status, body)
	}

	status, body = h.request(t, http.MethodPost, "/api/answers/drafts/"+itoa64(draftID)+"/comments", secondToken, map[string]any{
		"text": "Проверьте 3НФ",
	})
	if status != http.StatusCreated {
		t.Fatalf("second comment = %d %v", status, body)
	}

	// Третьего комментария быть не может.
	status, _ = h.request(t, http.MethodPost, "/api/answers/drafts/"+itoa64(draftID)+"/comments", authorToken, map[string]any{
		"text": "третьим не получится",
	})
	if status == http.StatusCreated {
		t.Fatalf("third comment accepted")
	}

	// Автор видит два отзыва и ставит лайки.
	status, overview := h.request(t, http.MethodGet, "/api/answers", authorToken, nil)
	if status != http.StatusOK {
		t.Fatalf("overview = %d %v", status, overview)
	}

	drafts, ok := overview["drafts"].([]any)
	if !ok || len(drafts) != 1 {
		t.Fatalf("drafts = %v", overview["drafts"])
	}

	draftView := drafts[0].(map[string]any)
	comments := draftView["comments"].([]any)
	if len(comments) != 2 {
		t.Fatalf("comments = %d, want 2", len(comments))
	}

	for _, raw := range comments {
		comment := raw.(map[string]any)
		commentID := int64(comment["id"].(float64))

		status, body = h.request(t, http.MethodPost, "/api/answers/comments/"+itoa64(commentID)+"/reaction", authorToken, map[string]any{
			"reaction": "LIKE",
		})
		if status != http.StatusOK {
			t.Fatalf("reaction = %d %v", status, body)
		}
	}

	h.advanceSubmission(submissionID, ids.student1, "REVIEW")

	authorBalanceBefore, authorWeeklyBefore := h.userBalance(t, ids.student1)
	balanceBefore, weeklyBefore := h.userBalance(t, ids.student2)

	status, verdict := h.request(t, http.MethodPost, "/api/submissions/"+itoa64(submissionID)+"/verdict", teacherToken, map[string]any{
		"verdict": "ACCEPT",
	})
	if status != http.StatusOK {
		t.Fatalf("verdict = %d %v", status, verdict)
	}

	// Оба лайка: по 75% пула каждому.
	share := int(math.Round(float64(poolXP) * 0.75))

	balanceAfter, weeklyAfter := h.userBalance(t, ids.student2)
	if balanceAfter-balanceBefore != share {
		t.Fatalf("reviewer balance delta = %d, want %d", balanceAfter-balanceBefore, share)
	}

	if weeklyAfter-weeklyBefore != share {
		t.Fatalf("reviewer weekly delta = %d, want %d", weeklyAfter-weeklyBefore, share)
	}

	// Автор получает итоговый XP минус обе выплаты.
	finalBefore := int(math.Round(float64(baseXP) * 1.5))
	wantAuthor := finalBefore - 2*share
	if verdict["xp_awarded"] != float64(wantAuthor) {
		t.Fatalf("author xp = %v, want %d", verdict["xp_awarded"], wantAuthor)
	}

	authorBalanceAfter, authorWeeklyAfter := h.userBalance(t, ids.student1)
	if authorBalanceAfter-authorBalanceBefore != wantAuthor {
		t.Fatalf("author balance delta = %d, want %d", authorBalanceAfter-authorBalanceBefore, wantAuthor)
	}

	if authorWeeklyAfter-authorWeeklyBefore != wantAuthor {
		t.Fatalf("author weekly delta = %d, want %d", authorWeeklyAfter-authorWeeklyBefore, wantAuthor)
	}
}

func TestAnswerRejectPaysNobody(t *testing.T) {
	h := newHarness(t)
	ids := h.seed()

	authorToken := h.login(t, "student1@parta.dev")
	reviewerToken := h.login(t, "student2@parta.dev")
	teacherToken := h.login(t, "teacher@parta.dev")

	_, submissionID, _ := h.answerTask(t, teacherToken, ids, ids.student1)

	status, body := h.request(t, http.MethodPost, "/api/answers/drafts", authorToken, map[string]any{
		"submission_id": submissionID,
		"text":          "Черновик",
	})
	if status != http.StatusCreated {
		t.Fatalf("create draft = %d %v", status, body)
	}

	status, queue := h.request(t, http.MethodGet, "/api/answers/queue/next", reviewerToken, nil)
	if status != http.StatusOK {
		t.Fatalf("queue = %d %v", status, queue)
	}

	draft := queue["draft"].(map[string]any)
	draftID := int64(draft["id"].(float64))

	status, _ = h.request(t, http.MethodPost, "/api/answers/drafts/"+itoa64(draftID)+"/comments", reviewerToken, map[string]any{
		"text": "Не хватает деталей",
	})
	if status != http.StatusCreated {
		t.Fatalf("comment = %d", status)
	}

	h.advanceSubmission(submissionID, ids.student1, "REVIEW")

	balanceBefore, weeklyBefore := h.userBalance(t, ids.student2)

	status, body = h.request(t, http.MethodPost, "/api/submissions/"+itoa64(submissionID)+"/verdict", teacherToken, map[string]any{
		"verdict": "REJECT",
		"comment": "Верните на доработку",
	})
	if status != http.StatusOK {
		t.Fatalf("reject = %d %v", status, body)
	}

	balanceAfter, weeklyAfter := h.userBalance(t, ids.student2)
	if balanceAfter != balanceBefore || weeklyAfter != weeklyBefore {
		t.Fatalf("reviewer changed on reject: %d/%d -> %d/%d", balanceBefore, weeklyBefore, balanceAfter, weeklyAfter)
	}
}
