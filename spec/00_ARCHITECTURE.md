# ПАРТА — System Design Specification
**EduRPG Mini-App для СПО / VK Сферум / MAX**
Роль документа: архитектурный baseline, обязательный для реализации.

---

## I. Контекст и регуляторика

### 1. Среда исполнения
- Рантайм: мобильный WebApp внутри VK Сферум / MAX.
- Пользователи: колледжи, техникумы, ИСП/СПО, профильные IT-классы.
- Концепция: EduRPG канбан-конвейер практических заданий.

### 2. Жёсткие рамки (Минпросвещения, ФГОС СПО)
- Сервис НЕ выставляет оценки 2/3/4/5, НЕ заменяет электронный журнал.
- XP — внутренняя валюта. XP не двигает официальные дедлайны и не покупает зачёты.
- Вся учебная база (задания, ГОСТы, методички) открыта по умолчанию. Монетизация запрещена.

### 3. Архитектурные табу
- НЕТ календарным стрикам Duolingo-style.
- НЕТ глобальному линейному лидерборду.
- НЕТ открытому файловому P2P-обмену между студентами.

---

## II. Технологический стек

| Слой | Технология |
|---|---|
| Бэкенд | Go 1.22+ |
| БД | SQLite, драйвер `modernc.org/sqlite` (БЕЗ CGO) |
| Реалтайм | WebSocket |
| Фронт | React + TypeScript + Tailwind CSS |
| Репо | Монорепо: `/backend`, `/frontend` |
| UI-режим | Вертикальный мобильный вьюпорт + свитчер ролей (Admin/Teacher/Student) |

---

## IV. Анти-балласт в командных рейдах

### 1. Ролевые слоты
Командный проект `TEAM_PROJECT` создаёт ровно `team_size` слотов.
Каждый слот — независимый вектор ответственности:
- `DB` — схема, миграции, индексы.
- `BIZ` — бизнес-логика, FSM, API.
- `QA_DOC` — тесты, ГОСТ 7.32, документация.
- `DEVOPS` — сборка, CI, окружение, WS-наблюдаемость.

### 2. Независимость приёмки
Сценарий: A сдал слот DB вовремя, B саботировал BIZ.
- А получает `SlotBaseXP * M_A`, streak инкрементируется.
- B получает 0 XP, streak сбрасывается на ближайшем deadline.
- Приёмка слота А не блокируется слотом B.
- В `xp_ledger` источник = `TEAM_SLOT`, source_id = team_slot.id.

### 3. Carry-over (перехват слота)
Условия: слот в `OPEN/ABANDONED/REJECTED`, запрашивающий — студент той же группы.
Процедура (`POST /api/team-slots/{id}/carry-over`):
1. `assigned_user_id = requester_id`, `status = CLAIMED`.
2. Исходный исполнитель теряет слот, streak сбрасывается.
3. Requester получает `SlotBaseXP * 1.5 * M` при приёмке.
4. Бонус `CARRY_OVER_BONUS` = 100% от SlotBaseXP (итого двойное вознаграждение).

---

## V. Реалтайм-протокол (WebSocket)

### Подключение
`wss://.../ws?token=<jwt>`
Комнаты: `user:{id}`, `group:{id}`, `teacher:{id}`, `task:{id}`.
Доставка: at-least-once. Клиент дедуплицирует по `event_id`.

### Конверт
```json
{
  "event_id": "uuid",
  "event_type": "submission.card.moved",
  "timestamp": "2026-10-10T12:00:00.000Z",
  "actor_id": 42,
  "room": "group:10",
  "payload": {}
}
```

### События
- `submission.card.moved`: `{submission_id, task_id, student_id, from, to, submitted_at}`
- `review.inbox.created`: `{submission_id, task_id, student_id, group_id, submitted_at, waiting_seconds}`
- `submission.verdict.issued`: `{submission_id, verdict, xp_awarded, streak_delta, reviewed_at}`
- `xp.ledger.posted`: `{ledger_id, user_id, amount, balance_after, reason}`
- `streak.updated`: `{user_id, on_time_streak, streak_freezes, reason}`
- `wager.resolved`: `{wager_id, status, stake_amount, payout}`
- `peer_review.state_changed`: `{peer_review_id, status, reviewer_id, expires_at}`
- `team_slot.state_changed`: `{team_slot_id, task_id, status, assigned_user_id}`