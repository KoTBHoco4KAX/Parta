# Математический аппарат

## 1. Base XP

Вход: `task_type`, `requirements_count=R`, `expected_hours=H`, `deadline_at`, `created_at`.
Окно в днях: `D = max(0.5, (deadline_at - created_at) / 86400)`

Веса типа:
- TEST: w = 1.0
- ESSAY: w = 1.5
- LAB_CODE: w = 2.0
- TEAM_PROJECT: w = 2.5

Сложность: `C = w * (0.4*R + 0.6*H)`

Фактор дедлайна: `F_d = clamp(1.0 + ln(1.0 + 7.0/D), 1.0, 2.5)`

Base XP: `BaseXP = max(10, round(50 * C * F_d))`

Для командного проекта:
`SlotBaseXP = max(10, round(BaseXP / team_size * 1.15))`

**Ручной ввод XP запрещён.** Учитель меняет только R, H, task_type, deadline_at, speedrun_window_hours, team_size.

---

## 2. Speedrun-множитель

Граница ранней сдачи: `T_speedrun = deadline_at - speedrun_window_hours * 3600`

Множитель M:
- `final_submitted_at <= T_speedrun`: M = 1.5
- `final_submitted_at <= deadline_at`: M = 1.0
- иначе: M = 0.5

Итог: `FinalXP = max(0, round(BaseXP_or_SlotBaseXP * M))`

Speedrun не отменяет дедлайн учебной части. Он только повышает внутренний XP.

---

## 3. On-Time Streak

Для студента u в момент t:
`Due(u,t) = { task | назначена группе u, status='PUBLISHED', deadline_at <= t }`

`Missed(u,t) = { task ∈ Due(u,t) | ¬∃ sub: sub.task_id=task.id ∧ sub.student_id=u ∧ sub.status='DONE' ∧ sub.final_submitted_at <= task.deadline_at }`

Правила:
1. **Инкремент:** при переходе submission в DONE, если `final_submitted_at <= task.deadline_at`, `on_time_streak += 1`.
2. **Сброс:** если `Missed(u,t) != ∅` и `streak_freezes = 0`, `on_time_streak = 0`.
3. **Заморозка:** если `Missed != ∅` и `streak_freezes > 0`, `streak_freezes -= 1`, стрик не меняется.
4. **Пустой Due:** если `Due(u,t) = ∅`, стрик не сбрасывается.

### Доказательство инварианта «нет задач — стрик жив»
Сброс возможен только при `Missed != ∅`.
Если задач нет, `Due = ∅`, значит `Missed = ∅`.
Условие сброса ложно. Следовательно, `on_time_streak` сохраняется.