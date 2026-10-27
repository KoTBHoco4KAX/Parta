// Package xp считает Base XP, Slot Base XP и итоговый XP по spec/03_MATH.md.
package xp

import (
	"math"
	"time"

	"github.com/parta/backend/internal/domain/economy"
)

// teamSlotFactor — коэффициент слота командного проекта из spec/03_MATH.md.
const teamSlotFactor = 1.15

// minBaseXP — нижняя граница Base XP и Slot Base XP.
const minBaseXP = 10

// BaseXPInput — вход формулы Base XP.
type BaseXPInput struct {
	TaskType          economy.TaskType
	RequirementsCount int
	ExpectedHours     float64
	CreatedAt         time.Time
	DeadlineAt        time.Time
	TeamSize          int
}

// ComputeComplexity считает сложность C = w * (0.4*R + 0.6*H).
func ComputeComplexity(taskType economy.TaskType, requirementsCount int, expectedHours float64) float64 {
	return taskType.Weight() * (0.4*float64(requirementsCount) + 0.6*expectedHours)
}

// ComputeDeadlineFactor считает F_d = clamp(1 + ln(1 + 7/D), 1.0, 2.5).
func ComputeDeadlineFactor(days float64) float64 {
	if days <= 0 {
		return 1.0
	}

	return clamp(1.0+math.Log(1.0+7.0/days), 1.0, 2.5)
}

// ComputeBaseXP считает Base XP, а для TEAM_PROJECT — Slot Base XP.
func ComputeBaseXP(in BaseXPInput) int {
	days := math.Max(0.5, in.DeadlineAt.Sub(in.CreatedAt).Hours()/24.0)

	complexity := ComputeComplexity(in.TaskType, in.RequirementsCount, in.ExpectedHours)
	base := int(math.Round(50.0 * complexity * ComputeDeadlineFactor(days)))

	if in.TaskType == economy.TaskTypeTeamProject && in.TeamSize > 1 {
		base = int(math.Round(float64(base) / float64(in.TeamSize) * teamSlotFactor))
	}

	return maxInt(base, minBaseXP)
}

// ComputeFinalXP применяет speedrun-множитель к Base XP и не бывает отрицательным.
func ComputeFinalXP(baseXP int, submittedAt, deadlineAt time.Time, speedrunWindow time.Duration) int {
	multiplier := economy.LateMultiplier

	switch {
	case !submittedAt.After(deadlineAt.Add(-speedrunWindow)):
		multiplier = economy.SpeedrunMultiplier
	case !submittedAt.After(deadlineAt):
		multiplier = economy.NormalMultiplier
	}

	return maxInt(int(math.Round(float64(baseXP)*multiplier)), 0)
}

// clamp ограничивает значение отрезком [low, high].
func clamp(value, low, high float64) float64 {
	return math.Min(math.Max(value, low), high)
}

// maxInt возвращает большее из двух целых.
func maxInt(a, b int) int {
	if a > b {
		return a
	}

	return b
}
