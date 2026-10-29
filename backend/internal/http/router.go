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
	// Роли проверяются на уровне маршрута, до входа в хендлер: даже если
	// проверка внутри хендлера будет забыта, чужую ручку вызвать нельзя.
	adminOnly := s.roleGuard(RoleAdmin)
	teacherOnly := s.roleGuard(RoleTeacher)
	staffOnly := s.roleGuard(RoleTeacher, RoleAdmin)
	studentOnly := s.roleGuard(RoleStudent)

	public := http.NewServeMux()
	public.Handle("POST /api/auth/login", http.HandlerFunc(s.handleLogin))
	public.Handle("POST /api/auth/dev-login", http.HandlerFunc(s.handleDevLogin))

	protected := http.NewServeMux()
	protected.Handle("GET /api/tasks", http.HandlerFunc(s.handleListTasks))
	protected.Handle("POST /api/tasks", teacherOnly(http.HandlerFunc(s.handleCreateTask)))
	protected.Handle("GET /api/submissions", http.HandlerFunc(s.handleListSubmissions))
	protected.Handle("POST /api/submissions", studentOnly(http.HandlerFunc(s.handleCreateSubmission)))
	protected.Handle("GET /api/wagers", studentOnly(http.HandlerFunc(s.handleListWagers)))
	protected.Handle("GET /api/peer-reviews", staffOnly(http.HandlerFunc(s.handleListPeerReviews)))
	protected.Handle("GET /api/assignments", staffOnly(http.HandlerFunc(s.handleListAssignments)))
	protected.Handle("GET /api/users", adminOnly(http.HandlerFunc(s.handleListUsers)))
	protected.Handle("POST /api/users", adminOnly(http.HandlerFunc(s.handleCreateUser)))
	protected.Handle("DELETE /api/users/{id}", adminOnly(http.HandlerFunc(s.handleDeleteUser)))
	protected.Handle("GET /api/groups", adminOnly(http.HandlerFunc(s.handleListGroups)))
	protected.Handle("POST /api/groups", adminOnly(http.HandlerFunc(s.handleCreateGroup)))
	protected.Handle("DELETE /api/groups/{id}", adminOnly(http.HandlerFunc(s.handleDeleteGroup)))
	protected.Handle("PATCH /api/submissions/{id}/status", studentOnly(http.HandlerFunc(s.handleSubmissionStatus)))
	protected.Handle("POST /api/submissions/{id}/verdict", staffOnly(http.HandlerFunc(s.handleVerdict)))
	protected.Handle("POST /api/users/me/streak-freezes/purchase", studentOnly(http.HandlerFunc(s.handlePurchaseFreezes)))
	protected.Handle("POST /api/wagers", studentOnly(http.HandlerFunc(s.handleCreateWager)))
	protected.Handle("POST /api/peer-reviews", studentOnly(http.HandlerFunc(s.handleCreatePeerReview)))
	protected.Handle("POST /api/peer-reviews/{id}/claim", studentOnly(http.HandlerFunc(s.handleClaimPeerReview)))
	protected.Handle("POST /api/peer-reviews/{id}/complete", studentOnly(http.HandlerFunc(s.handleCompletePeerReview)))
	protected.Handle("POST /api/team-slots/{id}/carry-over", studentOnly(http.HandlerFunc(s.handleCarryOver)))
	protected.Handle("/", http.HandlerFunc(s.handleNotFound))

	public.Handle("/api/", s.authenticate(protected))
	// Неизвестные пути тоже отвечают JSON-конвертом, а не текстом net/http.
	public.Handle("/", http.HandlerFunc(s.handleNotFound))

	return s.recoverer(s.logging(public))
}

// roleGuard проверяет JWT-роль маршрута до вызова хендлера.
func (s *Server) roleGuard(roles ...string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			p, ok := s.principalOr401(w, r)
			if !ok {
				return
			}

			if !requireRole(w, p, roles...) {
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}

// handleNotFound отвечает 404 в общем JSON-формате для неизвестных маршрутов.
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
