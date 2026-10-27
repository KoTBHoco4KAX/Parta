package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/parta/backend/internal/auth"
	"github.com/parta/backend/internal/config"
	httpapi "github.com/parta/backend/internal/http"
	"github.com/parta/backend/internal/storage"
	"github.com/parta/backend/internal/ws"
)

// shutdownTimeout — сколько ждём завершения активных запросов при остановке.
const shutdownTimeout = 5 * time.Second

func main() {
	log.Println("parta boot")

	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("config: %v", err)
	}

	db, err := storage.Open(cfg.DBPath)
	if err != nil {
		log.Fatalf("storage: %v", err)
	}
	defer db.Close()

	if err := storage.Migrate(context.Background(), db); err != nil {
		log.Fatalf("migrate: %v", err)
	}

	log.Println("migrations applied")

	// Один сервис токенов на REST и WS: второго JWT-парсера нет.
	tokens := auth.NewTokenService(cfg.JWTSecret, time.Now)

	hub := ws.NewHub()
	api := httpapi.New(cfg, db, httpapi.WithPublisher(hub)).Handler()

	wsOptions := []ws.Option{}
	if cfg.IsDev() {
		// Vite живёт на другом порту: разрешаем локальные Origin для dev.
		wsOptions = append(wsOptions, ws.WithOriginPatterns("localhost:*", "127.0.0.1:*"))
	}

	realtime := ws.NewServer(
		tokens,
		hub,
		storage.NewUserRepo(db),
		storage.NewTaskRepo(db),
		wsOptions...,
	)

	mux := http.NewServeMux()
	mux.Handle("/ws", realtime)
	mux.Handle("/", api)

	server := &http.Server{
		Addr:              cfg.Addr,
		Handler:           mux,
		ReadHeaderTimeout: fallbackReadHeaderTimeout,
	}

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)

	go func() {
		log.Printf("http: listening on %s (env=%s)", cfg.Addr, cfg.Env)

		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("http: %v", err)
		}
	}()

	<-stop

	// WebSocket-соединения не закрываются http.Server.Shutdown — закрываем хабом.
	hub.Close()

	shutdownCtx, cancel := context.WithTimeout(context.Background(), shutdownTimeout)
	defer cancel()

	if err := server.Shutdown(shutdownCtx); err != nil {
		log.Printf("http: shutdown: %v", err)
	}
}

// fallbackReadHeaderTimeout ограничивает время чтения заголовков запроса.
const fallbackReadHeaderTimeout = 10 * time.Second
