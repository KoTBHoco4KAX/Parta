-- Чистый демо-сид: ровно три MAX-аккаунта для браузерного входа.
-- Команда seed-max очищает пользовательские таблицы и применяет этот файл.

INSERT INTO groups (code, title) VALUES ('MAX', 'MAX')
ON CONFLICT (code) DO NOTHING;

INSERT INTO disciplines (code, title) VALUES ('DB', 'Базы данных')
ON CONFLICT (code) DO NOTHING;

INSERT INTO users (external_id, role, group_id, display_name) VALUES
    ('max:000000001', 'student', (SELECT id FROM groups WHERE code = 'MAX'), 'Демо Студент'),
    ('max:000000002', 'teacher', NULL, 'Демо Преподаватель'),
    ('max:000000003', 'admin', NULL, 'Демо Администратор');

INSERT INTO teacher_assignments (teacher_id, group_id, discipline_id) VALUES
    ((SELECT id FROM users WHERE external_id = 'max:000000002'),
     (SELECT id FROM groups WHERE code = 'MAX'),
     (SELECT id FROM disciplines WHERE code = 'DB'));
