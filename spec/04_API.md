# REST API контракты

Аутентификация: `Authorization: Bearer <jwt>`.
RBAC: `admin`, `teacher`, `student`.
Ошибки: 400 (валидация JSON), 403 (роль), 409 (FSM/дубль), 422 (бизнес-правило).

---

### POST /api/tasks — создание задачи
Роль: teacher, admin.
```json
// req
{
  "assignment_id": 10,
  "title": "Лабораторная №3",
  "description_md": "...",
  "task_type": "LAB_CODE",
  "requirements_count": 12,
  "expected_hours": 6.5,
  "deadline_at": "2026-10-15T18:00:00.000Z",
  "speedrun_window_hours": 48,
  "team_size": 1
}
// 201
{ "task_id": 101, "base_xp_computed": 420, "status": "PUBLISHED" }
```

### POST /api/submissions — постановка работы на канбан
Роль: student.
Создаёт карточку в статусе `TODO`; артефакт на этом шаге не принимается —
он фиксируется событием `SUBMIT` (см. PATCH ниже).
Идемпотентно: если submission для пары (task_id, student_id | team_slot_id)
уже существует, возвращается 200 с существующей карточкой.
```json
// req
{ "task_id": 101, "team_slot_id": null }
// 201
{ "submission_id": 501, "status": "TODO" }
// 200 (повторный вызов)
{ "submission_id": 501, "status": "TODO" }
```

### PATCH /api/submissions/{id}/status — движение по канбану
Роль: student.
```json
// req
{ "event": "SUBMIT", "artifact_url": "...", "artifact_hash": "sha256:..." }
// 200
{ "submission_id": 501, "status": "REVIEW", "submitted_at": "..." }
```

### POST /api/submissions/{id}/verdict — вердикт преподавателя
Роль: teacher, admin.
```json
// req
{ "verdict": "ACCEPT", "comment": "Зачтено" }
// 200
{ "submission_id": 501, "status": "DONE", "xp_awarded": 420, "streak_after": 7, "ledger_id": 9001 }
```

### POST /api/users/me/streak-freezes/purchase — покупка заморозки
Роль: student.
```json
// req
{ "quantity": 1 }
// 200
{ "streak_freezes": 2, "xp_balance": 380, "ledger_id": 9002 }
```

### POST /api/wagers — создание пари
Роль: student.
```json
// req
{ "task_id": 101, "stake_amount": 100, "deadline_at": "2026-10-12T18:00:00.000Z" }
// 201
{ "wager_id": 301, "status": "PLACED", "escrow_tx_id": 9003 }
```

### POST /api/peer-reviews — вызов P2P-ревью
Роль: student.
```json
// req
{
  "submission_id": 501,
  "escrow_amount": 80,
  "expires_at": "2026-10-20T18:00:00.000Z",
  "criteria_checklist": [
    { "code": "C1", "title": "Компилируется", "weight": 1 },
    { "code": "C2", "title": "Есть тесты", "weight": 2 }
  ]
}
// 201
{ "peer_review_id": 701, "status": "CREATED", "escrow_tx_id": 9004 }
```

### POST /api/peer-reviews/{id}/claim — взять ревью
Роль: student (не автор).
```json
// 200
{ "peer_review_id": 701, "status": "IN_REVIEW", "reviewer_id": 42, "access_token": "jwt-readonly" }
```

### POST /api/peer-reviews/{id}/complete — завершить ревью
Роль: reviewer.
```json
// req
{ "checklist_results": [{"code":"C1","passed":true}], "summary": "..." }
// 200
{ "peer_review_id": 701, "status": "COMPLETED", "reward_xp": 80, "ledger_id": 9005 }
```

### POST /api/team-slots/{id}/carry-over — перехват слота
Роль: student той же группы.
```json
// 200
{ "team_slot_id": 88, "assigned_user_id": 42, "status": "CLAIMED", "bonus_xp": 210 }
```