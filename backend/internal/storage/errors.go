package storage

import (
	"database/sql"
	"errors"
	"fmt"
	"strings"

	domainerrors "github.com/parta/backend/internal/domain/errors"
)

// MapSQLError переводит ошибки драйвера SQLite в доменные сентинелы.
func MapSQLError(err error) error {
	if err == nil {
		return nil
	}

	if errors.Is(err, sql.ErrNoRows) {
		return domainerrors.ErrNotFound
	}

	message := strings.ToUpper(err.Error())

	switch {
	case strings.Contains(message, "UNIQUE CONSTRAINT"):
		return domainerrors.ErrAlreadyExists
	case strings.Contains(message, "CHECK CONSTRAINT"):
		return domainerrors.ErrGuardFailed
	case strings.Contains(message, "FOREIGN KEY"):
		return domainerrors.ErrGuardFailed
	case strings.Contains(message, "CONSTRAINT FAILED"):
		return domainerrors.ErrAlreadyExists
	default:
		return fmt.Errorf("storage: %w", err)
	}
}
