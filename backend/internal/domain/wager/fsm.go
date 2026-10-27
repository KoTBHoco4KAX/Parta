// Package wager реализует правила пари на собственный результат студента.
package wager

import (
	"time"

	domainerrors "github.com/parta/backend/internal/domain/errors"
)

// Status — состояние пари.
type Status string

const (
	// StatusPlaced — пари активно.
	StatusPlaced Status = "PLACED"
	// StatusWon — пари выиграно.
	StatusWon Status = "WON"
	// StatusLost — пари проиграно.
	StatusLost Status = "LOST"
	// StatusCancelled — пари отменено администратором.
	StatusCancelled Status = "CANCELLED"
)

// ResolveWin сообщает, выиграно ли пари по времени финальной сдачи работы.
func ResolveWin(subFinal time.Time, wagerDeadline time.Time) bool {
	return !subFinal.After(wagerDeadline)
}

// ValidateCreate проверяет корректность создания пари до его записи.
func ValidateCreate(stakeAmount, xpBalance int, wagerDeadline, taskDeadline, now time.Time) error {
	if stakeAmount <= 0 {
		return domainerrors.ErrInvalidArgument
	}

	if stakeAmount > xpBalance {
		return domainerrors.ErrInsufficientXP
	}

	if !wagerDeadline.After(now) {
		return domainerrors.ErrDeadlinePassed
	}

	if wagerDeadline.After(taskDeadline) {
		return domainerrors.ErrGuardFailed
	}

	return nil
}
