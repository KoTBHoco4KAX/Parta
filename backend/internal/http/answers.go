package httpapi

import (
	"database/sql"
	"errors"
	"io"
	"net/http"
	"strings"

	answerdomain "github.com/parta/backend/internal/domain/answers"
	domainerrors "github.com/parta/backend/internal/domain/errors"
	"github.com/parta/backend/internal/storage"
)

const (
	// maxAnswerTextRunes — длина текста черновика и комментария.
	maxAnswerTextRunes = 4_000
	// maxAnswerFileBytes — размер файла черновика.
	maxAnswerFileBytes = 20 << 20
)

// answerTaskView — карточка для выпадающего списка «Ответов».
type answerTaskView struct {
	SubmissionID  int64  `json:"submission_id"`
	TaskID        int64  `json:"task_id"`
	TaskTitle     string `json:"task_title"`
	TaskType      string `json:"task_type"`
	DeadlineAt    string `json:"deadline_at"`
	BaseXP        int    `json:"base_xp"`
	EscrowPercent int    `json:"escrow_percent"`
	EscrowPoolXP  int    `json:"escrow_pool_xp"`
	BasePercent   int    `json:"base_percent"`
	TimeBonus     int    `json:"time_bonus"`
	SpamBonus     int    `json:"spam_bonus"`
	DraftStatus   string `json:"draft_status"`
}

// answerCommentView — комментарий без личности проверяющего.
type answerCommentView struct {
	ID            int64  `json:"id"`
	Text          string `json:"text"`
	Reaction      string `json:"reaction"`
	PayoutPercent int    `json:"payout_percent"`
	CreatedAt     string `json:"created_at"`
}

// answerDraftView — черновик автора.
type answerDraftView struct {
	ID             int64               `json:"id"`
	SubmissionID   int64               `json:"submission_id"`
	TaskID         int64               `json:"task_id"`
	TaskTitle      string              `json:"task_title"`
	TaskType       string              `json:"task_type"`
	Text           string              `json:"text"`
	AttachmentName string              `json:"attachment_name"`
	AttachmentURL  string              `json:"attachment_url"`
	EscrowPercent  int                 `json:"escrow_percent"`
	EscrowPoolXP   int                 `json:"escrow_pool_xp"`
	Status         string              `json:"status"`
	CreatedAt      string              `json:"created_at"`
	CommentsCount  int                 `json:"comments_count"`
	Comments       []answerCommentView `json:"comments"`
}

// answerQueueView — обезличенная работа для проверяющего.
type answerQueueView struct {
	ID             int64  `json:"id"`
	TaskTitle      string `json:"task_title"`
	TaskType       string `json:"task_type"`
	Text           string `json:"text"`
	AttachmentName string `json:"attachment_name"`
	AttachmentURL  string `json:"attachment_url"`
	EscrowPercent  int    `json:"escrow_percent"`
	EscrowPoolXP   int    `json:"escrow_pool_xp"`
	CommentsCount  int    `json:"comments_count"`
}

// answerReviewView — своя проверка глазами проверяющего.
type answerReviewView struct {
	ID            int64  `json:"id"`
	DraftID       int64  `json:"draft_id"`
	TaskTitle     string `json:"task_title"`
	Text          string `json:"text"`
	Reaction      string `json:"reaction"`
	PayoutPercent int    `json:"payout_percent"`
	DraftStatus   string `json:"draft_status"`
	CreatedAt     string `json:"created_at"`
}

// answersOverviewResponse — всё, что нужно вкладке «Ответы».
type answersOverviewResponse struct {
	Tasks   []answerTaskView   `json:"tasks"`
	Drafts  []answerDraftView  `json:"drafts"`
	Reviews []answerReviewView `json:"reviews"`
}

// handleAnswersOverview отдаёт активные задания, черновики и свои проверки.
func (s *Server) handleAnswersOverview(w http.ResponseWriter, r *http.Request) {
	p, ok := s.principalOr401(w, r)
	if !ok {
		return
	}

	now := s.now()
	weekStart := answerdomain.WeekStart(now)
	prior, err := s.answers.CountDraftsSince(r.Context(), p.UserID, weekStart.UTC())
	if err != nil {
		writeError(w, err)

		return
	}

	options, err := s.answers.ListTaskOptions(r.Context(), p.UserID)
	if err != nil {
		writeError(w, err)

		return
	}

	tasks := make([]answerTaskView, 0, len(options))

	for i := range options {
		option := options[i]
		percent := answerdomain.PoolPercent(option.DeadlineAt, now, prior)

		tasks = append(tasks, answerTaskView{
			SubmissionID:  option.SubmissionID,
			TaskID:        option.TaskID,
			TaskTitle:     option.TaskTitle,
			TaskType:      option.TaskType,
			DeadlineAt:    eventTime(option.DeadlineAt),
			BaseXP:        option.BaseXP,
			EscrowPercent: percent,
			EscrowPoolXP:  answerdomain.PoolXP(option.BaseXP, percent),
			BasePercent:   answerdomain.BasePercent,
			TimeBonus:     answerdomain.TimeBonus(option.DeadlineAt, now),
			SpamBonus:     answerdomain.SpamBonus(prior),
			DraftStatus:   option.DraftStatus,
		})
	}

	drafts, err := s.answers.ListAuthorDrafts(r.Context(), p.UserID)
	if err != nil {
		writeError(w, err)

		return
	}

	draftViews := make([]answerDraftView, 0, len(drafts))

	for i := range drafts {
		draftViews = append(draftViews, newAnswerDraftView(drafts[i]))
	}

	reviews, err := s.answers.ListReviewerComments(r.Context(), p.UserID)
	if err != nil {
		writeError(w, err)

		return
	}

	reviewViews := make([]answerReviewView, 0, len(reviews))

	for i := range reviews {
		review := reviews[i]
		reviewViews = append(reviewViews, answerReviewView{
			ID:            review.Comment.ID,
			DraftID:       review.Comment.DraftID,
			TaskTitle:     review.TaskTitle,
			Text:          review.Comment.Text,
			Reaction:      review.Comment.Reaction,
			PayoutPercent: review.Comment.PayoutPercent,
			DraftStatus:   review.DraftStatus,
			CreatedAt:     eventTime(review.Comment.CreatedAt),
		})
	}

	writeJSON(w, http.StatusOK, answersOverviewResponse{
		Tasks:   tasks,
		Drafts:  draftViews,
		Reviews: reviewViews,
	})
}

// handleNextAnswerDraft выдаёт случайную чужую работу из пула.
func (s *Server) handleNextAnswerDraft(w http.ResponseWriter, r *http.Request) {
	p, ok := s.principalOr401(w, r)
	if !ok {
		return
	}

	draft, err := s.answers.NextDraftForReviewer(r.Context(), p.UserID)
	if err != nil {
		if domainerrors.IsSentinel(err, domainerrors.ErrNotFound) {
			writeJSON(w, http.StatusOK, map[string]any{"draft": nil})

			return
		}

		writeError(w, err)

		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"draft": answerQueueView{
			ID:             draft.Draft.ID,
			TaskTitle:      draft.TaskTitle,
			TaskType:       draft.TaskType,
			Text:           draft.Draft.Text,
			AttachmentName: draft.Draft.AttachmentName,
			AttachmentURL:  draft.Draft.AttachmentURL,
			EscrowPercent:  draft.Draft.EscrowPercent,
			EscrowPoolXP:   draft.Draft.EscrowPoolXP,
			CommentsCount:  draft.Draft.CommentsCount,
		},
	})
}

// handleCreateAnswerDraft загружает черновик в пул взаимопроверки.
func (s *Server) handleCreateAnswerDraft(w http.ResponseWriter, r *http.Request) {
	p, ok := s.principalOr401(w, r)
	if !ok {
		return
	}

	submissionID, text, attachmentURL, attachmentName, ok := s.readAnswerDraftForm(w, r)
	if !ok {
		return
	}

	if strings.TrimSpace(text) == "" && attachmentURL == "" {
		writeError(w, domainerrors.ErrInvalidArgument)

		return
	}

	if len([]rune(text)) > maxAnswerTextRunes {
		writeError(w, domainerrors.ErrInvalidArgument)

		return
	}

	sub, err := s.submissions.GetByID(r.Context(), submissionID)
	if err != nil {
		writeError(w, err)

		return
	}

	if sub.StudentID != p.UserID {
		writeError(w, domainerrors.ErrForbidden)

		return
	}

	if sub.Status != "IN_PROGRESS" {
		writeError(w, domainerrors.ErrInvalidTransition)

		return
	}

	task, err := s.tasks.GetByID(r.Context(), sub.TaskID)
	if err != nil {
		writeError(w, err)

		return
	}

	// Заменять черновик можно только пока его никто не проверял.
	active, err := s.answers.GetActiveBySubmission(r.Context(), submissionID)
	if err != nil && !domainerrors.IsSentinel(err, domainerrors.ErrNotFound) {
		writeError(w, err)

		return
	}

	if active != nil {
		count, err := s.answers.CountComments(r.Context(), active.ID)
		if err != nil {
			writeError(w, err)

			return
		}

		if count > 0 {
			writeError(w, domainerrors.ErrAlreadyExists)

			return
		}
	}

	now := s.now()
	weekStart := answerdomain.WeekStart(now)
	prior, err := s.answers.CountDraftsSince(r.Context(), p.UserID, weekStart.UTC())
	if err != nil {
		writeError(w, err)

		return
	}

	percent := answerdomain.PoolPercent(task.DeadlineAt, now, prior)

	err = s.withTx(r.Context(), func(tx *sql.Tx) error {
		_, err := s.answers.CreateDraftTx(r.Context(), tx, storage.AnswerDraft{
			SubmissionID:   submissionID,
			TaskID:         sub.TaskID,
			AuthorID:       p.UserID,
			Text:           strings.TrimSpace(text),
			AttachmentURL:  attachmentURL,
			AttachmentName: attachmentName,
			EscrowPercent:  percent,
			EscrowPoolXP:   answerdomain.PoolXP(task.BaseXP, percent),
		})

		return err
	})
	if err != nil {
		writeError(w, err)

		return
	}

	draft, err := s.answers.GetActiveBySubmission(r.Context(), submissionID)
	if err != nil {
		writeError(w, err)

		return
	}

	writeJSON(w, http.StatusCreated, newAnswerDraftView(storage.AnswerDraftView{
		Draft:     *draft,
		TaskTitle: task.Title,
		TaskType:  task.TaskType,
	}))
}

// handleAddAnswerComment оставляет текстовый отзыв на чужую работу.
func (s *Server) handleAddAnswerComment(w http.ResponseWriter, r *http.Request) {
	p, ok := s.principalOr401(w, r)
	if !ok {
		return
	}

	id, err := parsePathID(r, "id")
	if err != nil {
		writeError(w, err)

		return
	}

	var req struct {
		Text string `json:"text"`
	}

	if !decodeJSON(w, r, &req) {
		return
	}

	text := strings.TrimSpace(req.Text)
	if text == "" || len([]rune(text)) > maxAnswerTextRunes {
		writeError(w, domainerrors.ErrInvalidArgument)

		return
	}

	var comment *storage.AnswerComment

	err = s.withTx(r.Context(), func(tx *sql.Tx) error {
		created, err := s.answers.AddCommentTx(r.Context(), tx, id, p.UserID, text)
		if err != nil {
			return err
		}

		comment = created

		return nil
	})
	if err != nil {
		writeError(w, err)

		return
	}

	writeJSON(w, http.StatusCreated, answerCommentView{
		ID:        comment.ID,
		Text:      comment.Text,
		Reaction:  comment.Reaction,
		CreatedAt: eventTime(comment.CreatedAt),
	})
}

// handleAnswerReaction сохраняет лайк или жалобу автора.
func (s *Server) handleAnswerReaction(w http.ResponseWriter, r *http.Request) {
	p, ok := s.principalOr401(w, r)
	if !ok {
		return
	}

	id, err := parsePathID(r, "id")
	if err != nil {
		writeError(w, err)

		return
	}

	var req struct {
		Reaction string `json:"reaction"`
	}

	if !decodeJSON(w, r, &req) {
		return
	}

	reaction := strings.ToUpper(strings.TrimSpace(req.Reaction))
	if reaction != "NONE" && reaction != "LIKE" && reaction != "REPORT" {
		writeError(w, domainerrors.ErrInvalidArgument)

		return
	}

	var comment *storage.AnswerComment

	err = s.withTx(r.Context(), func(tx *sql.Tx) error {
		updated, err := s.answers.SetReactionTx(r.Context(), tx, id, p.UserID, reaction)
		if err != nil {
			return err
		}

		comment = updated

		return nil
	})
	if err != nil {
		writeError(w, err)

		return
	}

	writeJSON(w, http.StatusOK, answerCommentView{
		ID:        comment.ID,
		Text:      comment.Text,
		Reaction:  comment.Reaction,
		CreatedAt: eventTime(comment.CreatedAt),
	})
}

// readAnswerDraftForm читает JSON или multipart и сохраняет файл черновика.
func (s *Server) readAnswerDraftForm(
	w http.ResponseWriter,
	r *http.Request,
) (submissionID int64, text, attachmentURL, attachmentName string, ok bool) {
	if strings.HasPrefix(r.Header.Get("Content-Type"), "multipart/form-data") {
		r.Body = http.MaxBytesReader(w, r.Body, maxAnswerFileBytes+1<<20)

		if err := r.ParseMultipartForm(4 << 20); err != nil {
			writeJSON(w, http.StatusBadRequest, errorBody{
				Error: "invalid multipart form",
				Code:  CodeInvalidMultipart,
			})

			return 0, "", "", "", false
		}

		form := r.MultipartForm
		if form != nil {
			defer func() { _ = form.RemoveAll() }()
		}

		value := func(key string) string {
			if form == nil || len(form.Value[key]) == 0 {
				return ""
			}

			return form.Value[key][0]
		}

		submissionID = parseInt64OrZero(value("submission_id"))
		text = value("text")
		attachmentName = value("attachment_name")

		file, header, err := r.FormFile("file")
		if err == nil {
			defer func() { _ = file.Close() }()

			limited := io.LimitReader(file, maxAnswerFileBytes+1)

			url, _, _, err := s.storeAnswerUpload(limited, header.Filename)
			if err != nil {
				writeError(w, err)

				return 0, "", "", "", false
			}

			attachmentURL = url
			attachmentName = header.Filename
		} else if !errors.Is(err, http.ErrMissingFile) {
			writeError(w, domainerrors.ErrInvalidArgument)

			return 0, "", "", "", false
		}

		return submissionID, text, attachmentURL, attachmentName, true
	}

	var req struct {
		SubmissionID int64  `json:"submission_id"`
		Text         string `json:"text"`
	}

	if !decodeJSON(w, r, &req) {
		return 0, "", "", "", false
	}

	return req.SubmissionID, req.Text, "", "", true
}

// newAnswerDraftView преобразует черновик в DTO автора.
func newAnswerDraftView(view storage.AnswerDraftView) answerDraftView {
	comments := make([]answerCommentView, 0, len(view.Comments))

	// Автор видит отзывы только после второго комментария: до этого сбор идёт.
	if view.Draft.CommentsCount >= 2 || view.Draft.Status != "OPEN" {
		for i := range view.Comments {
			comments = append(comments, answerCommentView{
				ID:            view.Comments[i].ID,
				Text:          view.Comments[i].Text,
				Reaction:      view.Comments[i].Reaction,
				PayoutPercent: view.Comments[i].PayoutPercent,
				CreatedAt:     eventTime(view.Comments[i].CreatedAt),
			})
		}
	}

	return answerDraftView{
		ID:             view.Draft.ID,
		SubmissionID:   view.Draft.SubmissionID,
		TaskID:         view.Draft.TaskID,
		TaskTitle:      view.TaskTitle,
		TaskType:       view.TaskType,
		Text:           view.Draft.Text,
		AttachmentName: view.Draft.AttachmentName,
		AttachmentURL:  view.Draft.AttachmentURL,
		EscrowPercent:  view.Draft.EscrowPercent,
		EscrowPoolXP:   view.Draft.EscrowPoolXP,
		Status:         view.Draft.Status,
		CreatedAt:      eventTime(view.Draft.CreatedAt),
		CommentsCount:  view.Draft.CommentsCount,
		Comments:       comments,
	}
}
