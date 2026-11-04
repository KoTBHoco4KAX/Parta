package leaderboard

import (
	"testing"
	"time"
)

func TestWeekBounds(t *testing.T) {
	wednesday := time.Date(2026, 11, 4, 15, 30, 0, 0, time.UTC)

	start := WeekStart(wednesday)
	if start.Weekday() != time.Monday || start.Day() != 2 || start.Hour() != 0 {
		t.Fatalf("WeekStart() = %v, want Monday 2 Nov 00:00", start)
	}

	end := WeekEnd(wednesday)
	if end.Weekday() != time.Sunday || end.Day() != 8 || end.Hour() != 23 ||
		end.Minute() != 59 || end.Second() != 59 {
		t.Fatalf("WeekEnd() = %v, want Sunday 8 Nov 23:59:59", end)
	}

	if WeekKey(wednesday) != "2026-11-02" {
		t.Fatalf("WeekKey() = %s", WeekKey(wednesday))
	}
}

func TestWeekStartOnSunday(t *testing.T) {
	sunday := time.Date(2026, 11, 8, 23, 59, 0, 0, time.UTC)

	start := WeekStart(sunday)
	if start.Day() != 2 || start.Weekday() != time.Monday {
		t.Fatalf("WeekStart(Sunday) = %v", start)
	}
}
