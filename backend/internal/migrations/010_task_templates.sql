-- ПАРТА: база заданий преподавателя и повторная выдача.
--
-- Шаблон хранит содержательные параметры задания, но не привязку к группе:
-- одна и та же заготовка может быть выдана в любой поток преподавателя.
-- Дедлайн и получатели задаются в момент выдачи (POST /api/task-templates/{id}/issue).
-- Из шаблона создаётся обычное задание tasks, поэтому карточки учеников
-- появляются через тот же механизм submissions, что и при POST /api/tasks.

CREATE TABLE task_templates (
    id                      INTEGER PRIMARY KEY,
    teacher_id              INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
    discipline_id           INTEGER NOT NULL REFERENCES disciplines(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    title                   TEXT NOT NULL,
    description_md          TEXT NOT NULL DEFAULT '',
    task_type               TEXT NOT NULL CHECK (task_type IN ('TEST','NOTES','ESSAY','LAB_CODE','TEAM_PROJECT')),
    requirements_count      INTEGER NOT NULL CHECK (requirements_count > 0),
    expected_hours          REAL NOT NULL CHECK (expected_hours > 0.0),
    speedrun_window_hours   INTEGER NOT NULL CHECK (speedrun_window_hours > 0),
    team_size               INTEGER NOT NULL DEFAULT 1 CHECK (team_size >= 1),
    created_at              TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    CHECK (
        (task_type = 'TEAM_PROJECT' AND team_size >= 2)
        OR (task_type != 'TEAM_PROJECT' AND team_size = 1)
    )
) STRICT;

CREATE INDEX idx_task_templates_teacher ON task_templates(teacher_id, created_at DESC);
CREATE INDEX idx_task_templates_discipline ON task_templates(discipline_id);
