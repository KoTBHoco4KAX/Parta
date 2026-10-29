-- ПАРТА: студент может быть без группы (PATCH /api/users/{id}, group_id=null).
--
-- Исходный CHECK в 001_init.sql требовал group_id NOT NULL для role='student'.
-- Админка (BUG-004) должна уметь убирать студента из группы, поэтому
-- ограничение ослабляется: NULL разрешён любой роли, а непустой group_id —
-- по-прежнему только студенту.
--
-- SQLite не умеет ALTER TABLE ... DROP CONSTRAINT, поэтому таблица
-- пересоздаётся. Миграции выполняются с PRAGMA foreign_keys=OFF
-- (см. storage/migrate.go), поэтому DROP parent-таблицы безопасен.

CREATE TABLE users_new (
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
    CHECK (group_id IS NULL OR role = 'student')
) STRICT;

INSERT INTO users_new (
    id, external_id, role, group_id, display_name,
    xp_balance, on_time_streak, streak_freezes, created_at, updated_at
)
SELECT
    id, external_id, role, group_id, display_name,
    xp_balance, on_time_streak, streak_freezes, created_at, updated_at
FROM users;

DROP TABLE users;

ALTER TABLE users_new RENAME TO users;
