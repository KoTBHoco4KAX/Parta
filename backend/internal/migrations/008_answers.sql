-- ПАРТА: взаимопроверка «Ответы».
--
-- Черновик ученика уходит в пул, двое других учеников пишут комментарии,
-- автор ставит лайк/жалобу, а вознаграждение выплачивается только при
-- приёмке работы преподавателем.

ALTER TABLE users ADD COLUMN weekly_xp INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN weekly_xp_week TEXT NOT NULL DEFAULT '';

CREATE TABLE answer_drafts (
    id                  INTEGER PRIMARY KEY,
    submission_id       INTEGER NOT NULL REFERENCES submissions(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    task_id             INTEGER NOT NULL REFERENCES tasks(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    author_id           INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    text                TEXT NOT NULL DEFAULT '',
    attachment_url      TEXT NOT NULL DEFAULT '',
    attachment_name     TEXT NOT NULL DEFAULT '',
    escrow_percent      INTEGER NOT NULL CHECK (escrow_percent BETWEEN 0 AND 60),
    escrow_pool_xp      INTEGER NOT NULL CHECK (escrow_pool_xp >= 0),
    status              TEXT NOT NULL CHECK (status IN ('OPEN','COLLECTED','SETTLED','CLOSED')),
    created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    settled_at          TEXT,
    CHECK (text <> '' OR attachment_url <> '')
) STRICT;

-- Один активный черновик на карточку: после возврата учителя можно загрузить
-- новый, а старый остаётся закрытым в истории.
CREATE UNIQUE INDEX idx_answer_drafts_active
    ON answer_drafts(submission_id)
    WHERE status IN ('OPEN','COLLECTED');

CREATE INDEX idx_answer_drafts_author ON answer_drafts(author_id, created_at);
CREATE INDEX idx_answer_drafts_status ON answer_drafts(status, created_at);

CREATE TABLE answer_comments (
    id                  INTEGER PRIMARY KEY,
    draft_id            INTEGER NOT NULL REFERENCES answer_drafts(id) ON DELETE CASCADE ON UPDATE CASCADE,
    reviewer_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    text                TEXT NOT NULL CHECK (text <> ''),
    reaction            TEXT NOT NULL DEFAULT 'NONE' CHECK (reaction IN ('NONE','LIKE','REPORT')),
    payout_percent      INTEGER NOT NULL DEFAULT 0 CHECK (payout_percent BETWEEN 0 AND 100),
    reward_ledger_id    INTEGER REFERENCES xp_ledger(id) ON DELETE SET NULL ON UPDATE CASCADE,
    created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    UNIQUE (draft_id, reviewer_id)
) STRICT;

CREATE INDEX idx_answer_comments_draft ON answer_comments(draft_id, created_at);
CREATE INDEX idx_answer_comments_reviewer ON answer_comments(reviewer_id, created_at);
