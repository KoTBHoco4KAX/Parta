# Кабинет преподавателя — `frontend/src/teacher`

Самодостаточный модуль роли `teacher`. Данные — реальные REST-запросы через
`apiFetch`; контракты повторяют `spec/04_API.md`, `spec/02_FSM.md` и события WS из
`spec/00_ARCHITECTURE.md` §V. Визуальные правила — в `DESIGN_SPEC.md`.

## Экраны

| Экран | Файл | Что делает |
|---|---|---|
| Review Inbox | `components/ReviewInbox.tsx` | работы в `REVIEW`, `waiting_seconds`, фильтр по группам, сортировка «дольше ждут / ближе дедлайн», сессионный журнал вердиктов |
| Карточка работы | `components/SubmissionCard.tsx` | студент, группа, тип, слот, попытка, прошлое отклонение, дедлайн и on-time |
| Модалка вердикта | `components/VerdictModal.tsx` | `ACCEPT`/`REJECT`, обязательный комментарий при отказе, предпросмотр `FinalXP` и стрика |
| Вложения сдачи | `components/AttachmentList.tsx` | список файлов через `GET /api/attachments`, скачивание с JWT, fallback на `artifact_url` |
| P2P-ревью | `components/PeerReviewScreen.tsx` | список sandbox-сессий, таймеры, анонимизация, детали чек-листа и read-only поток артефакта |
| Бонус рецензенту | `components/ReviewerAwardModal.tsx` | начисление XP рецензенту за качественную проверку после `COMPLETED` |

Корень — `TeacherApp.tsx` (табы «Инбокс ревью» / «P2P-ревью», тосты, мобильный layout).

## Как подключить

Интеграция делается в общем свитчере ролей (её меняет владелец `src/App.tsx`):

```tsx
import TeacherApp from './teacher';

// внутри свитчера ролей
{role === 'teacher' ? <TeacherApp /> : null}
```

Модуль не импортирует ничего из `src/` вне `src/teacher/`, поэтому не конфликтует с
ветками `feat/student-ui` и `feat/core-ws`.

## Данные и контракты

- `api.ts` — `fetchReviewInbox` (`GET /api/submissions?status=REVIEW`),
  `issueVerdict` (`POST /api/submissions/{id}/verdict`),
  `fetchPeerReviewSessions` (`GET /api/peer-reviews`). Ошибки — общий `ApiError`.
- Вложения: `fetchSubmissionAttachments` (`GET /api/attachments?submission_id={id}`)
  и `downloadSubmissionAttachment` (`GET /api/attachments/{id}`). Ответ списка
  принимается как массив или `{attachments|items|data}`; файл скачивается fetch-ом
  с `Authorization`, поэтому имя сохраняется через object URL.
- Attachments gated behind `ATTACHMENTS_ENABLED=false` до появления
  backend-спеки. Включить после мержа backend-контракта из BUGLOG BUG-001/002.
  При выключенном флаге `AttachmentList.tsx` не делает запросов и показывает
  только fallback: `artifact_url` + `artifact_hash`.
- P2P-бонус: `awardReviewerXP` (`POST /api/peer-reviews/{id}/award`,
  body `{reviewer_id, amount, comment}`) — только для `COMPLETED`-сессии.
  Ответ: `{peer_review_id, reviewer_id, xp_awarded, ledger_id, xp_balance?}`.
- `verdict` повторяет `POST /api/submissions/{id}/verdict`: `ACCEPT` → `DONE` + XP,
  `REJECT` → `REJECTED` + обязательный комментарий.
- `FinalXP` в предпросмотре считается по `spec/03_MATH.md` §2: `submitted_at` против
  `deadline_at - speedrun_window` → ×1.5 / ×1.0 / ×0.5. Ручного ввода XP нет.
- On-time везде считается по `submitted_at`, сервер присылает его в DTO.

## Соответствие регуляторике

- Оценок 2/3/4/5 нет — только вердикты `ACCEPT`/`REJECT`.
- Нет глобального лидерборда и календарных стриков; показан только on-time стрик.
- P2P-экран остаётся read-only в части завершения ревью: преподаватель не может
  завершить ревью за рецензента, экспорт артефакта автора отключён, в деталях виден
  watermark и TTL токена (15 мин). Бонус XP начисляется только после `COMPLETED`
  и не раскрывает личность рецензента.
- Скачивание вложений доступно только преподавателю в инбоксе: это файлы сдачи, а
  не sandbox-поток P2P.

## Что дальше

1. Для реалтайма подписаться на `teacher:{id}` и обрабатывать `review.inbox.created`,
   `submission.verdict.issued`, `peer_review.state_changed`; дедупликация по `event_id`.
2. При появлении `GET /api/reviews/inbox` заменить текущую выборку в `api.ts`.
3. Эндпоинты `/api/attachments` и `POST /api/peer-reviews/{id}/award` описаны в
   `api.ts`; пока backend их не отдаёт, UI показывает inline-ошибку и fallback-ссылку
   на `artifact_url`.

## Проверка

```bash
cd frontend
npx tsc --noEmit
npm run build
```

В браузере: `import TeacherApp from './teacher'` и смонтировать в свитчере ролей.
