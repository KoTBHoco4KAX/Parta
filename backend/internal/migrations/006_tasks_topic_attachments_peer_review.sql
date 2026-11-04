-- ПАРТА: доработка заданий и взаимопроверка учеников.
--
-- 1. Задание получает ТЗ (короткое пояснение, без «темы» отдельно) и
--    вложения, приложенные преподавателем при выдаче.
-- 2. Взаимопроверка переходит от P2P-экономики (escrow) к оценке 1–5 звёзд
--    с коротким комментарием: escrow/reward убираются, добавляются grade,
--    comment и признак принятия преподавателем (с него начинается награда).
-- 3. Сдача разрешена и после дедлайна (с пониженым множителем XP).

ALTER TABLE tasks ADD COLUMN topic TEXT NOT NULL DEFAULT '';
ALTER TABLE tasks ADD COLUMN attachments TEXT NOT NULL DEFAULT '[]';

CREATE TABLE peer_reviews_new (
    id                  INTEGER PRIMARY KEY,
    submission_id       INTEGER NOT NULL REFERENCES submissions(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    author_id           INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    reviewer_id         INTEGER REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    status              TEXT NOT NULL CHECK (status IN ('CREATED','IN_REVIEW','COMPLETED','EXPIRED')),
    grade               INTEGER CHECK (grade BETWEEN 1 AND 5),
    comment             TEXT,
    created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    taken_at            TEXT,
    completed_at        TEXT,
    expires_at          TEXT NOT NULL,
    reward_ledger_id    INTEGER REFERENCES xp_ledger(id) ON DELETE SET NULL ON UPDATE CASCADE,
    CHECK (reviewer_id IS NULL OR reviewer_id != author_id),
    CHECK (status != 'IN_REVIEW' OR reviewer_id IS NOT NULL),
    CHECK (status != 'COMPLETED' OR (reviewer_id IS NOT NULL AND completed_at IS NOT NULL
                                     AND grade IS NOT NULL AND comment IS NOT NULL))
) STRICT;

INSERT INTO peer_reviews_new (
    id, submission_id, author_id, reviewer_id, status, created_at, taken_at,
    completed_at, expires_at
)
SELECT
    id, submission_id, author_id, reviewer_id, status, created_at, taken_at,
    completed_at, expires_at
FROM peer_reviews;

DROP TABLE peer_reviews;

ALTER TABLE peer_reviews_new RENAME TO peer_reviews;

CREATE INDEX idx_peer_reviews_status_expires ON peer_reviews(status, expires_at);
CREATE INDEX idx_peer_reviews_reviewer_status ON peer_reviews(reviewer_id, status);
CREATE UNIQUE INDEX uq_peer_reviews_active_submission ON peer_reviews(submission_id)
    WHERE status IN ('CREATED','IN_REVIEW');

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

-- Взаимопроверка больше не блокирует сдачу: карточка может уйти в REVIEW
-- сразу после отправки файла (файл идёт учителю, оценка — рецензенту).
