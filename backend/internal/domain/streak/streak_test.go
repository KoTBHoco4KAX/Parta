package streak

import (
	"testing"
	"time"
)

var deadline = time.Date(2026, 10, 15, 18, 0, 0, 0, time.UTC)

func ptr(t time.Time) *time.Time { return &t }

func TestDecide(t *testing.T) {
	onTime := deadline.Add(-2 * time.Hour)
	late := deadline.Add(3 * time.Hour)

	cases := []struct {
		name   string
		state  UserStreak
		now    time.Time
		hasSub bool
		doneAt *time.Time
		want   StreakDecision
	}{
		{
			name:   "increment on on-time submission",
			state:  UserStreak{OnTimeStreak: 4, Freezes: 1},
			now:    onTime,
			hasSub: true,
			doneAt: ptr(onTime),
			want:   StreakDecision{NewStreak: 5, NewFreezes: 1, Action: ActionIncrement, Reason: ReasonOnTime},
		},
		{
			name:   "increment exactly at deadline",
			state:  UserStreak{OnTimeStreak: 0, Freezes: 0},
			now:    deadline,
			hasSub: true,
			doneAt: ptr(deadline),
			want:   StreakDecision{NewStreak: 1, NewFreezes: 0, Action: ActionIncrement, Reason: ReasonOnTime},
		},
		{
			name:   "noop when deadline not reached and nothing submitted",
			state:  UserStreak{OnTimeStreak: 7, Freezes: 2},
			now:    deadline.Add(-time.Hour),
			hasSub: false,
			doneAt: nil,
			want:   StreakDecision{NewStreak: 7, NewFreezes: 2, Action: ActionNoop, Reason: ReasonNotDue},
		},
		{
			name:   "freeze covers a miss while freezes remain",
			state:  UserStreak{OnTimeStreak: 7, Freezes: 2},
			now:    deadline.Add(time.Hour),
			hasSub: false,
			doneAt: nil,
			want:   StreakDecision{NewStreak: 7, NewFreezes: 1, Action: ActionFreeze, Reason: ReasonFrozen},
		},
		{
			name:   "reset when freezes are exhausted",
			state:  UserStreak{OnTimeStreak: 7, Freezes: 0},
			now:    deadline.Add(time.Hour),
			hasSub: false,
			doneAt: nil,
			want:   StreakDecision{NewStreak: 0, NewFreezes: 0, Action: ActionReset, Reason: ReasonMissed},
		},
		{
			name:   "late submission is a miss that spends a freeze",
			state:  UserStreak{OnTimeStreak: 3, Freezes: 1},
			now:    deadline.Add(4 * time.Hour),
			hasSub: true,
			doneAt: ptr(late),
			want:   StreakDecision{NewStreak: 3, NewFreezes: 0, Action: ActionFreeze, Reason: ReasonFrozen},
		},
		{
			name:   "late submission without freezes resets",
			state:  UserStreak{OnTimeStreak: 3, Freezes: 0},
			now:    deadline.Add(4 * time.Hour),
			hasSub: true,
			doneAt: ptr(late),
			want:   StreakDecision{NewStreak: 0, NewFreezes: 0, Action: ActionReset, Reason: ReasonMissed},
		},
		{
			name:   "submitted marker without completion time keeps streak alive before deadline",
			state:  UserStreak{OnTimeStreak: 2, Freezes: 0},
			now:    deadline.Add(-time.Minute),
			hasSub: true,
			doneAt: nil,
			want:   StreakDecision{NewStreak: 2, NewFreezes: 0, Action: ActionNoop, Reason: ReasonNotDue},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := Decide(tc.state, deadline, tc.now, tc.hasSub, tc.doneAt)
			if got != tc.want {
				t.Fatalf("Decide() = %+v, want %+v", got, tc.want)
			}
		})
	}
}

// TestDecideNoDueKeepsStreak доказывает инвариант «нет задач — стрик жив»:
// перед дедлайном решение всегда noop и не меняет ни стрик, ни заморозки.
func TestDecideNoDueKeepsStreak(t *testing.T) {
	state := UserStreak{OnTimeStreak: 12, Freezes: 0}

	for _, offset := range []time.Duration{-time.Hour, -time.Minute, -time.Second} {
		got := Decide(state, deadline, deadline.Add(offset), false, nil)
		if got.NewStreak != state.OnTimeStreak || got.NewFreezes != state.Freezes {
			t.Fatalf("Decide() at %s changed state to %+v", offset, got)
		}
		if got.Action != ActionNoop {
			t.Fatalf("Decide() at %s action = %q, want %q", offset, got.Action, ActionNoop)
		}
	}
}
