// Package submission реализует FSM канбан-карточки работы и её guard-функции.
package submission

import (
	domainerrors "github.com/parta/backend/internal/domain/errors"
)

// Status — состояние карточки работы.
type Status string

const (
	// StatusTodo — карточка создана, работа не начата.
	StatusTodo Status = "TODO"
	// StatusInProgress — работа выполняется.
	StatusInProgress Status = "IN_PROGRESS"
	// StatusReview — работа отправлена и ждёт вердикта преподавателя.
	StatusReview Status = "REVIEW"
	// StatusDone — работа принята.
	StatusDone Status = "DONE"
	// StatusRejected — работа отклонена и ждёт доработки.
	StatusRejected Status = "REJECTED"
)

// Event — событие движения по канбану.
type Event string

const (
	// EventStart — студент взял работу в работу.
	EventStart Event = "START"
	// EventSubmit — студент отправил артефакт на проверку.
	EventSubmit Event = "SUBMIT"
	// EventTeacherAccept — преподаватель принял работу.
	EventTeacherAccept Event = "TEACHER_ACCEPT"
	// EventTeacherReject — преподаватель отклонил работу.
	EventTeacherReject Event = "TEACHER_REJECT"
	// EventReopen — студент вернул отклонённую работу в работу.
	EventReopen Event = "REOPEN"
)

// transitions — таблица переходов FSM Submission из spec/02_FSM.md.
var transitions = map[Status]map[Event]Status{
	StatusTodo:       {EventStart: StatusInProgress},
	StatusInProgress: {EventSubmit: StatusReview, EventTeacherReject: StatusRejected},
	StatusReview:     {EventTeacherAccept: StatusDone, EventTeacherReject: StatusRejected},
	StatusRejected:   {EventReopen: StatusInProgress},
}

// CanTransition сообщает, допустимо ли событие в текущем состоянии.
func CanTransition(from Status, e Event) bool {
	byEvent, ok := transitions[from]
	if !ok {
		return false
	}

	_, ok = byEvent[e]

	return ok
}

// NextStatus возвращает состояние после события или ErrInvalidTransition.
func NextStatus(from Status, e Event) (Status, error) {
	byEvent, ok := transitions[from]
	if !ok {
		return from, domainerrors.ErrInvalidTransition
	}

	next, ok := byEvent[e]
	if !ok {
		return from, domainerrors.ErrInvalidTransition
	}

	return next, nil
}
