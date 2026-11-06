-- ПАРТА: расширенный dev-набор для проверки групп, заданий, рейтинга и «Ответов».
-- Все вставки идемпотентны: повторный запуск не создаёт дублей.

INSERT INTO groups (code, title) VALUES
    ('IS-23', 'ИС-23 Прикладная информатика'),
    ('IS-24', 'ИС-24 Веб-разработка'),
    ('IS-25', 'ИС-25 Аналитика данных'),
    ('IS-26', 'ИС-26 Робототехника'),
    ('NO-GROUP', 'Без группы')
ON CONFLICT (code) DO NOTHING;

INSERT INTO disciplines (code, title) VALUES
    ('WEB', 'Веб-разработка'),
    ('OOP', 'Объектно-ориентированное программирование'),
    ('DATA', 'Анализ данных')
ON CONFLICT (code) DO NOTHING;

INSERT INTO users (external_id, role, group_id, display_name) VALUES
    ('teacher2@parta.dev', 'teacher', NULL, 'Смирнова А.В.'),
    ('teacher3@parta.dev', 'teacher', NULL, 'Орлов Д.С.'),
    ('student4@parta.dev', 'student', (SELECT id FROM groups WHERE code = 'IS-21'), 'Морозов Д.А.'),
    ('student5@parta.dev', 'student', (SELECT id FROM groups WHERE code = 'IS-21'), 'Волкова Е.С.'),
    ('student6@parta.dev', 'student', (SELECT id FROM groups WHERE code = 'IS-21'), 'Лебедев Н.К.'),
    ('student7@parta.dev', 'student', (SELECT id FROM groups WHERE code = 'IS-22'), 'Соколова М.И.'),
    ('student8@parta.dev', 'student', (SELECT id FROM groups WHERE code = 'IS-22'), 'Павлов Р.О.'),
    ('student9@parta.dev', 'student', (SELECT id FROM groups WHERE code = 'IS-23'), 'Никитин А.В.'),
    ('student10@parta.dev', 'student', (SELECT id FROM groups WHERE code = 'IS-23'), 'Фёдорова К.Д.'),
    ('student11@parta.dev', 'student', (SELECT id FROM groups WHERE code = 'IS-23'), 'Егоров И.П.'),
    ('student12@parta.dev', 'student', (SELECT id FROM groups WHERE code = 'IS-24'), 'Белова О.С.'),
    ('student13@parta.dev', 'student', (SELECT id FROM groups WHERE code = 'IS-24'), 'Киселёв В.А.'),
    ('student14@parta.dev', 'student', (SELECT id FROM groups WHERE code = 'IS-25'), 'Громова Н.Е.'),
    ('student15@parta.dev', 'student', (SELECT id FROM groups WHERE code = 'IS-25'), 'Тарасов С.М.'),
    ('student16@parta.dev', 'student', (SELECT id FROM groups WHERE code = 'NO-GROUP'), 'Без группы П.П.')
ON CONFLICT (external_id) DO NOTHING;

INSERT INTO teacher_assignments (teacher_id, group_id, discipline_id) VALUES
    ((SELECT id FROM users WHERE external_id = 'teacher@parta.dev'),
     (SELECT id FROM groups WHERE code = 'IS-23'),
     (SELECT id FROM disciplines WHERE code = 'DB')),
    ((SELECT id FROM users WHERE external_id = 'teacher@parta.dev'),
     (SELECT id FROM groups WHERE code = 'IS-24'),
     (SELECT id FROM disciplines WHERE code = 'WEB')),
    ((SELECT id FROM users WHERE external_id = 'teacher@parta.dev'),
     (SELECT id FROM groups WHERE code = 'IS-25'),
     (SELECT id FROM disciplines WHERE code = 'DATA')),
    ((SELECT id FROM users WHERE external_id = 'teacher2@parta.dev'),
     (SELECT id FROM groups WHERE code = 'IS-25'),
     (SELECT id FROM disciplines WHERE code = 'DATA')),
    ((SELECT id FROM users WHERE external_id = 'teacher2@parta.dev'),
     (SELECT id FROM groups WHERE code = 'IS-26'),
     (SELECT id FROM disciplines WHERE code = 'OOP')),
    ((SELECT id FROM users WHERE external_id = 'teacher3@parta.dev'),
     (SELECT id FROM groups WHERE code = 'IS-24'),
     (SELECT id FROM disciplines WHERE code = 'OOP'))
ON CONFLICT (teacher_id, group_id, discipline_id) DO NOTHING;

INSERT INTO tasks (
    assignment_id, title, description_md, task_type, requirements_count,
    expected_hours, deadline_at, speedrun_window_hours, team_size,
    base_xp_computed, attachments, status
)
SELECT ta.id,
       'Практика: проектирование витрины данных',
       'Собрать витрину по продажам, описать модель и проверить запросы.',
       'LAB_CODE', 8, 4.0, '2030-12-31T18:00:00.000Z', 48, 1,
       600, '[]', 'PUBLISHED'
FROM teacher_assignments ta
JOIN groups g ON g.id = ta.group_id
WHERE g.code = 'IS-23'
  AND ta.discipline_id = (SELECT id FROM disciplines WHERE code = 'DB')
  AND NOT EXISTS (
      SELECT 1 FROM tasks t WHERE t.title = 'Практика: проектирование витрины данных'
  );

INSERT INTO tasks (
    assignment_id, title, description_md, task_type, requirements_count,
    expected_hours, deadline_at, speedrun_window_hours, team_size,
    base_xp_computed, attachments, status
)
SELECT ta.id,
       'Лендинг: адаптивная страница курса',
       'Свёрстать адаптивный лендинг, проверить мобильную версию.',
       'LAB_CODE', 6, 3.0, '2030-12-31T18:00:00.000Z', 48, 1,
       450, '[]', 'PUBLISHED'
FROM teacher_assignments ta
JOIN groups g ON g.id = ta.group_id
WHERE g.code = 'IS-24'
  AND ta.discipline_id = (SELECT id FROM disciplines WHERE code = 'WEB')
  AND NOT EXISTS (
      SELECT 1 FROM tasks t WHERE t.title = 'Лендинг: адаптивная страница курса'
  );

INSERT INTO submissions (task_id, student_id, status)
SELECT t.id, u.id, 'TODO'
FROM tasks t
JOIN teacher_assignments ta ON ta.id = t.assignment_id
JOIN users u ON u.group_id = ta.group_id AND u.role = 'student'
WHERE t.title IN (
    'Практика: проектирование витрины данных',
    'Лендинг: адаптивная страница курса'
)
AND NOT EXISTS (
    SELECT 1 FROM submissions s
    WHERE s.task_id = t.id AND s.student_id = u.id AND s.team_slot_id IS NULL
);

-- Демонстрационные карточки в разных статусах.
UPDATE submissions
SET status = 'IN_PROGRESS'
WHERE task_id = (SELECT id FROM tasks WHERE title = 'Практика: проектирование витрины данных')
  AND student_id = (SELECT id FROM users WHERE external_id = 'student9@parta.dev')
  AND status = 'TODO';

UPDATE submissions
SET status = 'IN_PROGRESS'
WHERE task_id = (SELECT id FROM tasks WHERE title = 'Практика: проектирование витрины данных')
  AND student_id = (SELECT id FROM users WHERE external_id = 'student10@parta.dev')
  AND status = 'TODO';

UPDATE submissions
SET status = 'REVIEW', submitted_at = '2030-12-20T12:00:00.000Z'
WHERE task_id = (SELECT id FROM tasks WHERE title = 'Практика: проектирование витрины данных')
  AND student_id = (SELECT id FROM users WHERE external_id = 'student10@parta.dev')
  AND status = 'IN_PROGRESS';

-- Витрина недельного рейтинга: значения привязаны к текущему понедельнику.
UPDATE users
SET weekly_xp = CASE external_id
        WHEN 'student1@parta.dev' THEN 420
        WHEN 'student2@parta.dev' THEN 300
        WHEN 'student4@parta.dev' THEN 250
        WHEN 'student5@parta.dev' THEN 180
        WHEN 'student9@parta.dev' THEN 500
        WHEN 'student10@parta.dev' THEN 220
        WHEN 'student12@parta.dev' THEN 160
        WHEN 'student14@parta.dev' THEN 90
        ELSE weekly_xp
    END,
    weekly_xp_week = date(
        'now',
        '-' || ((CAST(strftime('%w', 'now') AS INTEGER) + 6) % 7) || ' days'
    )
WHERE external_id IN (
    'student1@parta.dev',
    'student2@parta.dev',
    'student4@parta.dev',
    'student5@parta.dev',
    'student9@parta.dev',
    'student10@parta.dev',
    'student12@parta.dev',
    'student14@parta.dev'
);

-- Заготовка в базе заданий преподавателя.
INSERT INTO task_templates (
    teacher_id, discipline_id, title, description_md, task_type,
    requirements_count, expected_hours, speedrun_window_hours,
    attachments, team_size
)
SELECT
    (SELECT id FROM users WHERE external_id = 'teacher@parta.dev'),
    (SELECT id FROM disciplines WHERE code = 'DB'),
    'Шаблон: нормализация схемы',
    '',
    'LAB_CODE',
    8, 4.0, 48, '[]', 1
WHERE NOT EXISTS (
    SELECT 1 FROM task_templates
    WHERE teacher_id = (SELECT id FROM users WHERE external_id = 'teacher@parta.dev')
      AND title = 'Шаблон: нормализация схемы'
);
