-- Добавляем роли и группу к пользователям
ALTER TABLE users
    ADD COLUMN role ENUM('student','teacher','admin') NOT NULL DEFAULT 'student' AFTER name,
    ADD COLUMN group_name VARCHAR(50) DEFAULT NULL AFTER role,
    ADD COLUMN blocked TINYINT(1) NOT NULL DEFAULT 0 AFTER group_name;

-- Кто из преподавателей "ведёт" каких студентов
CREATE TABLE IF NOT EXISTS teacher_students (
    teacher_id INT UNSIGNED NOT NULL,
    student_id INT UNSIGNED NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (teacher_id, student_id),
    CONSTRAINT fk_ts_teacher FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_ts_student FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Вложения к задачам
CREATE TABLE IF NOT EXISTS attachments (
    id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    task_id      INT UNSIGNED NOT NULL,
    user_id      INT UNSIGNED NOT NULL,
    filename     VARCHAR(255) NOT NULL,
    mime         VARCHAR(120) NOT NULL,
    size_bytes   INT UNSIGNED NOT NULL,
    storage_path VARCHAR(500) NOT NULL,
    created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_attach_task (task_id),
    CONSTRAINT fk_attach_task FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
    CONSTRAINT fk_attach_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Комментарии (их не было в первой версии)
CREATE TABLE IF NOT EXISTS comments (
    id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    task_id    INT UNSIGNED NOT NULL,
    user_id    INT UNSIGNED NOT NULL,
    body       TEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_comments_task (task_id),
    CONSTRAINT fk_comments_task FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
    CONSTRAINT fk_comments_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
