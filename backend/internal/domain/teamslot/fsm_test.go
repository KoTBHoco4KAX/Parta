package teamslot

import (
	"testing"

	domainerrors "github.com/parta/backend/internal/domain/errors"
)

// allSlotStatuses — все состояния слота для тестов таблицы переходов.
var allSlotStatuses = []Status{
	StatusOpen,
	StatusClaimed,
	StatusSubmitted,
	StatusAccepted,
	StatusRejected,
	StatusAbandoned,
}

// slotEvents — все события слота для тестов таблицы переходов.
var slotEvents = []string{"CLAIM", "SUBMIT", "ACCEPT", "REJECT", "ABANDON"}

func TestNextStatus(t *testing.T) {
	cases := []struct {
		name    string
		from    Status
		event   string
		want    Status
		wantErr error
	}{
		{name: "open claim", from: StatusOpen, event: "CLAIM", want: StatusClaimed},
		{name: "open abandon", from: StatusOpen, event: "ABANDON", want: StatusAbandoned},
		{name: "claimed submit", from: StatusClaimed, event: "SUBMIT", want: StatusSubmitted},
		{name: "claimed abandon", from: StatusClaimed, event: "ABANDON", want: StatusAbandoned},
		{name: "submitted accept", from: StatusSubmitted, event: "ACCEPT", want: StatusAccepted},
		{name: "submitted reject", from: StatusSubmitted, event: "REJECT", want: StatusRejected},
		{name: "rejected claim", from: StatusRejected, event: "CLAIM", want: StatusClaimed},
		{name: "rejected abandon", from: StatusRejected, event: "ABANDON", want: StatusAbandoned},
		{name: "abandoned claim", from: StatusAbandoned, event: "CLAIM", want: StatusClaimed},
		{name: "accepted is terminal", from: StatusAccepted, event: "CLAIM", wantErr: domainerrors.ErrInvalidTransition},
		{name: "accepted cannot reject", from: StatusAccepted, event: "REJECT", wantErr: domainerrors.ErrInvalidTransition},
		{name: "open cannot submit", from: StatusOpen, event: "SUBMIT", wantErr: domainerrors.ErrInvalidTransition},
		{name: "open cannot accept", from: StatusOpen, event: "ACCEPT", wantErr: domainerrors.ErrInvalidTransition},
		{name: "abandoned cannot submit", from: StatusAbandoned, event: "SUBMIT", wantErr: domainerrors.ErrInvalidTransition},
		{name: "submitted cannot claim", from: StatusSubmitted, event: "CLAIM", wantErr: domainerrors.ErrInvalidTransition},
		{name: "submitted cannot abandon", from: StatusSubmitted, event: "ABANDON", wantErr: domainerrors.ErrInvalidTransition},
		{name: "unknown status", from: Status("NOPE"), event: "CLAIM", wantErr: domainerrors.ErrInvalidTransition},
		{name: "unknown event", from: StatusOpen, event: "NOPE", wantErr: domainerrors.ErrInvalidTransition},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, err := NextStatus(tc.from, tc.event)

			if tc.wantErr != nil {
				if !domainerrors.IsSentinel(err, tc.wantErr) {
					t.Fatalf("NextStatus(%s, %s) err = %v, want %v", tc.from, tc.event, err, tc.wantErr)
				}
				if got != tc.from {
					t.Fatalf("NextStatus(%s, %s) status = %s, want unchanged %s", tc.from, tc.event, got, tc.from)
				}
				return
			}

			if err != nil {
				t.Fatalf("NextStatus(%s, %s) unexpected err: %v", tc.from, tc.event, err)
			}

			if got != tc.want {
				t.Fatalf("NextStatus(%s, %s) = %s, want %s", tc.from, tc.event, got, tc.want)
			}
		})
	}
}

func TestCanTransition(t *testing.T) {
	cases := []struct {
		name  string
		from  Status
		event string
		want  bool
	}{
		{name: "open claim", from: StatusOpen, event: "CLAIM", want: true},
		{name: "open abandon", from: StatusOpen, event: "ABANDON", want: true},
		{name: "open reject", from: StatusOpen, event: "REJECT", want: false},
		{name: "claimed submit", from: StatusClaimed, event: "SUBMIT", want: true},
		{name: "claimed accept", from: StatusClaimed, event: "ACCEPT", want: false},
		{name: "submitted accept", from: StatusSubmitted, event: "ACCEPT", want: true},
		{name: "submitted reject", from: StatusSubmitted, event: "REJECT", want: true},
		{name: "submitted claim", from: StatusSubmitted, event: "CLAIM", want: false},
		{name: "accepted claim", from: StatusAccepted, event: "CLAIM", want: false},
		{name: "rejected claim", from: StatusRejected, event: "CLAIM", want: true},
		{name: "rejected reject", from: StatusRejected, event: "REJECT", want: false},
		{name: "abandoned claim", from: StatusAbandoned, event: "CLAIM", want: true},
		{name: "abandoned abandon", from: StatusAbandoned, event: "ABANDON", want: false},
		{name: "unknown status", from: Status("NOPE"), event: "CLAIM", want: false},
		{name: "empty event", from: StatusOpen, event: "", want: false},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := CanTransition(tc.from, tc.event); got != tc.want {
				t.Fatalf("CanTransition(%s, %s) = %v, want %v", tc.from, tc.event, got, tc.want)
			}
		})
	}
}

// TestCanTransitionMatchesNextStatus проверяет согласованность обоих API
// на полном декартовом произведении состояний и событий.
func TestCanTransitionMatchesNextStatus(t *testing.T) {
	for _, st := range allSlotStatuses {
		for _, event := range slotEvents {
			can := CanTransition(st, event)

			next, err := NextStatus(st, event)

			if can && err != nil {
				t.Fatalf("CanTransition(%s, %s) = true, but NextStatus returned %v", st, event, err)
			}

			if !can {
				if !domainerrors.IsSentinel(err, domainerrors.ErrInvalidTransition) {
					t.Fatalf("CanTransition(%s, %s) = false, but NextStatus err = %v", st, event, err)
				}
				continue
			}

			if want, ok := slotTransitions[st][event]; !ok || want != next {
				t.Fatalf("NextStatus(%s, %s) = %s, table says %s", st, event, next, want)
			}
		}
	}
}

func TestCanCarryOver(t *testing.T) {
	cases := []struct {
		name      string
		status    Status
		requester int64
		taskGroup int64
		wantErr   error
	}{
		{name: "open slot same group", status: StatusOpen, requester: 10, taskGroup: 10},
		{name: "abandoned slot same group", status: StatusAbandoned, requester: 10, taskGroup: 10},
		{name: "rejected slot same group", status: StatusRejected, requester: 10, taskGroup: 10},
		{name: "claimed slot cannot be carried over", status: StatusClaimed, requester: 10, taskGroup: 10, wantErr: domainerrors.ErrInvalidTransition},
		{name: "submitted slot cannot be carried over", status: StatusSubmitted, requester: 10, taskGroup: 10, wantErr: domainerrors.ErrInvalidTransition},
		{name: "accepted slot cannot be carried over", status: StatusAccepted, requester: 10, taskGroup: 10, wantErr: domainerrors.ErrInvalidTransition},
		{name: "other group cannot carry over", status: StatusOpen, requester: 10, taskGroup: 11, wantErr: domainerrors.ErrForbidden},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := CanCarryOver(tc.status, tc.requester, tc.taskGroup)

			if tc.wantErr == nil {
				if got != nil {
					t.Fatalf("CanCarryOver() = %v, want nil", got)
				}
				return
			}

			if !domainerrors.IsSentinel(got, tc.wantErr) {
				t.Fatalf("CanCarryOver() = %v, want %v", got, tc.wantErr)
			}
		})
	}
}

func TestSlotTransitions(t *testing.T) {
	cases := []struct {
		name  string
		from  Status
		event string
		want  Status
		found bool
	}{
		{name: "open claim", from: StatusOpen, event: "CLAIM", want: StatusClaimed, found: true},
		{name: "open abandon", from: StatusOpen, event: "ABANDON", want: StatusAbandoned, found: true},
		{name: "claimed submit", from: StatusClaimed, event: "SUBMIT", want: StatusSubmitted, found: true},
		{name: "claimed abandon", from: StatusClaimed, event: "ABANDON", want: StatusAbandoned, found: true},
		{name: "submitted accept", from: StatusSubmitted, event: "ACCEPT", want: StatusAccepted, found: true},
		{name: "submitted reject", from: StatusSubmitted, event: "REJECT", want: StatusRejected, found: true},
		{name: "rejected claim", from: StatusRejected, event: "CLAIM", want: StatusClaimed, found: true},
		{name: "rejected abandon", from: StatusRejected, event: "ABANDON", want: StatusAbandoned, found: true},
		{name: "abandoned claim", from: StatusAbandoned, event: "CLAIM", want: StatusClaimed, found: true},
		{name: "accepted is terminal", from: StatusAccepted, event: "CLAIM", found: false},
		{name: "open submit forbidden", from: StatusOpen, event: "SUBMIT", found: false},
		{name: "abandoned submit forbidden", from: StatusAbandoned, event: "SUBMIT", found: false},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, ok := slotTransitions[tc.from][tc.event]

			if ok != tc.found {
				t.Fatalf("slotTransitions[%s][%s] present = %v, want %v", tc.from, tc.event, ok, tc.found)
			}

			if ok && got != tc.want {
				t.Fatalf("slotTransitions[%s][%s] = %s, want %s", tc.from, tc.event, got, tc.want)
			}
		})
	}
}
