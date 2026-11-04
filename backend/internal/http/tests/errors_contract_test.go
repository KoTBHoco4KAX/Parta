package tests

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"testing"
)

// rawResponse — ответ тестового сервера с сохранёнными заголовками.
type rawResponse struct {
	status      int
	contentType string
	body        []byte
}

// doRaw отправляет запрос с произвольным телом и возвращает сырой ответ.
func (h *harness) doRaw(t *testing.T, method, path, token, rawBody string) rawResponse {
	t.Helper()

	req, err := http.NewRequest(method, h.server.URL+path, strings.NewReader(rawBody))
	if err != nil {
		t.Fatalf("new request: %v", err)
	}

	if rawBody != "" {
		req.Header.Set("Content-Type", "application/json")
	}

	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}

	resp, err := h.client.Do(req)
	if err != nil {
		t.Fatalf("%s %s: %v", method, path, err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatalf("read body: %v", err)
	}

	return rawResponse{
		status:      resp.StatusCode,
		contentType: resp.Header.Get("Content-Type"),
		body:        body,
	}
}

// TestErrorEnvelopeContract проверяет, что 400/401/403/404/409/422 всегда
// отвечают JSON-конвертом {error, code} и не отдают текст net/http.
func TestErrorEnvelopeContract(t *testing.T) {
	h := newHarness(t)
	ids := h.seed()

	studentToken := h.login(t, "student1@parta.dev")
	adminToken := h.login(t, "admin@parta.dev")

	cases := []struct {
		name   string
		method string
		path   string
		token  string
		body   string
		status int
		code   string
	}{
		{
			name:   "bad json",
			method: http.MethodPost,
			path:   "/api/auth/login",
			body:   `"not-an-object"`,
			status: http.StatusBadRequest,
			code:   "invalid_json",
		},
		{
			name:   "missing token",
			method: http.MethodGet,
			path:   "/api/tasks",
			status: http.StatusUnauthorized,
			code:   "unauthorized",
		},
		{
			name:   "student hits teacher endpoint",
			method: http.MethodPost,
			path:   "/api/tasks",
			token:  studentToken,
			body:   `{}`,
			status: http.StatusForbidden,
			code:   "forbidden",
		},
		{
			name:   "unknown route",
			method: http.MethodGet,
			path:   "/api/does-not-exist",
			token:  adminToken,
			status: http.StatusNotFound,
			code:   "not_found",
		},
		{
			name:   "duplicate user",
			method: http.MethodPost,
			path:   "/api/users",
			token:  adminToken,
			body:   `{"external_id":"student1@parta.dev","display_name":"Дубль","role":"student","group_id":` + itoa64(ids.groupIS21) + `}`,
			status: http.StatusConflict,
			code:   "already_exists",
		},
		{
			name:   "invalid argument",
			method: http.MethodPost,
			path:   "/api/submissions",
			token:  studentToken,
			body:   `{"task_id":0}`,
			status: http.StatusUnprocessableEntity,
			code:   "invalid_argument",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			resp := h.doRaw(t, tc.method, tc.path, tc.token, tc.body)

			if resp.status != tc.status {
				t.Fatalf("status = %d, want %d (body=%s)", resp.status, tc.status, resp.body)
			}

			if !strings.HasPrefix(resp.contentType, "application/json") {
				t.Fatalf("content-type = %q, want application/json", resp.contentType)
			}

			var body map[string]any
			if err := json.Unmarshal(bytes.TrimSpace(resp.body), &body); err != nil {
				t.Fatalf("body is not JSON: %q (%v)", resp.body, err)
			}

			if len(body) != 2 {
				t.Fatalf("error envelope = %v, want exactly {error, code}", body)
			}

			message, messageOK := body["error"].(string)
			code, codeOK := body["code"].(string)

			if !messageOK || message == "" {
				t.Fatalf("error field = %v", body["error"])
			}

			if !codeOK || code != tc.code {
				t.Fatalf("code = %v, want %q", body["code"], tc.code)
			}
		})
	}
}
