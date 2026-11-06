// Command seed-demo наполняет локальную базу демонстрационными данными.
//
// Запуск из каталога backend:
//
//	go run ./cmd/seed-demo -db ./parta.db -file ./demo/seed.sql
//
// Скрипт идемпотентен: повторный запуск не создаёт дублей и обновляет
// недельный рейтинг на текущую неделю. В тестовые миграции демо-данные не
// попадают, поэтому фиксированные ожидания тестов не ломаются.
package main

import (
	"context"
	"flag"
	"fmt"
	"os"
	"strings"

	"github.com/parta/backend/internal/storage"
)

func main() {
	dbPath := flag.String("db", "./parta.db", "path to SQLite database")
	seedPath := flag.String("file", "./demo/seed.sql", "path to demo SQL")
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

	raw, err := os.ReadFile(*seedPath)
	if err != nil {
		fail("read seed: %v", err)
	}

	statements := strings.Split(string(raw), ";")
	executed := 0

	for _, statement := range statements {
		statement = strings.TrimSpace(statement)
		if statement == "" {
			continue
		}

		if _, err := db.ExecContext(ctx, statement); err != nil {
			fail("seed statement %d: %v\n%s", executed+1, err, statement)
		}

		executed++
	}

	fmt.Printf("seeded %s with %d statements\n", *dbPath, executed)

	for _, table := range []string{"groups", "users", "tasks", "submissions", "task_templates"} {
		var count int

		if err := db.QueryRowContext(ctx, "SELECT COUNT(*) FROM "+table).Scan(&count); err != nil {
			fail("count %s: %v", table, err)
		}

		fmt.Printf("%-16s %d\n", table, count)
	}
}

func fail(format string, args ...any) {
	fmt.Fprintf(os.Stderr, format+"\n", args...)
	os.Exit(1)
}
