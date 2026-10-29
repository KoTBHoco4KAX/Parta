// Package httpapi реализует REST API ПАРТА на стандартном net/http.
package httpapi

import (
	"context"
	"database/sql"
	"net/http"
	"time"

	"github.com/parta/backend/internal/config"
	domainerrors "github.com/parta/backend/internal/domain/errors"
	"github.com/parta/backend/internal/events"
	"github.com/parta/backend/internal/storage"
)

// Роли RBAC из spec/01_SCHEMA.sql.
const (
	RoleAdmin   = "admin"
	RoleTeacher = "teacher"
	RoleStudent = "student"
)

// Server — набор зависимостей и хендлеров REST API.
type Server struct {
	cfg       config.Config
	db        *sql.DB
	now       func() time.Time
	tokens    *TokenService
	publisher events.Publisher

	users       *storage.UserRepo
	groups      *storage.GroupRepo
	tasks       *storage.TaskRepo
	submissions *storage.SubmissionRepo
	ledger      *storage.XPLedgerRepo
	wagers      *storage.WagerRepo
	peerReviews *storage.PeerReviewRepo
	teamSlots   *storage.TeamSlotRepo
}

// Option настраивает Server.
type Option func(*Server)

// WithPublisher подключает реалтайм-публикатор. Без этой опции используется
// no-op: REST-тесты и сценарии без WS работают без хаба.
func WithPublisher(publisher events.Publisher) Option {
	return func(s *Server) {
		if publisher != nil {
			s.publisher = publisher
		}
	}
}

// New собирает сервер поверх открытой БД.
func New(cfg config.Config, db *sql.DB, opts ...Option) *Server {
	now := time.Now

	server := &Server{
		cfg:         cfg,
		db:          db,
		now:         now,
		tokens:      NewTokenService(cfg.JWTSecret, now),
		publisher:   events.NoopPublisher{},
		users:       storage.NewUserRepo(db),
		groups:      storage.NewGroupRepo(db),
		tasks:       storage.NewTaskRepo(db),
		submissions: storage.NewSubmissionRepo(db),
		ledger:      storage.NewXPLedgerRepo(db),
		wagers:      storage.NewWagerRepo(db),
		peerReviews: storage.NewPeerReviewRepo(db),
		teamSlots:   storage.NewTeamSlotRepo(db),
	}

	for _, opt := range opts {
		opt(server)
	}

	return server
}

// Handler собирает маршруты, middleware и публичный /api.
func (s *Server) Handler() http.Handler {
	public := http.NewServeMux()
	public.Handle("POST /api/auth/login", http.HandlerFunc(s.handleLogin))
	public.Handle("POST /api/auth/dev-login", http.HandlerFunc(s.handleDevLogin))

	protected := http.NewServeMux()
	protected.Handle("GET /api/tasks", http.HandlerFunc(s.handleListTasks))
	protected.Handle("POST /api/tasks", http.HandlerFunc(s.handleCreateTask))
	protected.Handle("GET /api/submissions", http.HandlerFunc(s.handleListSubmissions))
	protected.Handle("POST /api/submissions", http.HandlerFunc(s.handleCreateSubmission))
	protected.Handle("GET /api/wagers", http.HandlerFunc(s.handleListWagers))
	protected.Handle("GET /api/peer-reviews", http.HandlerFunc(s.handleListPeerReviews))
	protected.Handle("GET /api/assignments", http.HandlerFunc(s.handleListAssignments))
	protected.Handle("GET /api/users", http.HandlerFunc(s.handleUsersListFiltered))
	protected.Handle("POST /api/users", http.HandlerFunc(s.handleCreateUser))
	protected.Handle("PATCH /api/users/{id}", http.HandlerFunc(s.handleUserGroupPatch))
	protected.Handle("DELETE /api/users/{id}", http.HandlerFunc(s.handleDeleteUser))
	protected.Handle("GET /api/groups", http.HandlerFunc(s.handleListGroups))
	protected.Handle("POST /api/groups", http.HandlerFunc(s.handleCreateGroup))
	protected.Handle("DELETE /api/groups/{id}", http.HandlerFunc(s.handleDeleteGroup))
	protected.Handle("GET /api/attachments", http.HandlerFunc(s.handleAttachmentsList))
	protected.Handle("GET /api/attachments/{id}", http.HandlerFunc(s.handleAttachmentDownload))
	protected.Handle("PATCH /api/submissions/{id}/status", http.HandlerFunc(s.handleSubmissionStatus))
	protected.Handle("POST /api/submissions/{id}/verdict", http.HandlerFunc(s.handleVerdict))
	protected.Handle("POST /api/users/me/streak-freezes/purchase", http.HandlerFunc(s.handlePurchaseFreezes))
	protected.Handle("POST /api/wagers", http.HandlerFunc(s.handleCreateWager))
	protected.Handle("POST /api/peer-reviews", http.HandlerFunc(s.handleCreatePeerReview))
	protected.Handle("POST /api/peer-reviews/{id}/award", http.HandlerFunc(s.handlePeerReviewAward))
	protected.Handle("POST /api/peer-reviews/{id}/claim", http.HandlerFunc(s.handleClaimPeerReview))
	protected.Handle("POST /api/peer-reviews/{id}/complete", http.HandlerFunc(s.handleCompletePeerReview))
	protected.Handle("POST /api/team-slots/{id}/carry-over", http.HandlerFunc(s.handleCarryOver))
	protected.Handle("/", http.HandlerFunc(s.handleNotFound))

	public.Handle("/api/", s.authenticate(protected))

	return s.recoverer(s.logging(public))
}

// handleNotFound отвечает 404 в общем JSON-формате для неизвестных /api-маршрутов.
func (s *Server) handleNotFound(w http.ResponseWriter, _ *http.Request) {
	writeError(w, domainerrors.ErrNotFound)
}

// principalOr401 достаёт пользователя из контекста; при отсутствии пишет 401.
func (s *Server) principalOr401(w http.ResponseWriter, r *http.Request) (principal, bool) {
	p, ok := principalFrom(r.Context())
	if !ok {
		writeUnauthorized(w, "authentication required")

		return principal{}, false
	}

	return p, true
}

// requireRole проверяет роль и отвечает 403 при несовпадении.
// Возвращает false, если ответ уже записан.
func requireRole(w http.ResponseWriter, p principal, roles ...string) bool {
	for _, role := range roles {
		if p.Role == role {
			return true
		}
	}

	writeError(w, domainerrors.ErrForbidden)

	return false
}

// withTx выполняет fn в транзакции: commit при успехе, rollback при ошибке.
// Внутри fn нельзя обращаться к методам репозиториев, читающим через *sql.DB:
// пул ограничен одним соединением (storage.Open), и такое чтение зависнет.
func (s *Server) withTx(ctx context.Context, fn func(tx *sql.Tx) error) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}

	if err := fn(tx); err != nil {
		_ = tx.Rollback()

		return err
	}

	return tx.Commit()
}

// parsePathID разбирает целочисленный path-параметр.
func parsePathID(r *http.Request, name string) (int64, error) {
	raw := r.PathValue(name)

	var id int64

	for _, digit := range raw {
		if digit < '0' || digit > '9' {
			return 0, domainerrors.ErrInvalidArgument
		}

		id = id*10 + int64(digit-'0')
	}

	if raw == "" || id <= 0 {
		return 0, domainerrors.ErrInvalidArgument
	}

	return id, nil
}
