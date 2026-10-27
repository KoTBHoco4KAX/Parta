package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/parta/backend/internal/config"
	httpapi "github.com/parta/backend/internal/http"
	"github.com/parta/backend/internal/storage"
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

	server := &http.Server{
		Addr:              cfg.Addr,
		Handler:           httpapi.New(cfg, db).Handler(),
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

	shutdownCtx, cancel := context.WithTimeout(context.Background(), shutdownTimeout)
	defer cancel()

	if err := server.Shutdown(shutdownCtx); err != nil {
		log.Printf("http: shutdown: %v", err)
	}
}

// fallbackReadHeaderTimeout ограничивает время чтения заголовков запроса.
const fallbackReadHeaderTimeout = 10 * time.Second
