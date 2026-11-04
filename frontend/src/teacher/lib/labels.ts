import type { BadgeTone } from '../components/ui';
import type { SubmissionWindow } from './economy';
import type { Role } from '../../core/types';
import type { PeerReviewStatus, SubmissionStatus, TaskType, Verdict } from '../types';

/** Русские подписи типов заданий (веса — spec/03_MATH.md §1). */
export const TASK_TYPE_LABEL: Record<TaskType, string> = {
  TEST: 'Тест',
  NOTES: 'Конспект',
  ESSAY: 'Эссе',
  LAB_CODE: 'Задание',
  TEAM_PROJECT: 'Командная',
};

/** Короткие подписи для фильтров и бейджей. */
export const TASK_TYPE_SHORT: Record<TaskType, string> = {
  TEST: 'Тест',
  NOTES: 'Конспект',
  ESSAY: 'Эссе',
  LAB_CODE: 'Задание',
  TEAM_PROJECT: 'Командная',
};

export const TASK_TYPE_TONE: Record<TaskType, BadgeTone> = {
  TEST: 'sky',
  NOTES: 'emerald',
  ESSAY: 'violet',
  LAB_CODE: 'indigo',
  TEAM_PROJECT: 'amber',
};

/** Описание типа задания в конструкторе выдачи. */
export const TASK_TYPE_HINT: Record<TaskType, string> = {
  TEST: 'Проверка знаний, вес ×1.0',
  NOTES: 'Конспект по теме, вес ×1.2',
  ESSAY: 'Текстовая работа, вес ×1.5',
  LAB_CODE: 'Задание с решением, вес ×2.0',
  TEAM_PROJECT: 'Командная работа, вес ×2.5',
};

/** Колонки канбана ученика (spec/02_FSM.md §1). */
export const STATUS_LABEL: Record<SubmissionStatus, string> = {
  TODO: 'К выполнению',
  IN_PROGRESS: 'В работе',
  REVIEW: 'На проверке',
  DONE: 'Зачтено',
  REJECTED: 'На доработке',
};

/** Короткие подписи для компактных бейджей и легенд. */
export const STATUS_SHORT: Record<SubmissionStatus, string> = {
  TODO: 'К выполнению',
  IN_PROGRESS: 'В работе',
  REVIEW: 'На проверке',
  DONE: 'Зачтено',
  REJECTED: 'Возврат',
};

export const STATUS_TONE: Record<SubmissionStatus, BadgeTone> = {
  TODO: 'slate',
  IN_PROGRESS: 'sky',
  REVIEW: 'amber',
  DONE: 'emerald',
  REJECTED: 'rose',
};

/** Порядок колонок — как на доске ученика. */
export const STATUS_ORDER: SubmissionStatus[] = [
  'TODO',
  'IN_PROGRESS',
  'REVIEW',
  'DONE',
  'REJECTED',
];

/** Человеческие названия слотов командного проекта (tasks.teamRoles). */
export const SLOT_ROLE_TITLE: Record<string, string> = {
  DB: 'Схема и миграции',
  BIZ: 'Бизнес-логика и API',
  QA_DOC: 'Тесты и документация',
  DEVOPS: 'Сборка, CI и окружение',
};

/** Порядок слотов при отрисовке командного проекта. */
export const SLOT_ROLE_ORDER = ['DB', 'BIZ', 'QA_DOC', 'DEVOPS'];

/** slotRoleTitle возвращает человеческое имя роли по её коду. */
export function slotRoleTitle(code: string | null | undefined): string {
  if (!code) {
    return 'Слот не назначен';
  }

  return SLOT_ROLE_TITLE[code] ?? code;
}

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

/** Подписи ролей для шапки и админки. */
export const ROLE_LABEL: Record<Role, string> = {
  admin: 'Админ',
  teacher: 'Преподаватель',
  student: 'Ученик',
};

/** Тоны ролей для бейджей админки. */
export const ROLE_TONE: Record<Role, BadgeTone> = {
  admin: 'violet',
  teacher: 'sky',
  student: 'slate',
};

/** Подписи окна сдачи: бонус, норма, просрочка. */
export const WINDOW_LABEL: Record<SubmissionWindow, string> = {
  speedrun: 'Бонус ×1.5',
  normal: 'В срок',
  late: 'После дедлайна',
};

export const WINDOW_TONE: Record<SubmissionWindow, BadgeTone> = {
  speedrun: 'emerald',
  normal: 'sky',
  late: 'rose',
};
