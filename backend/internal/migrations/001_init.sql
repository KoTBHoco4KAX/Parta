-- ПАРТА: SQLite STRICT schema
-- Драйвер: modernc.org/sqlite (pure-Go, без CGO)
-- Применяется как миграция 001 без изменений.

PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
PRAGMA busy_timeout = 5000;

CREATE TABLE groups (
    id              INTEGER PRIMARY KEY,
    code            TEXT NOT NULL UNIQUE,
    title           TEXT NOT NULL,
    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
) STRICT;

CREATE TABLE users (
    id                  INTEGER PRIMARY KEY,
    external_id         TEXT NOT NULL UNIQUE,
    role                TEXT NOT NULL CHECK (role IN ('admin','teacher','student')),
    group_id            INTEGER REFERENCES groups(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    display_name        TEXT NOT NULL,
    xp_balance          INTEGER NOT NULL DEFAULT 0 CHECK (xp_balance >= 0),
    on_time_streak      INTEGER NOT NULL DEFAULT 0 CHECK (on_time_streak >= 0),
    streak_freezes      INTEGER NOT NULL DEFAULT 0 CHECK (streak_freezes >= 0),
    created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    CHECK (
        (role = 'student' AND group_id IS NOT NULL)
        OR (role IN ('admin','teacher') AND group_id IS NULL)
    )
) STRICT;

CREATE TABLE disciplines (
    id              INTEGER PRIMARY KEY,
    code            TEXT NOT NULL UNIQUE,
    title           TEXT NOT NULL,
    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
) STRICT;

CREATE TABLE teacher_assignments (
    id              INTEGER PRIMARY KEY,
    teacher_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    group_id        INTEGER NOT NULL REFERENCES groups(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    discipline_id   INTEGER NOT NULL REFERENCES disciplines(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    UNIQUE (teacher_id, group_id, discipline_id)
) STRICT;

CREATE TABLE tasks (
    id                      INTEGER PRIMARY KEY,
    assignment_id           INTEGER NOT NULL REFERENCES teacher_assignments(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    title                   TEXT NOT NULL,
    description_md          TEXT NOT NULL,
    task_type               TEXT NOT NULL CHECK (task_type IN ('TEST','ESSAY','LAB_CODE','TEAM_PROJECT')),
    requirements_count      INTEGER NOT NULL CHECK (requirements_count > 0),
    expected_hours          REAL NOT NULL CHECK (expected_hours > 0.0),
    deadline_at             TEXT NOT NULL,
    speedrun_window_hours   INTEGER NOT NULL CHECK (speedrun_window_hours > 0),
    team_size               INTEGER NOT NULL DEFAULT 1 CHECK (team_size >= 1),
    base_xp_computed        INTEGER NOT NULL CHECK (base_xp_computed > 0),
    status                  TEXT NOT NULL CHECK (status IN ('DRAFT','PUBLISHED','ARCHIVED')),
    created_at              TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at              TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    CHECK (
        (task_type = 'TEAM_PROJECT' AND team_size >= 2)
        OR (task_type != 'TEAM_PROJECT' AND team_size = 1)
    ),
    CHECK (deadline_at > created_at)
) STRICT;

CREATE TABLE team_slots (
    id                  INTEGER PRIMARY KEY,
    task_id             INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE ON UPDATE CASCADE,
    role_code           TEXT NOT NULL,
    role_title          TEXT NOT NULL,
    assigned_user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
    status              TEXT NOT NULL CHECK (status IN ('OPEN','CLAIMED','SUBMITTED','ACCEPTED','REJECTED','ABANDONED')),
    artifact_url        TEXT,
    artifact_hash       TEXT,
    ready_at            TEXT,
    created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    UNIQUE (task_id, role_code),
    CHECK (
        (status = 'OPEN' AND assigned_user_id IS NULL)
        OR (status IN ('CLAIMED','SUBMITTED','ACCEPTED','REJECTED','ABANDONED') AND assigned_user_id IS NOT NULL)
    ),
    CHECK (
        (status IN ('SUBMITTED','ACCEPTED','REJECTED') AND artifact_url IS NOT NULL AND artifact_hash IS NOT NULL AND ready_at IS NOT NULL)
        OR (status NOT IN ('SUBMITTED','ACCEPTED','REJECTED'))
    )
) STRICT;

CREATE TABLE submissions (
    id                  INTEGER PRIMARY KEY,
    task_id             INTEGER NOT NULL REFERENCES tasks(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    student_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    team_slot_id        INTEGER REFERENCES team_slots(id) ON DELETE SET NULL ON UPDATE CASCADE,
    status              TEXT NOT NULL CHECK (status IN ('TODO','IN_PROGRESS','REVIEW','DONE','REJECTED')),
    artifact_url        TEXT,
    artifact_hash       TEXT,
    submitted_at        TEXT,
    final_submitted_at  TEXT,
    reviewed_at         TEXT,
    reviewer_id         INTEGER REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    verdict_comment     TEXT,
    revision_log        TEXT NOT NULL DEFAULT '[]',
    locked_at           TEXT,
    created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    CHECK (status NOT IN ('REVIEW','DONE') OR submitted_at IS NOT NULL),
    CHECK (status != 'DONE' OR final_submitted_at IS NOT NULL),
    CHECK (status != 'DONE' OR reviewed_at IS NOT NULL),
    CHECK (status != 'DONE' OR reviewer_id IS NOT NULL),
    CHECK (revision_log IS NULL OR json_valid(revision_log))
) STRICT;

CREATE TABLE xp_ledger (
    id                  INTEGER PRIMARY KEY,
    user_id             INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    amount              INTEGER NOT NULL CHECK (amount != 0),
    balance_after       INTEGER NOT NULL CHECK (balance_after >= 0),
    reason              TEXT NOT NULL CHECK (reason IN (
                            'TASK_BASE','SPEEDRUN_BONUS','PEER_REVIEW_REWARD',
                            'WAGER_WIN','WAGER_LOSS','WAGER_PLACE',
                            'FREEZE_PURCHASE','CARRY_OVER_BONUS','PENALTY','ADMIN_ADJUSTMENT'
                        )),
    source_type         TEXT NOT NULL CHECK (source_type IN (
                            'TASK','SUBMISSION','WAGER','PEER_REVIEW','USER','SYSTEM','TEAM_SLOT'
                        )),
    source_id           INTEGER,
    idempotency_key     TEXT NOT NULL UNIQUE,
    created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
) STRICT;

CREATE TABLE wagers (
    id                  INTEGER PRIMARY KEY,
    student_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    task_id             INTEGER NOT NULL REFERENCES tasks(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    stake_amount        INTEGER NOT NULL CHECK (stake_amount > 0),
    deadline_at         TEXT NOT NULL,
    status              TEXT NOT NULL CHECK (status IN ('PLACED','WON','LOST','CANCELLED')),
    created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    resolved_at         TEXT,
    resolution_note     TEXT,
    CHECK (status = 'PLACED' OR resolved_at IS NOT NULL)
) STRICT;

CREATE TABLE peer_reviews (
    id                  INTEGER PRIMARY KEY,
    submission_id       INTEGER NOT NULL REFERENCES submissions(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    author_id           INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    reviewer_id         INTEGER REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    criteria_checklist  TEXT NOT NULL DEFAULT '[]',
    comments            TEXT,
    status              TEXT NOT NULL CHECK (status IN ('CREATED','IN_REVIEW','COMPLETED','EXPIRED')),
    escrow_amount       INTEGER NOT NULL CHECK (escrow_amount > 0),
    reward_amount       INTEGER NOT NULL CHECK (reward_amount > 0),
    created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    taken_at            TEXT,
    completed_at        TEXT,
    expires_at          TEXT NOT NULL,
    CHECK (json_valid(criteria_checklist)),
    CHECK (reviewer_id IS NULL OR reviewer_id != author_id),
    CHECK (status != 'IN_REVIEW' OR reviewer_id IS NOT NULL),
    CHECK (status != 'COMPLETED' OR reviewer_id IS NOT NULL AND completed_at IS NOT NULL),
    CHECK (reward_amount <= escrow_amount)
) STRICT;

-- Индексы
CREATE INDEX idx_users_group_role ON users(group_id, role);
CREATE INDEX idx_teacher_assignments_teacher ON teacher_assignments(teacher_id, group_id);
CREATE INDEX idx_teacher_assignments_group ON teacher_assignments(group_id, discipline_id);
CREATE INDEX idx_tasks_deadline_status ON tasks(deadline_at, status);
CREATE INDEX idx_tasks_assignment_status ON tasks(assignment_id, status);
CREATE INDEX idx_team_slots_task_status ON team_slots(task_id, status);
CREATE UNIQUE INDEX uq_team_slots_assigned_active ON team_slots(task_id, assigned_user_id)
    WHERE assigned_user_id IS NOT NULL AND status IN ('CLAIMED','SUBMITTED','ACCEPTED','REJECTED');
CREATE INDEX idx_submissions_task_status_updated ON submissions(task_id, status, updated_at);
CREATE INDEX idx_submissions_student_status ON submissions(student_id, status);
CREATE INDEX idx_submissions_review_inbox ON submissions(status, submitted_at)
    WHERE status = 'REVIEW';
CREATE UNIQUE INDEX uq_submissions_individual ON submissions(task_id, student_id)
    WHERE team_slot_id IS NULL;
CREATE UNIQUE INDEX uq_submissions_team_slot ON submissions(team_slot_id)
    WHERE team_slot_id IS NOT NULL;
CREATE INDEX idx_xp_ledger_user_created ON xp_ledger(user_id, created_at);
CREATE INDEX idx_xp_ledger_source ON xp_ledger(source_type, source_id);
CREATE INDEX idx_wagers_status_deadline ON wagers(status, deadline_at);
CREATE UNIQUE INDEX uq_wagers_active ON wagers(student_id, task_id)
    WHERE status = 'PLACED';
CREATE INDEX idx_peer_reviews_status_expires ON peer_reviews(status, expires_at);
CREATE INDEX idx_peer_reviews_reviewer_status ON peer_reviews(reviewer_id, status);
CREATE UNIQUE INDEX uq_peer_reviews_active_submission ON peer_reviews(submission_id)
    WHERE status IN ('CREATED','IN_REVIEW');

-- Триггеры FSM
CREATE TRIGGER trg_submissions_status_transition
BEFORE UPDATE OF status ON submissions
FOR EACH ROW
WHEN NOT (
    OLD.status = NEW.status
    OR (OLD.status = 'TODO' AND NEW.status = 'IN_PROGRESS')
    OR (OLD.status = 'IN_PROGRESS' AND NEW.status IN ('REVIEW','REJECTED'))
    OR (OLD.status = 'REVIEW' AND NEW.status IN ('DONE','REJECTED'))
    OR (OLD.status = 'REJECTED' AND NEW.status = 'IN_PROGRESS')
)
BEGIN
    SELECT RAISE(ABORT, 'invalid submission status transition');
END;

CREATE TRIGGER trg_team_slots_status_transition
BEFORE UPDATE OF status ON team_slots
FOR EACH ROW
WHEN NOT (
    OLD.status = NEW.status
    OR (OLD.status = 'OPEN' AND NEW.status IN ('CLAIMED','ABANDONED'))
    OR (OLD.status = 'CLAIMED' AND NEW.status IN ('SUBMITTED','ABANDONED'))
    OR (OLD.status = 'SUBMITTED' AND NEW.status IN ('ACCEPTED','REJECTED'))
    OR (OLD.status = 'REJECTED' AND NEW.status IN ('CLAIMED','ABANDONED'))
    OR (OLD.status = 'ABANDONED' AND NEW.status = 'CLAIMED')
)
BEGIN
    SELECT RAISE(ABORT, 'invalid team_slot status transition');
END;

CREATE TRIGGER trg_wagers_status_transition
BEFORE UPDATE OF status ON wagers
FOR EACH ROW
WHEN NOT (
    OLD.status = NEW.status
    OR (OLD.status = 'PLACED' AND NEW.status IN ('WON','LOST','CANCELLED'))
)
BEGIN
    SELECT RAISE(ABORT, 'invalid wager status transition');
END;

CREATE TRIGGER trg_peer_reviews_status_transition
BEFORE UPDATE OF status ON peer_reviews
FOR EACH ROW
WHEN NOT (
    OLD.status = NEW.status
    OR (OLD.status = 'CREATED' AND NEW.status IN ('IN_REVIEW','EXPIRED'))
    OR (OLD.status = 'IN_REVIEW' AND NEW.status IN ('COMPLETED','EXPIRED'))
)
BEGIN
    SELECT RAISE(ABORT, 'invalid peer_review status transition');
END;