package maxbot

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestHandleUpdateStartSendsWebAppButton(t *testing.T) {
	type captured struct {
		userID string
		token  string
		body   outboundMessage
	}

	got := make(chan captured, 1)

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/messages" {
			http.NotFound(w, r)

			return
		}

		var body outboundMessage
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Errorf("decode message: %v", err)
		}

		got <- captured{
			userID: r.URL.Query().Get("user_id"),
			token:  r.Header.Get("Authorization"),
			body:   body,
		}

		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	bot := newBot(Config{
		Token:   "max-token",
		BaseURL: server.URL,
		AppURL:  "https://slow-cat.vps.ktk-45.ru/",
	})

	update := Update{
		UpdateType: "message_created",
		Message: &Message{
			Sender:    &User{UserID: 42},
			Recipient: &Recipient{ChatID: 77, ChatType: "dialog"},
			Body:      &Body{Text: "/start"},
		},
	}

	if err := bot.handleUpdate(context.Background(), update); err != nil {
		t.Fatalf("handleUpdate: %v", err)
	}

	capturedMessage := <-got

	if capturedMessage.userID != "42" {
		t.Fatalf("user_id = %q, want 42", capturedMessage.userID)
	}

	if capturedMessage.token != "max-token" {
		t.Fatalf("Authorization = %q", capturedMessage.token)
	}

	if len(capturedMessage.body.Attachments) != 1 {
		t.Fatalf("attachments = %d, want 1", len(capturedMessage.body.Attachments))
	}

	button := capturedMessage.body.Attachments[0].Payload.Buttons[0][0]
	if button.Type != "open_app" || button.WebApp != "https://slow-cat.vps.ktk-45.ru/" {
		t.Fatalf("button = %#v", button)
	}
}

func TestNewBotTLSConfig(t *testing.T) {
	bot := newBot(Config{
		Token:              "max-token",
		InsecureSkipVerify: true,
	})

	transport, ok := bot.client.Transport.(*http.Transport)
	if !ok {
		t.Fatal("transport is not *http.Transport")
	}

	if transport.TLSClientConfig == nil || !transport.TLSClientConfig.InsecureSkipVerify {
		t.Fatal("InsecureSkipVerify is not enabled")
	}
}

func TestIsStartCommand(t *testing.T) {
	for _, text := range []string{"/start", " /start", "/start@parta_bot", "/START"} {
		if !isStartCommand(text) {
			t.Fatalf("%q should be start", text)
		}
	}

	for _, text := range []string{"", "/help", "start"} {
		if isStartCommand(text) {
			t.Fatalf("%q should not be start", text)
		}
	}
}
