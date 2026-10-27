# FSM и инварианты транзакций

## 1. FSM Submission (Канбан)

Состояния: `TODO, IN_PROGRESS, REVIEW, DONE, REJECTED`

| Текущее | Событие | Guard | Следующее | Действие |
|---|---|---|---|---|
| TODO | START | студент-владелец, задача PUBLISHED | IN_PROGRESS | updated_at=now |
| IN_PROGRESS | SUBMIT | artifact_url+hash заданы | REVIEW | submitted_at=now, locked_at=now |
| REVIEW | TEACHER_ACCEPT | преподаватель назначен | DONE | final_submitted_at=submitted_at, reviewed_at=now, начисление XP+streak |
| REVIEW | TEACHER_REJECT | есть комментарий | REJECTED | revision_log += {at, comment}, locked_at=NULL |
| REJECTED | REOPEN | студент-владелец | IN_PROGRESS | locked_at=NULL |
| DONE | любое | запрещено | — | 409 |

### Блокировка в REVIEW
При переходе IN_PROGRESS → REVIEW фиксируются artifact_url, artifact_hash, submitted_at, locked_at.
Студент не может менять артефакт. Разрешено только чтение и append в revision_log.

### Краевой сценарий: дедлайн наступил, работа висит в REVIEW
Инвариант: **студент не наказывается за задержку преподавателя.**

Доказательство:
1. On-time определяется по `submitted_at`, не по `reviewed_at`.
2. Deadline evaluator пропускает REVIEW, если `submitted_at <= deadline_at`.
3. При reject после дедлайна: `grace_until = reviewed_at + 24h`.
4. Если студент переводит работу в DONE до grace_until, on-time и speedrun считаются по первому submitted_at.
5. При accept после дедлайна XP и streak начисляются по submitted_at.

---

## 2. FSM Wagers

Состояния: `PLACED, WON, LOST, CANCELLED`

| Текущее | Событие | Guard | Следующее | Действие |
|---|---|---|---|---|
| PLACED | WIN_RESOLVE | submission DONE, final_submitted_at <= wager.deadline_at | WON | кредит 2*stake_amount, WAGER_WIN |
| PLACED | LOSE_RESOLVE | now > wager.deadline_at, победы нет | LOST | без возврата |
| PLACED | CANCEL | admin, до deadline | CANCELLED | возврат stake |
| WON/LOST/CANCELLED | любое | терминальное | — | 409 |

Валидация победы:
`∃ sub: sub.task_id=wager.task_id ∧ sub.student_id=wager.student_id ∧ sub.status='DONE' ∧ sub.final_submitted_at <= wager.deadline_at`

Ставка не превышает `xp_balance` на момент создания. Дедлайн пари ≤ дедлайн задачи.

---

## 3. FSM Peer-Review Sandbox

Состояния: `CREATED, IN_REVIEW, COMPLETED, EXPIRED`

| Текущее | Событие | Guard | Следующее | Действие |
|---|---|---|---|---|
| CREATED | CLAIM | reviewer != author, now < expires_at, активных review < 3 | IN_REVIEW | taken_at=now, read-only токен |
| CREATED | EXPIRE | now >= expires_at | EXPIRED | возврат escrow автору |
| IN_REVIEW | COMPLETE | reviewer_id совпадает, чек-лист заполнен | COMPLETED | выплата reward_amount |
| IN_REVIEW | EXPIRE | now >= expires_at | EXPIRED | возврат escrow автору |
| COMPLETED/EXPIRED | любое | терминальное | — | 409 |

### Ограничения режима
Рецензент получает не файл, а поток через backend-прокси:
- одноразовый токен, TTL 15 минут
- watermark с reviewer_id и peer_review_id
- API экспорта/скачивания отсутствует
- чек-лист только в UI

Это исключает чёрный рынок списанных работ.