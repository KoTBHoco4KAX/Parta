import type { BadgeTone } from '../components/ui';
import type { PeerReviewStatus, TaskType, Verdict } from '../types';

/** Русские подписи типов заданий (веса — spec/03_MATH.md §1). */
export const TASK_TYPE_LABEL: Record<TaskType, string> = {
  TEST: 'Тест',
  ESSAY: 'Эссе',
  LAB_CODE: 'Лабораторная',
  TEAM_PROJECT: 'Командный проект',
};

export const TASK_TYPE_TONE: Record<TaskType, BadgeTone> = {
  TEST: 'sky',
  ESSAY: 'violet',
  LAB_CODE: 'indigo',
  TEAM_PROJECT: 'amber',
};

/** Статусы peer-review sandbox (spec/02_FSM.md §3). */
export const PEER_STATUS_LABEL: Record<PeerReviewStatus, string> = {
  CREATED: 'Ждёт рецензента',
  IN_REVIEW: 'В работе',
  COMPLETED: 'Завершено',
  EXPIRED: 'Истекло',
};

export const PEER_STATUS_TONE: Record<PeerReviewStatus, BadgeTone> = {
  CREATED: 'amber',
  IN_REVIEW: 'sky',
  COMPLETED: 'emerald',
  EXPIRED: 'slate',
};

export const VERDICT_LABEL: Record<Verdict, string> = {
  ACCEPT: 'Принято',
  REJECT: 'На доработку',
};

/** Допустимые статусы для фильтра P2P. */
export const PEER_FILTER_LABEL = {
  ALL: 'Все',
  ACTIVE: 'Активные',
  COMPLETED: 'Завершённые',
  EXPIRED: 'Истёкшие',
} as const;
