package storage

import (
	"context"
	"database/sql"
	"time"
)

// querier — общий доступ к *sql.DB и *sql.Tx для репозиториев.
type querier interface {
	ExecContext(ctx context.Context, query string, args ...any) (sql.Result, error)
	QueryContext(ctx context.Context, query string, args ...any) (*sql.Rows, error)
	QueryRowContext(ctx context.Context, query string, args ...any) *sql.Row
}

// row — то, что умеет читать одну строку: *sql.Row и *sql.Rows.
type row interface {
	Scan(dest ...any) error
}

// sqlTimeLayout — формат времени, который пишет strftime('%Y-%m-%dT%H:%M:%fZ','now').
const sqlTimeLayout = "2006-01-02T15:04:05.000Z"

// formatTime приводит время к формату, в котором его хранит схема.
func formatTime(t time.Time) string {
	return t.UTC().Format(sqlTimeLayout)
}

// FormatTimestamp приводит время к TEXT-формату схемы. Нужен слоям выше
// storage, которые передают время в CreateTaskInput.
func FormatTimestamp(t time.Time) string {
	return formatTime(t)
}

// parseTime читает время из TEXT-колонки схемы.
func parseTime(value string) (time.Time, error) {
	return time.Parse(sqlTimeLayout, value)
}

// scanTime читает nullable TEXT-колонку в *time.Time.
func scanTime(value sql.NullString) (*time.Time, error) {
	if !value.Valid {
		return nil, nil
	}

	parsed, err := parseTime(value.String)
	if err != nil {
		return nil, err
	}

	return &parsed, nil
}

// scanInt64Ptr читает nullable INTEGER-колонку в *int64.
func scanInt64Ptr(value sql.NullInt64) *int64 {
	if !value.Valid {
		return nil
	}

	return &value.Int64
}

// scanStringPtr читает nullable TEXT-колонку в *string.
func scanStringPtr(value sql.NullString) *string {
	if !value.Valid {
		return nil
	}

	return &value.String
}

// scanString читает nullable TEXT-колонку в строку, где NULL означает пусто.
func scanString(value sql.NullString) string {
	if !value.Valid {
		return ""
	}

	return value.String
}
