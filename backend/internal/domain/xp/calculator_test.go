package xp

import (
	"math"
	"testing"
	"time"

	"github.com/parta/backend/internal/domain/economy"
)

var (
	created = time.Date(2026, 10, 1, 9, 0, 0, 0, time.UTC)
	due10d  = time.Date(2026, 10, 11, 9, 0, 0, 0, time.UTC)
)

func TestComputeBaseXP(t *testing.T) {
	cases := []struct {
		name  string
		input BaseXPInput
		want  int
	}{
		{
			name:  "test type base",
			input: BaseXPInput{TaskType: economy.TaskTypeTest, RequirementsCount: 5, ExpectedHours: 2, CreatedAt: created, DeadlineAt: due10d, TeamSize: 1},
			want:  245,
		},
		{
			name:  "essay type base",
			input: BaseXPInput{TaskType: economy.TaskTypeEssay, RequirementsCount: 5, ExpectedHours: 2, CreatedAt: created, DeadlineAt: due10d, TeamSize: 1},
			want:  367,
		},
		{
			name:  "lab code type base",
			input: BaseXPInput{TaskType: economy.TaskTypeLabCode, RequirementsCount: 10, ExpectedHours: 6, CreatedAt: created, DeadlineAt: due10d, TeamSize: 1},
			want:  1163,
		},
		{
			name:  "team project slot share",
			input: BaseXPInput{TaskType: economy.TaskTypeTeamProject, RequirementsCount: 10, ExpectedHours: 6, CreatedAt: created, DeadlineAt: due10d, TeamSize: 4},
			want:  418,
		},
		{
			name:  "team project single slot keeps full base",
			input: BaseXPInput{TaskType: economy.TaskTypeTeamProject, RequirementsCount: 10, ExpectedHours: 6, CreatedAt: created, DeadlineAt: due10d, TeamSize: 1},
			want:  1454,
		},
		{
			name:  "team size zero keeps full base",
			input: BaseXPInput{TaskType: economy.TaskTypeTeamProject, RequirementsCount: 10, ExpectedHours: 6, CreatedAt: created, DeadlineAt: due10d, TeamSize: 0},
			want:  1454,
		},
		{
			name:  "minimum window clamps D to half day",
			input: BaseXPInput{TaskType: economy.TaskTypeTest, RequirementsCount: 1, ExpectedHours: 0.1, CreatedAt: created, DeadlineAt: created.Add(2 * time.Hour), TeamSize: 1},
			want:  58,
		},
		{
			name:  "deadline equal to creation clamps D to half day",
			input: BaseXPInput{TaskType: economy.TaskTypeTest, RequirementsCount: 1, ExpectedHours: 1, CreatedAt: created, DeadlineAt: created, TeamSize: 1},
			want:  125,
		},
		{
			name:  "floor of ten xp applies",
			input: BaseXPInput{TaskType: economy.TaskTypeTest, RequirementsCount: 0, ExpectedHours: 0.001, CreatedAt: created, DeadlineAt: created.Add(365 * 24 * time.Hour), TeamSize: 1},
			want:  10,
		},
		{
			name:  "long deadline window",
			input: BaseXPInput{TaskType: economy.TaskTypeLabCode, RequirementsCount: 20, ExpectedHours: 10, CreatedAt: created, DeadlineAt: created.AddDate(0, 0, 365), TeamSize: 1},
			want:  1427,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := ComputeBaseXP(tc.input); got != tc.want {
				t.Fatalf("ComputeBaseXP(%+v) = %d, want %d", tc.input, got, tc.want)
			}
		})
	}
}

func TestComputeBaseXPFloorIsNotReachableByRounding(t *testing.T) {
	input := BaseXPInput{
		TaskType:          economy.TaskTypeTest,
		RequirementsCount: 0,
		ExpectedHours:     0.001,
		CreatedAt:         created,
		DeadlineAt:        created.Add(365 * 24 * time.Hour),
		TeamSize:          1,
	}

	if got := ComputeBaseXP(input); got != 10 {
		t.Fatalf("ComputeBaseXP() = %d, want the floor value 10", got)
	}
}

func TestComputeFinalXP(t *testing.T) {
	deadline := time.Date(2026, 10, 15, 18, 0, 0, 0, time.UTC)
	window := 48 * time.Hour
	speedrunEdge := deadline.Add(-window)

	cases := []struct {
		name        string
		base        int
		submittedAt time.Time
		want        int
	}{
		{name: "early submission", base: 100, submittedAt: deadline.Add(-72 * time.Hour), want: 150},
		{name: "speedrun boundary inclusive", base: 100, submittedAt: speedrunEdge, want: 150},
		{name: "inside speedrun window", base: 100, submittedAt: speedrunEdge.Add(time.Hour), want: 100},
		{name: "deadline boundary inclusive", base: 100, submittedAt: deadline, want: 100},
		{name: "late submission", base: 100, submittedAt: deadline.Add(time.Second), want: 50},
		{name: "late rounding half away from zero", base: 111, submittedAt: deadline.Add(time.Hour), want: 56},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := ComputeFinalXP(tc.base, tc.submittedAt, deadline, window); got != tc.want {
				t.Fatalf("ComputeFinalXP() = %d, want %d", got, tc.want)
			}
		})
	}
}

func TestComputeFinalXPNeverNegative(t *testing.T) {
	deadline := time.Date(2026, 10, 15, 18, 0, 0, 0, time.UTC)

	if got := ComputeFinalXP(-5, deadline.Add(24*time.Hour), deadline, 48*time.Hour); got != 0 {
		t.Fatalf("ComputeFinalXP() = %d, want 0", got)
	}

	if got := ComputeFinalXP(0, deadline, deadline, 48*time.Hour); got != 0 {
		t.Fatalf("ComputeFinalXP() = %d, want 0", got)
	}
}

func TestComputeDeadlineFactor(t *testing.T) {
	cases := []struct {
		name string
		days float64
		want float64
	}{
		{name: "half day clamps to max", days: 0.5, want: 2.5},
		{name: "ten days", days: 10, want: 1.5306282510621703},
		{name: "long window approaches one", days: 100000, want: 1.0000699975501144},
		{name: "zero days is neutral", days: 0, want: 1.0},
		{name: "negative days is neutral", days: -3, want: 1.0},
		{name: "subnormal days stays finite", days: 1e-300, want: 2.5},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := ComputeDeadlineFactor(tc.days)

			if math.IsNaN(got) {
				t.Fatalf("ComputeDeadlineFactor(%v) = NaN", tc.days)
			}

			if diff := got - tc.want; diff > 1e-12 || diff < -1e-12 {
				t.Fatalf("ComputeDeadlineFactor(%v) = %v, want %v", tc.days, got, tc.want)
			}
		})
	}
}

func TestComputeComplexity(t *testing.T) {
	cases := []struct {
		name  string
		task  economy.TaskType
		count int
		hours float64
		want  float64
	}{
		{name: "test", task: economy.TaskTypeTest, count: 10, hours: 5, want: 7.0},
		{name: "essay", task: economy.TaskTypeEssay, count: 10, hours: 5, want: 10.5},
		{name: "lab code", task: economy.TaskTypeLabCode, count: 10, hours: 5, want: 14.0},
		{name: "team project", task: economy.TaskTypeTeamProject, count: 10, hours: 5, want: 17.5},
		{name: "zero workload", task: economy.TaskTypeTest, count: 0, hours: 0, want: 0},
		{name: "unknown type is neutral", task: economy.TaskType("NOPE"), count: 10, hours: 5, want: 0},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := ComputeComplexity(tc.task, tc.count, tc.hours)
			if diff := got - tc.want; diff > 1e-12 || diff < -1e-12 {
				t.Fatalf("ComputeComplexity() = %v, want %v", got, tc.want)
			}
		})
	}
}

func TestTaskTypeWeight(t *testing.T) {
	cases := []struct {
		task economy.TaskType
		want float64
	}{
		{economy.TaskTypeTest, 1.0},
		{economy.TaskTypeEssay, 1.5},
		{economy.TaskTypeLabCode, 2.0},
		{economy.TaskTypeTeamProject, 2.5},
		{economy.TaskType("UNKNOWN"), 0.0},
	}

	for _, tc := range cases {
		t.Run(string(tc.task), func(t *testing.T) {
			if got := tc.task.Weight(); got != tc.want {
				t.Fatalf("Weight() = %v, want %v", got, tc.want)
			}
		})
	}
}
