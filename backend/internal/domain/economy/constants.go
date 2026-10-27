// Package economy хранит константы экономики XP и типы заданий.
package economy

// StreakFreezePriceXP — цена одной заморозки стрика в XP.
const StreakFreezePriceXP = 200

// SpeedrunMultiplier — множитель XP за сдачу внутри speedrun-окна.
const SpeedrunMultiplier = 1.5

// NormalMultiplier — множитель XP за сдачу до дедлайна.
const NormalMultiplier = 1.0

// LateMultiplier — множитель XP за сдачу после дедлайна.
const LateMultiplier = 0.5

// GracePeriodHours — окно grace-периода после вердикта преподавателя, в часах.
const GracePeriodHours = 24

// TaskType — тип задания из spec/01_SCHEMA.sql.
type TaskType string

const (
	// TaskTypeTest — тест.
	TaskTypeTest TaskType = "TEST"
	// TaskTypeEssay — эссе.
	TaskTypeEssay TaskType = "ESSAY"
	// TaskTypeLabCode — лабораторная с кодом.
	TaskTypeLabCode TaskType = "LAB_CODE"
	// TaskTypeTeamProject — командный проект.
	TaskTypeTeamProject TaskType = "TEAM_PROJECT"
)

// Weight возвращает весовой коэффициент типа задания по spec/03_MATH.md.
func (t TaskType) Weight() float64 {
	switch t {
	case TaskTypeTest:
		return 1.0
	case TaskTypeEssay:
		return 1.5
	case TaskTypeLabCode:
		return 2.0
	case TaskTypeTeamProject:
		return 2.5
	default:
		return 0.0
	}
}
