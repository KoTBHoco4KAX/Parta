// Package answers считает динамический пул эскроу для взаимопроверки «Ответы».
package answers

import (
	"math"
	"time"
)

const (
	// BasePercent — базовый процент пула.
	BasePercent = 25
	// MaxPercent — верхняя граница пула.
	MaxPercent = 60
)

// TimeBonus возвращает наценку за приближение дедлайна.
func TimeBonus(deadline, now time.Time) int {
	hours := deadline.Sub(now).Hours()

	switch {
	case hours > 48:
		return 0
	case hours >= 24:
		return 10
	case hours >= 6:
		return 20
	default:
		return 30
	}
}

// SpamBonus возвращает налог за количество обращений за неделю.
// priorRequests — сколько запросов было до текущего.
func SpamBonus(priorRequests int) int {
	switch {
	case priorRequests <= 0:
		return 0
	case priorRequests == 1:
		return 10
	default:
		return 20
	}
}

// PoolPercent собирает итоговый процент и ограничивает его 60%.
func PoolPercent(deadline, now time.Time, priorRequests int) int {
	percent := BasePercent + TimeBonus(deadline, now) + SpamBonus(priorRequests)
	if percent > MaxPercent {
		return MaxPercent
	}

	return percent
}

// PoolXP переводит процент в XP от Base XP задания.
func PoolXP(baseXP, percent int) int {
	if baseXP <= 0 || percent <= 0 {
		return 0
	}

	return int(math.Round(float64(baseXP) * float64(percent) / 100))
}

// WeekStart возвращает понедельник 00:00 недели, в которую попадает момент.
func WeekStart(at time.Time) time.Time {
	offset := (int(at.Weekday()) + 6) % 7
	start := time.Date(at.Year(), at.Month(), at.Day(), 0, 0, 0, 0, at.Location())

	return start.AddDate(0, 0, -offset)
}

// PayoutPercents распределяет пул между двумя комментариями.
//
// Правила из постановки:
//   - лайк + лайк: 75% и 75%;
//   - лайк + без реакции: 75% и 25%;
//   - без реакции + без реакции: 50% и 50%;
//   - жалоба: этому комментарию 0%, второй сохраняет свою долю.
func PayoutPercents(first, second string) (int, int) {
	if first == "REPORT" && second == "REPORT" {
		return 0, 0
	}

	if first == "REPORT" {
		if second == "LIKE" {
			return 0, 75
		}

		return 0, 50
	}

	if second == "REPORT" {
		if first == "LIKE" {
			return 75, 0
		}

		return 50, 0
	}

	if first == "LIKE" && second == "LIKE" {
		return 75, 75
	}

	if first == "LIKE" {
		return 75, 25
	}

	if second == "LIKE" {
		return 25, 75
	}

	return 50, 50
}
