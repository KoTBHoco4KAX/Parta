// Package leaderboard считает границы учебной недели для рейтинга.
package leaderboard

import "time"

// WeekStart возвращает понедельник 00:00 недели, в которую попадает момент.
func WeekStart(at time.Time) time.Time {
	offset := (int(at.Weekday()) + 6) % 7
	start := time.Date(at.Year(), at.Month(), at.Day(), 0, 0, 0, 0, at.Location())

	return start.AddDate(0, 0, -offset)
}

// WeekEnd возвращает воскресенье 23:59:59 той же недели.
func WeekEnd(at time.Time) time.Time {
	return WeekStart(at).AddDate(0, 0, 7).Add(-time.Second)
}

// WeekKey — ключ недели в формате YYYY-MM-DD (понедельник).
func WeekKey(at time.Time) string {
	return WeekStart(at).Format("2006-01-02")
}
