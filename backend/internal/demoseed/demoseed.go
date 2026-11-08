// Package demoseed наполняет пустую базу тремя фиксированными MAX-аккаунтами.
package demoseed

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
)

const seedSQL = `
INSERT INTO groups (code, title) VALUES ('MAX', 'MAX')
ON CONFLICT (code) DO NOTHING;

INSERT INTO disciplines (code, title) VALUES ('DB', 'Базы данных')
ON CONFLICT (code) DO NOTHING;

INSERT INTO users (external_id, role, group_id, display_name) VALUES
    ('max:000000001', 'student', (SELECT id FROM groups WHERE code = 'MAX'), 'Демо Студент'),
    ('max:000000002', 'teacher', NULL, 'Демо Преподаватель'),
    ('max:000000003', 'admin', NULL, 'Демо Администратор');

INSERT INTO teacher_assignments (teacher_id, group_id, discipline_id) VALUES
    ((SELECT id FROM users WHERE external_id = 'max:000000002'),
     (SELECT id FROM groups WHERE code = 'MAX'),
     (SELECT id FROM disciplines WHERE code = 'DB'));
`

// Reset очищает пользовательские таблицы и применяет демо-сид.
func Reset(ctx context.Context, db *sql.DB) error {
	if _, err := db.ExecContext(ctx, "PRAGMA foreign_keys=OFF"); err != nil {
		return fmt.Errorf("demoseed: disable foreign_keys: %w", err)
	}

	defer func() {
		_, _ = db.ExecContext(ctx, "PRAGMA foreign_keys=ON")
	}()

	rows, err := db.QueryContext(ctx, `
		SELECT name FROM sqlite_master
		WHERE type = 'table'
		  AND name NOT LIKE 'sqlite_%'
		  AND name != 'schema_migrations'
	`)
	if err != nil {
		return fmt.Errorf("demoseed: list tables: %w", err)
	}

	tables := make([]string, 0)

	for rows.Next() {
		var name string

		if err := rows.Scan(&name); err != nil {
			return fmt.Errorf("demoseed: scan table: %w", err)
		}

		tables = append(tables, name)
	}

	if err := rows.Close(); err != nil {
		return fmt.Errorf("demoseed: close tables: %w", err)
	}

	if err := rows.Err(); err != nil {
		return fmt.Errorf("demoseed: iterate tables: %w", err)
	}

	for _, table := range tables {
		quoted := `"` + strings.ReplaceAll(table, `"`, `""`) + `"`

		if _, err := db.ExecContext(ctx, "DELETE FROM "+quoted); err != nil {
			return fmt.Errorf("demoseed: clear %s: %w", table, err)
		}
	}

	for _, statement := range strings.Split(seedSQL, ";") {
		statement = strings.TrimSpace(statement)
		if statement == "" {
			continue
		}

		if _, err := db.ExecContext(ctx, statement); err != nil {
			return fmt.Errorf("demoseed: seed statement: %w", err)
		}
	}

	var users int

	if err := db.QueryRowContext(ctx, "SELECT COUNT(*) FROM users").Scan(&users); err != nil {
		return fmt.Errorf("demoseed: count users: %w", err)
	}

	if users != 3 {
		return fmt.Errorf("demoseed: users = %d, want 3", users)
	}

	return nil
}
