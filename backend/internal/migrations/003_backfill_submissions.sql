-- ПАРТА: бэкфилл карточек канбана для уже опубликованных заданий.
-- Новые задания создают submissions в POST /api/tasks, но задания из сида
-- 002_seed_dev.sql появились раньше этого правила. Студент не должен создавать
-- карточки вручную — он сразу видит задание в TODO.

INSERT INTO submissions (task_id, student_id, status)
SELECT t.id, u.id, 'TODO'
FROM tasks t
JOIN teacher_assignments ta ON ta.id = t.assignment_id
JOIN users u ON u.group_id = ta.group_id AND u.role = 'student'
WHERE t.status = 'PUBLISHED'
ON CONFLICT DO NOTHING;
