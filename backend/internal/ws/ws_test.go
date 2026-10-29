package ws_test

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/parta/backend/internal/auth"
	"github.com/parta/backend/internal/config"
	"github.com/parta/backend/internal/events"
	httpapi "github.com/parta/backend/internal/http"
	"github.com/parta/backend/internal/storage"
	"github.com/parta/backend/internal/ws"
	"nhooyr.io/websocket"
)

const testSecret = "ws-test-secret"

// fixture — поднятый сервер с REST и WS поверх изолированной БД.
type fixture struct {
	server *httptest.Server
	hub    *ws.Hub
	tokens *auth.TokenService
	users  *storage.UserRepo
	db     *sql.DB

	student1 int64
	student3 int64
	teacher  int64
	group21  int64
	group22  int64
	taskLab  int64
}

// newFixture поднимает окружение и читает id сид-данных.
func newFixture(t *testing.T) *fixture {
	t.Helper()

	db, err := storage.Open(filepath.Join(t.TempDir(), "parta_ws.db"))
	if err != nil {
		t.Fatalf("storage.Open: %v", err)
	}

	t.Cleanup(func() { _ = db.Close() })

	if err := storage.Migrate(context.Background(), db); err != nil {
		t.Fatalf("storage.Migrate: %v", err)
	}

	cfg := config.Config{JWTSecret: testSecret, Env: "dev"}
	tokens := auth.NewTokenService(testSecret, time.Now)
	hub := ws.NewHub()
	users := storage.NewUserRepo(db)

	realtime := ws.NewServer(tokens, hub, users, storage.NewTaskRepo(db))

	mux := http.NewServeMux()
	mux.Handle("/ws", realtime)
	// Тот же хаб — публикатор REST-слоя: тесты проверяют полный контур
	// «HTTP-мутация → Commit → Hub → WebSocket-клиент».
	mux.Handle("/", httpapi.New(cfg, db, httpapi.WithPublisher(hub)).Handler())

	server := httptest.NewServer(mux)
	t.Cleanup(func() {
		hub.Close()
		server.Close()
	})

	f := &fixture{server: server, hub: hub, tokens: tokens, users: users, db: db}

	queries := []struct {
		dest  *int64
		query string
		arg   any
	}{
		{&f.student1, `SELECT id FROM users WHERE external_id = ?`, "student1@parta.dev"},
		{&f.student3, `SELECT id FROM users WHERE external_id = ?`, "student3@parta.dev"},
		{&f.teacher, `SELECT id FROM users WHERE external_id = ?`, "teacher@parta.dev"},
		{&f.group21, `SELECT id FROM groups WHERE code = ?`, "IS-21"},
		{&f.group22, `SELECT id FROM groups WHERE code = ?`, "IS-22"},
		{&f.taskLab, `SELECT id FROM tasks WHERE task_type = 'LAB_CODE'`, nil},
	}

	for _, q := range queries {
		var err error

		if q.arg == nil {
			err = db.QueryRow(q.query).Scan(q.dest)
		} else {
			err = db.QueryRow(q.query, q.arg).Scan(q.dest)
		}

		if err != nil {
			t.Fatalf("seed %q: %v", q.query, err)
		}
	}

	return f
}

// token выпускает валидный пользовательский токен.
func (f *fixture) token(t *testing.T, userID int64, role string) string {
	t.Helper()

	token, err := f.tokens.Issue(userID, role, time.Hour)
	if err != nil {
		t.Fatalf("issue token: %v", err)
	}

	return token
}

// dial подключается к /ws с токеном (пустой токен — без параметра).
func (f *fixture) dial(t *testing.T, token string) (*websocket.Conn, *http.Response, error) {
	t.Helper()

	url := "ws" + strings.TrimPrefix(f.server.URL, "http") + "/ws"
	if token != "" {
		url += "?token=" + token
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	return websocket.Dial(ctx, url, nil)
}

// doJSON выполняет REST-запрос к тестовому серверу и разбирает JSON-ответ.
func (f *fixture) doJSON(t *testing.T, method, path, token string, body any) (int, map[string]any) {
	t.Helper()

	var reader io.Reader

	if body != nil {
		payload, err := json.Marshal(body)
		if err != nil {
			t.Fatalf("marshal request: %v", err)
		}

		reader = bytes.NewReader(payload)
	}

	req, err := http.NewRequest(method, f.server.URL+path, reader)
	if err != nil {
		t.Fatalf("new request: %v", err)
	}

	req.Header.Set("Content-Type", "application/json")

	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}

	resp, err := f.server.Client().Do(req)
	if err != nil {
		t.Fatalf("%s %s: %v", method, path, err)
	}
	defer resp.Body.Close()

	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatalf("read body: %v", err)
	}

	payload := map[string]any{}

	if len(bytes.TrimSpace(raw)) > 0 {
		if err := json.Unmarshal(raw, &payload); err != nil {
			t.Fatalf("%s %s: body is not JSON: %q", method, path, string(raw))
		}
	}

	return resp.StatusCode, payload
}

// readJSON читает один кадр и разбирает его в map.
func readJSON(t *testing.T, conn *websocket.Conn) map[string]any {
	t.Helper()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	_, data, err := conn.Read(ctx)
	if err != nil {
		t.Fatalf("read: %v", err)
	}

	var message map[string]any
	if err := json.Unmarshal(data, &message); err != nil {
		t.Fatalf("decode frame %q: %v", data, err)
	}

	return message
}

// readEvent дочитывает кадры до первого события конверта.
func readEvent(t *testing.T, conn *websocket.Conn) events.Event {
	t.Helper()

	deadline := time.Now().Add(5 * time.Second)

	for time.Now().Before(deadline) {
		message := readJSON(t, conn)
		if _, ok := message["event_id"]; !ok {
			continue // ready/ack
		}

		raw, err := json.Marshal(message)
		if err != nil {
			t.Fatalf("remarshal event: %v", err)
		}

		var event events.Event
		if err := json.Unmarshal(raw, &event); err != nil {
			t.Fatalf("decode event: %v", err)
		}

		return event
	}

	t.Fatal("no event received")

	return events.Event{}
}

// expectReady проверяет приветственный кадр и его комнаты.
func expectReady(t *testing.T, conn *websocket.Conn, wantRooms ...string) {
	t.Helper()

	message := readJSON(t, conn)
	if message["type"] != "ready" {
		t.Fatalf("first frame = %v, want ready", message)
	}

	rawRooms, _ := message["rooms"].([]any)
	got := make(map[string]bool, len(rawRooms))

	for _, room := range rawRooms {
		got[room.(string)] = true
	}

	for _, room := range wantRooms {
		if !got[room] {
			t.Fatalf("ready rooms = %v, want %q", rawRooms, room)
		}
	}
}

// subscribe отправляет команду подписки.
func subscribe(t *testing.T, conn *websocket.Conn, rooms ...string) {
	t.Helper()

	payload, err := json.Marshal(map[string]any{"action": "subscribe", "rooms": rooms})
	if err != nil {
		t.Fatalf("marshal subscribe: %v", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := conn.Write(ctx, websocket.MessageText, payload); err != nil {
		t.Fatalf("write subscribe: %v", err)
	}
}

// readAck дочитывает кадры до итогового ack и возвращает число отказов.
func readAck(t *testing.T, conn *websocket.Conn) (map[string]any, int) {
	t.Helper()

	forbidden := 0

	for i := 0; i < 10; i++ {
		message := readJSON(t, conn)

		switch message["type"] {
		case "error":
			forbidden++
		case "ack":
			return message, forbidden
		}
	}

	t.Fatal("no ack received")

	return nil, 0
}

func TestWSRejectsMissingToken(t *testing.T) {
	f := newFixture(t)

	conn, resp, err := f.dial(t, "")
	if err == nil {
		_ = conn.Close(websocket.StatusNormalClosure, "")
		t.Fatal("dial without token succeeded")
	}

	if resp == nil || resp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("status = %v, want 401", resp)
	}
}

func TestWSRejectsInvalidToken(t *testing.T) {
	f := newFixture(t)

	conn, resp, err := f.dial(t, "not-a-jwt")
	if err == nil {
		_ = conn.Close(websocket.StatusNormalClosure, "")
		t.Fatal("dial with invalid token succeeded")
	}

	if resp == nil || resp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("status = %v, want 401", resp)
	}
}

func TestWSDeliversGroupAndTaskRooms(t *testing.T) {
	f := newFixture(t)

	conn, _, err := f.dial(t, f.token(t, f.student1, ws.RoleStudent))
	if err != nil {
		t.Fatalf("dial: %v", err)
	}
	defer conn.Close(websocket.StatusNormalClosure, "")

	expectReady(t, conn, events.RoomUser(f.student1), events.RoomGroup(f.group21))

	f.hub.Publish(context.Background(), events.New(
		events.TypeSubmissionCardMoved, f.student1, events.RoomGroup(f.group21), map[string]any{"submission_id": 1},
	))

	event := readEvent(t, conn)
	if event.EventType != events.TypeSubmissionCardMoved || event.Room != events.RoomGroup(f.group21) {
		t.Fatalf("event = %+v", event)
	}

	// Задание своей группы подписать можно.
	subscribe(t, conn, events.RoomTask(f.taskLab))

	ack, denied := readAck(t, conn)
	if ack["type"] != "ack" || denied != 0 {
		t.Fatalf("ack = %v, denied = %d", ack, denied)
	}

	f.hub.Publish(context.Background(), events.New(
		events.TypeSubmissionCardMoved, f.student1, events.RoomTask(f.taskLab), map[string]any{"submission_id": 2},
	))

	if event := readEvent(t, conn); event.Room != events.RoomTask(f.taskLab) {
		t.Fatalf("task room event = %+v", event)
	}
}

func TestWSReceivesSubmissionLifecycle(t *testing.T) {
	f := newFixture(t)

	studentToken := f.token(t, f.student1, ws.RoleStudent)
	teacherToken := f.token(t, f.teacher, ws.RoleTeacher)

	studentConn, _, err := f.dial(t, studentToken)
	if err != nil {
		t.Fatalf("student dial: %v", err)
	}
	defer studentConn.Close(websocket.StatusNormalClosure, "")

	teacherConn, _, err := f.dial(t, teacherToken)
	if err != nil {
		t.Fatalf("teacher dial: %v", err)
	}
	defer teacherConn.Close(websocket.StatusNormalClosure, "")

	expectReady(t, studentConn, events.RoomUser(f.student1), events.RoomGroup(f.group21))
	expectReady(t, teacherConn, events.RoomUser(f.teacher), events.RoomTeacher(f.teacher))

	var submissionID int64
	if err := f.db.QueryRow(
		`SELECT id FROM submissions WHERE task_id = ? AND student_id = ? AND status = 'TODO' LIMIT 1`,
		f.taskLab,
		f.student1,
	).Scan(&submissionID); err != nil {
		t.Fatalf("seed submission: %v", err)
	}

	statusPath := "/api/submissions/" + strconv.FormatInt(submissionID, 10) + "/status"

	status, body := f.doJSON(t, http.MethodPatch, statusPath, studentToken, map[string]any{"event": "START"})
	if status != http.StatusOK {
		t.Fatalf("START = %d %v", status, body)
	}

	moved := readEvent(t, studentConn)
	if moved.EventType != events.TypeSubmissionCardMoved || moved.Room != events.RoomGroup(f.group21) {
		t.Fatalf("START event = %+v", moved)
	}

	if payload, ok := moved.Payload.(map[string]any); !ok || payload["to"] != "IN_PROGRESS" {
		t.Fatalf("START payload = %#v", moved.Payload)
	}

	status, body = f.doJSON(t, http.MethodPatch, statusPath, studentToken, map[string]any{
		"event":         "SUBMIT",
		"artifact_url":  "https://parta.local/artifact.zip",
		"artifact_hash": "sha256:deadbeef",
	})
	if status != http.StatusOK {
		t.Fatalf("SUBMIT = %d %v", status, body)
	}

	submitted := readEvent(t, studentConn)
	if submitted.EventType != events.TypeSubmissionCardMoved || submitted.Room != events.RoomGroup(f.group21) {
		t.Fatalf("SUBMIT event = %+v", submitted)
	}

	if payload, ok := submitted.Payload.(map[string]any); !ok || payload["to"] != "REVIEW" {
		t.Fatalf("SUBMIT payload = %#v", submitted.Payload)
	}

	inbox := readEvent(t, teacherConn)
	if inbox.EventType != events.TypeReviewInboxCreated || inbox.Room != events.RoomTeacher(f.teacher) {
		t.Fatalf("inbox event = %+v", inbox)
	}

	status, body = f.doJSON(t, http.MethodPost, "/api/submissions/"+strconv.FormatInt(submissionID, 10)+"/verdict", teacherToken, map[string]any{
		"verdict": "ACCEPT",
	})
	if status != http.StatusOK {
		t.Fatalf("verdict = %d %v", status, body)
	}

	verdict := readEvent(t, studentConn)
	if verdict.EventType != events.TypeSubmissionVerdictIssued || verdict.Room != events.RoomGroup(f.group21) {
		t.Fatalf("verdict event = %+v", verdict)
	}

	if payload, ok := verdict.Payload.(map[string]any); !ok || payload["verdict"] != "ACCEPT" {
		t.Fatalf("verdict payload = %#v", verdict.Payload)
	}
}

func TestWSRejectsForeignRooms(t *testing.T) {
	f := newFixture(t)

	conn, _, err := f.dial(t, f.token(t, f.student1, ws.RoleStudent))
	if err != nil {
		t.Fatalf("dial: %v", err)
	}
	defer conn.Close(websocket.StatusNormalClosure, "")

	expectReady(t, conn, events.RoomUser(f.student1), events.RoomGroup(f.group21))

	subscribe(t, conn, events.RoomGroup(f.group22), events.RoomTeacher(f.teacher), events.RoomUser(f.student3))

	ack, denied := readAck(t, conn)
	if ack["type"] != "ack" {
		t.Fatalf("ack = %v", ack)
	}

	if denied != 3 {
		t.Fatalf("forbidden rooms = %d, want 3", denied)
	}

	// Ни одна чужая комната не должна доставлять события.
	f.hub.Publish(context.Background(), events.New(
		events.TypeReviewInboxCreated, f.teacher, events.RoomTeacher(f.teacher), map[string]any{"submission_id": 3},
	))

	ctx, cancel := context.WithTimeout(context.Background(), 300*time.Millisecond)
	defer cancel()

	if _, _, err := conn.Read(ctx); err == nil {
		t.Fatal("student received an event from a foreign room")
	}
}

func TestWSInboxIsAddressedToTeacher(t *testing.T) {
	f := newFixture(t)

	teacherConn, _, err := f.dial(t, f.token(t, f.teacher, ws.RoleTeacher))
	if err != nil {
		t.Fatalf("teacher dial: %v", err)
	}
	defer teacherConn.Close(websocket.StatusNormalClosure, "")

	expectReady(t, teacherConn, events.RoomUser(f.teacher), events.RoomTeacher(f.teacher))

	studentConn, _, err := f.dial(t, f.token(t, f.student1, ws.RoleStudent))
	if err != nil {
		t.Fatalf("student dial: %v", err)
	}
	defer studentConn.Close(websocket.StatusNormalClosure, "")

	expectReady(t, studentConn, events.RoomUser(f.student1), events.RoomGroup(f.group21))

	f.hub.Publish(context.Background(), events.New(
		events.TypeReviewInboxCreated, f.student1, events.RoomTeacher(f.teacher), map[string]any{
			"submission_id": 10,
			"group_id":      f.group21,
		},
	))

	event := readEvent(t, teacherConn)
	if event.EventType != events.TypeReviewInboxCreated || event.Room != events.RoomTeacher(f.teacher) {
		t.Fatalf("teacher event = %+v", event)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 300*time.Millisecond)
	defer cancel()

	if _, _, err := studentConn.Read(ctx); err == nil {
		t.Fatal("student received a teacher inbox event")
	}
}

func TestHubCloseDisconnects(t *testing.T) {
	f := newFixture(t)

	conn, _, err := f.dial(t, f.token(t, f.student1, ws.RoleStudent))
	if err != nil {
		t.Fatalf("dial: %v", err)
	}
	defer conn.Close(websocket.StatusNormalClosure, "")

	expectReady(t, conn, events.RoomUser(f.student1))

	f.hub.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	for {
		if _, _, err := conn.Read(ctx); err != nil {
			if ctx.Err() != nil {
				t.Fatal("connection survived Hub.Close")
			}

			return
		}
	}
}

// TestWSApplicationPingPong проверяет прикладной heartbeat: клиент шлёт ping,
// сервер отвечает pong, не требуя списка комнат.
func TestWSApplicationPingPong(t *testing.T) {
	f := newFixture(t)

	conn, _, err := f.dial(t, f.token(t, f.student1, ws.RoleStudent))
	if err != nil {
		t.Fatalf("dial: %v", err)
	}
	defer conn.Close(websocket.StatusNormalClosure, "")

	expectReady(t, conn, events.RoomUser(f.student1), events.RoomGroup(f.group21))

	payload, err := json.Marshal(map[string]any{"action": "ping"})
	if err != nil {
		t.Fatalf("marshal ping: %v", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := conn.Write(ctx, websocket.MessageText, payload); err != nil {
		t.Fatalf("write ping: %v", err)
	}

	message := readJSON(t, conn)
	if message["type"] != "pong" {
		t.Fatalf("response = %v, want pong", message)
	}
}
