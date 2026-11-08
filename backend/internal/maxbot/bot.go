// Package maxbot реализует минимальный long-polling воркер MAX Bot API.
package maxbot

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

const (
	defaultBaseURL = "https://platform-api2.max.ru"
	defaultAppURL  = "https://slow-cat.vps.ktk-45.ru/"
	pollTimeout    = 30 * time.Second
	maxBackoff     = 30 * time.Second
)

// Config — настройки бота.
type Config struct {
	Token   string
	BaseURL string
	AppURL  string
}

// Bot — long-polling клиент MAX Bot API.
type Bot struct {
	token   string
	baseURL string
	appURL  string
	client  *http.Client
	logger  *log.Logger
}

// Run запускает цикл long polling. Без токена воркер сразу завершается.
func Run(ctx context.Context, cfg Config) {
	bot := newBot(cfg)

	if bot.token == "" {
		bot.logger.Println("maxbot: MAX_BOT_TOKEN is empty, worker disabled")

		return
	}

	bot.logger.Printf("maxbot: long polling started (%s)", bot.baseURL)
	bot.loop(ctx)
}

func newBot(cfg Config) *Bot {
	baseURL := strings.TrimRight(strings.TrimSpace(cfg.BaseURL), "/")
	if baseURL == "" {
		baseURL = defaultBaseURL
	}

	appURL := strings.TrimSpace(cfg.AppURL)
	if appURL == "" {
		appURL = defaultAppURL
	}

	return &Bot{
		token:   strings.TrimSpace(cfg.Token),
		baseURL: baseURL,
		appURL:  appURL,
		client:  &http.Client{Timeout: 60 * time.Second},
		logger:  log.Default(),
	}
}

func (b *Bot) loop(ctx context.Context) {
	var marker *int64
	backoff := time.Second

	for {
		if ctx.Err() != nil {
			b.logger.Println("maxbot: stopped")

			return
		}

		updates, next, err := b.getUpdates(ctx, marker)
		if err != nil {
			b.logger.Printf("maxbot: getUpdates: %v", err)

			if !sleep(ctx, backoff) {
				return
			}

			if backoff < maxBackoff {
				backoff *= 2
			}

			continue
		}

		backoff = time.Second
		marker = next

		for _, update := range updates {
			if err := b.handleUpdate(ctx, update); err != nil {
				b.logger.Printf("maxbot: update %s: %v", update.UpdateType, err)
			}
		}
	}
}

func (b *Bot) getUpdates(ctx context.Context, marker *int64) ([]Update, *int64, error) {
	query := url.Values{}
	query.Set("limit", "100")
	query.Set("timeout", strconv.Itoa(int(pollTimeout.Seconds())))

	if marker != nil {
		query.Set("marker", strconv.FormatInt(*marker, 10))
	}

	endpoint := b.baseURL + "/updates?" + query.Encode()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, marker, err
	}

	req.Header.Set("Authorization", b.token)
	req.Header.Set("Accept", "application/json")

	resp, err := b.client.Do(req)
	if err != nil {
		return nil, marker, err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 512))

		return nil, marker, fmt.Errorf("status %d: %s", resp.StatusCode, strings.TrimSpace(string(body)))
	}

	var payload updatesResponse
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		return nil, marker, fmt.Errorf("decode updates: %w", err)
	}

	return payload.Updates, payload.Marker, nil
}

func (b *Bot) handleUpdate(ctx context.Context, update Update) error {
	switch update.UpdateType {
	case "bot_started":
		target, ok := botStartedTarget(update)
		if !ok {
			return nil
		}

		return b.sendWelcome(ctx, target)
	case "message_created":
		if update.Message == nil || !isStartCommand(update.Message.text()) {
			return nil
		}

		target, ok := messageTarget(update.Message)
		if !ok {
			return nil
		}

		return b.sendWelcome(ctx, target)
	default:
		return nil
	}
}

func (b *Bot) sendWelcome(ctx context.Context, target chatTarget) error {
	payload := outboundMessage{
		Text: "Добро пожаловать в ПАРТУ! Откройте приложение, чтобы начать.",
		Attachments: []outboundAttachment{
			{
				Type: "inline_keyboard",
				Payload: keyboardPayload{
					Buttons: [][]keyboardButton{
						{
							{
								Type:   "open_app",
								Text:   "Открыть ПАРТУ",
								WebApp: b.appURL,
							},
						},
					},
				},
			},
		},
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	query := url.Values{}
	if target.kind == "chat_id" {
		query.Set("chat_id", strconv.FormatInt(target.id, 10))
	} else {
		query.Set("user_id", strconv.FormatInt(target.id, 10))
	}

	endpoint := b.baseURL + "/messages?" + query.Encode()

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		return err
	}

	req.Header.Set("Authorization", b.token)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")

	resp, err := b.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		responseBody, _ := io.ReadAll(io.LimitReader(resp.Body, 512))

		return fmt.Errorf("send message: status %d: %s", resp.StatusCode, strings.TrimSpace(string(responseBody)))
	}

	b.logger.Printf("maxbot: welcome sent (%s=%d)", target.kind, target.id)

	return nil
}

func isStartCommand(text string) bool {
	fields := strings.Fields(strings.ToLower(text))

	if len(fields) == 0 {
		return false
	}

	return fields[0] == "/start" || strings.HasPrefix(fields[0], "/start@")
}

type chatTarget struct {
	kind string
	id   int64
}

func messageTarget(message *Message) (chatTarget, bool) {
	if message.Recipient != nil {
		if message.Recipient.ChatType == "dialog" && message.Sender != nil && message.Sender.UserID != 0 {
			return chatTarget{kind: "user_id", id: message.Sender.UserID}, true
		}

		if message.Recipient.UserID != 0 {
			return chatTarget{kind: "user_id", id: message.Recipient.UserID}, true
		}

		if message.Recipient.ChatID != 0 {
			return chatTarget{kind: "chat_id", id: message.Recipient.ChatID}, true
		}
	}

	if message.Sender != nil && message.Sender.UserID != 0 {
		return chatTarget{kind: "user_id", id: message.Sender.UserID}, true
	}

	return chatTarget{}, false
}

func botStartedTarget(update Update) (chatTarget, bool) {
	if update.User != nil && update.User.UserID != 0 {
		return chatTarget{kind: "user_id", id: update.User.UserID}, true
	}

	if update.ChatID != 0 {
		return chatTarget{kind: "chat_id", id: update.ChatID}, true
	}

	return chatTarget{}, false
}

func sleep(ctx context.Context, duration time.Duration) bool {
	timer := time.NewTimer(duration)
	defer timer.Stop()

	select {
	case <-ctx.Done():
		return false
	case <-timer.C:
		return true
	}
}

// --- DTO MAX Bot API ---

type updatesResponse struct {
	Updates []Update `json:"updates"`
	Marker  *int64   `json:"marker"`
}

type Update struct {
	UpdateType string   `json:"update_type"`
	Timestamp  int64    `json:"timestamp"`
	ChatID     int64    `json:"chat_id"`
	User       *User    `json:"user"`
	Message    *Message `json:"message"`
}

type User struct {
	UserID    int64  `json:"user_id"`
	FirstName string `json:"first_name"`
	LastName  string `json:"last_name"`
	Username  string `json:"username"`
	IsBot     bool   `json:"is_bot"`
}

type Message struct {
	Sender    *User      `json:"sender"`
	Recipient *Recipient `json:"recipient"`
	Body      *Body      `json:"body"`
	// Text — fallback для упрощённых ответов long polling.
	Text string `json:"text"`
}

func (m *Message) text() string {
	if m.Body != nil && m.Body.Text != "" {
		return m.Body.Text
	}

	return m.Text
}

type Recipient struct {
	ChatID   int64  `json:"chat_id"`
	ChatType string `json:"chat_type"`
	UserID   int64  `json:"user_id"`
}

type Body struct {
	Mid  string `json:"mid"`
	Text string `json:"text"`
}

type outboundMessage struct {
	Text        string               `json:"text"`
	Attachments []outboundAttachment `json:"attachments"`
}

type outboundAttachment struct {
	Type    string          `json:"type"`
	Payload keyboardPayload `json:"payload"`
}

type keyboardPayload struct {
	Buttons [][]keyboardButton `json:"buttons"`
}

type keyboardButton struct {
	Type   string `json:"type"`
	Text   string `json:"text"`
	WebApp string `json:"web_app,omitempty"`
}
