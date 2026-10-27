-- =====================================================================
--  Переделка под модель "препод выдаёт задания"
-- =====================================================================

-- ---------------------------------------------
--  Задания (создаёт преподаватель)
-- ---------------------------------------------
DROP TABLE IF EXISTS submissions, assignment_students, assignments;

CREATE TABLE assignments (
    id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    teacher_id     INT UNSIGNED NOT NULL,
    title          VARCHAR(255) NOT NULL,
    description    TEXT DEFAULT NULL,
    subject_id     INT UNSIGNED DEFAULT NULL,
    deadline_at    DATE DEFAULT NULL,
    grade_max      INT UNSIGNED NOT NULL DEFAULT 100,
    allow_resubmit TINYINT(1) NOT NULL DEFAULT 1,
    created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_assign_teacher (teacher_id, created_at),
    CONSTRAINT fk_assign_teacher FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_assign_subject FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------
--  Кому выдано задание
-- ---------------------------------------------
CREATE TABLE assignment_students (
    assignment_id INT UNSIGNED NOT NULL,
    student_id    INT UNSIGNED NOT NULL,
    created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (assignment_id, student_id),
    INDEX idx_as_student (student_id),
    CONSTRAINT fk_as_assign FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE CASCADE,
    CONSTRAINT fk_as_student FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------
--  Статус и сдача по каждому выданому заданию
--  (одна строка = "этот студент делает это задание")
-- ---------------------------------------------
CREATE TABLE submissions (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    assignment_id   INT UNSIGNED NOT NULL,
    student_id      INT UNSIGNED NOT NULL,
    status          ENUM('new','in_progress','submitted','graded') NOT NULL DEFAULT 'new',
    work_text       TEXT DEFAULT NULL,
    grade           INT UNSIGNED DEFAULT NULL,
    teacher_comment TEXT DEFAULT NULL,
    position        INT NOT NULL DEFAULT 0,
    submitted_at    DATETIME DEFAULT NULL,
    graded_at       DATETIME DEFAULT NULL,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_sub_assign_student (assignment_id, student_id),
    INDEX idx_sub_student (student_id, status),
    INDEX idx_sub_assign (assignment_id, status),
    CONSTRAINT fk_sub_assign  FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE CASCADE,
    CONSTRAINT fk_sub_student FOREIGN KEY (student_id)    REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------
--  Файлы: теперь у них может быть владелец = assignment (методичка препода)
--  или = submission (работа студента).
--  Переделываем таблицу attachments.
-- ---------------------------------------------
DROP TABLE IF EXISTS attachments;

CREATE TABLE attachments (
    id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    owner_type    ENUM('assignment','submission') NOT NULL,
    owner_id      INT UNSIGNED NOT NULL,
    user_id       INT UNSIGNED NOT NULL,
    filename      VARCHAR(255) NOT NULL,
    mime          VARCHAR(120) NOT NULL,
    size_bytes    INT UNSIGNED NOT NULL,
    storage_path  VARCHAR(500) NOT NULL,
    created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_attach_owner (owner_type, owner_id),
    CONSTRAINT fk_attach_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------
--  Комментарии тоже перевесим на submission
-- ---------------------------------------------
DROP TABLE IF EXISTS comments;

CREATE TABLE comments (
    id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    submission_id INT UNSIGNED NOT NULL,
    user_id       INT UNSIGNED NOT NULL,
    body          TEXT NOT NULL,
    created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_com_sub (submission_id),
    CONSTRAINT fk_com_sub  FOREIGN KEY (submission_id) REFERENCES submissions(id) ON DELETE CASCADE,
    CONSTRAINT fk_com_user FOREIGN KEY (user_id)       REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
