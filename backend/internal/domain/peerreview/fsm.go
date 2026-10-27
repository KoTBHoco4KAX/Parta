// Package peerreview реализует FSM sandbox-ревью без доступа к файлам автора.
package peerreview

import (
	"time"

	domainerrors "github.com/parta/backend/internal/domain/errors"
)

// maxActiveReviews — предел одновременных активных ревью у одного студента.
const maxActiveReviews = 3

// Status — состояние peer-review.
type Status string

const (
	// StatusCreated — ревью создано и ждёт рецензента.
	StatusCreated Status = "CREATED"
	// StatusInReview — ревью взято рецензентом.
	StatusInReview Status = "IN_REVIEW"
	// StatusCompleted — ревью завершено с выплатой вознаграждения.
	StatusCompleted Status = "COMPLETED"
	// StatusExpired — ревью истекло с возвратом escrow автору.
	StatusExpired Status = "EXPIRED"
)

// CanClaim проверяет право студента взять ревью в работу.
func CanClaim(authorID, reviewerID int64, st Status, now, expiresAt time.Time, activeReviews int) error {
	if st != StatusCreated {
		return domainerrors.ErrInvalidTransition
	}

	if authorID == reviewerID {
		return domainerrors.ErrGuardFailed
	}

	if !now.Before(expiresAt) {
		return domainerrors.ErrDeadlinePassed
	}

	if activeReviews >= maxActiveReviews {
		return domainerrors.ErrGuardFailed
	}

	return nil
}

// CanComplete проверяет право рецензента завершить ревью с заполненным чек-листом.
func CanComplete(reviewerID int64, st Status, checklistFilled bool) error {
	if st != StatusInReview {
		return domainerrors.ErrInvalidTransition
	}

	if reviewerID <= 0 {
		return domainerrors.ErrGuardFailed
	}

	if !checklistFilled {
		return domainerrors.ErrGuardFailed
	}

	return nil
}

// CanExpire сообщает, истёк ли срок ревью в момент now.
func CanExpire(st Status, now, expiresAt time.Time) bool {
	if st != StatusCreated && st != StatusInReview {
		return false
	}

	return !now.Before(expiresAt)
}
