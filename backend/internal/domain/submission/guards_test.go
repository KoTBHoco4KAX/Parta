package submission

import (
	"testing"
	"time"

	domainerrors "github.com/parta/backend/internal/domain/errors"
)

var (
	deadline = time.Date(2026, 10, 15, 18, 0, 0, 0, time.UTC)
	now      = time.Date(2026, 10, 10, 12, 0, 0, 0, time.UTC)
	student  = Actor{UserID: 42, Role: "student"}
)

func ptrTime(t time.Time) *time.Time { return &t }

func ptrInt64(v int64) *int64 { return &v }

func TestNextStatus(t *testing.T) {
	cases := []struct {
		name    string
		from    Status
		event   Event
		want    Status
		wantErr error
	}{
		{name: "todo start", from: StatusTodo, event: EventStart, want: StatusInProgress},
		{name: "in progress submit", from: StatusInProgress, event: EventSubmit, want: StatusReview},
		{name: "review accept", from: StatusReview, event: EventTeacherAccept, want: StatusDone},
		{name: "review reject", from: StatusReview, event: EventTeacherReject, want: StatusRejected},
		{name: "rejected reopen", from: StatusRejected, event: EventReopen, want: StatusInProgress},
		{name: "todo submit forbidden", from: StatusTodo, event: EventSubmit, wantErr: domainerrors.ErrInvalidTransition},
		{name: "todo accept forbidden", from: StatusTodo, event: EventTeacherAccept, wantErr: domainerrors.ErrInvalidTransition},
		{name: "in progress start forbidden", from: StatusInProgress, event: EventStart, wantErr: domainerrors.ErrInvalidTransition},
		{name: "in progress accept forbidden", from: StatusInProgress, event: EventTeacherAccept, wantErr: domainerrors.ErrInvalidTransition},
		{name: "done start forbidden", from: StatusDone, event: EventStart, wantErr: domainerrors.ErrInvalidTransition},
		{name: "done submit forbidden", from: StatusDone, event: EventSubmit, wantErr: domainerrors.ErrInvalidTransition},
		{name: "done reopen forbidden", from: StatusDone, event: EventReopen, wantErr: domainerrors.ErrInvalidTransition},
		{name: "rejected reopen only", from: StatusRejected, event: EventSubmit, wantErr: domainerrors.ErrInvalidTransition},
		{name: "unknown status", from: Status("NOPE"), event: EventStart, wantErr: domainerrors.ErrInvalidTransition},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, err := NextStatus(tc.from, tc.event)

			if tc.wantErr != nil {
				if !domainerrors.IsSentinel(err, tc.wantErr) {
					t.Fatalf("NextStatus(%s, %s) err = %v, want %v", tc.from, tc.event, err, tc.wantErr)
				}
				if got != tc.from {
					t.Fatalf("NextStatus(%s, %s) status = %s, want unchanged %s", tc.from, tc.event, got, tc.from)
				}
				return
			}

			if err != nil {
				t.Fatalf("NextStatus(%s, %s) unexpected err: %v", tc.from, tc.event, err)
			}

			if got != tc.want {
				t.Fatalf("NextStatus(%s, %s) = %s, want %s", tc.from, tc.event, got, tc.want)
			}
		})
	}
}

func TestCanTransition(t *testing.T) {
	cases := []struct {
		name  string
		from  Status
		event Event
		want  bool
	}{
		{name: "todo start", from: StatusTodo, event: EventStart, want: true},
		{name: "todo reject", from: StatusTodo, event: EventTeacherReject, want: false},
		{name: "in progress submit", from: StatusInProgress, event: EventSubmit, want: true},
		{name: "in progress reject", from: StatusInProgress, event: EventTeacherReject, want: true},
		{name: "review accept", from: StatusReview, event: EventTeacherAccept, want: true},
		{name: "review reopen", from: StatusReview, event: EventReopen, want: false},
		{name: "rejected reopen", from: StatusRejected, event: EventReopen, want: true},
		{name: "done anything", from: StatusDone, event: EventTeacherAccept, want: false},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := CanTransition(tc.from, tc.event); got != tc.want {
				t.Fatalf("CanTransition(%s, %s) = %v, want %v", tc.from, tc.event, got, tc.want)
			}
		})
	}
}

func TestGuardStart(t *testing.T) {
	task := Task{ID: 1, Status: "PUBLISHED", DeadlineAt: deadline, AssignedTeacherID: 7}
	base := Submission{ID: 5, TaskID: 1, StudentID: 42, Status: StatusTodo}

	cases := []struct {
		name    string
		actor   Actor
		sub     Submission
		task    Task
		wantErr error
	}{
		{name: "owner student starts", actor: student, sub: base, task: task},
		{name: "teacher cannot start", actor: Actor{UserID: 7, Role: "teacher"}, sub: base, task: task, wantErr: domainerrors.ErrForbidden},
		{name: "other student cannot start", actor: Actor{UserID: 99, Role: "student"}, sub: base, task: task, wantErr: domainerrors.ErrForbidden},
		{name: "draft task blocks start", actor: student, sub: base, task: Task{ID: 1, Status: "DRAFT", DeadlineAt: deadline}, wantErr: domainerrors.ErrGuardFailed},
		{name: "archived task blocks start", actor: student, sub: base, task: Task{ID: 1, Status: "ARCHIVED", DeadlineAt: deadline}, wantErr: domainerrors.ErrGuardFailed},
		{name: "non todo card blocks start", actor: student, sub: Submission{StudentID: 42, Status: StatusReview}, task: task, wantErr: domainerrors.ErrInvalidTransition},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := GuardStart(tc.actor, tc.sub, tc.task)

			if tc.wantErr == nil {
				if got != nil {
					t.Fatalf("GuardStart() = %v, want nil", got)
				}
				return
			}

			if !domainerrors.IsSentinel(got, tc.wantErr) {
				t.Fatalf("GuardStart() = %v, want %v", got, tc.wantErr)
			}
		})
	}
}

func TestGuardSubmit(t *testing.T) {
	task := Task{ID: 1, Status: "PUBLISHED", DeadlineAt: deadline, AssignedTeacherID: 7}
	base := Submission{ID: 5, TaskID: 1, StudentID: 42, Status: StatusInProgress}

	cases := []struct {
		name    string
		actor   Actor
		sub     Submission
		task    Task
		url     string
		hash    string
		now     time.Time
		wantErr error
	}{
		{name: "valid submit", actor: student, sub: base, task: task, url: "u", hash: "h", now: now},
		{name: "last moment inside late window", actor: student, sub: base, task: task, url: "u", hash: "h", now: deadline.AddDate(0, 0, 7)},
		{name: "beyond late window", actor: student, sub: base, task: task, url: "u", hash: "h", now: deadline.AddDate(0, 0, 8), wantErr: domainerrors.ErrDeadlinePassed},
		{name: "missing artifact url", actor: student, sub: base, task: task, url: "", hash: "h", now: now, wantErr: domainerrors.ErrInvalidArgument},
		{name: "missing artifact hash", actor: student, sub: base, task: task, url: "u", hash: "", now: now, wantErr: domainerrors.ErrInvalidArgument},
		{name: "foreign student", actor: Actor{UserID: 99, Role: "student"}, sub: base, task: task, url: "u", hash: "h", now: now, wantErr: domainerrors.ErrForbidden},
		{name: "teacher cannot submit", actor: Actor{UserID: 7, Role: "teacher"}, sub: base, task: task, url: "u", hash: "h", now: now, wantErr: domainerrors.ErrForbidden},
		{name: "todo card cannot submit", actor: student, sub: Submission{StudentID: 42, Status: StatusTodo}, task: task, url: "u", hash: "h", now: now, wantErr: domainerrors.ErrInvalidTransition},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := GuardSubmit(tc.actor, tc.sub, tc.task, tc.url, tc.hash, tc.now)

			if tc.wantErr == nil {
				if got != nil {
					t.Fatalf("GuardSubmit() = %v, want nil", got)
				}
				return
			}

			if !domainerrors.IsSentinel(got, tc.wantErr) {
				t.Fatalf("GuardSubmit() = %v, want %v", got, tc.wantErr)
			}
		})
	}
}

func TestGuardTeacherAccept(t *testing.T) {
	task := Task{ID: 1, Status: "PUBLISHED", DeadlineAt: deadline, AssignedTeacherID: 7}
	review := Submission{ID: 5, TaskID: 1, StudentID: 42, Status: StatusReview, SubmittedAt: ptrTime(now)}

	cases := []struct {
		name    string
		actor   Actor
		sub     Submission
		task    Task
		wantErr error
	}{
		{name: "assigned teacher accepts", actor: Actor{UserID: 7, Role: "teacher"}, sub: review, task: task},
		{name: "admin accepts anything", actor: Actor{UserID: 1, Role: "admin"}, sub: review, task: Task{ID: 1, AssignedTeacherID: 99}},
		{name: "other teacher forbidden", actor: Actor{UserID: 8, Role: "teacher"}, sub: review, task: task, wantErr: domainerrors.ErrForbidden},
		{name: "teacher without assignment forbidden", actor: Actor{UserID: 7, Role: "teacher"}, sub: review, task: Task{ID: 1, AssignedTeacherID: 0}, wantErr: domainerrors.ErrForbidden},
		{name: "student forbidden", actor: student, sub: review, task: task, wantErr: domainerrors.ErrForbidden},
		{name: "card not in review", actor: Actor{UserID: 7, Role: "teacher"}, sub: Submission{Status: StatusInProgress}, task: task, wantErr: domainerrors.ErrInvalidTransition},
		{name: "review without submitted_at", actor: Actor{UserID: 7, Role: "teacher"}, sub: Submission{Status: StatusReview}, task: task, wantErr: domainerrors.ErrGuardFailed},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := GuardTeacherAccept(tc.actor, tc.sub, tc.task)

			if tc.wantErr == nil {
				if got != nil {
					t.Fatalf("GuardTeacherAccept() = %v, want nil", got)
				}
				return
			}

			if !domainerrors.IsSentinel(got, tc.wantErr) {
				t.Fatalf("GuardTeacherAccept() = %v, want %v", got, tc.wantErr)
			}
		})
	}
}

func TestGuardTeacherReject(t *testing.T) {
	task := Task{ID: 1, Status: "PUBLISHED", DeadlineAt: deadline, AssignedTeacherID: 7}
	review := Submission{ID: 5, TaskID: 1, StudentID: 42, Status: StatusReview, SubmittedAt: ptrTime(now)}

	cases := []struct {
		name    string
		actor   Actor
		sub     Submission
		comment string
		wantErr error
	}{
		{name: "assigned teacher rejects with comment", actor: Actor{UserID: 7, Role: "teacher"}, sub: review, comment: "Переделать раздел 2"},
		{name: "admin rejects with comment", actor: Actor{UserID: 1, Role: "admin"}, sub: review, comment: "Возврат"},
		{name: "empty comment rejected", actor: Actor{UserID: 7, Role: "teacher"}, sub: review, comment: "", wantErr: domainerrors.ErrInvalidArgument},
		{name: "other teacher forbidden", actor: Actor{UserID: 8, Role: "teacher"}, sub: review, comment: "нет", wantErr: domainerrors.ErrForbidden},
		{name: "student forbidden", actor: student, sub: review, comment: "нет", wantErr: domainerrors.ErrForbidden},
		{name: "card not in review", actor: Actor{UserID: 7, Role: "teacher"}, sub: Submission{Status: StatusTodo}, comment: "нет", wantErr: domainerrors.ErrInvalidTransition},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := GuardTeacherReject(tc.actor, tc.sub, task, tc.comment, now)

			if tc.wantErr == nil {
				if got != nil {
					t.Fatalf("GuardTeacherReject() = %v, want nil", got)
				}
				return
			}

			if !domainerrors.IsSentinel(got, tc.wantErr) {
				t.Fatalf("GuardTeacherReject() = %v, want %v", got, tc.wantErr)
			}
		})
	}
}

func TestGuardReopen(t *testing.T) {
	task := Task{ID: 1, Status: "PUBLISHED", DeadlineAt: deadline, AssignedTeacherID: 7}
	rejected := Submission{ID: 5, TaskID: 1, StudentID: 42, Status: StatusRejected, ReviewerID: ptrInt64(7)}

	cases := []struct {
		name    string
		actor   Actor
		sub     Submission
		wantErr error
	}{
		{name: "owner reopens", actor: student, sub: rejected},
		{name: "foreign student forbidden", actor: Actor{UserID: 99, Role: "student"}, sub: rejected, wantErr: domainerrors.ErrForbidden},
		{name: "teacher forbidden", actor: Actor{UserID: 7, Role: "teacher"}, sub: rejected, wantErr: domainerrors.ErrForbidden},
		{name: "card not rejected", actor: student, sub: Submission{StudentID: 42, Status: StatusReview}, wantErr: domainerrors.ErrInvalidTransition},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := GuardReopen(tc.actor, tc.sub, task)

			if tc.wantErr == nil {
				if got != nil {
					t.Fatalf("GuardReopen() = %v, want nil", got)
				}
				return
			}

			if !domainerrors.IsSentinel(got, tc.wantErr) {
				t.Fatalf("GuardReopen() = %v, want %v", got, tc.wantErr)
			}
		})
	}
}
