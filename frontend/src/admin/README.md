# Админка — `frontend/src/admin`

Самодостаточный модуль роли `admin`. Данные — реальные REST-запросы (`GET /api/assignments`,
`GET/POST /api/tasks`) через `apiFetch`. Визуальные правила — в `DESIGN_SPEC.md`.

## Экран

| Блок | Файл | Что делает |
|---|---|---|
| Форма задачи | `components/TaskForm.tsx` | назначение (группа + дисциплина), тип, название/описание, R, H, дедлайн, speedrun-окно, team_size |
| Предпросмотр XP | `components/XpPreview.tsx` | живой `Base XP` / `Slot Base XP`, `C`, `F_d`, итог по speedrun/в срок/поздно, список слотов |
| Созданные задачи | `components/CreatedTasks.tsx` | read-модель: тип, группа, XP, слоты, дедлайн, статус |

Корень — `AdminApp.tsx` (загрузка назначений и задач, тосты, ошибки, `reloadTasks`).

## Как подключить

```tsx
import AdminApp from './admin';

// внутри свитчера ролей
{role === 'admin' ? <AdminApp /> : null}
```

## Расчёт XP

`lib/xp.ts` — зеркало `backend/internal/domain/xp/calculator.go` и `spec/03_MATH.md` §1:

```
D = max(0.5, (deadline_at - created_at) / 86400)
C = w * (0.4*R + 0.6*H)
F_d = clamp(1 + ln(1 + 7/D), 1.0, 2.5)
BaseXP = max(10, round(50 * C * F_d))
SlotBaseXP = max(10, round(BaseXP / team_size * 1.15))   // TEAM_PROJECT
```

Веса: TEST 1.0, ESSAY 1.5, LAB_CODE 2.0, TEAM_PROJECT 2.5.
Для `TEAM_PROJECT` сервер возвращает уже `Slot Base XP` в `base_xp_computed` — форма
показывает оба значения, чтобы не было сюрпризов.

**Ручной ввод XP отсутствует намеренно.** Администратор меняет только
`R`, `H`, `task_type`, `deadline_at`, `speedrun_window_hours`, `team_size`.

## Валидация формы

Повторяет backend (`tasks.go`):

- название не пустое, `R > 0`, `H > 0`, `speedrun_window_hours > 0`, дедлайн в будущем;
- `TEAM_PROJECT` требует `team_size >= 2` (в UI 2–8), остальные типы — ровно 1;
- слоты строятся как `DB, BIZ, QA_DOC, DEVOPS`, далее с суффиксами `_2`, `_3`, как в
  `teamSlotSeeds` бэкенда.

## Данные и интеграция

- `api.ts` — `fetchAssignments` (`GET /api/assignments`),
  `fetchCreatedTasks` (`GET /api/tasks`), `createTask` (`POST /api/tasks`).
  Ошибки — общий `ApiError` (`code`, `status`).
- Группа и дисциплина подставляются в список задач из назначений по `assignment_id`.
- `slots_count` приходит из ответа `POST /api/tasks`; для списка он вычисляется как
  `team_size` у `TEAM_PROJECT`.

## Проверка

```bash
cd frontend
npx tsc --noEmit
npm run build
```
