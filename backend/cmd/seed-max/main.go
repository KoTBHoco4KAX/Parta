// Command seed-max сбрасывает локальную базу и оставляет ровно три
// демо-аккаунта MAX для браузерного входа.
//
// Запуск из каталога backend:
//
//	go run ./cmd/seed-max -db ./parta.db
package main

import (
	"context"
	"flag"
	"fmt"
	"os"

	"github.com/parta/backend/internal/demoseed"
	"github.com/parta/backend/internal/storage"
)

func main() {
	dbPath := flag.String("db", "./parta.db", "path to SQLite database")
	flag.Parse()

	ctx := context.Background()

	db, err := storage.Open(*dbPath)
	if err != nil {
		fail("open database: %v", err)
	}
	defer db.Close()

	if err := storage.Migrate(ctx, db); err != nil {
		fail("apply migrations: %v", err)
	}

	if err := demoseed.Reset(ctx, db); err != nil {
		fail("seed demo data: %v", err)
	}

	fmt.Printf("seeded %s: 3 MAX users (max:000000001..3)\n", *dbPath)
}

func fail(format string, args ...any) {
	fmt.Fprintf(os.Stderr, format+"\n", args...)
	os.Exit(1)
}
