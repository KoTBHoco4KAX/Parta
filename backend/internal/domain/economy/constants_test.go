package economy

import "testing"

func TestTaskTypeWeight(t *testing.T) {
	cases := []struct {
		name string
		task TaskType
		want float64
	}{
		{name: "test", task: TaskTypeTest, want: 1.0},
		{name: "essay", task: TaskTypeEssay, want: 1.5},
		{name: "lab code", task: TaskTypeLabCode, want: 2.0},
		{name: "team project", task: TaskTypeTeamProject, want: 2.5},
		{name: "unknown type", task: TaskType("UNKNOWN"), want: 0.0},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := tc.task.Weight(); got != tc.want {
				t.Fatalf("Weight() = %v, want %v", got, tc.want)
			}
		})
	}
}

func TestTaskTypeValuesMatchSchema(t *testing.T) {
	cases := []struct {
		task TaskType
		want string
	}{
		{TaskTypeTest, "TEST"},
		{TaskTypeEssay, "ESSAY"},
		{TaskTypeLabCode, "LAB_CODE"},
		{TaskTypeTeamProject, "TEAM_PROJECT"},
	}

	for _, tc := range cases {
		t.Run(tc.want, func(t *testing.T) {
			if string(tc.task) != tc.want {
				t.Fatalf("TaskType value = %q, want %q", tc.task, tc.want)
			}
		})
	}
}

func TestEconomyConstants(t *testing.T) {
	if StreakFreezePriceXP != 200 {
		t.Fatalf("StreakFreezePriceXP = %d, want 200", StreakFreezePriceXP)
	}

	if SpeedrunMultiplier != 1.5 {
		t.Fatalf("SpeedrunMultiplier = %v, want 1.5", SpeedrunMultiplier)
	}

	if NormalMultiplier != 1.0 {
		t.Fatalf("NormalMultiplier = %v, want 1.0", NormalMultiplier)
	}

	if LateMultiplier != 0.5 {
		t.Fatalf("LateMultiplier = %v, want 0.5", LateMultiplier)
	}

	if GracePeriodHours != 24 {
		t.Fatalf("GracePeriodHours = %d, want 24", GracePeriodHours)
	}
}
