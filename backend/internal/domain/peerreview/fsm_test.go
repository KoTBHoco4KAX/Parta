package peerreview

import (
	"testing"
	"time"

	domainerrors "github.com/parta/backend/internal/domain/errors"
)

var (
	now       = time.Date(2026, 10, 10, 12, 0, 0, 0, time.UTC)
	expiresAt = time.Date(2026, 10, 20, 18, 0, 0, 0, time.UTC)
)

func TestCanClaim(t *testing.T) {
	cases := []struct {
		name      string
		authorID  int64
		reviewer  int64
		status    Status
		now       time.Time
		expiresAt time.Time
		active    int
		wantErr   error
	}{
		{name: "valid claim", authorID: 1, reviewer: 2, status: StatusCreated, now: now, expiresAt: expiresAt, active: 0},
		{name: "two active reviews still allowed", authorID: 1, reviewer: 2, status: StatusCreated, now: now, expiresAt: expiresAt, active: 2},
		{name: "three active reviews blocked", authorID: 1, reviewer: 2, status: StatusCreated, now: now, expiresAt: expiresAt, active: 3, wantErr: domainerrors.ErrGuardFailed},
		{name: "author cannot claim own review", authorID: 2, reviewer: 2, status: StatusCreated, now: now, expiresAt: expiresAt, active: 0, wantErr: domainerrors.ErrGuardFailed},
		{name: "already in review", authorID: 1, reviewer: 2, status: StatusInReview, now: now, expiresAt: expiresAt, active: 0, wantErr: domainerrors.ErrInvalidTransition},
		{name: "completed is terminal", authorID: 1, reviewer: 2, status: StatusCompleted, now: now, expiresAt: expiresAt, active: 0, wantErr: domainerrors.ErrInvalidTransition},
		{name: "expired is terminal", authorID: 1, reviewer: 2, status: StatusExpired, now: now, expiresAt: expiresAt, active: 0, wantErr: domainerrors.ErrInvalidTransition},
		{name: "expired by time", authorID: 1, reviewer: 2, status: StatusCreated, now: expiresAt, expiresAt: expiresAt, active: 0, wantErr: domainerrors.ErrDeadlinePassed},
		{name: "expired after ttl", authorID: 1, reviewer: 2, status: StatusCreated, now: expiresAt.Add(time.Hour), expiresAt: expiresAt, active: 0, wantErr: domainerrors.ErrDeadlinePassed},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := CanClaim(tc.authorID, tc.reviewer, tc.status, tc.now, tc.expiresAt, tc.active)

			if tc.wantErr == nil {
				if got != nil {
					t.Fatalf("CanClaim() = %v, want nil", got)
				}
				return
			}

			if !domainerrors.IsSentinel(got, tc.wantErr) {
				t.Fatalf("CanClaim() = %v, want %v", got, tc.wantErr)
			}
		})
	}
}

func TestCanComplete(t *testing.T) {
	cases := []struct {
		name      string
		reviewer  int64
		status    Status
		checklist bool
		wantErr   error
	}{
		{name: "filled checklist completes", reviewer: 2, status: StatusInReview, checklist: true},
		{name: "empty checklist blocked", reviewer: 2, status: StatusInReview, checklist: false, wantErr: domainerrors.ErrGuardFailed},
		{name: "missing reviewer blocked", reviewer: 0, status: StatusInReview, checklist: true, wantErr: domainerrors.ErrGuardFailed},
		{name: "not in review", reviewer: 2, status: StatusCreated, checklist: true, wantErr: domainerrors.ErrInvalidTransition},
		{name: "already completed", reviewer: 2, status: StatusCompleted, checklist: true, wantErr: domainerrors.ErrInvalidTransition},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := CanComplete(tc.reviewer, tc.status, tc.checklist)

			if tc.wantErr == nil {
				if got != nil {
					t.Fatalf("CanComplete() = %v, want nil", got)
				}
				return
			}

			if !domainerrors.IsSentinel(got, tc.wantErr) {
				t.Fatalf("CanComplete() = %v, want %v", got, tc.wantErr)
			}
		})
	}
}

func TestCanExpire(t *testing.T) {
	cases := []struct {
		name      string
		status    Status
		now       time.Time
		expiresAt time.Time
		want      bool
	}{
		{name: "created before ttl", status: StatusCreated, now: now, expiresAt: expiresAt, want: false},
		{name: "created exactly at ttl", status: StatusCreated, now: expiresAt, expiresAt: expiresAt, want: true},
		{name: "in review after ttl", status: StatusInReview, now: expiresAt.Add(time.Minute), expiresAt: expiresAt, want: true},
		{name: "completed never expires", status: StatusCompleted, now: expiresAt.Add(time.Hour), expiresAt: expiresAt, want: false},
		{name: "already expired stays expired", status: StatusExpired, now: expiresAt.Add(time.Hour), expiresAt: expiresAt, want: false},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := CanExpire(tc.status, tc.now, tc.expiresAt); got != tc.want {
				t.Fatalf("CanExpire(%s) = %v, want %v", tc.status, got, tc.want)
			}
		})
	}
}
