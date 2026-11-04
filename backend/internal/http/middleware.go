package httpapi

import (
	"context"
	"log"
	"net/http"
	"runtime/debug"
	"strings"
	"time"
)

// principal — аутентифицированный пользователь из JWT.
type principal struct {
	UserID int64
	Role   string
}

// principalKey — ключ контекста для principal.
type principalKey struct{}

// withPrincipal кладёт пользователя в контекст запроса.
func withPrincipal(ctx context.Context, p principal) context.Context {
	return context.WithValue(ctx, principalKey{}, p)
}

// principalFrom достаёт пользователя из контекста.
func principalFrom(ctx context.Context) (principal, bool) {
	p, ok := ctx.Value(principalKey{}).(principal)

	return p, ok
}

// bearerToken вынимает токен из заголовка Authorization.
func bearerToken(r *http.Request) string {
	header := r.Header.Get("Authorization")

	scheme, token, found := strings.Cut(header, " ")
	if !found || !strings.EqualFold(scheme, "Bearer") {
		return ""
	}

	return strings.TrimSpace(token)
}

// authenticate проверяет JWT и кладёт principal в контекст.
func (s *Server) authenticate(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		raw := bearerToken(r)
		if raw == "" {
			writeUnauthorized(w, "missing bearer token")

			return
		}

		claims, err := s.tokens.Parse(raw)
		if err != nil {
			writeUnauthorized(w, "invalid or expired token")

			return
		}

		// В API принимаются только пользовательские токены с известной ролью.
		// Read-only токен peer-review (scope без role) не должен становиться
		// principal: иначе любой валидно подписанный токен открывал бы REST.
		if claims.Scope != "" || !validRole(claims.Role) {
			writeUnauthorized(w, "token does not grant API access")

			return
		}

		next.ServeHTTP(w, r.WithContext(withPrincipal(r.Context(), principal{
			UserID: claims.Sub,
			Role:   claims.Role,
		})))
	})
}

// statusRecorder запоминает статус ответа для лога.
type statusRecorder struct {
	http.ResponseWriter
	status int
}

// WriteHeader запоминает первый записанный статус.
func (r *statusRecorder) WriteHeader(status int) {
	if r.status == 0 {
		r.status = status
	}

	r.ResponseWriter.WriteHeader(status)
}

// Write запоминает неявный 200, если WriteHeader ещё не вызывался.
func (r *statusRecorder) Write(body []byte) (int, error) {
	if r.status == 0 {
		r.status = http.StatusOK
	}

	return r.ResponseWriter.Write(body)
}

// logging логирует метод, путь, статус и длительность запроса.
func (s *Server) logging(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		started := s.now()
		recorder := &statusRecorder{ResponseWriter: w}

		next.ServeHTTP(recorder, r)

		status := recorder.status
		if status == 0 {
			status = http.StatusOK
		}

		log.Printf("http: %s %s -> %d (%s)", r.Method, r.URL.Path, status, s.now().Sub(started).Round(time.Microsecond))
	})
}

// recoverer превращает панику хендлера в 500 в общем формате ошибки.
// Паника одного запроса не должна ронять процесс: сервер продолжает
// обслуживать остальные соединения, а клиент получает JSON-конверт.
func (s *Server) recoverer(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if recovered := recover(); recovered != nil {
				log.Printf("http: panic on %s %s: %v\n%s", r.Method, r.URL.Path, recovered, debug.Stack())
				writeJSON(w, http.StatusInternalServerError, errorBody{
					Error: "internal server error",
					Code:  CodeInternal,
				})
			}
		}()

		next.ServeHTTP(w, r)
	})
}
