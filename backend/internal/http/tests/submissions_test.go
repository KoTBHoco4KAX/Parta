package tests

import (
	"encoding/json"
	"net/http"
	"testing"
	"time"
)

func TestCreateSubmissionIdempotent(t *testing.T) {
	h := newHarness(t)
	ids := h.seed()
	token := h.login(t, "student1@parta.dev")

	body := map[string]any{"task_id": ids.taskLab}

	status, first := h.request(t, http.MethodPost, "/api/submissions", token, body)
	if status != http.StatusCreated {
		t.Fatalf("first status = %d, want 201 (%v)", status, first)
	}

	status, second := h.request(t, http.MethodPost, "/api/submissions", token, body)
	if status != http.StatusOK {
		t.Fatalf("second status = %d, want 200 (%v)", status, second)
	}

	if first["submission_id"] != second["submission_id"] {
		t.Fatalf("ids differ: %v vs %v", first["submission_id"], second["submission_id"])
	}

	if first["status"] != "TODO" {
		t.Fatalf("status = %v, want TODO", first["status"])
	}
}

func TestCreateSubmissionForeignGroupForbidden(t *testing.T) {
	h := newHarness(t)
	ids := h.seed()
	token := h.login(t, "student3@parta.dev")

	status, body := h.request(t, http.MethodPost, "/api/submissions", token, map[string]any{"task_id": ids.taskLab})
	if status != http.StatusForbidden {
		t.Fatalf("status = %d, want 403 (%v)", status, body)
	}
}

func TestCreateSubmissionForTeamSlot(t *testing.T) {
	h := newHarness(t)
	ids := h.seed()

	h.exec(`UPDATE team_slots SET assigned_user_id = ?, status = 'CLAIMED' WHERE id = ?`, ids.student1, ids.slotDB)

	token := h.login(t, "student1@parta.dev")
	body := map[string]any{"task_id": ids.taskTeam, "team_slot_id": ids.slotDB}

	status, created := h.request(t, http.MethodPost, "/api/submissions", token, body)
	if status != http.StatusCreated {
		t.Fatalf("status = %d, want 201 (%v)", status, created)
	}

	status, repeated := h.request(t, http.MethodPost, "/api/submissions", token, body)
	if status != http.StatusOK {
		t.Fatalf("repeat status = %d, want 200 (%v)", status, repeated)
	}

	if created["submission_id"] != repeated["submission_id"] {
		t.Fatalf("ids differ: %v vs %v", created["submission_id"], repeated["submission_id"])
	}

	slotID := h.scalarInt(`SELECT team_slot_id FROM submissions WHERE id = ?`,
		int64(created["submission_id"].(float64)))
	if slotID != ids.slotDB {
		t.Fatalf("team_slot_id = %d, want %d", slotID, ids.slotDB)
	}
}

func TestCreateSubmissionForForeignTeamSlot(t *testing.T) {
	h := newHarness(t)
	ids := h.seed()

	h.exec(`UPDATE team_slots SET assigned_user_id = ?, status = 'CLAIMED' WHERE id = ?`, ids.student2, ids.slotDB)

	token := h.login(t, "student1@parta.dev")

	status, body := h.request(t, http.MethodPost, "/api/submissions", token, map[string]any{
		"task_id":      ids.taskTeam,
		"team_slot_id": ids.slotDB,
	})
	if status != http.StatusForbidden {
		t.Fatalf("status = %d, want 403 (%v)", status, body)
	}
}

func TestSubmissionStatusStart(t *testing.T) {
	h := newHarness(t)
	ids := h.seed()
	token := h.login(t, "student1@parta.dev")

	subID := h.createSubmission(ids.taskLab, ids.student1, "TODO")

	status, body := h.request(t, http.MethodPatch, submissionPath(subID), token, map[string]any{"event": "START"})
	if status != http.StatusOK {
		t.Fatalf("status = %d, want 200 (%v)", status, body)
	}

	if body["status"] != "IN_PROGRESS" {
		t.Fatalf("status = %v, want IN_PROGRESS", body["status"])
	}
}

func TestSubmissionStatusSubmitRequiresArtifact(t *testing.T) {
	h := newHarness(t)
	ids := h.seed()
	token := h.login(t, "student1@parta.dev")

	subID := h.createSubmission(ids.taskLab, ids.student1, "IN_PROGRESS")

	status, body := h.request(t, http.MethodPatch, submissionPath(subID), token, map[string]any{"event": "SUBMIT"})
	if status != http.StatusUnprocessableEntity {
		t.Fatalf("status = %d, want 422 (%v)", status, body)
	}

	if body["code"] != "invalid_argument" {
		t.Fatalf("code = %v", body["code"])
	}
}

func TestSubmissionStatusSubmit(t *testing.T) {
	h := newHarness(t)
	ids := h.seed()
	token := h.login(t, "student1@parta.dev")

	subID := h.createSubmission(ids.taskLab, ids.student1, "IN_PROGRESS")

	status, body := h.request(t, http.MethodPatch, submissionPath(subID), token, map[string]any{
		"event":         "SUBMIT",
		"artifact_url":  "https://parta.local/report.pdf",
		"artifact_hash": "sha256:abc123",
	})
	if status != http.StatusOK {
		t.Fatalf("status = %d, want 200 (%v)", status, body)
	}

	if body["status"] != "REVIEW" {
		t.Fatalf("status = %v, want REVIEW", body["status"])
	}

	if body["submitted_at"] == nil {
		t.Fatalf("submitted_at missing in %v", body)
	}

	if got := h.scalarString(`SELECT artifact_hash FROM submissions WHERE id = ?`, subID); got != "sha256:abc123" {
		t.Fatalf("stored artifact_hash = %q", got)
	}
}

func TestSubmissionStatusForeignStudentForbidden(t *testing.T) {
	h := newHarness(t)
	ids := h.seed()

	subID := h.createSubmission(ids.taskLab, ids.student1, "TODO")
	token := h.login(t, "student2@parta.dev")

	status, body := h.request(t, http.MethodPatch, submissionPath(subID), token, map[string]any{"event": "START"})
	if status != http.StatusForbidden {
		t.Fatalf("status = %d, want 403 (%v)", status, body)
	}
}

func TestSubmissionStatusRoleForbiddenForTeacher(t *testing.T) {
	h := newHarness(t)
	ids := h.seed()

	subID := h.createSubmission(ids.taskLab, ids.student1, "TODO")
	token := h.login(t, "teacher@parta.dev")

	status, body := h.request(t, http.MethodPatch, submissionPath(subID), token, map[string]any{"event": "START"})
	if status != http.StatusForbidden {
		t.Fatalf("status = %d, want 403 (%v)", status, body)
	}
}

func TestSubmissionStatusInvalidTransition(t *testing.T) {
	h := newHarness(t)
	ids := h.seed()

	subID := h.createSubmission(ids.taskLab, ids.student1, "TODO")
	token := h.login(t, "student1@parta.dev")

	status, body := h.request(t, http.MethodPatch, submissionPath(subID), token, map[string]any{"event": "SUBMIT"})
	if status != http.StatusConflict {
		t.Fatalf("status = %d, want 409 (%v)", status, body)
	}

	status, body = h.request(t, http.MethodPatch, submissionPath(subID), token, map[string]any{"event": "UNKNOWN"})
	if status != http.StatusConflict {
		t.Fatalf("unknown event status = %d, want 409 (%v)", status, body)
	}
}

func TestSubmissionStatusNotFound(t *testing.T) {
	h := newHarness(t)
	_ = h.seed()
	token := h.login(t, "student1@parta.dev")

	status, body := h.request(t, http.MethodPatch, submissionPath(999999), token, map[string]any{"event": "START"})
	if status != http.StatusNotFound {
		t.Fatalf("status = %d, want 404 (%v)", status, body)
	}
}

func TestVerdictAccept(t *testing.T) {
	h := newHarness(t)
	ids := h.seed()

	subID := h.createSubmission(ids.taskLab, ids.student1, "REVIEW")
	token := h.login(t, "teacher@parta.dev")

	status, body := h.request(t, http.MethodPost, verdictPath(subID), token, map[string]any{
		"verdict": "ACCEPT",
		"comment": "Зачтено",
	})
	if status != http.StatusOK {
		t.Fatalf("status = %d, want 200 (%v)", status, body)
	}

	if body["status"] != "DONE" {
		t.Fatalf("status = %v, want DONE", body["status"])
	}

	// База 400 XP и speedrun-множитель 1.5.
	if xp := int64(body["xp_awarded"].(float64)); xp != 600 {
		t.Fatalf("xp_awarded = %d, want 600", xp)
	}

	if streakAfter := int64(body["streak_after"].(float64)); streakAfter != 1 {
		t.Fatalf("streak_after = %d, want 1", streakAfter)
	}

	if ledgerID := int64(body["ledger_id"].(float64)); ledgerID <= 0 {
		t.Fatalf("ledger_id = %d", ledgerID)
	}

	if balance := h.scalarInt(`SELECT xp_balance FROM users WHERE id = ?`, ids.student1); balance != 600 {
		t.Fatalf("balance = %d, want 600", balance)
	}

	if got := h.scalarString(`SELECT reason FROM xp_ledger WHERE user_id = ? ORDER BY id DESC LIMIT 1`, ids.student1); got != "SPEEDRUN_BONUS" {
		t.Fatalf("ledger reason = %q, want SPEEDRUN_BONUS", got)
	}

	if streak := h.scalarInt(`SELECT on_time_streak FROM users WHERE id = ?`, ids.student1); streak != 1 {
		t.Fatalf("stored streak = %d, want 1", streak)
	}

	if got := h.scalarString(`SELECT status FROM submissions WHERE id = ?`, subID); got != "DONE" {
		t.Fatalf("stored status = %q", got)
	}
}

func TestVerdictAcceptResolvesWager(t *testing.T) {
	h := newHarness(t)
	ids := h.seed()

	h.topUpXP(ids.student1, 500)

	studentToken := h.login(t, "student1@parta.dev")

	status, wagerBody := h.request(t, http.MethodPost, "/api/wagers", studentToken, map[string]any{
		"task_id":      ids.taskLab,
		"stake_amount": 100,
		"deadline_at":  time.Now().Add(10 * 24 * time.Hour).UTC().Format(time.RFC3339),
	})
	if status != http.StatusCreated {
		t.Fatalf("wager status = %d, want 201 (%v)", status, wagerBody)
	}

	wagerID := int64(wagerBody["wager_id"].(float64))

	subID := h.createSubmission(ids.taskLab, ids.student1, "REVIEW")
	teacherToken := h.login(t, "teacher@parta.dev")

	status, body := h.request(t, http.MethodPost, verdictPath(subID), teacherToken, map[string]any{"verdict": "ACCEPT"})
	if status != http.StatusOK {
		t.Fatalf("verdict status = %d, want 200 (%v)", status, body)
	}

	if got := h.scalarString(`SELECT status FROM wagers WHERE id = ?`, wagerID); got != "WON" {
		t.Fatalf("wager status = %q, want WON", got)
	}

	// 500 - 100 escrow + 600 XP + 200 выплата.
	if balance := h.scalarInt(`SELECT xp_balance FROM users WHERE id = ?`, ids.student1); balance != 1200 {
		t.Fatalf("balance = %d, want 1200", balance)
	}
}

func TestVerdictAcceptMissedDeadlineConsumesFreeze(t *testing.T) {
	h := newHarness(t)
	ids := h.seed()

	// Дедлайн в прошлом, но сдача укладывается в late-окно GuardSubmit.
	deadline := time.Now().Add(-24 * time.Hour)
	h.exec(`UPDATE tasks SET created_at = ?, deadline_at = ? WHERE id = ?`,
		time.Now().Add(-10*24*time.Hour).UTC().Format("2006-01-02T15:04:05.000Z"),
		deadline.UTC().Format("2006-01-02T15:04:05.000Z"), ids.taskLab)

	h.exec(`UPDATE users SET streak_freezes = 1 WHERE id = ?`, ids.student1)

	subID := h.createSubmission(ids.taskLab, ids.student1, "REVIEW")
	token := h.login(t, "teacher@parta.dev")

	status, body := h.request(t, http.MethodPost, verdictPath(subID), token, map[string]any{"verdict": "ACCEPT"})
	if status != http.StatusOK {
		t.Fatalf("status = %d, want 200 (%v)", status, body)
	}

	if xp := int64(body["xp_awarded"].(float64)); xp != 200 {
		t.Fatalf("xp_awarded = %d, want 200 (late multiplier)", xp)
	}

	if got := h.scalarString(`SELECT reason FROM xp_ledger WHERE user_id = ? ORDER BY id DESC LIMIT 1`, ids.student1); got != "TASK_BASE" {
		t.Fatalf("reason = %q, want TASK_BASE", got)
	}

	if freezes := h.scalarInt(`SELECT streak_freezes FROM users WHERE id = ?`, ids.student1); freezes != 0 {
		t.Fatalf("freezes = %d, want 0 after freeze applied", freezes)
	}

	if streak := h.scalarInt(`SELECT on_time_streak FROM users WHERE id = ?`, ids.student1); streak != 0 {
		t.Fatalf("streak = %d, want 0", streak)
	}
}

func TestVerdictRejectAndReopen(t *testing.T) {
	h := newHarness(t)
	ids := h.seed()

	subID := h.createSubmission(ids.taskLab, ids.student1, "REVIEW")
	teacherToken := h.login(t, "teacher@parta.dev")

	status, body := h.request(t, http.MethodPost, verdictPath(subID), teacherToken, map[string]any{
		"verdict": "REJECT",
		"comment": "Нет тестов",
	})
	if status != http.StatusOK {
		t.Fatalf("status = %d, want 200 (%v)", status, body)
	}

	if body["status"] != "REJECTED" {
		t.Fatalf("status = %v, want REJECTED", body["status"])
	}

	var revisions []map[string]any

	raw := h.scalarString(`SELECT revision_log FROM submissions WHERE id = ?`, subID)
	if err := json.Unmarshal([]byte(raw), &revisions); err != nil {
		t.Fatalf("revision_log is not JSON: %v (%q)", err, raw)
	}

	if len(revisions) != 1 || revisions[0]["comment"] != "Нет тестов" {
		t.Fatalf("revision_log = %v", revisions)
	}

	studentToken := h.login(t, "student1@parta.dev")

	status, body = h.request(t, http.MethodPatch, submissionPath(subID), studentToken, map[string]any{"event": "REOPEN"})
	if status != http.StatusOK {
		t.Fatalf("reopen status = %d, want 200 (%v)", status, body)
	}

	if body["status"] != "IN_PROGRESS" {
		t.Fatalf("reopen status = %v", body["status"])
	}
}

func TestVerdictRejectRequiresComment(t *testing.T) {
	h := newHarness(t)
	ids := h.seed()

	subID := h.createSubmission(ids.taskLab, ids.student1, "REVIEW")
	token := h.login(t, "teacher@parta.dev")

	status, body := h.request(t, http.MethodPost, verdictPath(subID), token, map[string]any{"verdict": "REJECT"})
	if status != http.StatusUnprocessableEntity {
		t.Fatalf("status = %d, want 422 (%v)", status, body)
	}
}

func TestVerdictInvalidValue(t *testing.T) {
	h := newHarness(t)
	ids := h.seed()

	subID := h.createSubmission(ids.taskLab, ids.student1, "REVIEW")
	token := h.login(t, "teacher@parta.dev")

	status, body := h.request(t, http.MethodPost, verdictPath(subID), token, map[string]any{"verdict": "MAYBE"})
	if status != http.StatusUnprocessableEntity {
		t.Fatalf("status = %d, want 422 (%v)", status, body)
	}
}

func TestVerdictForeignTeacherForbidden(t *testing.T) {
	h := newHarness(t)
	ids := h.seed()

	subID := h.createSubmission(ids.taskLab, ids.student1, "REVIEW")

	h.addTeacher("teacher2@parta.dev")
	token := h.login(t, "teacher2@parta.dev")

	status, body := h.request(t, http.MethodPost, verdictPath(subID), token, map[string]any{"verdict": "ACCEPT"})
	if status != http.StatusForbidden {
		t.Fatalf("status = %d, want 403 (%v)", status, body)
	}
}

func TestVerdictStudentForbidden(t *testing.T) {
	h := newHarness(t)
	ids := h.seed()

	subID := h.createSubmission(ids.taskLab, ids.student1, "REVIEW")
	token := h.login(t, "student1@parta.dev")

	status, body := h.request(t, http.MethodPost, verdictPath(subID), token, map[string]any{"verdict": "ACCEPT"})
	if status != http.StatusForbidden {
		t.Fatalf("status = %d, want 403 (%v)", status, body)
	}
}

func TestVerdictWrongState(t *testing.T) {
	h := newHarness(t)
	ids := h.seed()

	subID := h.createSubmission(ids.taskLab, ids.student1, "TODO")
	token := h.login(t, "teacher@parta.dev")

	status, body := h.request(t, http.MethodPost, verdictPath(subID), token, map[string]any{"verdict": "ACCEPT"})
	if status != http.StatusConflict {
		t.Fatalf("status = %d, want 409 (%v)", status, body)
	}

	if body["code"] != "invalid_transition" {
		t.Fatalf("code = %v", body["code"])
	}
}

func TestVerdictNotFound(t *testing.T) {
	h := newHarness(t)
	_ = h.seed()
	token := h.login(t, "teacher@parta.dev")

	status, body := h.request(t, http.MethodPost, verdictPath(999999), token, map[string]any{"verdict": "ACCEPT"})
	if status != http.StatusNotFound {
		t.Fatalf("status = %d, want 404 (%v)", status, body)
	}
}

// submissionPath собирает путь PATCH статуса.
func submissionPath(id int64) string {
	return "/api/submissions/" + itoa64(id) + "/status"
}

// verdictPath собирает путь вердикта.
func verdictPath(id int64) string {
	return "/api/submissions/" + itoa64(id) + "/verdict"
}
