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
  `cause instanceof ApiError && cause.status === 404`.
- Что видит пользователь: при ошибке — inline-amber с «Повторить» и fallback
  на `artifact_url` + `artifact_hash`; toast не показывается. При успехе —
  одна запись «artifact» с внешней ссылкой.
- Ожидаемый контракт: `200 { items: [{ id, filename, size, created_at, url }] }`.
  UI также принимает массив или `{ attachments | data | files }` и поля
  `file_name`, `size_bytes`, `uploaded_at` как синонимы.
- Авторизация: JWT (Bearer). Доступ — автор сдачи / teacher курса / admin.
- Приоритет: high
- Статус: mvp / blocked on full spec
- Примечание: MVP реализован в `backend/internal/http/teacher_api.go` —
  `GET /api/attachments?submission_id=` отдаёт синтетический
  `artifact-{submission_id}` со ссылкой `artifact_url`. Полноценное хранилище
  файлов (таблица вложений + storage) ждёт отдельной спеки и решения
  архитектора. UI включён через `ATTACHMENTS_ENABLED=true`.

### [BUG-002] Отсутствует GET /api/attachments/{id}

- Ветка: feat/teacher-ui
- Компонент: `frontend/src/teacher/components/AttachmentList.tsx` (кнопка
  «Скачать»; загрузка — `downloadSubmissionAttachment` в
  `frontend/src/teacher/api.ts`)
- Симптом: 404 при скачивании файла вложения.
- Где ловится: `downloadSubmissionAttachment` бросает `ApiError` по
  `!response.ok`; `AttachmentList.tsx` → `handleDownload` → `catch`.
- Что видит пользователь: при 404 — inline-ошибка (rose) под списком файлов;
  при CORS-барьере внешнего `artifact_url` файл открывается в новой вкладке.
  При успехе — toast «Файл скачан».
- Ожидаемый контракт: `302 Location: artifact_url` (без `Content-Disposition`,
  сервер не проксирует файл — SSRF-безопасно); JWT на первом запросе.
- Авторизация: те же правила, что BUG-001.
- Приоритет: high
- Статус: mvp / blocked on full spec
- Примечание: redirect-MVP реализован в `teacher_api.go`; полноценная отдача
  файлов из хранилища ждёт спеки. UI включён через `ATTACHMENTS_ENABLED=true`.

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
- Статус: closed
- Закрыто: коммит `feat: backend MVP, migrations, frontend types` (ветка
  `feat/teacher-ui`). Обработчик — `backend/internal/http/teacher_api.go`,
  идемпотентность через `peer_review:{id}:award`; тесты — `teacher_api_test.go`.

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
- Фактическое состояние роутера: `PATCH /api/users/{id}` зарегистрирован в
  `router.go` и реализован в `teacher_api.go`; запрос обновляет `users.group_id`
  в транзакции.
- Ожидаемый контракт: body `{ group_id: int64 | null }` →
  `200 <обновлённый пользователь>`; `null` убирает студента из группы.
- Авторизация: admin — любая группа; teacher — только свои
  `teacher_assignments.group_id`. Валидация: менять можно только `student`;
  группа должна существовать; `null` допустим.
- Приоритет: high
- Статус: closed
- Закрыто: коммит `feat: backend MVP, migrations, frontend types`
  (ветка `feat/teacher-ui`). Для `group_id=null` миграция
  `004_users_group_optional.sql` ослабляет CHECK у `users`; тесты —
  `teacher_api_test.go`.

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
- Ожидаемый контракт: `GET /api/users?group_id={id}` и
  `GET /api/users?unassigned=true` для списка кандидатов; текущий
  `GET /api/users` без параметров оставить для админского списка.
- Приоритет: low
- Статус: closed
- Закрыто: коммит `feat: backend MVP, migrations, frontend types`
  (ветка `feat/teacher-ui`). `handleUsersListFiltered` в `teacher_api.go`
  поддерживает оба фильтра; UI пока продолжает фильтровать кандидатов на
  клиенте (не блокирует, см. примечание).

### Сводка

| ID | Контракт | Приоритет | Статус | Блокер мержа? | Влияние на UI |
|---|---|---|---|---|---|
| BUG-001 | `GET /api/attachments?submission_id=` | high | mvp / blocked on full spec | нет | MVP: одна ссылка `artifact-{id}`, fallback на `artifact_url` |
| BUG-002 | `GET /api/attachments/{id}` | high | mvp / blocked on full spec | нет | MVP: 302 redirect, CORS-fallback в новую вкладку |
| BUG-003 | `POST /api/peer-reviews/{id}/award` | high | closed | нет | работает: toast + бейдж «бонус +N XP» |
| BUG-004 | `PATCH /api/users/{id}` | high | closed | нет | работает: перенос/снятие группы, inline-error при 403/422 |
| BUG-005 | `GET /api/users?group_id=/unassigned=` | low | closed | нет | серверный фильтр готов; UI пока фильтрует кандидатов на клиенте |
