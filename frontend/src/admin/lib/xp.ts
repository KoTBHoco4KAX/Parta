/**
 * XP-математика админки — посимвольное зеркало spec/03_MATH.md §1
 * и backend/internal/domain/xp/calculator.go.
 *
 * Используется ТОЛЬКО для предпросмотра в форме. Сервер считает Base XP сам,
 * поле для ручного ввода XP отсутствует (spec/03_MATH.md: «Ручной ввод XP запрещён»).
 */

import type { TaskType, TeamSlotRole } from '../types';

/** Веса типов заданий (spec/03_MATH.md §1). */
export const TASK_TYPE_WEIGHT: Record<TaskType, number> = {
  TEST: 1.0,
  ESSAY: 1.5,
  LAB_CODE: 2.0,
  TEAM_PROJECT: 2.5,
};

export const TASK_TYPE_LABEL: Record<TaskType, string> = {
  TEST: 'Тест',
  ESSAY: 'Эссе',
  LAB_CODE: 'Лабораторная',
  TEAM_PROJECT: 'Командный проект',
};

export const TASK_TYPE_DESCRIPTION: Record<TaskType, string> = {
  TEST: 'Проверка теории, короткий цикл',
  ESSAY: 'Письменная работа с аргументацией',
  LAB_CODE: 'Код + отчёт, основной формат',
  TEAM_PROJECT: 'Командные слоты, независимая приёмка',
};

/** Нижняя граница Base XP и Slot Base XP. */
export const MIN_BASE_XP = 10;

/** Коэффициент слота командного проекта. */
export const TEAM_SLOT_FACTOR = 1.15;

/** Скоростные множители из spec/03_MATH.md §2. */
export const MULTIPLIERS = [
  { key: 'speedrun', label: 'Speedrun', multiplier: 1.5, hint: 'сдано в окне' },
  { key: 'normal', label: 'В срок', multiplier: 1.0, hint: 'до дедлайна' },
  { key: 'late', label: 'После', multiplier: 0.5, hint: 'после дедлайна' },
] as const;

/** Ролевые слоты: DB, BIZ, QA_DOC, DEVOPS и суффиксы _2, _3 при team_size > 4. */
export const TEAM_SLOT_ROLES: TeamSlotRole[] = [
  { code: 'DB', title: 'Схема и миграции' },
  { code: 'BIZ', title: 'Бизнес-логика и API' },
  { code: 'QA_DOC', title: 'Тесты и документация' },
  { code: 'DEVOPS', title: 'Сборка, CI и окружение' },
];

export interface XPParts {
  /** D = max(0.5, (deadline - created) / 86400). */
  days: number;
  /** C = w * (0.4*R + 0.6*H). */
  complexity: number;
  /** F_d = clamp(1 + ln(1 + 7/D), 1.0, 2.5). */
  deadlineFactor: number;
  /** round(50 * C * F_d) до применения нижней границы. */
  rawBaseXP: number;
  /** Итоговый Base XP; для TEAM_PROJECT — Slot Base XP. */
  baseXP: number;
  /** Slot Base XP для командного проекта, иначе null. */
  slotBaseXP: number | null;
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), high);
}

/** Полный расчёт Base XP / Slot Base XP для предпросмотра. */
export function computeXPParts(input: {
  taskType: TaskType;
  requirementsCount: number;
  expectedHours: number;
  createdAt: Date;
  deadlineAt: Date;
  teamSize: number;
}): XPParts {
  const days = Math.max(
    0.5,
    (input.deadlineAt.getTime() - input.createdAt.getTime()) / 86_400_000,
  );
  const complexity =
    TASK_TYPE_WEIGHT[input.taskType] *
    (0.4 * input.requirementsCount + 0.6 * input.expectedHours);
  const deadlineFactor = clamp(1 + Math.log(1 + 7 / days), 1.0, 2.5);
  const rawBaseXP = Math.round(50 * complexity * deadlineFactor);

  let slotBaseXP: number | null = null;

  if (input.taskType === 'TEAM_PROJECT' && input.teamSize > 1) {
    slotBaseXP = Math.round((rawBaseXP / input.teamSize) * TEAM_SLOT_FACTOR);
  }

  return {
    days,
    complexity,
    deadlineFactor,
    rawBaseXP,
    slotBaseXP,
    baseXP: Math.max(MIN_BASE_XP, slotBaseXP ?? rawBaseXP),
  };
}

/** Итоговый XP при множителе скорости — FinalXP = max(0, round(base * M)). */
export function computeFinalXP(baseXP: number, multiplier: number): number {
  return Math.max(0, Math.round(baseXP * multiplier));
}

/** Слоты, которые создаст backend при `POST /api/tasks`. */
export function buildTeamSlots(taskType: TaskType, teamSize: number): TeamSlotRole[] {
  if (taskType !== 'TEAM_PROJECT' || teamSize < 2) {
    return [];
  }

  return Array.from({ length: teamSize }, (_, index) => {
    const role = TEAM_SLOT_ROLES[index % TEAM_SLOT_ROLES.length];
    const round = Math.floor(index / TEAM_SLOT_ROLES.length);

    return {
      code: round === 0 ? role.code : `${role.code}_${round + 1}`,
      title: role.title,
    };
  });
}

/** `datetime-local` требует значение вида YYYY-MM-DDTHH:mm в локальной зоне. */
export function toDatetimeLocalValue(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

/** Дедлайн по умолчанию: через неделю, 18:00 локального времени. */
export function defaultDeadlineLocal(): string {
  const date = new Date();
  date.setDate(date.getDate() + 7);
  date.setHours(18, 0, 0, 0);

  return toDatetimeLocalValue(date);
}
