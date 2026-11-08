// Command seed-max сбрасывает локальную базу и оставляет ровно три
// демо-аккаунта MAX для браузерного входа.
//
// Запуск из каталога backend:
//
//	go run ./cmd/seed-max -db ./parta.db -file ./demo/max_seed.sql
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
	seedPath := flag.String("file", "./demo/max_seed.sql", "path to demo SQL")
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

	if _, err := db.ExecContext(ctx, "PRAGMA foreign_keys=OFF"); err != nil {
		fail("disable foreign keys: %v", err)
	}

	rows, err := db.QueryContext(ctx, `
		SELECT name FROM sqlite_master
		WHERE type = 'table'
		  AND name NOT LIKE 'sqlite_%'
		  AND name != 'schema_migrations'
	`)
	if err != nil {
		fail("list tables: %v", err)
	}

	tables := make([]string, 0)

	for rows.Next() {
		var name string

		if err := rows.Scan(&name); err != nil {
			fail("scan table: %v", err)
		}

		tables = append(tables, name)
	}

	if err := rows.Close(); err != nil {
		fail("close tables: %v", err)
	}

	for _, table := range tables {
		quoted := `"` + strings.ReplaceAll(table, `"`, `""`) + `"`

		if _, err := db.ExecContext(ctx, "DELETE FROM "+quoted); err != nil {
			fail("clear %s: %v", table, err)
		}
	}

	raw, err := os.ReadFile(*seedPath)
	if err != nil {
		fail("read seed: %v", err)
	}

	for _, statement := range strings.Split(string(raw), ";") {
		statement = strings.TrimSpace(statement)
		if statement == "" || strings.HasPrefix(statement, "--") && !strings.Contains(statement, "\n") {
			continue
		}

		if _, err := db.ExecContext(ctx, statement); err != nil {
			fail("seed statement: %v\n%s", err, statement)
		}
	}

	var users int

	if err := db.QueryRowContext(ctx, "SELECT COUNT(*) FROM users").Scan(&users); err != nil {
		fail("count users: %v", err)
	}

	if users != 3 {
		fail("seeded users = %d, want 3", users)
	}

	fmt.Printf("seeded %s: %d users (max:000000001..3)\n", *dbPath, users)
}

func fail(format string, args ...any) {
	fmt.Fprintf(os.Stderr, format+"\n", args...)
	os.Exit(1)
}
