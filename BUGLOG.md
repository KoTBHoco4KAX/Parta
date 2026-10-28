# BUGLOG — ПАРТА

Журнал расхождений между UI и backend. Записи ведутся по веткам; исправление
backend-контрактов — отдельная задача, здесь фиксируются блокеры и текущее
поведение интерфейса.

Проверено по `backend/internal/http/router.go` на коммите `32817e4`
(`feat/teacher-ui`). Код компонентов в этом коммите не менялся.

## Sprint 2 — Teacher/Admin UI

### [BUG-001] Отсутствует GET /api/attachments?submission_id={id}

- Ветка: feat/teacher-ui
- Компонент: `frontend/src/teacher/components/AttachmentList.tsx`
  (запрос — `fetchSubmissionAttachments` в `frontend/src/teacher/api.ts`)
- Симптом: 404, список вложений не загружается.
- Где ловится: `AttachmentList.tsx`, `useEffect` → `.catch`, ветка
  `cause instanceof ApiError && cause.status === 404`.
- Что видит пользователь: inline-предупреждение (amber) «Сервер пока не отдаёт
  список файлов через /api/attachments.» с кнопкой «Повторить». Ниже всегда
  остаётся fallback-ссылка на `artifact_url` и хэш артефакта; toast не показывается.
- Ожидаемый контракт: `200 { items: [{ id, filename, size, created_at }] }`.
  UI также принимает массив или `{ attachments | data | files }` и поля
  `file_name`, `size_bytes`, `uploaded_at` как синонимы.
- Авторизация: JWT (Bearer). Доступ — автор сдачи / teacher курса / admin.
- Приоритет: high (блокирует фичу вложений)
- Статус: open

### [BUG-002] Отсутствует GET /api/attachments/{id}

- Ветка: feat/teacher-ui
- Компонент: `frontend/src/teacher/components/AttachmentList.tsx` (кнопка
  «Скачать»; загрузка — `downloadSubmissionAttachment` в
  `frontend/src/teacher/api.ts`)
- Симптом: 404 при скачивании файла вложения.
- Где ловится: `downloadSubmissionAttachment` бросает `ApiError` по
  `!response.ok`; `AttachmentList.tsx` → `handleDownload` → `catch`.
- Что видит пользователь: inline-ошибка (rose) под списком файлов с текстом
  сервера или «Не удалось скачать файл. Проверьте соединение.»; toast не
  показывается, список остаётся на экране.
- Ожидаемый контракт: бинарный поток; `Content-Type` исходного файла;
  `Content-Disposition: attachment; filename="…"`; запрос с JWT в заголовке
  `Authorization: Bearer <jwt>` (не через `<a href>`, чтобы не терять токен).
- Авторизация: те же правила, что BUG-001.
- Приоритет: high
- Статус: open

### [BUG-003] Отсутствует POST /api/peer-reviews/{id}/award

- Ветка: feat/teacher-ui
- Компоненты: `frontend/src/teacher/components/ReviewerAwardModal.tsx`,
  `frontend/src/teacher/components/PeerReviewScreen.tsx` (запрос —
  `awardReviewerXP` в `frontend/src/teacher/api.ts`)
- Симптом: 404 при начислении XP рецензенту.
- Где ловится: `ReviewerAwardModal.tsx` → `handleSubmit` → `catch`;
  отдельная ветка `ApiError.status === 404`.
- Что видит пользователь: inline-ошибка (rose) в модалке «Сервер пока не
  поддерживает начисление XP за P2P-проверку
  (/api/peer-reviews/{id}/award).». Кнопка начисления показывается только для
  сессий `COMPLETED` в `PeerReviewDetails`; при успехе — toast и бейдж
  «бонус +N XP» на карточке, при ошибке toast не показывается.
- Ожидаемый контракт: body `{ reviewer_id, amount 1..1000, comment? }` →
  `200 { reviewer_id, amount, total_xp }`.
- Совместимость UI: сейчас результат читается из `xp_awarded` (или `reward_xp`),
  `ledger_id`, `xp_balance`; при ответе строго по контракту выше UI покажет
  `amount` как начисленную сумму, но `total_xp` проигнорирует. Нужно либо
  добавить эти поля в ответ, либо синхронизировать маппинг в `api.ts` перед
  релизом.
- Роли: teacher, admin. Предусловия: `peer_review.status = COMPLETED`,
  `reviewer_id` совпадает с рецензентом сессии.
- Приоритет: high
- Статус: open

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
- Статус: open

### [BUG-005] Отсутствует POST /api/users и GET /api/users?group_id=/unassigned=

- Ветка: feat/teacher-ui
- Компоненты: `frontend/src/admin/components/GroupMembersModal.tsx`
  (создание студента и список кандидатов), `frontend/src/admin/components/GroupsPanel.tsx`
  (загрузка пользователей)
- Симптом из отчёта: создание студента в группе и список кандидатов не
  обеспечены контрактом.
- Уточнение по факту проверки: `POST /api/users` **уже реализован**
  (`backend/internal/http/admin.go:65`, маршрут
  `backend/internal/http/router.go:96`) и используется UI — создание студента
  в группе работает. `GET /api/users` тоже существует, но игнорирует
  `group_id`/`unassigned`; UI сейчас получает полный список и фильтрует
  кандидатов на клиенте (`GroupMembersModal.tsx` → `candidates`).
- Где ловится: ошибки создания — `GroupMembersModal.tsx` → `handleCreate` →
  `catch`; фильтрация кандидатов ошибок не даёт.
- Что видит пользователь: при успешном создании — toast «Студент создан и сразу
  привязан к группе»; при ошибке — inline-ошибка (rose) в модалке. Отсутствие
  серверного фильтра пользователю сейчас не видно, но список тянется целиком.
- Ожидаемый контракт (если фильтр нужен): `GET /api/users?group_id={id}` и
  `GET /api/users?unassigned=true` для списка кандидатов; `POST /api/users`
  оставить с телом `{ external_id, display_name, role, group_id }`.
- Приоритет: medium (не блокирует UI; оптимизация и явный контракт)
- Статус: open

### Сводка

| ID | Контракт | Приоритет | Влияние на UI |
|---|---|---|---|
| BUG-001 | `GET /api/attachments?submission_id=` | high | inline-error + fallback на `artifact_url` |
| BUG-002 | `GET /api/attachments/{id}` | high | inline-error, скачивание недоступно |
| BUG-003 | `POST /api/peer-reviews/{id}/award` | high | inline-error в модалке начисления |
| BUG-004 | `PATCH /api/users/{id}` | high | inline-error, состав группы не меняется |
| BUG-005 | `GET /api/users?group_id=/unassigned=` | medium | не блокирует: фильтрация на клиенте |
