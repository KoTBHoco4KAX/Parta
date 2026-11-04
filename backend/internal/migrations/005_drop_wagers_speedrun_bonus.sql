-- ПАРТА: отказ от пари и добавление даты окончания бонуса за спидран.
--
-- 1. Пари (wagers) удалены как механика: вместо них у каждого задания есть
--    бонусный период. Граница бонуса — момент, когда сдача ещё получает
--    speedrun-множитель: deadline_at - speedrun_window_hours для автоматического
--    режима либо явно назначенная преподавателем дата.
-- 2. Из журнала XP убираются причины/источники пари, из-за чего таблица
--    xp_ledger пересоздаётся (SQLite не умеет менять CHECK на месте).

DROP TRIGGER IF EXISTS trg_wagers_status_transition;
DROP TABLE IF EXISTS wagers;

CREATE TABLE tasks_new (
    id                      INTEGER PRIMARY KEY,
    assignment_id           INTEGER NOT NULL REFERENCES teacher_assignments(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    title                   TEXT NOT NULL,
    description_md          TEXT NOT NULL,
    task_type               TEXT NOT NULL CHECK (task_type IN ('TEST','ESSAY','LAB_CODE','TEAM_PROJECT')),
    requirements_count      INTEGER NOT NULL CHECK (requirements_count > 0),
    expected_hours          REAL NOT NULL CHECK (expected_hours > 0.0),
    deadline_at             TEXT NOT NULL,
    speedrun_window_hours   INTEGER NOT NULL CHECK (speedrun_window_hours > 0),
    speedrun_bonus_until    TEXT,
    team_size               INTEGER NOT NULL DEFAULT 1 CHECK (team_size >= 1),
    base_xp_computed        INTEGER NOT NULL CHECK (base_xp_computed > 0),
    status                  TEXT NOT NULL CHECK (status IN ('DRAFT','PUBLISHED','ARCHIVED')),
    created_at              TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at              TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    CHECK (
        (task_type = 'TEAM_PROJECT' AND team_size >= 2)
        OR (task_type != 'TEAM_PROJECT' AND team_size = 1)
    ),
    CHECK (deadline_at > created_at),
    CHECK (speedrun_bonus_until IS NULL OR speedrun_bonus_until < deadline_at)
) STRICT;

INSERT INTO tasks_new (
    id, assignment_id, title, description_md, task_type, requirements_count,
    expected_hours, deadline_at, speedrun_window_hours, speedrun_bonus_until,
    team_size, base_xp_computed, status, created_at, updated_at
)
SELECT
    id, assignment_id, title, description_md, task_type, requirements_count,
    expected_hours, deadline_at, speedrun_window_hours, NULL,
    team_size, base_xp_computed, status, created_at, updated_at
FROM tasks;

DROP TABLE tasks;

ALTER TABLE tasks_new RENAME TO tasks;

CREATE INDEX idx_tasks_deadline_status ON tasks(deadline_at, status);
CREATE INDEX idx_tasks_assignment_status ON tasks(assignment_id, status);

CREATE TABLE xp_ledger_new (
    id                  INTEGER PRIMARY KEY,
    user_id             INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    amount              INTEGER NOT NULL CHECK (amount != 0),
    balance_after       INTEGER NOT NULL CHECK (balance_after >= 0),
    reason              TEXT NOT NULL CHECK (reason IN (
                            'TASK_BASE','SPEEDRUN_BONUS','PEER_REVIEW_REWARD',
                            'FREEZE_PURCHASE','CARRY_OVER_BONUS','PENALTY','ADMIN_ADJUSTMENT'
                        )),
    source_type         TEXT NOT NULL CHECK (source_type IN (
                            'TASK','SUBMISSION','PEER_REVIEW','USER','SYSTEM','TEAM_SLOT'
                        )),
    source_id           INTEGER,
    idempotency_key     TEXT NOT NULL UNIQUE,
    created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
) STRICT;

INSERT INTO xp_ledger_new (
    id, user_id, amount, balance_after, reason, source_type, source_id,
    idempotency_key, created_at
)
SELECT
    id, user_id, amount, balance_after, reason, source_type, source_id,
    idempotency_key, created_at
FROM xp_ledger
WHERE reason NOT IN ('WAGER_WIN','WAGER_LOSS','WAGER_PLACE');

DROP TABLE xp_ledger;

ALTER TABLE xp_ledger_new RENAME TO xp_ledger;

CREATE INDEX idx_xp_ledger_user_created ON xp_ledger(user_id, created_at);
CREATE INDEX idx_xp_ledger_source ON xp_ledger(source_type, source_id);
