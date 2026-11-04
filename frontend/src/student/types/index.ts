// UI-модели студенческого кабинета ПАРТА.
//
// Поля повторяют JSON backend (core/types), но в camelCase-витрине: маппинг
// «DTO → модель» живёт в ../api.ts. Пока read-эндпоинтов Фазы 7 нет, данные
// отдаёт мок-слой (../mock/) с теми же сигнатурами, что и будущие вызовы
// apiFetch — при подключении реального backend меняется только api.ts.

// Статусы карточки канбана — 1:1 с submissions.status (spec/02_FSM.md).
export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'REVIEW' | 'DONE' | 'REJECTED';

// События FSM карточки (spec/02_FSM.md).
export type SubmissionEvent = 'START' | 'SUBMIT' | 'REOPEN';

// Задание в доске студента (GET /api/tasks — роль student).
export interface BoardTask {
  id: number;
  title: string;
  description: string;
  taskType: 'TEST' | 'ESSAY' | 'LAB_CODE' | 'TEAM_PROJECT';
  deadlineAt: string;
  speedrunWindowHours: number;
  baseXp: number;
  teamSize: number;
}

// Карточка студента по заданию (GET /api/submissions).
export interface BoardSubmission {
  id: number;
  status: TaskStatus;
  attempt: number;
  artifactUrl: string;
  artifactHash: string;
  submittedAt: string | null;
  revisionLog: { at: string; comment: string }[];
}

// Карточка канбана = задание + его карточка submissions.
export interface BoardCard {
  task: BoardTask;
  submission: BoardSubmission | null;
}

// Снимок доски: карточки + профиль (аналог двух GET-запросов Фазы 7).
export interface BoardSnapshot {
  cards: BoardCard[];
  profile: Profile;
}

export interface BoardColumn {
  status: TaskStatus;
  title: string;
}

// Профиль студента (dev-login + WS-события streak.updated / xp.ledger.posted).
export interface Profile {
  id: number;
  displayName: string;
  groupCode: string;
  xpBalance: number;
  onTimeStreak: number;
  streakFreezes: number;
}

// Проводка xp_ledger (WS-событие xp.ledger.posted).
export interface LedgerEntry {
  id: number;
  amount: number;
  reason: 'TASK_ACCEPT' | 'WAGER_ESCROW' | 'WAGER_PAYOUT' | 'STREAK_FREEZE' | 'ADMIN_ADJUSTMENT';
  memo: string;
  createdAt: string;
}

// Пари студента (GET /api/wagers).
export interface StudentWager {
  id: number;
  taskId: number;
  taskTitle: string;
  taskDeadlineAt: string;
  stakeAmount: number;
  deadlineAt: string;
  status: 'PLACED' | 'WON' | 'LOST' | 'CANCELLED';
  createdAt: string;
  resolutionNote: string;
}

// Ответ PATCH /api/submissions/{id}/status.
export interface MoveResult {
  submissionId: number;
  status: TaskStatus;
  submittedAt: string | null;
}

// Ответ вердикта (симуляция WS-событий submission.verdict.issued + xp.ledger.posted).
export interface VerdictResult {
  submissionId: number;
  status: TaskStatus;
  xpAwarded: number;
  streakAfter: number;
}

// Ответ покупки заморозок (POST /api/users/me/streak-freezes/purchase).
export interface PurchaseFreezesResult {
  streakFreezes: number;
  xpBalance: number;
}
