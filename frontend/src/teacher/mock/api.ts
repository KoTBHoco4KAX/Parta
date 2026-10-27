/**
 * Мок-слой API преподавательского кабинета.
 *
 * Повторяет контракты spec/04_API.md (verdict) и события WS
 * `review.inbox.created` / `peer_review.state_changed` из spec/00_ARCHITECTURE.md §V.
 * Чтобы подключить реальный backend, достаточно заменить тела функций этого файла
 * на fetch-вызовы: сигнатуры и типы уже совпадают.
 *
 * Внутри — только in-memory состояние. Задержка добавлена, чтобы UI честно
 * показывал loading/disabled-состояния.
 */

import {
  computeFinalXP,
  computeSpeedrunMultiplier,
} from '../lib/xp';
import type {
  InboxSubmission,
  PeerReview,
  ReviewInboxItem,
  Verdict,
  VerdictResult,
} from '../types';
import { seedInbox, seedPeerReviews, seedStreaks } from './data';

const LATENCY_MS = 420;

let inbox: InboxSubmission[] = seedInbox();
let peerReviews: PeerReview[] = seedPeerReviews();
let streaks: Record<number, number> = seedStreaks();

/** Ошибка мока в форме, совместимой с `{ error, code }` из backend. */
export class MockApiError extends Error {
  readonly code: string;

  readonly status: number;

  constructor(code: string, message: string, status = 422) {
    super(message);
    this.name = 'MockApiError';
    this.code = code;
    this.status = status;
  }
}

export function isMockApiError(error: unknown): error is MockApiError {
  return error instanceof MockApiError;
}

function sleep(ms: number = LATENCY_MS): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function cloneInboxItem(item: InboxSubmission): InboxSubmission {
  return { ...item, revisions: item.revisions.map((entry) => ({ ...entry })) };
}

/**
 * GET /api/reviews/inbox (в backend пока не реализован — см. PROJECT_MANIFEST §6.5).
 * `waiting_seconds` считается каждый раз от текущего момента, как в событии
 * `review.inbox.created`.
 */
export async function fetchReviewInbox(): Promise<ReviewInboxItem[]> {
  await sleep();

  const now = Date.now();

  return inbox.map((item) => {
    const submittedAt = new Date(item.submittedAt).getTime();
    const deadlineAt = new Date(item.deadlineAt).getTime();

    return {
      ...cloneInboxItem(item),
      waitingSeconds: Math.max(0, Math.round((now - submittedAt) / 1000)),
      onTime: submittedAt <= deadlineAt,
    };
  });
}

/**
 * POST /api/submissions/{id}/verdict.
 * ACCEPT: REVIEW → DONE, XP и стрик считаются по submitted_at.
 * REJECT: REVIEW → REJECTED, комментарий обязателен (spec/02_FSM.md §1).
 */
export async function issueVerdict(input: {
  submissionId: number;
  verdict: Verdict;
  comment: string;
}): Promise<VerdictResult> {
  await sleep();

  const item = inbox.find((candidate) => candidate.id === input.submissionId);

  if (!item) {
    throw new MockApiError('not_found', 'Работа не найдена в инбоксе.', 404);
  }

  const comment = input.comment.trim();

  if (input.verdict === 'REJECT' && comment.length === 0) {
    throw new MockApiError(
      'invalid_argument',
      'Комментарий обязателен: студент должен понять, что доработать.',
    );
  }

  const submittedAt = new Date(item.submittedAt).getTime();
  const deadlineAt = new Date(item.deadlineAt).getTime();
  const onTime = submittedAt <= deadlineAt;
  const currentStreak = streaks[item.studentId] ?? 0;

  let xpAwarded = 0;
  let streakAfter = currentStreak;

  if (input.verdict === 'ACCEPT') {
    const multiplier = computeSpeedrunMultiplier(
      item.submittedAt,
      item.deadlineAt,
      item.speedrunWindowHours,
    );

    xpAwarded = computeFinalXP(item.baseXP, multiplier);

    // Инкремент только за on-time (spec/03_MATH.md §3, правило 1).
    if (onTime) {
      streakAfter = currentStreak + 1;
      streaks = { ...streaks, [item.studentId]: streakAfter };
    }
  }

  inbox = inbox.filter((candidate) => candidate.id !== input.submissionId);

  return {
    submissionId: item.id,
    status: input.verdict === 'ACCEPT' ? 'DONE' : 'REJECTED',
    verdict: input.verdict,
    xpAwarded,
    streakAfter,
    reviewedAt: new Date().toISOString(),
  };
}

/** Список P2P-ревью для наблюдения преподавателем. Read-only. */
export async function fetchPeerReviews(): Promise<PeerReview[]> {
  await sleep();

  return peerReviews.map((review) => ({
    ...review,
    checklist: review.checklist.map((item) => ({ ...item })),
    checklistResults: review.checklistResults.map((result) => ({ ...result })),
  }));
}

/** Сброс демо-сценария — удобно, если все работы уже разобраны. */
export async function resetTeacherDemo(): Promise<void> {
  await sleep(120);

  inbox = seedInbox();
  peerReviews = seedPeerReviews();
  streaks = seedStreaks();
}
