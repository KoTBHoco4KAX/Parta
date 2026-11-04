package httpapi

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"

	domainerrors "github.com/parta/backend/internal/domain/errors"
)

const (
	// maxTaskAttachments — сколько файлов можно приложить к заданию.
	maxTaskAttachments = 5
	// maxTaskAttachmentBytes — размер одного вложения задания.
	maxTaskAttachmentBytes = 20 << 20
)

// uploadTaskAttachments сохраняет файлы задания в uploads и возвращает
// JSON-массив вложений для tasks.attachments. Ошибки пишутся в ответ сами.
func (s *Server) uploadTaskAttachments(w http.ResponseWriter, r *http.Request, groupID int64) (string, bool) {
	r.Body = http.MaxBytesReader(w, r.Body, maxTaskAttachments*(maxTaskAttachmentBytes+1<<20))

	if err := r.ParseMultipartForm(16 << 20); err != nil {
		writeJSON(w, http.StatusBadRequest, errorBody{
			Error: "invalid multipart form",
			Code:  CodeInvalidMultipart,
		})

		return "", false
	}

	if r.MultipartForm != nil {
		defer func() {
			_ = r.MultipartForm.RemoveAll()
		}()
	}

	files := r.MultipartForm.File["file"]
	if len(files) > maxTaskAttachments {
		writeError(w, domainerrors.ErrInvalidArgument)

		return "", false
	}

	attachments := make([]taskAttachment, 0, len(files))

	for _, header := range files {
		if header.Size <= 0 || header.Size > maxTaskAttachmentBytes {
			writeJSON(w, http.StatusRequestEntityTooLarge, errorBody{
				Error: "file too large",
				Code:  CodeFileTooLarge,
			})

			return "", false
		}

		src, err := header.Open()
		if err != nil {
			writeError(w, domainerrors.ErrInvalidArgument)

			return "", false
		}

		url, _, _, err := s.storeUpload(src, header.Filename, -groupID)
		_ = src.Close()

		if err != nil {
			writeError(w, err)

			return "", false
		}

		attachments = append(attachments, taskAttachment{
			Name: strings.TrimSpace(header.Filename),
			URL:  url,
			Size: header.Size,
		})
	}

	encoded, err := json.Marshal(attachments)
	if err != nil {
		writeError(w, domainerrors.ErrInvalidArgument)

		return "", false
	}

	return string(encoded), true
}

// formTime разбирает дату из формы: RFC3339 или значение datetime-local.
func formTime(raw string) (time.Time, bool) {
	raw = strings.TrimSpace(raw)

	for _, layout := range []string{time.RFC3339, "2006-01-02T15:04", "2006-01-02T15:04:05"} {
		if parsed, err := time.Parse(layout, raw); err == nil {
			return parsed, true
		}
	}

	return time.Time{}, false
}

// parseInt64OrZero разбирает целое из формы; пустое значение — 0.
func parseInt64OrZero(raw string) int64 {
	value, err := strconv.ParseInt(strings.TrimSpace(raw), 10, 64)
	if err != nil {
		return 0
	}

	return value
}

// parseFloatOrZero разбирает дробное из формы; пустое значение — 0.
func parseFloatOrZero(raw string) float64 {
	value, err := strconv.ParseFloat(strings.TrimSpace(strings.ReplaceAll(raw, ",", ".")), 64)
	if err != nil {
		return 0
	}

	return value
}
