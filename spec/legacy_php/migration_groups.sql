-- =====================================================================
--  Нормальные учебные группы
--  ВАЖНО: используем study_groups, потому что groups — зарезервированное слово
-- =====================================================================

CREATE TABLE IF NOT EXISTS study_groups (
    id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name        VARCHAR(100) NOT NULL UNIQUE,
    curator_id  INT UNSIGNED DEFAULT NULL,
    year_start  YEAR DEFAULT NULL,
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_group_curator FOREIGN KEY (curator_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_groups (
    user_id     INT UNSIGNED NOT NULL,
    group_id    INT UNSIGNED NOT NULL,
    added_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, group_id),
    INDEX idx_ug_group (group_id),
    CONSTRAINT fk_ug_user  FOREIGN KEY (user_id)  REFERENCES users(id)        ON DELETE CASCADE,
    CONSTRAINT fk_ug_group FOREIGN KEY (group_id) REFERENCES study_groups(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS teacher_groups (
    teacher_id  INT UNSIGNED NOT NULL,
    group_id    INT UNSIGNED NOT NULL,
    added_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (teacher_id, group_id),
    INDEX idx_tg_group (group_id),
    CONSTRAINT fk_tg_teacher FOREIGN KEY (teacher_id) REFERENCES users(id)        ON DELETE CASCADE,
    CONSTRAINT fk_tg_group   FOREIGN KEY (group_id)   REFERENCES study_groups(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Переносим существующие group_name в нормальные группы
INSERT IGNORE INTO study_groups (name)
SELECT DISTINCT group_name FROM users
WHERE role = 'student' AND group_name IS NOT NULL AND group_name <> '';

INSERT IGNORE INTO user_groups (user_id, group_id)
SELECT u.id, g.id
FROM users u
JOIN study_groups g ON g.name = u.group_name
WHERE u.role = 'student' AND u.group_name IS NOT NULL AND u.group_name <> '';
