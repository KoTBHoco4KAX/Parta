package wager

import (
	"testing"
	"time"

	domainerrors "github.com/parta/backend/internal/domain/errors"
)

var (
	now           = time.Date(2026, 10, 10, 12, 0, 0, 0, time.UTC)
	taskDeadline  = time.Date(2026, 10, 15, 18, 0, 0, 0, time.UTC)
	wagerDeadline = time.Date(2026, 10, 12, 18, 0, 0, 0, time.UTC)
)

func TestValidateCreate(t *testing.T) {
	cases := []struct {
		name    string
		stake   int
		balance int
		wd      time.Time
		td      time.Time
		wantErr error
	}{
		{name: "valid wager", stake: 100, balance: 380, wd: wagerDeadline, td: taskDeadline},
		{name: "stake equals balance is allowed", stake: 380, balance: 380, wd: wagerDeadline, td: taskDeadline},
		{name: "wager deadline equals task deadline", stake: 100, balance: 380, wd: taskDeadline, td: taskDeadline},
		{name: "zero stake", stake: 0, balance: 380, wd: wagerDeadline, td: taskDeadline, wantErr: domainerrors.ErrInvalidArgument},
		{name: "negative stake", stake: -50, balance: 380, wd: wagerDeadline, td: taskDeadline, wantErr: domainerrors.ErrInvalidArgument},
		{name: "stake above balance", stake: 400, balance: 380, wd: wagerDeadline, td: taskDeadline, wantErr: domainerrors.ErrInsufficientXP},
		{name: "deadline in the past", stake: 100, balance: 380, wd: now.Add(-time.Hour), td: taskDeadline, wantErr: domainerrors.ErrDeadlinePassed},
		{name: "deadline exactly now", stake: 100, balance: 380, wd: now, td: taskDeadline, wantErr: domainerrors.ErrDeadlinePassed},
		{name: "wager deadline after task deadline", stake: 100, balance: 380, wd: taskDeadline.Add(time.Hour), td: taskDeadline, wantErr: domainerrors.ErrGuardFailed},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := ValidateCreate(tc.stake, tc.balance, tc.wd, tc.td, now)

			if tc.wantErr == nil {
				if got != nil {
					t.Fatalf("ValidateCreate() = %v, want nil", got)
				}
				return
			}

			if !domainerrors.IsSentinel(got, tc.wantErr) {
				t.Fatalf("ValidateCreate() = %v, want %v", got, tc.wantErr)
			}
		})
	}
}

func TestResolveWin(t *testing.T) {
	cases := []struct {
		name string
		sub  time.Time
		wd   time.Time
		want bool
	}{
		{name: "submitted before wager deadline", sub: wagerDeadline.Add(-time.Hour), wd: wagerDeadline, want: true},
		{name: "submitted exactly at wager deadline", sub: wagerDeadline, wd: wagerDeadline, want: true},
		{name: "submitted after wager deadline", sub: wagerDeadline.Add(time.Second), wd: wagerDeadline, want: false},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := ResolveWin(tc.sub, tc.wd); got != tc.want {
				t.Fatalf("ResolveWin() = %v, want %v", got, tc.want)
			}
		})
	}
}
