# ПАРТА — архитектура базы данных

Документ описывает актуальную схему SQLite (STRICT), инварианты и точки входа
для MAX. Все миграции лежат в `backend/internal/migrations` и применяются
последовательно один раз.

## 1. Слои

```
MAX (мессенджер)
   │  max_user_id / max_chat_id
   ▼
max_accounts ── users ── group_memberships ── groups
                  │
                  ├── teacher_assignments ── disciplines
                  │        │
                  │        ▼
                  │      tasks ── task_attachments
                  │        │
                  │        └── team_slots
                  │
                  └── submissions ── submission_attachments
                           │        └── submission_revisions
                           │        └── submission_events
                           │
                           └── answer_drafts ── answer_comments
```

`users` — единая identity. Роль хранится в `users.role`:
`admin`, `teacher`, `student`. Не дублируем людей в отдельных таблицах
«ученики» и «преподаватели»: это ломает внешние ключи и авторизацию. Различие
ролей задаётся CHECK-констрейнтом и триггерами.

## 2. Кто где состоит

### groups
Учебная группа: `code` (IS-21), `title`.

### users
Пользователь: `external_id` (email/логин), `role`, `display_name`, XP,
стрик, заморозки.

- `student` обязан иметь `group_id`;
- `teacher` и `admin` не имеют `group_id`;
- `weekly_xp` и `weekly_xp_week` — недельный лидерборд.

### group_memberships
История членства. Ученик может быть в нескольких группах, при переводе старая
запись получает `left_at`, новая становится `is_primary = 1`.

Триггеры `trg_users_membership_*` синхронизируют `users.group_id` с
`group_memberships`, чтобы старый код продолжал работать.

### disciplines
Справочник дисциплин.

### teacher_assignments
Связь «преподаватель + группа + дисциплина». Одна запись = один поток
преподавателя. Триггеры `trg_teacher_assignments_role_*` не дают назначить
админа или ученика преподавателем.

## 3. Задания

### tasks
Задание привязано к `teacher_assignments`, поэтому у него всегда есть
преподаватель, группа и дисциплина. Типы: `TEST`, `NOTES`, `ESSAY`,
`LAB_CODE`, `TEAM_PROJECT`.

`tasks.attachments` — JSON для совместимости. Нормализованная копия:
`task_attachments` (`filename`, `url`, `size_bytes`). Триггеры
`trg_tasks_attachments_*` пересобирают её при каждом изменении JSON.

### team_slots
Слоты командного проекта: роль, исполнитель, статус, артефакт.

## 4. Работа ученика

### submissions
Карточка канбана: `TODO → IN_PROGRESS → REVIEW → DONE/REJECTED`.
`REJECTED → IN_PROGRESS` — повторная попытка. FSM защищён триггером
`trg_submissions_status_transition`.

`artifact_url`/`artifact_hash` — совместимость. Нормализованный файл:
`submission_attachments`.

### submission_attachments
Файлы сдачи: имя, URL, sha256, размер, content-type. Заполняется триггерами
из `artifact_url`/`artifact_hash`.

### submission_revisions
История возвратов на доработку. Заполняется из `revision_log` триггерами.

### submission_events
Аудит переходов статуса. Пишется триггером `trg_submissions_events` при любом
изменении `submissions.status` — даже если код забыл записать событие.

## 5. Взаимопроверка «Ответы»

### answer_drafts
Черновик ученика: `submission_id`, `task_id`, `author_id`, текст/файл,
`escrow_percent`, `escrow_pool_xp`, статус
`OPEN → COLLECTED → SETTLED/CLOSED`.

Один активный черновик на карточку — partial unique index.

### answer_comments
Ровно два комментария на черновик. Проверяющий не ставит баллов, только текст.
`reaction` (`NONE/LIKE/REPORT`) ставит автор, `payout_percent` и
`reward_ledger_id` появляются при вердикте учителя.

## 6. XP и деньги

### xp_ledger
Единственный источник правды по XP. `amount != 0`, `idempotency_key` уникален.
Баланс `users.xp_balance` обновляется в той же транзакции.

Причины: `TASK_BASE`, `SPEEDRUN_BONUS`, `PEER_REVIEW_REWARD`,
`FREEZE_PURCHASE`, `CARRY_OVER_BONUS`, `PENALTY`, `ADMIN_ADJUSTMENT`.

### weekly_xp
Награды проверяющим увеличивают `users.weekly_xp`; при смене недели счётчик
сбрасывается. Ключ недели — понедельник 00:00 в часовом поясе сервера.

## 7. MAX

`max_accounts` связывает пользователя ПАРТЫ с MAX:

- `max_user_id` — уникальный id пользователя MAX;
- `max_chat_id` — чат/беседа, куда отправлять уведомления;
- `display_name`, `linked_at`, `last_seen_at`.

Для MAX не нужно знать внутренние таблицы. Read-модели:

### v_student_kanban
Плоская строка канбана: ученик, задание, группа, преподаватель, дисциплина,
статус, дедлайн, XP.

### v_max_student_kanban
То же плюс `max_user_id` и `max_chat_id`.

### v_teacher_review_inbox
Очередь проверки преподавателя.

### v_group_roster
Состав групп и количество учеников.

## 8. Инварианты

1. У задания всегда есть преподаватель, группа и дисциплина через
   `teacher_assignments`.
2. Ученик не может быть назначен преподавателем.
3. Один активный черновик на карточку.
4. Два комментария на черновик.
5. Проверяющий не может комментировать свою работу.
6. XP не начисляется без проводки в `xp_ledger`.
7. Payout проверяющим — только при `ACCEPT` учителя.
8. При `REJECT` проверяющие получают 0, автор не теряет XP.

## 9. Правила миграций

- Новые изменения — только новой миграцией `NNN_*.sql`.
- Уже применённые миграции не редактируются.
- Миграция должна быть идемпотентной по смыслу: backfill + `INSERT OR IGNORE`.
- Для совместимости сначала добавляем таблицу/колонку, заполняем, затем
  включаем триггеры.
- `storage/migrate.go` отключает FK на время миграции и пишет
  `schema_migrations`.

## 10. Демо-данные

Фиксированные демо-данные не входят в миграции, чтобы не ломать ожидания
тестов. Для локальной базы есть отдельная команда:

```bash
cd backend
go run ./cmd/seed-demo -db ./parta.db -file ./demo/seed.sql
```

Она идемпотентна: добавляет группы IS-23…IS-26, преподавателей, учеников,
задания, карточки, шаблон и обновляет `weekly_xp` на текущую неделю. Повторный
запуск не создаёт дублей.

## 11. Что дальше

- API MAX: `GET /api/max/kanban?max_user_id=...` поверх
  `v_max_student_kanban`.
- Уведомления MAX через `max_chat_id` на события `task.created`,
  `review.inbox.created`, `submission.verdict.issued`.
- Полный переход кода с JSON-полей на `task_attachments` и
  `submission_attachments` (таблицы уже заполняются триггерами).
