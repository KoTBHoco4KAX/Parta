-- ПАРТА: пятый тип задания — конспект (NOTES).
--
-- Типы заданий теперь: тест (TEST), конспект (NOTES), домашнее задание
-- (LAB_CODE), эссе (ESSAY), командный проект (TEAM_PROJECT).
-- SQLite не умеет менять CHECK на месте, поэтому таблица пересоздаётся
-- (миграции идут с PRAGMA foreign_keys=OFF, см. storage/migrate.go).

CREATE TABLE tasks_new (
    id                      INTEGER PRIMARY KEY,
    assignment_id           INTEGER NOT NULL REFERENCES teacher_assignments(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    title                   TEXT NOT NULL,
    topic                   TEXT NOT NULL DEFAULT '',
    description_md          TEXT NOT NULL,
    task_type               TEXT NOT NULL CHECK (task_type IN ('TEST','NOTES','ESSAY','LAB_CODE','TEAM_PROJECT')),
    requirements_count      INTEGER NOT NULL CHECK (requirements_count > 0),
    expected_hours          REAL NOT NULL CHECK (expected_hours > 0.0),
    deadline_at             TEXT NOT NULL,
    speedrun_window_hours   INTEGER NOT NULL CHECK (speedrun_window_hours > 0),
    speedrun_bonus_until    TEXT,
    team_size               INTEGER NOT NULL DEFAULT 1 CHECK (team_size >= 1),
    base_xp_computed        INTEGER NOT NULL CHECK (base_xp_computed > 0),
    attachments             TEXT NOT NULL DEFAULT '[]',
    status                  TEXT NOT NULL CHECK (status IN ('DRAFT','PUBLISHED','ARCHIVED')),
    created_at              TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at              TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    CHECK (
        (task_type = 'TEAM_PROJECT' AND team_size >= 2)
        OR (task_type != 'TEAM_PROJECT' AND team_size = 1)
    ),
    CHECK (deadline_at > created_at),
    CHECK (speedrun_bonus_until IS NULL OR speedrun_bonus_until < deadline_at),
    CHECK (json_valid(attachments))
) STRICT;

INSERT INTO tasks_new (
    id, assignment_id, title, topic, description_md, task_type, requirements_count,
    expected_hours, deadline_at, speedrun_window_hours, speedrun_bonus_until,
    team_size, base_xp_computed, attachments, status, created_at, updated_at
)
SELECT
    id, assignment_id, title, topic, description_md, task_type, requirements_count,
    expected_hours, deadline_at, speedrun_window_hours, speedrun_bonus_until,
    team_size, base_xp_computed, attachments, status, created_at, updated_at
FROM tasks;

DROP TABLE tasks;

ALTER TABLE tasks_new RENAME TO tasks;

CREATE INDEX idx_tasks_deadline_status ON tasks(deadline_at, status);
CREATE INDEX idx_tasks_assignment_status ON tasks(assignment_id, status);
