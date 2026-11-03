/**
 * Экономика XP для интерфейса преподавателя.
 *
 * Модуль повторяет spec/03_MATH.md и `internal/domain/xp`: интерфейс обязан
 * показывать те же числа, которые начислит backend, иначе преподаватель видит
 * одно, а студент получает другое. Все формулы — чистые функции без запросов:
 * источник истины остаётся на сервере, здесь только предпросмотр.
 */

import type { TaskType } from '../types';

/** Множитель XP за сдачу внутри speedrun-окна (economy.SpeedrunMultiplier). */
export const SPEEDRUN_MULTIPLIER = 1.5;

/** Множитель XP за сдачу до дедлайна (economy.NormalMultiplier). */
export const NORMAL_MULTIPLIER = 1;

/** Множитель XP за сдачу после дедлайна (economy.LateMultiplier). */
export const LATE_MULTIPLIER = 0.5;

/** Вес типа задания (economy.TaskType.Weight). */
export const TASK_TYPE_WEIGHT: Record<TaskType, number> = {
  TEST: 1,
  ESSAY: 1.5,
  LAB_CODE: 2,
  TEAM_PROJECT: 2.5,
};

/** Коэффициент слота командного проекта (xp.teamSlotFactor). */
const TEAM_SLOT_FACTOR = 1.15;

/** Нижняя граница Base XP (xp.minBaseXP). */
const MIN_BASE_XP = 10;

/** Окно сдачи относительно дедлайна. */
export type SubmissionWindow = 'speedrun' | 'normal' | 'late';

/**
 * speedrunEndsAt — момент, после которого усиленный бонус уже не действует.
 * Студент получает ×1.5, если сдал не позже `deadline - speedrunWindow`.
 */
export function speedrunEndsAt(deadlineAt: string | Date, windowHours: number): Date {
  const deadline = toDate(deadlineAt);
  const windowMs = Math.max(0, windowHours) * 3_600_000;

  return new Date(deadline.getTime() - windowMs);
}

/** submissionWindow определяет, в какое окно попала сдача. */
export function submissionWindow(
  submittedAt: string | Date | null,
  deadlineAt: string | Date,
  windowHours: number,
): SubmissionWindow {
  if (submittedAt === null) {
    return 'late';
  }

  const submitted = toDate(submittedAt);
  const deadline = toDate(deadlineAt);

  if (submitted.getTime() <= speedrunEndsAt(deadline, windowHours).getTime()) {
    return 'speedrun';
  }

  if (submitted.getTime() <= deadline.getTime()) {
    return 'normal';
  }

  return 'late';
}

/** xpMultiplier возвращает множитель для момента сдачи. */
export function xpMultiplier(
  submittedAt: string | Date | null,
  deadlineAt: string | Date,
  windowHours: number,
): number {
  switch (submissionWindow(submittedAt, deadlineAt, windowHours)) {
    case 'speedrun':
      return SPEEDRUN_MULTIPLIER;
    case 'normal':
      return NORMAL_MULTIPLIER;
    default:
      return LATE_MULTIPLIER;
  }
}

/** estimateFinalXP — сколько XP получит студент за сдачу в этот момент. */
export function estimateFinalXP(
  baseXP: number,
  submittedAt: string | Date | null,
  deadlineAt: string | Date,
  windowHours: number,
): number {
  const multiplier = xpMultiplier(submittedAt, deadlineAt, windowHours);

  return Math.max(0, Math.round(baseXP * multiplier));
}

export interface BaseXPInput {
  taskType: TaskType;
  requirementsCount: number;
  expectedHours: number;
  createdAt: Date;
  deadlineAt: Date;
  teamSize: number;
}

/**
 * estimateBaseXP — предпросмотр Base XP до создания задания.
 *
 * Совпадает с `xp.ComputeBaseXP`: C = w·(0.4·R + 0.6·H),
 * F = clamp(1 + ln(1 + 7/D), 1, 2.5), Base = round(50·C·F), для команды —
 * деление на размер команды с коэффициентом 1.15.
 */
export function estimateBaseXP(input: BaseXPInput): number {
  const weight = TASK_TYPE_WEIGHT[input.taskType] ?? 0;
  const complexity = weight * (0.4 * input.requirementsCount + 0.6 * input.expectedHours);

  const days = Math.max(
    0.5,
    (input.deadlineAt.getTime() - input.createdAt.getTime()) / 86_400_000,
  );
  const deadlineFactor = clamp(1 + Math.log(1 + 7 / days), 1, 2.5);

  let base = Math.round(50 * complexity * deadlineFactor);

  if (input.taskType === 'TEAM_PROJECT' && input.teamSize > 1) {
    base = Math.round((base / input.teamSize) * TEAM_SLOT_FACTOR);
  }

  return Math.max(base, MIN_BASE_XP);
}

/** Доля времени, прошедшая от старта окна до дедлайна: 0…1. */
export function elapsedRatio(createdAt: string | Date, deadlineAt: string | Date, now: number): number {
  const start = toDate(createdAt).getTime();
  const end = toDate(deadlineAt).getTime();

  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return 0;
  }

  return clamp((now - start) / (end - start), 0, 1);
}

/** toDate безопасно приводит вход к Date (невалидные строки — epoch 0). */
function toDate(value: string | Date): Date {
  return value instanceof Date ? value : new Date(value);
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), high);
}
