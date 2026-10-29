package storage

import (
	"context"
	"database/sql"
	"fmt"

	"github.com/parta/backend/internal/migrations"
)

// Migrate creates the schema_migrations bookkeeping table and applies every
// embedded migration that has not been applied yet. Each migration runs in its
// own transaction; a failure rolls that migration back and stops the run.
func Migrate(ctx context.Context, db *sql.DB) error {
	if err := ensureMigrationsTable(ctx, db); err != nil {
		return err
	}

	list, err := migrations.Files()
	if err != nil {
		return err
	}

	for _, m := range list {
		if err := applyMigration(ctx, db, m); err != nil {
			return err
		}
	}

	return nil
}

func ensureMigrationsTable(ctx context.Context, db *sql.DB) error {
	const ddl = `CREATE TABLE IF NOT EXISTS schema_migrations (
    version     INTEGER PRIMARY KEY,
    applied_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
)`

	if _, err := db.ExecContext(ctx, ddl); err != nil {
		return fmt.Errorf("storage: create schema_migrations: %w", err)
	}

	return nil
}

func applyMigration(ctx context.Context, db *sql.DB, m migrations.Migration) error {
	// Миграции 004 пересоздаёт parent-таблицу users; SQLite не умеет менять
	// CHECK на месте, а DROP TABLE с включёнными FK внутри транзакции падает.
	// На время стартовых миграций FK выключается (одно соединение), после —
	// включается обратно. На работу приложения это не влияет.
	if _, err := db.ExecContext(ctx, `PRAGMA foreign_keys = OFF`); err != nil {
		return fmt.Errorf("storage: disable foreign_keys: %w", err)
	}

	defer func() {
		_, _ = db.ExecContext(ctx, `PRAGMA foreign_keys = ON`)
	}()

	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("storage: begin migration %s: %w", m.Name, err)
	}

	defer func() {
		// No-op after Commit; releases the connection on any early return.
		// The error is intentionally discarded: Rollback on a finished
		// transaction is expected.
		_ = tx.Rollback()
	}()

	applied, err := isApplied(ctx, tx, m.Version)
	if err != nil {
		return err
	}

	if !applied {
		if _, err := tx.ExecContext(ctx, m.SQL); err != nil {
			return fmt.Errorf("storage: apply migration %s: %w", m.Name, err)
		}

		if _, err := tx.ExecContext(ctx,
			`INSERT INTO schema_migrations (version) VALUES (?)`, m.Version); err != nil {
			return fmt.Errorf("storage: record migration %s: %w", m.Name, err)
		}
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("storage: commit migration %s: %w", m.Name, err)
	}

	return nil
}

func isApplied(ctx context.Context, tx *sql.Tx, version int) (bool, error) {
	var found int

	err := tx.QueryRowContext(ctx,
		`SELECT COUNT(1) FROM schema_migrations WHERE version = ?`, version).Scan(&found)
	if err != nil {
		return false, fmt.Errorf("storage: check migration %d: %w", version, err)
	}

	return found > 0, nil
}
