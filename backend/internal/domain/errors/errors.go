// Package errors содержит сентинел-ошибки доменного слоя ПАРТА.
package errors

import "errors"

var (
	// ErrInvalidTransition — событие недопустимо для текущего состояния FSM.
	ErrInvalidTransition = errors.New("invalid transition")
	// ErrGuardFailed — guard-условие перехода не выполнено.
	ErrGuardFailed = errors.New("guard failed")
	// ErrInsufficientXP — на балансе недостаточно XP.
	ErrInsufficientXP = errors.New("insufficient xp")
	// ErrDeadlinePassed — дедлайн истёк.
	ErrDeadlinePassed = errors.New("deadline passed")
	// ErrAlreadyExists — сущность уже существует.
	ErrAlreadyExists = errors.New("already exists")
	// ErrNotFound — сущность не найдена.
	ErrNotFound = errors.New("not found")
	// ErrForbidden — действие запрещено роли или владельцу.
	ErrForbidden = errors.New("forbidden")
	// ErrInvalidArgument — аргумент не проходит валидацию.
	ErrInvalidArgument = errors.New("invalid argument")
)

// IsSentinel сообщает, входит ли target в цепочку err.
func IsSentinel(err, target error) bool {
	return errors.Is(err, target)
}
