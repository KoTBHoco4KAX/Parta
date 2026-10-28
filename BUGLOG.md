# BUGLOG — ПАРТА

Журнал расхождений между UI и backend. Записи ведутся по веткам; исправление
backend-контрактов — отдельная задача, здесь фиксируются блокеры и текущее
поведение интерфейса.

Проверено по `backend/internal/http/router.go` на ветке `feat/teacher-ui`
(базовый коммит `32817e4`; актуализация — коммит с нормализацией award-контракта).

## Sprint 2 — Teacher/Admin UI

### [BUG-001] Отсутствует GET /api/attachments?submission_id={id}

- Ветка: feat/teacher-ui
- Компонент: `frontend/src/teacher/components/AttachmentList.tsx`
  (запрос — `fetchSubmissionAttachments` в `frontend/src/teacher/api.ts`)
- Симптом: 404, список вложений не загружается.
- Где ловится: `AttachmentList.tsx`, `useEffect` → `.catch`, ветка
  `cause instanceof ApiError && cause.status === 404` (только при включённом
  флаге).
- Что видит пользователь: при `ATTACHMENTS_ENABLED=false` запросов нет — виден
  только fallback-блок: ссылка `artifact_url`, хэш `artifact_hash` и бейдж
  «временно недоступно». После включения флага при 404 показывался бы
  inline-amber с «Повторить»; toast не показывается.
- Ожидаемый контракт: `200 { items: [{ id, filename, size, created_at }] }`.
  UI также принимает массив или `{ attachments | data | files }` и поля
  `file_name`, `size_bytes`, `uploaded_at` как синонимы.
- Авторизация: JWT (Bearer). Доступ — автор сдачи / teacher курса / admin.
- Приоритет: high (блокирует фичу вложений)
- Статус: open / blocked on spec / out of Sprint 2 scope
- Примечание: backend-контракта на вложения нет в PROJECT_MANIFEST.md §6.5 и
  `spec/`. Решение архитектора: не реализуем в Спринте 2, требуется спека
  (PROJECT_MANIFEST §6.5) и хранилище. UI gated через
  `ATTACHMENTS_ENABLED=false` в `AttachmentList.tsx`. Не блокирует мерж
  остальных фич спринта.

### [BUG-002] Отсутствует GET /api/attachments/{id}

- Ветка: feat/teacher-ui
- Компонент: `frontend/src/teacher/components/AttachmentList.tsx` (кнопка
  «Скачать»; загрузка — `downloadSubmissionAttachment` в
  `frontend/src/teacher/api.ts`)
- Симптом: 404 при скачивании файла вложения.
- Где ловится: `downloadSubmissionAttachment` бросает `ApiError` по
  `!response.ok`; `AttachmentList.tsx` → `handleDownload` → `catch` (только при
  включённом флаге).
- Что видит пользователь: при `ATTACHMENTS_ENABLED=false` кнопка «Скачать» не
  рендерится и запросов нет — остаётся fallback-ссылка на артефакт. После
  включения флага при 404 была бы inline-ошибка (rose) под списком файлов.
- Ожидаемый контракт: бинарный поток; `Content-Type` исходного файла;
  `Content-Disposition: attachment; filename="…"`; запрос с JWT в заголовке
  `Authorization: Bearer <jwt>` (не через `<a href>`, чтобы не терять токен).
- Авторизация: те же правила, что BUG-001.
- Приоритет: high
- Статус: open / blocked on spec / out of Sprint 2 scope
- Примечание: backend-контракта на вложения нет в PROJECT_MANIFEST.md §6.5 и
  `spec/`. Решение архитектора: не реализуем в Спринте 2, требуется спека
  (PROJECT_MANIFEST §6.5) и хранилище. UI gated через
  `ATTACHMENTS_ENABLED=false` в `AttachmentList.tsx`. Не блокирует мерж
  остальных фич спринта.

### [BUG-003] Отсутствует POST /api/peer-reviews/{id}/award

- Ветка: feat/teacher-ui
- Компоненты: `frontend/src/teacher/components/ReviewerAwardModal.tsx`,
  `frontend/src/teacher/components/PeerReviewScreen.tsx` (запрос —
  `awardPeerReview` в `frontend/src/teacher/api.ts`)
- Симптом: 404 при начислении XP рецензенту.
- Где ловится: `ReviewerAwardModal.tsx` → `handleSubmit` → `catch`;
  отдельная ветка `ApiError.status === 404`.
- Что видит пользователь: inline-ошибка (rose) в модалке «Сервер пока не
  поддерживает начисление XP за P2P-проверку
  (/api/peer-reviews/{id}/award).». Кнопка начисления показывается только для
  сессий `COMPLETED` в `PeerReviewDetails`; при успехе — toast и бейдж
  «бонус +N XP» на карточке, при ошибке toast не показывается.
- Ожидаемый контракт: body `{ reviewer_id, amount 1..1000, comment? }` →
  `200 { peer_review_id, reviewer_id, amount, total_xp, ledger_id }`.
- Контракт согласован, UI нормализует в `api.ts`: `amount ← amount | xp_awarded`,
  `totalXp ← total_xp | xp_balance | reward_xp`, `ledgerId ← ledger_id`.
  Компоненты читают только UI-поля `amount` / `totalXp` / `ledgerId` и не знают
  про snake_case (DESIGN_SPEC §4.2).
- Роли: teacher, admin. Предусловия: `peer_review.status = COMPLETED`,
  `reviewer_id` совпадает с рецензентом сессии.
- Приоритет: high
- Статус: open / waiting for backend
- Примечание: ждёт backend-агента, контракты согласованы, см. коммит `08ff4b0`.

### [BUG-004] PATCH /api/users/{id} не поддерживает group_id

- Ветка: feat/teacher-ui
- Компонент: `frontend/src/admin/components/GroupMembersModal.tsx`
  (запрос — `updateUserGroup` в `frontend/src/admin/api.ts`)
- Симптом: удаление/добавление студента в группу не сохраняется или 404.
- Где ловится: `GroupMembersModal.tsx` → `describeError`; ветка
  `ApiError.status === 404`.
- Что видит пользователь: inline-ошибка (rose) «Сервер пока не поддерживает
  изменение состава группы (PATCH /api/users/{id}).». При успехе — toast и
  перечитывание списка; при ошибке toast не показывается.
- Фактическое состояние роутера: `PATCH /api/users/{id}` не зарегистрирован
  (есть только `GET`, `POST`, `DELETE /api/users...`), запрос уходит в
  catch-all `protected.Handle("/")` и возвращает 404.
- Ожидаемый контракт: body `{ group_id: int64 | null }` →
  `200 <обновлённый пользователь>`; `null` убирает студента из группы.
- Авторизация: admin. Валидация: менять можно только `student`; группа должна
  существовать; `null` допустим.
- Приоритет: high
- Статус: open / waiting for backend
- Примечание: ждёт backend-агента, контракты согласованы, см. коммит `08ff4b0`.

### [BUG-005] Отсутствует GET /api/users?group_id=/unassigned=

- Ветка: feat/teacher-ui
- Компоненты: `frontend/src/admin/components/GroupMembersModal.tsx`
  (список кандидатов), `frontend/src/admin/components/GroupsPanel.tsx`
  (загрузка пользователей)
- Симптом: серверного фильтра пользователей по группе нет; UI получает полный
  список `GET /api/users` и фильтрует кандидатов на клиенте.
- Где ловится: ошибок нет — фильтрация в `GroupMembersModal.tsx` → `candidates`
  (`user.role === 'student' && user.group_id !== group.id`). `POST /api/users`
  существует (`backend/internal/http/admin.go:65`, `router.go:96`) и
  используется для создания студента сразу в группе.
- Что видит пользователь: при успешном создании — toast «Студент создан и сразу
  привязан к группе»; при ошибке — inline-ошибка (rose). Отсутствие серверного
  фильтра визуально не проявляется, но список тянется целиком.
- Ожидаемый контракт (если фильтр нужен): `GET /api/users?group_id={id}` и
  `GET /api/users?unassigned=true` для списка кандидатов; текущий
  `GET /api/users` без параметров оставить для админского списка.
- Приоритет: low
- Статус: open / low
- Примечание: не блокирует: фильтрация кандидатов сейчас на клиенте, но она
  неполная для больших групп.

### Сводка

| ID | Контракт | Приоритет | Статус | Блокер мержа? | Влияние на UI |
|---|---|---|---|---|---|
| BUG-001 | `GET /api/attachments?submission_id=` | high | open / blocked on spec / out of Sprint 2 scope | нет (gated) | gated: только fallback (`artifact_url` + hash) |
| BUG-002 | `GET /api/attachments/{id}` | high | open / blocked on spec / out of Sprint 2 scope | нет (gated) | gated: скачивание скрыто, fallback-ссылка |
| BUG-003 | `POST /api/peer-reviews/{id}/award` | high | open / waiting for backend | да | inline-error в модалке начисления |
| BUG-004 | `PATCH /api/users/{id}` | high | open / waiting for backend | да | inline-error, состав группы не меняется |
| BUG-005 | `GET /api/users?group_id=/unassigned=` | low | open / low | нет | не блокирует: фильтрация на клиенте, неполная для больших групп |
