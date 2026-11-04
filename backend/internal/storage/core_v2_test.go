package storage

import (
	"context"
	"testing"
	"time"
)

func TestCoreV2TriggersAndViews(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()

	var (
		assignmentID int64
		studentID    int64
		groupOne     int64
		groupTwo     int64
	)

	mustScan := func(query string, dest ...any) {
		t.Helper()

		if err := db.QueryRowContext(ctx, query).Scan(dest...); err != nil {
			t.Fatalf("%s: %v", query, err)
		}
	}

	mustScan(`SELECT id FROM teacher_assignments LIMIT 1`, &assignmentID)
	mustScan(`SELECT id FROM users WHERE role = 'student' ORDER BY id LIMIT 1`, &studentID)
	mustScan(`SELECT id FROM groups ORDER BY id LIMIT 1`, &groupOne)
	mustScan(`SELECT id FROM groups ORDER BY id DESC LIMIT 1`, &groupTwo)

	deadline := time.Now().Add(7 * 24 * time.Hour).UTC().Format(time.RFC3339)

	var taskID int64

	if err := db.QueryRowContext(ctx,
		`INSERT INTO tasks (
		    assignment_id, title, topic, description_md, task_type,
		    requirements_count, expected_hours, deadline_at, speedrun_window_hours,
		    team_size, base_xp_computed, attachments, status
		 ) VALUES (?, 'Задание', 'Тема', '', 'LAB_CODE', 8, 4, ?, 48, 1, 400,
		           '[{"name":"brief.pdf","url":"/uploads/brief.pdf","size":123}]', 'PUBLISHED')
		 RETURNING id`,
		assignmentID, deadline).Scan(&taskID); err != nil {
		t.Fatalf("insert task: %v", err)
	}

	var (
		attachmentName string
		attachmentSize int
	)

	if err := db.QueryRowContext(ctx,
		`SELECT filename, size_bytes FROM task_attachments WHERE task_id = ?`, taskID).
		Scan(&attachmentName, &attachmentSize); err != nil {
		t.Fatalf("task_attachments: %v", err)
	}

	if attachmentName != "brief.pdf" || attachmentSize != 123 {
		t.Fatalf("task attachment = %s/%d", attachmentName, attachmentSize)
	}

	var submissionID int64

	if err := db.QueryRowContext(ctx,
		`INSERT INTO submissions (task_id, student_id, status, artifact_url, artifact_hash)
		 VALUES (?, ?, 'IN_PROGRESS', '/uploads/submission-9-1-work.pdf', 'sha256:abc')
		 RETURNING id`,
		taskID, studentID).Scan(&submissionID); err != nil {
		t.Fatalf("insert submission: %v", err)
	}

	var attachmentFile string

	if err := db.QueryRowContext(ctx,
		`SELECT filename FROM submission_attachments WHERE submission_id = ?`, submissionID).
		Scan(&attachmentFile); err != nil {
		t.Fatalf("submission_attachments: %v", err)
	}

	if attachmentFile != "submission-9-1-work.pdf" {
		t.Fatalf("submission attachment = %s", attachmentFile)
	}

	if _, err := db.ExecContext(ctx,
		`UPDATE submissions SET status = 'REVIEW', submitted_at = ? WHERE id = ?`,
		time.Now().UTC().Format(time.RFC3339), submissionID); err != nil {
		t.Fatalf("update status: %v", err)
	}

	var eventCount int

	if err := db.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM submission_events WHERE submission_id = ?`, submissionID).
		Scan(&eventCount); err != nil {
		t.Fatalf("submission_events: %v", err)
	}

	if eventCount == 0 {
		t.Fatalf("submission_events empty")
	}

	var kanbanStatus string

	if err := db.QueryRowContext(ctx,
		`SELECT status FROM v_student_kanban WHERE submission_id = ?`, submissionID).
		Scan(&kanbanStatus); err != nil {
		t.Fatalf("v_student_kanban: %v", err)
	}

	if kanbanStatus != "REVIEW" {
		t.Fatalf("kanban status = %s", kanbanStatus)
	}

	if groupOne != groupTwo {
		if _, err := db.ExecContext(ctx,
			`UPDATE users SET group_id = ? WHERE id = ?`, groupTwo, studentID); err != nil {
			t.Fatalf("move student: %v", err)
		}

		var activeMemberships int

		if err := db.QueryRowContext(ctx,
			`SELECT COUNT(*) FROM group_memberships
			 WHERE user_id = ? AND group_id = ? AND is_primary = 1 AND left_at IS NULL`,
			studentID, groupTwo).Scan(&activeMemberships); err != nil {
			t.Fatalf("group_memberships: %v", err)
		}

		if activeMemberships != 1 {
			t.Fatalf("active memberships = %d, want 1", activeMemberships)
		}
	}
}
