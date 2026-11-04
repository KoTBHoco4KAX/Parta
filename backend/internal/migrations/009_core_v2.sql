-- ПАРТА: ядро данных v2.
--
-- Миграция не ломает старые клиенты: JSON-поля и artifact_* остаются для
-- совместимости, а нормализованные таблицы синхронизируются триггерами.
-- Поверх них появляются read-модели для MAX и проверки.

-- 1. Привязка аккаунта MAX к пользователю ПАРТЫ.
CREATE TABLE max_accounts (
    id              INTEGER PRIMARY KEY,
    user_id         INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
    max_user_id     TEXT NOT NULL UNIQUE,
    max_chat_id     TEXT,
    display_name    TEXT NOT NULL DEFAULT '',
    linked_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    last_seen_at    TEXT
) STRICT;

-- 2. Членство в группах: ученик может состоять в нескольких группах,
--    история не теряется при переводе.
CREATE TABLE group_memberships (
    id              INTEGER PRIMARY KEY,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
    group_id        INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE ON UPDATE CASCADE,
    role            TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('student','curator')),
    is_primary      INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0,1)),
    joined_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    left_at         TEXT
) STRICT;

CREATE UNIQUE INDEX uq_group_memberships_active
    ON group_memberships(user_id, group_id)
    WHERE left_at IS NULL;

CREATE UNIQUE INDEX uq_group_memberships_primary
    ON group_memberships(user_id)
    WHERE is_primary = 1 AND left_at IS NULL;

CREATE INDEX idx_group_memberships_group ON group_memberships(group_id, left_at);
CREATE INDEX idx_group_memberships_user ON group_memberships(user_id, left_at);

INSERT INTO group_memberships (user_id, group_id, role, is_primary)
SELECT id, group_id, 'student', 1
FROM users
WHERE role = 'student' AND group_id IS NOT NULL;

-- 3. Нормализованные вложения задания.
CREATE TABLE task_attachments (
    id              INTEGER PRIMARY KEY,
    task_id         INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE ON UPDATE CASCADE,
    filename        TEXT NOT NULL,
    url             TEXT NOT NULL,
    size_bytes      INTEGER NOT NULL DEFAULT 0 CHECK (size_bytes >= 0),
    content_type    TEXT NOT NULL DEFAULT '',
    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    UNIQUE (task_id, url)
) STRICT;

CREATE INDEX idx_task_attachments_task ON task_attachments(task_id);

INSERT OR IGNORE INTO task_attachments (task_id, filename, url, size_bytes)
SELECT t.id,
       COALESCE(json_extract(j.value, '$.name'), 'file'),
       json_extract(j.value, '$.url'),
       COALESCE(json_extract(j.value, '$.size'), 0)
FROM tasks t,
     json_each(CASE WHEN json_valid(t.attachments) THEN t.attachments ELSE '[]' END) j
WHERE json_extract(j.value, '$.url') IS NOT NULL;

-- 4. Нормализованные файлы сдачи.
CREATE TABLE submission_attachments (
    id              INTEGER PRIMARY KEY,
    submission_id   INTEGER NOT NULL REFERENCES submissions(id) ON DELETE CASCADE ON UPDATE CASCADE,
    filename        TEXT NOT NULL,
    url             TEXT NOT NULL,
    sha256          TEXT NOT NULL DEFAULT '',
    size_bytes      INTEGER NOT NULL DEFAULT 0 CHECK (size_bytes >= 0),
    content_type    TEXT NOT NULL DEFAULT '',
    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    UNIQUE (submission_id, url)
) STRICT;

CREATE INDEX idx_submission_attachments_submission ON submission_attachments(submission_id);

INSERT OR IGNORE INTO submission_attachments (submission_id, filename, url, sha256)
SELECT s.id,
       CASE
           WHEN instr(s.artifact_url, '/uploads/') > 0
               THEN substr(s.artifact_url, instr(s.artifact_url, '/uploads/') + 9)
           ELSE s.artifact_url
       END,
       s.artifact_url,
       COALESCE(s.artifact_hash, '')
FROM submissions s
WHERE s.artifact_url IS NOT NULL AND s.artifact_url <> '';

-- 5. История доработок и переходов статуса.
CREATE TABLE submission_revisions (
    id              INTEGER PRIMARY KEY,
    submission_id   INTEGER NOT NULL REFERENCES submissions(id) ON DELETE CASCADE ON UPDATE CASCADE,
    at              TEXT NOT NULL,
    actor_id        INTEGER REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
    comment         TEXT NOT NULL DEFAULT '',
    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
) STRICT;

CREATE INDEX idx_submission_revisions_submission ON submission_revisions(submission_id, at);

INSERT INTO submission_revisions (submission_id, at, actor_id, comment)
SELECT s.id,
       COALESCE(json_extract(j.value, '$.at'), s.created_at),
       CASE WHEN json_type(j.value, '$.actor_id') = 'integer'
            THEN json_extract(j.value, '$.actor_id') END,
       COALESCE(json_extract(j.value, '$.comment'), '')
FROM submissions s,
     json_each(CASE WHEN json_valid(s.revision_log) THEN s.revision_log ELSE '[]' END) j
WHERE json_extract(j.value, '$.at') IS NOT NULL;

CREATE TABLE submission_events (
    id              INTEGER PRIMARY KEY,
    submission_id   INTEGER NOT NULL REFERENCES submissions(id) ON DELETE CASCADE ON UPDATE CASCADE,
    from_status     TEXT,
    to_status       TEXT NOT NULL,
    actor_id        INTEGER REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
    comment         TEXT NOT NULL DEFAULT '',
    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
) STRICT;

CREATE INDEX idx_submission_events_submission ON submission_events(submission_id, created_at);

-- 6. Синхронизация старых полей с нормализованными таблицами.
CREATE TRIGGER trg_users_membership_insert
AFTER INSERT ON users
FOR EACH ROW
WHEN NEW.role = 'student' AND NEW.group_id IS NOT NULL
BEGIN
    INSERT INTO group_memberships (user_id, group_id, role, is_primary)
    VALUES (NEW.id, NEW.group_id, 'student', 1);
END;

CREATE TRIGGER trg_users_membership_update
AFTER UPDATE OF group_id, role ON users
FOR EACH ROW
WHEN OLD.group_id IS NOT NEW.group_id OR OLD.role IS NOT NEW.role
BEGIN
    UPDATE group_memberships
    SET left_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
    WHERE user_id = OLD.id AND is_primary = 1 AND left_at IS NULL;

    INSERT INTO group_memberships (user_id, group_id, role, is_primary)
    SELECT NEW.id, NEW.group_id, 'student', 1
    WHERE NEW.role = 'student' AND NEW.group_id IS NOT NULL;
END;

CREATE TRIGGER trg_tasks_attachments_insert
AFTER INSERT ON tasks
FOR EACH ROW
BEGIN
    DELETE FROM task_attachments WHERE task_id = NEW.id;

    INSERT INTO task_attachments (task_id, filename, url, size_bytes)
    SELECT NEW.id,
           COALESCE(json_extract(j.value, '$.name'), 'file'),
           json_extract(j.value, '$.url'),
           COALESCE(json_extract(j.value, '$.size'), 0)
    FROM json_each(CASE WHEN json_valid(NEW.attachments) THEN NEW.attachments ELSE '[]' END) j
    WHERE json_extract(j.value, '$.url') IS NOT NULL;
END;

CREATE TRIGGER trg_tasks_attachments_update
AFTER UPDATE OF attachments ON tasks
FOR EACH ROW
BEGIN
    DELETE FROM task_attachments WHERE task_id = NEW.id;

    INSERT INTO task_attachments (task_id, filename, url, size_bytes)
    SELECT NEW.id,
           COALESCE(json_extract(j.value, '$.name'), 'file'),
           json_extract(j.value, '$.url'),
           COALESCE(json_extract(j.value, '$.size'), 0)
    FROM json_each(CASE WHEN json_valid(NEW.attachments) THEN NEW.attachments ELSE '[]' END) j
    WHERE json_extract(j.value, '$.url') IS NOT NULL;
END;

CREATE TRIGGER trg_submissions_attachment_insert
AFTER INSERT ON submissions
FOR EACH ROW
WHEN NEW.artifact_url IS NOT NULL AND NEW.artifact_url <> ''
BEGIN
    INSERT OR IGNORE INTO submission_attachments (submission_id, filename, url, sha256)
    VALUES (
        NEW.id,
        CASE
            WHEN instr(NEW.artifact_url, '/uploads/') > 0
                THEN substr(NEW.artifact_url, instr(NEW.artifact_url, '/uploads/') + 9)
            ELSE NEW.artifact_url
        END,
        NEW.artifact_url,
        COALESCE(NEW.artifact_hash, '')
    );
END;

CREATE TRIGGER trg_submissions_attachment_update
AFTER UPDATE OF artifact_url, artifact_hash ON submissions
FOR EACH ROW
BEGIN
    DELETE FROM submission_attachments WHERE submission_id = NEW.id;

    INSERT INTO submission_attachments (submission_id, filename, url, sha256)
    SELECT NEW.id,
           CASE
               WHEN instr(NEW.artifact_url, '/uploads/') > 0
                   THEN substr(NEW.artifact_url, instr(NEW.artifact_url, '/uploads/') + 9)
               ELSE NEW.artifact_url
           END,
           NEW.artifact_url,
           COALESCE(NEW.artifact_hash, '')
    WHERE NEW.artifact_url IS NOT NULL AND NEW.artifact_url <> '';
END;

CREATE TRIGGER trg_submissions_revisions_insert
AFTER INSERT ON submissions
FOR EACH ROW
BEGIN
    INSERT INTO submission_revisions (submission_id, at, actor_id, comment)
    SELECT NEW.id,
           COALESCE(json_extract(j.value, '$.at'), NEW.created_at),
           CASE WHEN json_type(j.value, '$.actor_id') = 'integer'
                THEN json_extract(j.value, '$.actor_id') END,
           COALESCE(json_extract(j.value, '$.comment'), '')
    FROM json_each(CASE WHEN json_valid(NEW.revision_log) THEN NEW.revision_log ELSE '[]' END) j
    WHERE json_extract(j.value, '$.at') IS NOT NULL;
END;

CREATE TRIGGER trg_submissions_revisions_update
AFTER UPDATE OF revision_log ON submissions
FOR EACH ROW
BEGIN
    DELETE FROM submission_revisions WHERE submission_id = NEW.id;

    INSERT INTO submission_revisions (submission_id, at, actor_id, comment)
    SELECT NEW.id,
           COALESCE(json_extract(j.value, '$.at'), NEW.updated_at),
           CASE WHEN json_type(j.value, '$.actor_id') = 'integer'
                THEN json_extract(j.value, '$.actor_id') END,
           COALESCE(json_extract(j.value, '$.comment'), '')
    FROM json_each(CASE WHEN json_valid(NEW.revision_log) THEN NEW.revision_log ELSE '[]' END) j
    WHERE json_extract(j.value, '$.at') IS NOT NULL;
END;

CREATE TRIGGER trg_submissions_events
AFTER UPDATE OF status ON submissions
FOR EACH ROW
WHEN OLD.status IS NOT NEW.status
BEGIN
    INSERT INTO submission_events (submission_id, from_status, to_status, actor_id, comment)
    VALUES (NEW.id, OLD.status, NEW.status, NEW.reviewer_id, COALESCE(NEW.verdict_comment, ''));
END;

-- 7. Целостность ролей: назначение можно выдать только преподавателю.
CREATE TRIGGER trg_teacher_assignments_role_insert
BEFORE INSERT ON teacher_assignments
FOR EACH ROW
WHEN (SELECT role FROM users WHERE id = NEW.teacher_id) IS NOT 'teacher'
BEGIN
    SELECT RAISE(ABORT, 'teacher_assignments: teacher_id must be teacher');
END;

CREATE TRIGGER trg_teacher_assignments_role_update
BEFORE UPDATE OF teacher_id ON teacher_assignments
FOR EACH ROW
WHEN (SELECT role FROM users WHERE id = NEW.teacher_id) IS NOT 'teacher'
BEGIN
    SELECT RAISE(ABORT, 'teacher_assignments: teacher_id must be teacher');
END;

-- 8. Read-модели для MAX и проверок.
CREATE VIEW v_student_kanban AS
SELECT
    s.id                AS submission_id,
    s.student_id        AS student_id,
    s.task_id           AS task_id,
    t.title             AS task_title,
    t.task_type         AS task_type,
    s.status            AS status,
    t.deadline_at       AS deadline_at,
    t.speedrun_bonus_until AS speedrun_bonus_until,
    t.base_xp_computed  AS base_xp,
    ta.group_id         AS group_id,
    g.code              AS group_code,
    ta.teacher_id       AS teacher_id,
    u.display_name      AS teacher_name,
    d.title             AS discipline_title,
    s.submitted_at      AS submitted_at,
    s.reviewed_at       AS reviewed_at,
    s.updated_at        AS updated_at
FROM submissions s
JOIN tasks t ON t.id = s.task_id
JOIN teacher_assignments ta ON ta.id = t.assignment_id
JOIN groups g ON g.id = ta.group_id
JOIN users u ON u.id = ta.teacher_id
JOIN disciplines d ON d.id = ta.discipline_id;

CREATE VIEW v_teacher_review_inbox AS
SELECT
    k.submission_id,
    k.teacher_id,
    k.teacher_name,
    k.student_id,
    k.group_id,
    k.group_code,
    k.discipline_title,
    k.task_id,
    k.task_title,
    k.task_type,
    k.deadline_at,
    k.base_xp,
    k.submitted_at
FROM v_student_kanban k
WHERE k.status = 'REVIEW';

CREATE VIEW v_group_roster AS
SELECT
    g.id                AS group_id,
    g.code              AS group_code,
    g.title             AS group_title,
    COUNT(u.id)         AS students_count
FROM groups g
LEFT JOIN users u ON u.group_id = g.id AND u.role = 'student'
GROUP BY g.id, g.code, g.title;

CREATE VIEW v_max_student_kanban AS
SELECT
    k.*,
    m.max_user_id,
    m.max_chat_id
FROM v_student_kanban k
LEFT JOIN max_accounts m ON m.user_id = k.student_id;

-- 9. Индексы под частые выборки.
CREATE INDEX idx_max_accounts_chat ON max_accounts(max_chat_id);
CREATE INDEX idx_submission_events_status ON submission_events(to_status, created_at);
