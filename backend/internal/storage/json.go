package storage

import (
	"encoding/json"
	"fmt"

	domainerrors "github.com/parta/backend/internal/domain/errors"
)

// rowToJSON превращает доменную запись журнала доработок в JSON-объект.
func rowToJSON(entry any) (string, error) {
	payload, err := json.Marshal(entry)
	if err != nil {
		return "", fmt.Errorf("%w: marshal json: %v", domainerrors.ErrInvalidArgument, err)
	}

	return string(payload), nil
}
