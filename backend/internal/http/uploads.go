package httpapi

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	domainerrors "github.com/parta/backend/internal/domain/errors"
	"github.com/parta/backend/internal/domain/submission"
)

const (
	// maxUploadBytes — максимальный размер файла работы.
	maxUploadBytes = 20 << 20
	// maxUploadRequestBytes оставляет запас на multipart-границы и заголовки.
	maxUploadRequestBytes = maxUploadBytes + 1<<20
	// maxUploadMemory — сколько multipart держим в памяти, остальное во временном файле.
	maxUploadMemory = 8 << 20
)

// handleSubmitFile принимает файл работы, сам считает SHA-256 и переводит
// карточку IN_PROGRESS → REVIEW. Клиент не присылает ни URL, ни хеш.
func (s *Server) handleSubmitFile(w http.ResponseWriter, r *http.Request) {
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

	r.Body = http.MaxBytesReader(w, r.Body, maxUploadRequestBytes)

	if err := r.ParseMultipartForm(maxUploadMemory); err != nil {
		var tooLarge *http.MaxBytesError
		if errors.As(err, &tooLarge) {
			writeJSON(w, http.StatusRequestEntityTooLarge, errorBody{
				Error: "file too large",
				Code:  CodeFileTooLarge,
			})

			return
		}

		writeJSON(w, http.StatusBadRequest, errorBody{
			Error: "invalid multipart form",
			Code:  CodeInvalidMultipart,
		})

		return
	}

	if r.MultipartForm != nil {
		defer func() {
			_ = r.MultipartForm.RemoveAll()
		}()
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		writeError(w, domainerrors.ErrInvalidArgument)

		return
	}
	defer func() {
		_ = file.Close()
	}()

	if header.Size <= 0 {
		writeError(w, domainerrors.ErrInvalidArgument)

		return
	}

	if header.Size > maxUploadBytes {
		writeJSON(w, http.StatusRequestEntityTooLarge, errorBody{
			Error: "file too large",
			Code:  CodeFileTooLarge,
		})

		return
	}

	artifactURL, artifactHash, diskPath, err := s.storeUpload(file, header.Filename, id)
	if err != nil {
		writeError(w, err)

		return
	}

	accepted := s.applyStatusEvent(w, r, p, id, statusRequest{
		Event:        string(submission.EventSubmit),
		ArtifactURL:  artifactURL,
		ArtifactHash: artifactHash,
	})
	if !accepted {
		// Переход не состоялся (чужой id, неверный статус, гонка) — файл-сирота
		// не нужен, удаляем его.
		_ = os.Remove(diskPath)
	}
}

// storeUpload сохраняет файл под уникальным именем и возвращает URL, хеш и путь.
func (s *Server) storeUpload(src io.Reader, originalName string, submissionID int64) (string, string, string, error) {
	dir := s.cfg.UploadDir
	if dir == "" {
		dir = "./uploads"
	}

	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", "", "", fmt.Errorf("uploads: create dir: %w", err)
	}

	name := fmt.Sprintf(
		"submission-%d-%d-%s",
		submissionID,
		time.Now().UnixNano(),
		sanitizeUploadName(originalName),
	)
	diskPath := filepath.Join(dir, name)

	out, err := os.OpenFile(diskPath, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o644)
	if err != nil {
		return "", "", "", fmt.Errorf("uploads: create file: %w", err)
	}

	hasher := sha256.New()

	_, copyErr := io.Copy(io.MultiWriter(out, hasher), src)
	closeErr := out.Close()

	if copyErr != nil {
		_ = os.Remove(diskPath)

		return "", "", "", fmt.Errorf("uploads: save file: %w", copyErr)
	}

	if closeErr != nil {
		_ = os.Remove(diskPath)

		return "", "", "", fmt.Errorf("uploads: close file: %w", closeErr)
	}

	artifactURL := "/uploads/" + name
	artifactHash := "sha256:" + hex.EncodeToString(hasher.Sum(nil))

	return artifactURL, artifactHash, diskPath, nil
}

// sanitizeUploadName оставляет в имени файла только безопасные символы и
// ограничивает длину. Исходный путь от клиента не используется.
func sanitizeUploadName(name string) string {
	base := filepath.Base(name)

	var safe strings.Builder

	for _, char := range base {
		switch {
		case char >= 'a' && char <= 'z',
			char >= 'A' && char <= 'Z',
			char >= '0' && char <= '9',
			char == '.', char == '-', char == '_':
			safe.WriteRune(char)
		default:
			safe.WriteByte('_')
		}
	}

	result := strings.Trim(safe.String(), ".")
	if result == "" {
		result = "file"
	}

	runes := []rune(result)
	if len(runes) > 120 {
		result = string(runes[len(runes)-120:])
	}

	return result
}
