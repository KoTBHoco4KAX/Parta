# Student UI (ветка feat/student-ui)

Экраны ученика ПАРТА: канбан-доска, сдача работы и магазин XP.
Работают на **моках** — см. `AI_TASK.md` этой ветки (read-эндпоинты backend
Фазы 7 ещё не готовы).

## Структура

```
student/
├── api.ts                    ← ЕДИНСТВЕННАЯ точка интеграции: экраны зовут только её
├── hooks/
│   └── useKanbanBoard.ts     ← данные доски: WS-события, опрос, фокус вкладки
├── mock/
│   ├── data.ts               ← сид: задания/карточки/проводки XP (дедлайны «живые»)
│   └── store.ts              ← ин-мемори БД: FSM, XP-математика, стрик, заморозки
├── components/
│   ├── TaskDetailsModal.tsx  ← задание целиком + сдача файла (хеш считает сервер)
│   ├── TaskCard.tsx          ← карточка канбана
│   └── StreakCalendar.tsx    ← календарь on-time сдач (8 недель × 7 дней)
├── pages/
│   ├── KanbanPage.tsx        ← доска: клик по входящей берёт её в работу
│   └── ShopPage.tsx          ← магазин: XP, стрик, заморозки, достижения, история
└── types/index.ts            ← UI-модели витрины
```

## Правила

1. UI-примитивы — только `src/components/` (`Button`, `Modal`); палитра —
   токены темы (`card`, `line`, `ink*`, `brand`).
2. Все состояния экранов: loading / error (`role="alert"`) / empty.
3. Ошибки мока — `ApiError` с кодами backend (`invalid_transition`,
   `insufficient_xp`, `guard_failed`…), рендерятся как с реальным API.
4. После мутации список перечитывается (подписка `subscribe` в mock/store
   имитирует инвалидацию по WS-событиям).
5. FSM-переходы карточки: TODO → IN_PROGRESS → REVIEW → DONE, REJECTED →
   IN_PROGRESS; `SUBMIT` требует файл, хеш считает сервер.

## Бонус за спидран

У каждого задания есть граница бонуса ×1.5. Она либо считается автоматически
(`deadline − speedrun-окно`), либо её задаёт преподаватель при выдаче задания.
Пари и отдельной вкладки «Экономика» нет: покупки живут в магазине.

## Как перепаять на реальный backend (Фаза 7)

Меняется только `student/api.ts`:

| Мок-функция | Станет |
|---|---|
| `getBoard()` | `fetchTasks()` + `fetchSubmissions()` из `core/api` — уже есть |
| `takeCard(id, e)` | PATCH `/api/submissions/{id}/status` (`moveSubmission`) |
| `submitWork(id, file)` | POST `/api/submissions/{id}/submit` (`submitWorkFile`) |
| `purchaseFreezes(q)` | `buyStreakFreezes(q)` из `core/api` — уже есть |
| `getProfile()/getLedger()` | профиль dev-login + WS `xp.ledger.posted` |

## Демо-сценарий

1. Войти как `student1@parta.dev` (пароль — любой непустой).
2. **Канбан**: нажать на карточку — она уходит в «В работе» и открывает задание.
3. Прикрепить файл и отправить: через ~6 секунд мок-«преподаватель» вернёт
   вердикт с XP и стриком.
4. **Магазин**: купить заморозки (200 XP/шт.), посмотреть календарь стрика.
