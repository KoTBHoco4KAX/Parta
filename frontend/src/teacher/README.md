# Кабинет преподавателя — `frontend/src/teacher`

Модуль роли `teacher`: конвейер задач от пакетной выдачи до вердикта.
Данные — реальные REST-запросы через `apiFetch`, реалтайм — события
`teacher:{id}` из `core/auth` (WS). Контракты — `spec/04_API.md`,
`spec/02_FSM.md`, `spec/03_MATH.md`; визуальные правила — `DESIGN_SPEC.md`.

Тема: тёмная по умолчанию и светлая по переключателю в шапке. Цвета — семантические
токены в `tailwind.config.js` поверх CSS-переменных из `src/index.css`; прикладной код
не использует конкретные палитровые классы (`bg-slate-*`, hex), только токены
`page/card/muted/sunken`, `ink*`, `brand*`, `ok/warn/bad/team`.

## Экраны

| Раздел | Файл | Что делает |
|---|---|---|
| Обзор нагрузки | `components/OverviewScreen.tsx` | очередь проверки, просрочки, пик сдачи за 7 дней, ближайшие дедлайны, открытые бонусные окна, прогресс потоков |
| Единый инбокс | `components/InboxScreen.tsx` | все сдачи `REVIEW` по потокам, фильтры (после срока, бонус ×1.5, ждут > 24 ч), сортировка, вердикт в один клик в шторке |
| Проверка работы | `components/AttachmentsPanel.tsx` | файлы сдачи: открыть/скачать, fallback на `artifact_url`, хэш |
| Выдача заданий | `components/TasksScreen.tsx` | конструктор задания сразу на несколько потоков (пакетная выдача), предпросмотр Base XP и бонусного окна, список выданных заданий с прогрессом колонок |
| Аудит команд | `components/TeamsScreen.tsx` | слоты ответственности, кто занял и когда сдал, просрочки, участники «за двоих», вердикт по слоту |
| Взаимопроверка | `components/PeerReviewScreen.tsx` | P2P-сессии по чек-листу и бонус рецензенту (`ReviewerAwardModal.tsx`) |

Корень — `TeacherApp.tsx`: hash-роутинг (`#/overview`, `#/review`, `#/tasks`,
`#/teams`, `#/peer`), нижняя навигация со счётчиком инбокса, тосты.

## Данные и формулы

- `api.ts`: `fetchTeacherTasks`, `fetchAllSubmissions` (источник инбокса и аудита),
  `fetchTeacherAssignments`, `createTeacherTask`, `issueVerdict`,
  `fetchSubmissionAttachments`, `downloadSubmissionAttachment`,
  `fetchPeerReviewSessions`, `awardPeerReview`, `fetchGroupMembers`.
- `createTeacherTask` → `POST /api/tasks`: backend сам создаёт карточку `TODO`
  каждому ученику потока и, для `TEAM_PROJECT`, слоты ответственности. Выдача на
  несколько потоков — последовательность запросов по выбранным назначениям.
- `lib/economy.ts` повторяет `internal/domain/xp`: Base XP, множители ×1.5 / ×1.0 /
  ×0.5 и граница бонусного окна. Это предпросмотр; истина — ответ backend при
  выдаче и приёмке.
- On-time и ожидание считаются по `submitted_at`; вердикт по слоту — тот же
  `POST /api/submissions/{id}/verdict`, что и в инбоксе.

## Ограничения, заложенные в интерфейс

- Вложения — MVP: `GET /api/attachments` отдаёт ссылку, download — 302 на внешний
  `artifact_url`, поэтому файл открывается в новой вкладке (backend не проксирует
  файлы, это осознанная защита от SSRF).
- API не отдаёт список слотов и историю перехватов: аудит сопоставляет слоты по
  `team_slot_role` из сдач, а «за двоих» выводит из числа закрытых слотов. Интерфейс
  прямо об этом предупреждает.
- Смена роли и создание назначений — вне API: в кабинете только выдача заданий.

## Проверка

```bash
cd frontend
npx tsc --noEmit
npm run build
```

В браузере: http://localhost:5173, вход `teacher@parta.dev`, роль «Преподаватель».
