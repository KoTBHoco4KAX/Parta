package tests

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"mime/multipart"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"testing"
)

// submitFile отправляет multipart-запрос на новый endpoint сдачи файла.
func (h *harness) submitFile(t *testing.T, submissionID, token string, content []byte) (int, map[string]any) {
	t.Helper()

	var body bytes.Buffer

	writer := multipart.NewWriter(&body)
	part, err := writer.CreateFormFile("file", "лабораторная.txt")
	if err != nil {
		t.Fatalf("create form file: %v", err)
	}

	if _, err := part.Write(content); err != nil {
		t.Fatalf("write file: %v", err)
	}

	if err := writer.Close(); err != nil {
		t.Fatalf("close multipart writer: %v", err)
	}

	req, err := http.NewRequest(
		http.MethodPost,
		h.server.URL+"/api/submissions/"+submissionID+"/submit",
		&body,
	)
	if err != nil {
		t.Fatalf("new request: %v", err)
	}

	req.Header.Set("Content-Type", writer.FormDataContentType())
	req.Header.Set("Authorization", "Bearer "+token)

	resp, err := h.client.Do(req)
	if err != nil {
		t.Fatalf("submit file: %v", err)
	}
	defer resp.Body.Close()

	payload := map[string]any{}
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		t.Fatalf("decode response: %v", err)
	}

	return resp.StatusCode, payload
}

func TestSubmitFileUploadsAndHashesOnServer(t *testing.T) {
	h := newHarness(t)
	ids := h.seed()

	token := h.login(t, "student1@parta.dev")
	subID := h.createSubmission(ids.taskLab, ids.student1, "IN_PROGRESS")

	content := []byte("отчёт по лабораторной №1")

	status, body := h.submitFile(t, itoa64(subID), token, content)
	if status != http.StatusOK {
		t.Fatalf("status = %d, want 200 (%v)", status, body)
	}

	if body["status"] != "REVIEW" {
		t.Fatalf("status = %v, want REVIEW", body["status"])
	}

	artifactURL := h.scalarString(`SELECT artifact_url FROM submissions WHERE id = ?`, subID)
	artifactHash := h.scalarString(`SELECT artifact_hash FROM submissions WHERE id = ?`, subID)

	if artifactURL == "" || artifactHash == "" {
		t.Fatalf("artifact not stored: url=%q hash=%q", artifactURL, artifactHash)
	}

	sum := sha256.Sum256(content)
	wantHash := "sha256:" + hex.EncodeToString(sum[:])

	if artifactHash != wantHash {
		t.Fatalf("artifact_hash = %q, want %q", artifactHash, wantHash)
	}

	diskPath := filepath.Join(h.cfg.UploadDir, path.Base(artifactURL))

	saved, err := os.ReadFile(diskPath)
	if err != nil {
		t.Fatalf("read uploaded file %q: %v", diskPath, err)
	}

	if !bytes.Equal(saved, content) {
		t.Fatalf("uploaded content = %q, want %q", saved, content)
	}
}

func TestSubmitFileRequiresFile(t *testing.T) {
	h := newHarness(t)
	ids := h.seed()

	token := h.login(t, "student1@parta.dev")
	subID := h.createSubmission(ids.taskLab, ids.student1, "IN_PROGRESS")

	var body bytes.Buffer

	writer := multipart.NewWriter(&body)
	if err := writer.WriteField("comment", "без файла"); err != nil {
		t.Fatalf("write field: %v", err)
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("close writer: %v", err)
	}

	req, err := http.NewRequest(
		http.MethodPost,
		h.server.URL+"/api/submissions/"+itoa64(subID)+"/submit",
		&body,
	)
	if err != nil {
		t.Fatalf("new request: %v", err)
	}

	req.Header.Set("Content-Type", writer.FormDataContentType())
	req.Header.Set("Authorization", "Bearer "+token)

	resp, err := h.client.Do(req)
	if err != nil {
		t.Fatalf("submit request: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusUnprocessableEntity {
		t.Fatalf("status = %d, want 422", resp.StatusCode)
	}
}
