/**
 * Демо-данные админки: назначения (группа + дисциплина) и уже созданные задачи.
 * Значения согласованы с 002_seed_dev.sql (PROJECT_MANIFEST §6.4).
 */

import type { Assignment, CreatedTask } from '../types';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export const MOCK_ADMIN = {
  id: 1,
  name: 'Николай Волков',
  email: 'admin@parta.dev',
  role: 'admin' as const,
};

/** Назначения: учительские пары из сида. */
export const MOCK_ASSIGNMENTS: Assignment[] = [
  {
    id: 10,
    groupCode: 'IS-21',
    groupTitle: 'Информационные системы, 21',
    disciplineCode: 'DB',
    disciplineTitle: 'Базы данных',
    teacherName: 'Алексей Смирнов',
  },
  {
    id: 11,
    groupCode: 'IS-22',
    groupTitle: 'Информационные системы, 22',
    disciplineCode: 'BIZ',
    disciplineTitle: 'Бизнес-логика и API',
    teacherName: 'Алексей Смирнов',
  },
  {
    id: 12,
    groupCode: 'IS-21',
    groupTitle: 'Информационные системы, 21',
    disciplineCode: 'BIZ',
    disciplineTitle: 'Бизнес-логика и API',
    teacherName: 'Алексей Смирнов',
  },
  {
    id: 13,
    groupCode: 'IS-22',
    groupTitle: 'Информационные системы, 22',
    disciplineCode: 'DB',
    disciplineTitle: 'Базы данных',
    teacherName: 'Алексей Смирнов',
  },
];

/** Две задачи, которые «уже опубликованы» в демо-БД. */
export function seedCreatedTasks(now: number = Date.now()): CreatedTask[] {
  return [
    {
      taskId: 2,
      title: 'Командный проект: сервис учёта заявок',
      taskType: 'TEAM_PROJECT',
      assignmentId: 11,
      groupCode: 'IS-22',
      disciplineCode: 'BIZ',
      baseXP: 460,
      slotsCount: 2,
      teamSize: 2,
      deadlineAt: new Date(now + 60 * DAY).toISOString(),
      createdAt: new Date(now - 2 * DAY).toISOString(),
      status: 'PUBLISHED',
    },
    {
      taskId: 1,
      title: 'Лабораторная №1: нормализация схемы',
      taskType: 'LAB_CODE',
      assignmentId: 10,
      groupCode: 'IS-21',
      disciplineCode: 'DB',
      baseXP: 400,
      slotsCount: 0,
      teamSize: 1,
      deadlineAt: new Date(now + 45 * DAY).toISOString(),
      createdAt: new Date(now - 3 * HOUR).toISOString(),
      status: 'PUBLISHED',
    },
  ];
}
