// Мок-хранилище студенческого кабинета ПАРТА (ветка feat/student-ui).
//
// ЧЕСТНОЕ ПРЕДУПРЕЖДЕНИЕ: здесь моки, а не backend. Задача ветки — UI до
// появления read-эндпоинтов Фазы 7, поэтому данные живут в памяти страницы.
// Правила игры соблюдаются те же, что в домене backend (spec/02_FSM.md,
// spec/03_MATH.md): FSM-переходы, speedrun-множитель, стрик, escrow пари
// и цена заморозки 200 XP. Ошибки выбрасываются типом ApiError с кодами
// backend (invalid_transition, insufficient_xp…) — экраны уже умеют их рендерить.
//
// При подключении реального backend перепаивается только student/api.ts:
// сигнатуры методов хранилища совпадают с контрактами REST.
import { ApiError } from '../../core/api';
import {
  buildStreakCalendar,
  seedLedger,
  seedProfile,
  seedSubmissions,
  seedTasks,
  seedWagers,
  streakFreezePrice,
} from './data';
import type {
  BoardCard,
  BoardSnapshot,
  BoardSubmission,
  BoardTask,
  LedgerEntry,
  Profile,
  PurchaseFreezesResult,
  StudentWager,
  SubmissionEvent,
  TaskStatus,
  VerdictResult,
} from '../types';

// Таблица допустимых переходов карточки (spec/02_FSM.md):
// SUBMIT выполняется модалкой сдачи, TODO → REVIEW идёт как START + SUBMIT.
const ALLOWED: Record<TaskStatus, TaskStatus[]> = {
  TODO: ['IN_PROGRESS', 'REVIEW'],
  IN_PROGRESS: ['REVIEW'],
  REVIEW: [],
  DONE: [],
  REJECTED: ['IN_PROGRESS'],
};

// STREAK_FREEZE_PRICE — spec: 200 XP за заморозку (domain/economy).
export const FREEZE_PRICE = streakFreezePrice;

// VERDICT_DELAY_MS — «преподаватель посмотрел». В моке вердикт приходит
// сам через несколько секунд (симуляция WS-событий verdict+streak+xp).
const VERDICT_DELAY_MS = 6_000;

interface SubWithTask extends BoardSubmission {
  task: BoardTask;
}

const db = {
  profile: { ...seedProfile },
  tasks: seedTasks.map((task) => ({ ...task })),
  submissions: seedSubmissions.map((sub) => ({
    ...sub,
    revisionLog: sub.revisionLog.map((revision) => ({ ...revision })),
  })),
  wagers: seedWagers.map((wager) => ({ ...wager })),
  ledger: seedLedger.map((entry) => ({ ...entry })),
  streakDays: buildStreakCalendar(),
};

let submissionSeq = 200;
let wagerSeq = 300;
let ledgerSeq = 400;

// Подписки: экраны перечитывают данные после каждой мутации (аналог паттерна
// «список перечитывается с сервера, а не правится на глаз», DESIGN_SPEC §4.6).
const listeners = new Set<() => void>();

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

function notify() {
  listeners.forEach((listener) => listener());
}

// delay имитирует сетевую задержку, чтобы loading-состояния были реалистичны.
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function ledgerPost(amount: number, reason: LedgerEntry['reason'], memo: string) {
  ledgerSeq += 1;

  db.ledger.unshift({
    id: ledgerSeq,
    amount,
    reason,
    memo,
    createdAt: new Date().toISOString(),
  });
}

// computeMultiplier — spec/03_MATH.md: speedrun 1.5 / вовремя 1.0 / опоздание 0.5.
function computeMultiplier(sub: SubWithTask): number {
  const deadline = new Date(sub.task.deadlineAt).getTime();
  const submitted = new Date(sub.submittedAt ?? new Date().toISOString()).getTime();
  const speedrunCut = deadline - sub.task.speedrunWindowHours * 3_600_000;

  if (submitted <= speedrunCut) {
    return 1.5;
  }

  return submitted <= deadline ? 1.0 : 0.5;
}

// applyVerdict — симуляция ACCEPT из Review Inbox преподавателя: считаем XP
// по формуле, двигаем стрик (заморозка поглощает сброс) и разрешаем пари.
function applyVerdict(sub: SubWithTask): VerdictResult {
  const multiplier = computeMultiplier(sub);
  const xpAwarded = Math.max(10, Math.round(sub.task.baseXp * multiplier));
  const submittedAt = sub.submittedAt ?? new Date().toISOString();
  const onTime = new Date(submittedAt).getTime() <= new Date(sub.task.deadlineAt).getTime();

  db.profile.xpBalance += xpAwarded;
  ledgerPost(xpAwarded, 'TASK_ACCEPT', `Принято: ${sub.task.title} (множитель ×${multiplier})`);

  if (onTime) {
    db.profile.onTimeStreak += 1;
  } else if (db.profile.streakFreezes > 0) {
    db.profile.streakFreezes -= 1;
  } else {
    db.profile.onTimeStreak = 0;
  }

  // Пари по этой задаче: победа ⇔ DONE раньше дедлайна пари (spec §6.3).
  for (const wager of db.wagers) {
    if (wager.taskId !== sub.task.id || wager.status !== 'PLACED') {
      continue;
    }

    const wagerDeadline = new Date(wager.deadlineAt).getTime();

    if (onTime && new Date(submittedAt).getTime() <= wagerDeadline) {
      wager.status = 'WON';
      wager.resolutionNote = 'Работа принята до дедлайна пари — выплата ×2.';
      db.profile.xpBalance += wager.stakeAmount * 2;
      ledgerPost(wager.stakeAmount * 2, 'WAGER_PAYOUT', `Пари на «${wager.taskTitle}»: победа ×2`);
    }
  }

  return {
    submissionId: sub.id,
    status: sub.status,
    xpAwarded,
    streakAfter: db.profile.onTimeStreak,
  };
}

function assertTransition(from: TaskStatus, to: TaskStatus) {
  if (!ALLOWED[from].includes(to)) {
    throw new ApiError(
      409,
      'invalid_transition',
      `Переход ${from} → ${to} запрещён правилами FSM.`,
    );
  }
}

// ---------------------------------------------------------------------------
// Доска (аналог GET /api/tasks + GET /api/submissions)
// ---------------------------------------------------------------------------

export async function getBoard(): Promise<BoardSnapshot> {
  await delay(180);

  return {
    profile: { ...db.profile },
    cards: db.tasks.map((task) => {
      const submission = db.submissions.find((candidate) => candidate.id === task.id + 100);

      return {
        task: { ...task },
        submission: submission
          ? { ...submission, revisionLog: submission.revisionLog.map((r) => ({ ...r })) }
          : null,
      };
    }),
  };
}

// moveCard — аналог PATCH /api/submissions/{id}/status. START и REOPEN идут
// сразу; SUBMIT требует артефакт (url + hash), поэтому выполняется модулкой сдачи.
export async function moveCard(
  submissionId: number,
  event: SubmissionEvent,
  artifact?: { url: string; hash: string },
): Promise<BoardSnapshot> {
  await delay(200);

  const stored = db.submissions.find((candidate) => candidate.id === submissionId);

  if (!stored) {
    throw new ApiError(404, 'not_found', 'Карточка не найдена.');
  }

  const task = db.tasks.find((candidate) => candidate.id === stored.id - 100);

  if (!task) {
    throw new ApiError(404, 'not_found', 'Задание карточки не найдено.');
  }

  const sub: SubWithTask = { ...stored, revisionLog: [...stored.revisionLog], task };

  if (event === 'START' || event === 'REOPEN') {
    assertTransition(stored.status, 'IN_PROGRESS');
    stored.status = 'IN_PROGRESS';
  } else {
    if (!artifact || artifact.url.trim() === '' || artifact.hash.trim() === '') {
      throw new ApiError(422, 'guard_failed', 'Для сдачи нужен файл и его SHA-256.');
    }

    assertTransition(stored.status, 'REVIEW');
    stored.status = 'REVIEW';
    stored.artifactUrl = artifact.url.trim();
    stored.artifactHash = artifact.hash.trim();
    stored.submittedAt = new Date().toISOString();
    stored.attempt += 1;

    // Симуляция вердикта преподавателя (в реальной системе приходит по WS).
    // Важно: мутируем именно stored-объект — applyVerdict считает XP, а карточка
    // уходит в DONE, иначе FAILED после вердикта вечный REVIEW на доске.
    window.setTimeout(() => {
      stored.status = 'DONE';
      applyVerdict({ ...stored, revisionLog: [...stored.revisionLog], task });
      notify();
    }, VERDICT_DELAY_MS);
  }

  notify();

  return getBoardNoDelay();
}

function getBoardNoDelay(): BoardSnapshot {
  return {
    profile: { ...db.profile },
    cards: db.tasks.map((task) => {
      const submission = db.submissions.find((candidate) => candidate.id === task.id + 100);

      return {
        task: { ...task },
        submission: submission
          ? { ...submission, revisionLog: submission.revisionLog.map((r) => ({ ...r })) }
          : null,
      };
    }),
  };
}

// ---------------------------------------------------------------------------
// Геймификация (аналог dev-login-профиля + WS-событий + покупки заморозок)
// ---------------------------------------------------------------------------

export async function getProfile(): Promise<Profile> {
  await delay(120);

  return { ...db.profile };
}

export async function getLedger(): Promise<LedgerEntry[]> {
  await delay(150);

  return db.ledger.map((entry) => ({ ...entry }));
}

// getStreakCalendar — дни on-time сдач для календарной сетки стрика.
export async function getStreakDays(): Promise<string[]> {
  await delay(100);

  return [...db.streakDays];
}

export async function purchaseFreezes(quantity: number): Promise<PurchaseFreezesResult> {
  await delay(260);

  const total = FREEZE_PRICE * quantity;

  if (total > db.profile.xpBalance) {
    throw new ApiError(
      422,
      'insufficient_xp',
      `Недостаточно XP: ${quantity} шт. стоят ${total} XP, баланс ${db.profile.xpBalance}.`,
    );
  }

  db.profile.xpBalance -= total;
  db.profile.streakFreezes += quantity;
  ledgerPost(-total, 'STREAK_FREEZE', `Покупка ${quantity} заморозки(ок) по ${FREEZE_PRICE} XP`);
  notify();

  return {
    streakFreezes: db.profile.streakFreezes,
    xpBalance: db.profile.xpBalance,
  };
}

// ---------------------------------------------------------------------------
// Пари (аналог GET /api/wagers + POST /api/wagers)
// ---------------------------------------------------------------------------

export async function getWagers(): Promise<StudentWager[]> {
  await delay(150);

  return db.wagers.map((wager) => ({ ...wager }));
}

export async function placeWager(input: {
  taskId: number;
  stakeAmount: number;
  deadlineAt: string;
}): Promise<StudentWager> {
  await delay(280);

  const task = db.tasks.find((candidate) => candidate.id === input.taskId);

  if (!task) {
    throw new ApiError(404, 'not_found', 'Задание не найдено.');
  }

  if (db.wagers.some((candidate) => candidate.taskId === task.id && candidate.status === 'PLACED')) {
    throw new ApiError(409, 'already_exists', 'По этому заданию уже есть активное пари.');
  }

  const stake = Math.floor(input.stakeAmount);

  if (!Number.isFinite(stake) || stake <= 0) {
    throw new ApiError(422, 'invalid_argument', 'Ставка должна быть положительным числом XP.');
  }

  if (stake > db.profile.xpBalance) {
    throw new ApiError(422, 'insufficient_xp', `Ставка больше баланса (${db.profile.xpBalance} XP).`);
  }

  if (!Number.isFinite(new Date(input.deadlineAt).getTime())) {
    throw new ApiError(422, 'guard_failed', 'Укажите корректный дедлайн пари.');
  }

  if (new Date(input.deadlineAt).getTime() > new Date(task.deadlineAt).getTime()) {
    throw new ApiError(422, 'guard_failed', 'Дедлайн пари не может быть позже дедлайна задания.');
  }

  db.profile.xpBalance -= stake;
  ledgerPost(-stake, 'WAGER_ESCROW', `Пари на «${task.title}»: ставка в escrow`);

  wagerSeq += 1;

  const wager: StudentWager = {
    id: wagerSeq,
    taskId: task.id,
    taskTitle: task.title,
    taskDeadlineAt: task.deadlineAt,
    stakeAmount: stake,
    deadlineAt: input.deadlineAt,
    status: 'PLACED',
    createdAt: new Date().toISOString(),
    resolutionNote: '',
  };

  db.wagers.unshift(wager);
  notify();

  return { ...wager };
}
