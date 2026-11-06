-- ПАРТА: вложения в базе заданий.
--
-- Файлы хранятся в том же JSON-формате, что и tasks.attachments:
-- [{"name": "...", "url": "/uploads/...", "size": 123}].
-- При выдаче шаблона они копируются в задание.

ALTER TABLE task_templates ADD COLUMN attachments TEXT NOT NULL DEFAULT '[]';
