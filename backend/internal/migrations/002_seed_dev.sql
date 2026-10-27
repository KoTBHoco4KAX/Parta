-- ПАРТА: dev-сид для локального запуска и интеграционных тестов.
-- Идемпотентен: повторное применение не меняет данные.

INSERT INTO groups (code, title) VALUES
    ('IS-21', 'ИС-21 Информационные системы'),
    ('IS-22', 'ИС-22 Информационные системы')
ON CONFLICT (code) DO NOTHING;

INSERT INTO disciplines (code, title) VALUES
    ('DB', 'Базы данных'),
    ('BIZ', 'Бизнес-логика и API')
ON CONFLICT (code) DO NOTHING;

INSERT INTO users (external_id, role, group_id, display_name) VALUES
    ('admin@parta.dev',   'admin',   NULL,  'Администратор ПАРТА'),
    ('teacher@parta.dev', 'teacher', NULL,  'Иванов И.И.'),
    ('student1@parta.dev','student', (SELECT id FROM groups WHERE code = 'IS-21'), 'Петров П.П.'),
    ('student2@parta.dev','student', (SELECT id FROM groups WHERE code = 'IS-21'), 'Сидоров С.С.'),
    ('student3@parta.dev','student', (SELECT id FROM groups WHERE code = 'IS-22'), 'Кузнецова А.А.')
ON CONFLICT (external_id) DO NOTHING;

INSERT INTO teacher_assignments (teacher_id, group_id, discipline_id) VALUES
    ((SELECT id FROM users WHERE external_id = 'teacher@parta.dev'),
     (SELECT id FROM groups WHERE code = 'IS-21'),
     (SELECT id FROM disciplines WHERE code = 'DB')),
    ((SELECT id FROM users WHERE external_id = 'teacher@parta.dev'),
     (SELECT id FROM groups WHERE code = 'IS-22'),
     (SELECT id FROM disciplines WHERE code = 'DB'))
ON CONFLICT (teacher_id, group_id, discipline_id) DO NOTHING;

INSERT INTO tasks (
    assignment_id, title, description_md, task_type, requirements_count,
    expected_hours, deadline_at, speedrun_window_hours, team_size,
    base_xp_computed, status
) VALUES (
    (SELECT ta.id FROM teacher_assignments ta
     JOIN users u ON u.id = ta.teacher_id
     JOIN groups g ON g.id = ta.group_id
     JOIN disciplines d ON d.id = ta.discipline_id
     WHERE u.external_id = 'teacher@parta.dev' AND g.code = 'IS-21' AND d.code = 'DB'),
    'Лабораторная №1: нормализация схемы',
    'Привести схему БД к третьей нормальной форме и описать миграции.',
    'LAB_CODE', 8, 4.0, '2027-12-31T18:00:00.000Z', 48, 1, 400, 'PUBLISHED'
) ON CONFLICT DO NOTHING;

INSERT INTO tasks (
    assignment_id, title, description_md, task_type, requirements_count,
    expected_hours, deadline_at, speedrun_window_hours, team_size,
    base_xp_computed, status
) VALUES (
    (SELECT ta.id FROM teacher_assignments ta
     JOIN users u ON u.id = ta.teacher_id
     JOIN groups g ON g.id = ta.group_id
     JOIN disciplines d ON d.id = ta.discipline_id
     WHERE u.external_id = 'teacher@parta.dev' AND g.code = 'IS-21' AND d.code = 'DB'),
    'Командный проект: сервис учёта заявок',
    'Каждый слот — независимый вектор ответственности, приёмка независимая.',
    'TEAM_PROJECT', 12, 10.0, '2027-12-31T18:00:00.000Z', 72, 2, 800, 'PUBLISHED'
) ON CONFLICT DO NOTHING;

INSERT INTO team_slots (task_id, role_code, role_title, status) VALUES
    ((SELECT id FROM tasks WHERE title = 'Командный проект: сервис учёта заявок'), 'DB', 'Схема и миграции', 'OPEN'),
    ((SELECT id FROM tasks WHERE title = 'Командный проект: сервис учёта заявок'), 'BIZ', 'Бизнес-логика и API', 'OPEN')
ON CONFLICT (task_id, role_code) DO NOTHING;
