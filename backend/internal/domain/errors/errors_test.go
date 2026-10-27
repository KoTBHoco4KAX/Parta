package errors

import (
	"errors"
	"fmt"
	"testing"
)

func TestIsSentinel(t *testing.T) {
	cases := []struct {
		name   string
		err    error
		target error
		want   bool
	}{
		{name: "same sentinel", err: ErrGuardFailed, target: ErrGuardFailed, want: true},
		{name: "wrapped sentinel", err: fmt.Errorf("guard: %w", ErrForbidden), target: ErrForbidden, want: true},
		{name: "double wrapped sentinel", err: fmt.Errorf("http: %w", fmt.Errorf("guard: %w", ErrNotFound)), target: ErrNotFound, want: true},
		{name: "different sentinel", err: ErrGuardFailed, target: ErrNotFound, want: false},
		{name: "nil error", err: nil, target: ErrNotFound, want: false},
		{name: "arbitrary error", err: errors.New("boom"), target: ErrNotFound, want: false},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := IsSentinel(tc.err, tc.target); got != tc.want {
				t.Fatalf("IsSentinel() = %v, want %v", got, tc.want)
			}
		})
	}
}

func TestSentinelsAreDistinct(t *testing.T) {
	all := []error{
		ErrInvalidTransition,
		ErrGuardFailed,
		ErrInsufficientXP,
		ErrDeadlinePassed,
		ErrAlreadyExists,
		ErrNotFound,
		ErrForbidden,
		ErrInvalidArgument,
	}

	for i, first := range all {
		if first == nil {
			t.Fatalf("sentinel at index %d is nil", i)
		}

		for j, second := range all {
			if i != j && errors.Is(first, second) {
				t.Fatalf("sentinel %d matches sentinel %d", i, j)
			}
		}
	}
}
