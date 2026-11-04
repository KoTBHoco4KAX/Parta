package httpapi

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"unicode/utf8"

	domainerrors "github.com/parta/backend/internal/domain/errors"
	"github.com/parta/backend/internal/domain/submission"
	"github.com/parta/backend/internal/events"
	"github.com/parta/backend/internal/storage"
)

// teacher_api.go — MVP-эндпоинты кабинета преподавателя и админки, которых не
// было в backend на Спринте 2:
//   - POST /api/peer-reviews/{id}/award — бонус рецензенту (BUG-003);
//   - PATCH /api/users/{id} — перенос студента между группами (BUG-004);
//   - GET /api/users?group_id=|?unassigned= — фильтр пользователей (BUG-005);
//   - GET /api/attachments + /{id} — MVP вложений через redirect (BUG-001/002).
//
// Полноценное хранилище вложений — отдельная спека: сейчас backend не хранит
// файлы, поэтому download отдаёт 302 на artifact_url и ничего не проксирует
// (SSRF-безопасно). См. BUGLOG BUG-001/002.

const (
	// awardReason — причина проводки бонуса рецензенту.
	awardReason = storage.ReasonPeerReviewReward
	// awardMin/awardMax — границы бонуса из контракта BUG-003.
	awardMin = 1
	awardMax = 1_000
	// awardCommentLimit — максимальная длина комментария в рунах.
	awardCommentLimit = 500
	// attachmentIDPrefix — префикс синтетического id вложения.
	attachmentIDPrefix = "artifact-"
)

// peerReviewAwardRequest — тело POST /api/peer-reviews/{id}/award.
type peerReviewAwardRequest struct {
	ReviewerID int64  `json:"reviewer_id"`
	Amount     int    `json:"amount"`
	Comment    string `json:"comment"`
}

// peerReviewAwardResponse — ответ начисления бонуса.
type peerReviewAwardResponse struct {
	PeerReviewID int64 `json:"peer_review_id"`
	ReviewerID   int64 `json:"reviewer_id"`
	Amount       int   `json:"amount"`
	TotalXP      int   `json:"total_xp"`
	LedgerID     int64 `json:"ledger_id"`
}

// filteredUserItem — элемент GET /api/users?group_id= / ?unassigned=true.
type filteredUserItem struct {
	ID       int64  `json:"id"`
	Email    string `json:"email"`
	FullName string `json:"full_name"`
	Role     string `json:"role"`
	GroupID  *int64 `json:"group_id"`
}

// filteredUsersResponse — конверт фильтрованного списка пользователей.
type filteredUsersResponse struct {
	Items []filteredUserItem `json:"items"`
}

// attachmentItem — MVP-представление вложения сдачи.
type attachmentItem struct {
	ID        string `json:"id"`
	Filename  string `json:"filename"`
	Size      int    `json:"size"`
	CreatedAt string `json:"created_at"`
	URL       string `json:"url"`
}

// attachmentListResponse — конверт списка вложений.
type attachmentListResponse struct {
	Items []attachmentItem `json:"items"`
}

// handlePeerReviewAward начисляет бонусный XP рецензенту завершённой P2P-сессии.
func (s *Server) handlePeerReviewAward(w http.ResponseWriter, r *http.Request) {
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

	var req peerReviewAwardRequest

	if !decodeJSON(w, r, &req) {
		return
	}

	if req.ReviewerID <= 0 || req.Amount < awardMin || req.Amount > awardMax ||
		utf8.RuneCountInString(req.Comment) > awardCommentLimit {
		writeError(w, domainerrors.ErrInvalidArgument)

		return
	}

	// Чтения — строго до BeginTx: пул ограничен одним соединением.
	review, err := s.peerReviews.GetByID(r.Context(), id)
	if err != nil {
		writeError(w, err)

		return
	}

	if review.Status != storage.PeerReviewStatusCompleted {
		writeError(w, domainerrors.ErrInvalidTransition)

		return
	}

	if review.ReviewerID == nil || *review.ReviewerID != req.ReviewerID {
		writeError(w, domainerrors.ErrGuardFailed)

		return
	}

	sourceID := review.ID

	var entry *storage.LedgerEntry

	err = s.withTx(r.Context(), func(tx *sql.Tx) error {
		var postErr error

		entry, postErr = s.ledger.Post(r.Context(), tx, storage.PostLedgerInput{
			UserID:         req.ReviewerID,
			Amount:         req.Amount,
			Reason:         awardReason,
			SourceType:     storage.SourcePeerReview,
			SourceID:       &sourceID,
			IdempotencyKey: fmt.Sprintf("peer_review:%d:award", review.ID),
		})

		return postErr
	})
	if err != nil {
		writeError(w, err)

		return
	}

	// WS — только после Commit: событие уведомляет, но не является источником истины.
	s.publishPeerReviewState(r.Context(), review, req.ReviewerID)
	s.publisher.Publish(r.Context(), events.New(
		events.TypeXPLedgerPosted,
		req.ReviewerID,
		events.RoomUser(req.ReviewerID),
		xpLedgerPostedPayload{
			LedgerID:     entry.ID,
			UserID:       entry.UserID,
			Amount:       entry.Amount,
			BalanceAfter: entry.BalanceAfter,
			Reason:       entry.Reason,
		},
	))

	writeJSON(w, http.StatusOK, peerReviewAwardResponse{
		PeerReviewID: review.ID,
		ReviewerID:   req.ReviewerID,
		Amount:       entry.Amount,
		TotalXP:      entry.BalanceAfter,
		LedgerID:     entry.ID,
	})
}

// handleUserGroupPatch переносит студента в другую группу или убирает из группы.
func (s *Server) handleUserGroupPatch(w http.ResponseWriter, r *http.Request) {
	p, ok := s.principalOr401(w, r)
	if !ok {
		return
	}

	if !requireRole(w, p, RoleAdmin, RoleTeacher) {
		return
	}

	id, err := parsePathID(r, "id")
	if err != nil {
		writeError(w, err)

		return
	}

	// map нужен, чтобы отличить отсутствующее поле от явного null.
	var raw map[string]json.RawMessage

	if !decodeJSON(w, r, &raw) {
		return
	}

	rawGroup, present := raw["group_id"]
	if !present {
		writeError(w, domainerrors.ErrInvalidArgument)

		return
	}

	var groupID *int64

	if strings.TrimSpace(string(rawGroup)) != "null" {
		var value int64
		if err := json.Unmarshal(rawGroup, &value); err != nil || value <= 0 {
			writeError(w, domainerrors.ErrInvalidArgument)

			return
		}

		groupID = &value
	}

	// Все чтения — до транзакции.
	target, err := s.users.GetByID(r.Context(), id)
	if err != nil {
		writeError(w, err)

		return
	}

	// Группа есть только у студентов; teacher/admin с group_id запрещены.
	if target.Role != RoleStudent {
		writeError(w, domainerrors.ErrInvalidArgument)

		return
	}

	if p.Role == RoleTeacher {
		groups, err := s.teacherGroupIDs(r.Context(), p.UserID)
		if err != nil {
			writeError(w, err)

			return
		}

		if target.GroupID != nil {
			if _, allowed := groups[*target.GroupID]; !allowed {
				writeError(w, domainerrors.ErrForbidden)

				return
			}
		}

		if groupID != nil {
			if _, allowed := groups[*groupID]; !allowed {
				writeError(w, domainerrors.ErrForbidden)

				return
			}
		}
	}

	if groupID != nil {
		if _, err := s.groups.GetByID(r.Context(), *groupID); err != nil {
			writeError(w, err)

			return
		}
	}

	var groupArg any
	if groupID != nil {
		groupArg = *groupID
	}

	if err := s.withTx(r.Context(), func(tx *sql.Tx) error {
		_, execErr := tx.ExecContext(r.Context(), `UPDATE users
			SET group_id = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
			WHERE id = ?`, groupArg, id)

		return execErr
	}); err != nil {
		writeError(w, err)

		return
	}

	updated, err := s.users.GetByID(r.Context(), id)
	if err != nil {
		writeError(w, err)

		return
	}

	writeJSON(w, http.StatusOK, newUserView(updated))
}

// handleUsersListFiltered отдаёт пользователей по группе или без группы.
//
// Без query-параметров сохраняется прежний контракт GET /api/users (весь список
// для админки): на нём держатся UsersPanel и существующие тесты. С параметрами
// действует строгий фильтрованный контракт BUG-005.
func (s *Server) handleUsersListFiltered(w http.ResponseWriter, r *http.Request) {
	p, ok := s.principalOr401(w, r)
	if !ok {
		return
	}

	if !requireRole(w, p, RoleAdmin, RoleTeacher) {
		return
	}

	query := r.URL.Query()
	_, hasGroup := query["group_id"]
	_, hasUnassigned := query["unassigned"]

	if !hasGroup && !hasUnassigned {
		// Backward compatibility: старый полный список, только для admin.
		s.handleListUsers(w, r)

		return
	}

	if hasGroup && hasUnassigned {
		writeBadRequest(w, "pass exactly one of group_id or unassigned")

		return
	}

	users, err := s.users.ListAll(r.Context())
	if err != nil {
		writeError(w, err)

		return
	}

	items := make([]filteredUserItem, 0)

	if hasGroup {
		groupID, err := parsePositiveInt64(query.Get("group_id"))
		if err != nil {
			writeError(w, domainerrors.ErrInvalidArgument)

			return
		}

		if p.Role == RoleTeacher {
			groups, err := s.teacherGroupIDs(r.Context(), p.UserID)
			if err != nil {
				writeError(w, err)

				return
			}

			if _, allowed := groups[groupID]; !allowed {
				writeError(w, domainerrors.ErrForbidden)

				return
			}
		}

		if _, err := s.groups.GetByID(r.Context(), groupID); err != nil {
			writeError(w, err)

			return
		}

		for i := range users {
			if users[i].GroupID != nil && *users[i].GroupID == groupID {
				items = append(items, newFilteredUserItem(&users[i]))
			}
		}
	} else {
		if p.Role != RoleAdmin {
			writeError(w, domainerrors.ErrForbidden)

			return
		}

		if query.Get("unassigned") != "true" {
			writeBadRequest(w, "unassigned must be true")

			return
		}

		for i := range users {
			if users[i].GroupID == nil {
				items = append(items, newFilteredUserItem(&users[i]))
			}
		}
	}

	writeJSON(w, http.StatusOK, filteredUsersResponse{Items: items})
}

// handleAttachmentsList — MVP-список вложений сдачи (одна внешняя ссылка).
func (s *Server) handleAttachmentsList(w http.ResponseWriter, r *http.Request) {
	p, ok := s.principalOr401(w, r)
	if !ok {
		return
	}

	submissionID, err := parsePositiveInt64(r.URL.Query().Get("submission_id"))
	if err != nil {
		writeError(w, domainerrors.ErrInvalidArgument)

		return
	}

	sub, task, err := s.attachmentTarget(r.Context(), submissionID)
	if err != nil {
		writeError(w, err)

		return
	}

	if !canReadSubmission(p, sub, task) {
		writeError(w, domainerrors.ErrForbidden)

		return
	}

	items := make([]attachmentItem, 0)

	if strings.TrimSpace(sub.ArtifactURL) != "" {
		createdAt := ""
		if sub.SubmittedAt != nil {
			createdAt = eventTime(*sub.SubmittedAt)
		}

		items = append(items, attachmentItem{
			ID:        fmt.Sprintf("%s%d", attachmentIDPrefix, sub.ID),
			Filename:  "artifact",
			Size:      0,
			CreatedAt: createdAt,
			URL:       sub.ArtifactURL,
		})
	}

	writeJSON(w, http.StatusOK, attachmentListResponse{Items: items})
}

// handleAttachmentDownload отдаёт 302 на artifact_url. Сервер не проксирует и
// не скачивает файл — это исключает SSRF. Полное хранилище — отдельная спека.
func (s *Server) handleAttachmentDownload(w http.ResponseWriter, r *http.Request) {
	p, ok := s.principalOr401(w, r)
	if !ok {
		return
	}

	submissionID, err := parseAttachmentID(r.PathValue("id"))
	if err != nil {
		writeError(w, domainerrors.ErrNotFound)

		return
	}

	sub, task, err := s.attachmentTarget(r.Context(), submissionID)
	if err != nil {
		writeError(w, err)

		return
	}

	if !canReadSubmission(p, sub, task) {
		writeError(w, domainerrors.ErrForbidden)

		return
	}

	if strings.TrimSpace(sub.ArtifactURL) == "" {
		writeError(w, domainerrors.ErrNotFound)

		return
	}

	http.Redirect(w, r, sub.ArtifactURL, http.StatusFound)
}

// attachmentTarget загружает сдачу и её задание для проверки доступа.
func (s *Server) attachmentTarget(ctx context.Context, submissionID int64) (*submission.Submission, *submission.Task, error) {
	sub, err := s.submissions.GetByID(ctx, submissionID)
	if err != nil {
		return nil, nil, err
	}

	task, err := s.tasks.GetByID(ctx, sub.TaskID)
	if err != nil {
		return nil, nil, err
	}

	return sub, task, nil
}

// canReadSubmission проверяет доступ к артефакту сдачи.
func canReadSubmission(p principal, sub *submission.Submission, task *submission.Task) bool {
	switch p.Role {
	case RoleAdmin:
		return true
	case RoleTeacher:
		return task.AssignedTeacherID == p.UserID
	default:
		return sub.StudentID == p.UserID
	}
}

// teacherGroupIDs возвращает группы, закреплённые за преподавателем.
func (s *Server) teacherGroupIDs(ctx context.Context, teacherID int64) (map[int64]struct{}, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT DISTINCT group_id FROM teacher_assignments WHERE teacher_id = ?`, teacherID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	groups := make(map[int64]struct{})

	for rows.Next() {
		var groupID int64
		if err := rows.Scan(&groupID); err != nil {
			return nil, err
		}

		groups[groupID] = struct{}{}
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}

	return groups, nil
}

// newFilteredUserItem собирает DTO фильтрованного списка.
func newFilteredUserItem(user *storage.User) filteredUserItem {
	return filteredUserItem{
		ID:       user.ID,
		Email:    user.ExternalID,
		FullName: user.DisplayName,
		Role:     user.Role,
		GroupID:  user.GroupID,
	}
}

// parseAttachmentID разбирает синтетический id "artifact-{submission_id}".
func parseAttachmentID(raw string) (int64, error) {
	if !strings.HasPrefix(raw, attachmentIDPrefix) {
		return 0, domainerrors.ErrNotFound
	}

	return parsePositiveInt64(strings.TrimPrefix(raw, attachmentIDPrefix))
}

// parsePositiveInt64 разбирает положительный int64 из строки.
func parsePositiveInt64(raw string) (int64, error) {
	value, err := strconv.ParseInt(strings.TrimSpace(raw), 10, 64)
	if err != nil || value <= 0 {
		return 0, domainerrors.ErrInvalidArgument
	}

	return value, nil
}

// writeBadRequest пишет 400 в общем конверте ошибки (для query-валидации).
func writeBadRequest(w http.ResponseWriter, message string) {
	writeJSON(w, http.StatusBadRequest, errorBody{Error: message, Code: "invalid_argument"})
}
