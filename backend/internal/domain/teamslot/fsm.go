// Package teamslot реализует FSM слотов командного проекта и перехват слота.
package teamslot

import (
	domainerrors "github.com/parta/backend/internal/domain/errors"
)

// Status — состояние слота командного проекта.
type Status string

const (
	// StatusOpen — слот свободен.
	StatusOpen Status = "OPEN"
	// StatusClaimed — слот занят студентом.
	StatusClaimed Status = "CLAIMED"
	// StatusSubmitted — артефакт слота отправлен на приёмку.
	StatusSubmitted Status = "SUBMITTED"
	// StatusAccepted — слот принят.
	StatusAccepted Status = "ACCEPTED"
	// StatusRejected — слот отклонён.
	StatusRejected Status = "REJECTED"
	// StatusAbandoned — слот брошен исполнителем.
	StatusAbandoned Status = "ABANDONED"
)

// slotTransitions — таблица переходов FSM team_slots из spec/01_SCHEMA.sql.
var slotTransitions = map[Status]map[string]Status{
	StatusOpen:      {"CLAIM": StatusClaimed, "ABANDON": StatusAbandoned},
	StatusClaimed:   {"SUBMIT": StatusSubmitted, "ABANDON": StatusAbandoned},
	StatusSubmitted: {"ACCEPT": StatusAccepted, "REJECT": StatusRejected},
	StatusRejected:  {"CLAIM": StatusClaimed, "ABANDON": StatusAbandoned},
	StatusAbandoned: {"CLAIM": StatusClaimed},
}

// CanTransition сообщает, допустимо ли событие в текущем состоянии слота.
func CanTransition(from Status, event string) bool {
	byEvent, ok := slotTransitions[from]
	if !ok {
		return false
	}

	_, ok = byEvent[event]

	return ok
}

// NextStatus возвращает состояние слота после события или ErrInvalidTransition.
func NextStatus(from Status, event string) (Status, error) {
	byEvent, ok := slotTransitions[from]
	if !ok {
		return from, domainerrors.ErrInvalidTransition
	}

	next, ok := byEvent[event]
	if !ok {
		return from, domainerrors.ErrInvalidTransition
	}

	return next, nil
}

// CanCarryOver проверяет, что слот перехватывает студент той же группы.
func CanCarryOver(st Status, requesterGroupID, taskGroupID int64) error {
	switch st {
	case StatusOpen, StatusAbandoned, StatusRejected:
	default:
		return domainerrors.ErrInvalidTransition
	}

	if requesterGroupID != taskGroupID {
		return domainerrors.ErrForbidden
	}

	return nil
}
