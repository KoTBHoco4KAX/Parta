package answers

import (
	"testing"
	"time"
)

func TestPoolPercent(t *testing.T) {
	now := time.Date(2026, 11, 4, 12, 0, 0, 0, time.UTC)

	cases := []struct {
		name   string
		hours  int
		prior  int
		want   int
		wantXP int
		baseXP int
	}{
		{name: "far deadline first request", hours: 72, prior: 0, want: 25, baseXP: 600, wantXP: 150},
		{name: "48 hours adds ten", hours: 48, prior: 0, want: 35, baseXP: 600, wantXP: 210},
		{name: "24 hours is still ten", hours: 24, prior: 0, want: 35, baseXP: 600, wantXP: 210},
		{name: "6 hours is still twenty", hours: 6, prior: 0, want: 45, baseXP: 600, wantXP: 270},
		{name: "under six hours adds thirty", hours: 5, prior: 0, want: 55, baseXP: 600, wantXP: 330},
		{name: "second request adds ten", hours: 72, prior: 1, want: 35, baseXP: 100, wantXP: 35},
		{name: "third request adds twenty", hours: 72, prior: 2, want: 45, baseXP: 100, wantXP: 45},
		{name: "cap at sixty", hours: 1, prior: 5, want: 60, baseXP: 1000, wantXP: 600},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			deadline := now.Add(time.Duration(tc.hours) * time.Hour)

			got := PoolPercent(deadline, now, tc.prior)
			if got != tc.want {
				t.Fatalf("PoolPercent() = %d, want %d", got, tc.want)
			}

			if xp := PoolXP(tc.baseXP, got); xp != tc.wantXP {
				t.Fatalf("PoolXP() = %d, want %d", xp, tc.wantXP)
			}
		})
	}
}

func TestPayoutPercents(t *testing.T) {
	cases := []struct {
		first, second string
		wantFirst     int
		wantSecond    int
	}{
		{"LIKE", "LIKE", 75, 75},
		{"LIKE", "NONE", 75, 25},
		{"NONE", "LIKE", 25, 75},
		{"NONE", "NONE", 50, 50},
		{"REPORT", "LIKE", 0, 75},
		{"LIKE", "REPORT", 75, 0},
		{"REPORT", "NONE", 0, 50},
		{"NONE", "REPORT", 50, 0},
		{"REPORT", "REPORT", 0, 0},
	}

	for _, tc := range cases {
		t.Run(tc.first+"+"+tc.second, func(t *testing.T) {
			first, second := PayoutPercents(tc.first, tc.second)

			if first != tc.wantFirst || second != tc.wantSecond {
				t.Fatalf("PayoutPercents() = %d,%d, want %d,%d", first, second, tc.wantFirst, tc.wantSecond)
			}
		})
	}
}

func TestWeekStartIsMonday(t *testing.T) {
	sunday := time.Date(2026, 11, 8, 23, 30, 0, 0, time.UTC)

	start := WeekStart(sunday)
	if start.Weekday() != time.Monday || start.Hour() != 0 || start.Minute() != 0 {
		t.Fatalf("WeekStart() = %v, want Monday 00:00", start)
	}

	if start.Day() != 2 {
		t.Fatalf("WeekStart().Day() = %d, want 2", start.Day())
	}
}
