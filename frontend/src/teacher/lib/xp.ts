/**
 * XP-математика преподавательского кабинета — зеркало spec/03_MATH.md §2
 * и backend/internal/domain/xp (ComputeFinalXP).
 *
 * ВАЖНО: это только предпросмотр для UI. Источник истины — сервер: преподаватель
 * не вводит XP вручную и не может его «подкрутить» (spec/03_MATH.md §1).
 */

export const SPEEDRUN_MULTIPLIER = 1.5;
export const NORMAL_MULTIPLIER = 1.0;
export const LATE_MULTIPLIER = 0.5;

export type SpeedrunMultiplier =
  | typeof SPEEDRUN_MULTIPLIER
  | typeof NORMAL_MULTIPLIER
  | typeof LATE_MULTIPLIER;

/**
 * Множитель скорости сдачи (spec/03_MATH.md §2).
 *
 * T_speedrun = deadline_at - speedrun_window_hours;
 * submitted_at <= T_speedrun → 1.5; <= deadline_at → 1.0; иначе → 0.5.
 */
export function computeSpeedrunMultiplier(
  submittedAt: string | Date,
  deadlineAt: string | Date,
  speedrunWindowHours: number,
): SpeedrunMultiplier {
  const submitted = new Date(submittedAt).getTime();
  const deadline = new Date(deadlineAt).getTime();
  const speedrunEdge = deadline - speedrunWindowHours * 3_600_000;

  if (submitted <= speedrunEdge) {
    return SPEEDRUN_MULTIPLIER;
  }

  if (submitted <= deadline) {
    return NORMAL_MULTIPLIER;
  }

  return LATE_MULTIPLIER;
}

/** FinalXP = max(0, round(BaseXP_or_SlotBaseXP * M)). */
export function computeFinalXP(baseXP: number, multiplier: SpeedrunMultiplier): number {
  return Math.max(0, Math.round(baseXP * multiplier));
}

/** Человекочитаемая подпись множителя для UI. */
export function describeMultiplier(multiplier: SpeedrunMultiplier): string {
  switch (multiplier) {
    case SPEEDRUN_MULTIPLIER:
      return 'speedrun ×1.5';
    case NORMAL_MULTIPLIER:
      return 'в срок ×1.0';
    default:
      return 'после дедлайна ×0.5';
  }
}
