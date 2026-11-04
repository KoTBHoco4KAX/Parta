# Student UI (ветка feat/student-ui)

Экраны студента ПАРТА: канбан-доска, сдача работы, геймификация, пари.
Работают на **моках** — см. `AI_TASK.md` этой ветки (read-эндпоинты backend
Фазы 7 ещё не готовы).

## Структура

```
student/
├── api.ts                    ← ЕДИНСТВЕННАЯ точка интеграции: экраны зовут только её
├── mock/
│   ├── data.ts               ← сид: задания/карточки/пари/проводки XP (дедлайны «живые»)
│   └── store.ts              ← ин-мемори БД: FSM, XP-математика, стрик, escrow, ApiError
├── components/
│   ├── SubmitWorkModal.tsx   ← модалка сдачи: drag-n-drop файлов, SHA-256, прогресс
│   ├── TaskCard.tsx          ← карточка канбана
│   └── StreakCalendar.tsx    ← календарь on-time сдач (8 недель × 7 дней)
├── pages/
│   ├── KanbanPage.tsx        ← доска: 5 колонок, HTML5 drag-n-drop + тач-fallback
│   ├── GamificationPage.tsx  ← XP/уровень, стрик, покупка заморозок, история XP
│   └── BetsPage.tsx          ← пари: escrow, ×2 за победу, история
└── types/index.ts            ← UI-модели витрины
```

## Правила

1. UI-примитивы — только `src/components/` (`Button`, `Modal`); палитра —
   тёмная тема из `DESIGN_SPEC.md` (slate-950/900 + emerald-акцент).
2. Все состояния экранов: loading / error (`role="alert"` + «Повторить») / empty.
3. Ошибки мока — `ApiError` с кодами backend (`invalid_transition`,
   `insufficient_xp`, `guard_failed`…), рендерятся как с реальным API.
4. После мутации список перечитывается (подписка `subscribe` в mock/store
   имитирует инвалидацию по WS-событиям).
5. FSM-переходы карточки: TODO → IN_PROGRESS → REVIEW → DONE, REJECTED →
   IN_PROGRESS; `SUBMIT` требует файл + SHA-256; `DONE` заблокировано.

## Как перепаять на реальный backend (Фаза 7)

Меняется только `student/api.ts`:

| Мок-функция | Станет |
|---|---|
| `getBoard()` | `Promise.all([apiFetch('/tasks'), apiFetch('/submissions')])` |
| `takeCard(id, e)` | PATCH `/api/submissions/{id}/status` (`moveSubmission`) |
| `submitWork(id, artifact)` | тот же PATCH с `artifact_url` + `artifact_hash` |
| `purchaseFreezes(q)` | `buyStreakFreezes(q)` из `core/api` — уже есть |
| `getWagers()/placeWager()` | `fetchWagers()` / `placeWager()` из `core/api` — уже есть |
| `getProfile()/getLedger()` | профиль dev-login + WS `xp.ledger.posted` |

Сигнатуры уже совпадают с REST — доменные экраны трогать не придётся.

## Демо-сценарий

1. Войти как `student1@parta.dev` (dev-login backend'а).
2. **Канбан**: тащить «Тест по нормальным формам» в «В работе», затем
   тащить в «На проверке» → откроется модалка сдачи (можно тапнуть карточку).
3. Через ~6 секунд мок-«преподаватель» вернёт вердикт: XP, стрик, пари.
4. **XP**: купить заморозки (200 XP/шт.), посмотреть календарь стрика.
5. **Пари**: поставить XP на задание, сдать его до дедлайна — выплата ×2.
