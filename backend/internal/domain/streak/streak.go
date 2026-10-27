// Package streak решает судьбу on-time стрика по spec/03_MATH.md.
package streak

import "time"

// Действия, которые Decide предписывает применить к стрику.
const (
	// ActionIncrement — инкремент стрика за сдачу в срок.
	ActionIncrement = "increment"
	// ActionReset — сброс стрика в ноль.
	ActionReset = "reset"
	// ActionFreeze — трата заморозки, стрик не меняется.
	ActionFreeze = "freeze"
	// ActionNoop — состояние стрика не меняется.
	ActionNoop = "noop"
)

// Причины решений Decide.
const (
	// ReasonOnTime — работа сдана до дедлайна.
	ReasonOnTime = "submitted on time"
	// ReasonNotDue — дедлайн ещё не наступил.
	ReasonNotDue = "deadline not reached"
	// ReasonFrozen — просрочка закрыта заморозкой.
	ReasonFrozen = "missed deadline covered by freeze"
	// ReasonMissed — просрочка без доступных заморозок.
	ReasonMissed = "missed deadline"
	// ReasonNoChange — нет оснований менять стрик.
	ReasonNoChange = "no change"
)

// UserStreak — текущее состояние стрика студента.
type UserStreak struct {
	OnTimeStreak int
	Freezes      int
}

// StreakDecision — новое состояние стрика и применённое действие.
type StreakDecision struct {
	NewStreak  int
	NewFreezes int
	Action     string
	Reason     string
}

// Decide решает судьбу стрика для одной задачи в момент now.
func Decide(s UserStreak, deadline, now time.Time, hasSub bool, doneAt *time.Time) StreakDecision {
	onTime := hasSub && doneAt != nil && !doneAt.After(deadline)
	overdue := now.After(deadline)

	switch {
	case onTime:
		return StreakDecision{
			NewStreak:  s.OnTimeStreak + 1,
			NewFreezes: s.Freezes,
			Action:     ActionIncrement,
			Reason:     ReasonOnTime,
		}
	case !overdue:
		return StreakDecision{
			NewStreak:  s.OnTimeStreak,
			NewFreezes: s.Freezes,
			Action:     ActionNoop,
			Reason:     ReasonNotDue,
		}
	case s.Freezes > 0:
		return StreakDecision{
			NewStreak:  s.OnTimeStreak,
			NewFreezes: s.Freezes - 1,
			Action:     ActionFreeze,
			Reason:     ReasonFrozen,
		}
	default:
		return StreakDecision{
			NewStreak:  0,
			NewFreezes: s.Freezes,
			Action:     ActionReset,
			Reason:     ReasonMissed,
		}
	}
}
