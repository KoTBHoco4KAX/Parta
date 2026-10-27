package storage

import (
	"database/sql"
	"fmt"

	_ "modernc.org/sqlite"
)

// Open opens the ПАРТА SQLite database at dbPath and configures the pragmas
// required by spec/01_SCHEMA.sql (foreign_keys, WAL, busy_timeout).
func Open(dbPath string) (*sql.DB, error) {
	if dbPath == "" {
		return nil, fmt.Errorf("storage: empty database path")
	}

	dsn := "file:" + dbPath +
		"?_pragma=foreign_keys(1)" +
		"&_pragma=journal_mode(WAL)" +
		"&_pragma=busy_timeout(5000)"

	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, fmt.Errorf("storage: open %s: %w", dbPath, err)
	}

	// SQLite in WAL mode does not tolerate concurrent writers: keep exactly one
	// connection so every transaction is serialized by database/sql itself.
	db.SetMaxOpenConns(1)
	db.SetConnMaxLifetime(0)

	return db, nil
}
