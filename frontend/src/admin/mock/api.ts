/**
 * Мок-слой админки. Повторяет контракт `POST /api/tasks` (spec/04_API.md)
 * вместе с расширениями backend: ответ содержит `slots_count`, для
 * TEAM_PROJECT создаётся ровно `team_size` слотов.
 *
 * Чтобы перейти на реальный backend, замените тела функций на fetch-вызовы:
 * сигнатуры и DTO уже совпадают.
 */

import { buildTeamSlots, computeXPParts } from '../lib/xp';
import type {
  Assignment,
  CreateTaskRequest,
  CreateTaskResponse,
  CreatedTask,
} from '../types';
import { MOCK_ASSIGNMENTS, seedCreatedTasks } from './data';

const LATENCY_MS = 480;

let createdTasks: CreatedTask[] = seedCreatedTasks();
let nextTaskID = 101;

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

/** Список назначений «группа + дисциплина», доступных администратору. */
export async function fetchAssignments(): Promise<Assignment[]> {
  await sleep(240);
  return MOCK_ASSIGNMENTS.map((assignment) => ({ ...assignment }));
}

/** Список созданных задач (в backend read-эндпоинтов пока нет, §6.5). */
export async function fetchCreatedTasks(): Promise<CreatedTask[]> {
  await sleep(320);
  return createdTasks.map((task) => ({ ...task }));
}

/**
 * POST /api/tasks.
 * Валидация повторяет backend: R/H/speedrun > 0, дедлайн в будущем,
 * TEAM_PROJECT требует team_size >= 2, остальные типы — ровно 1.
 */
export async function createTask(
  request: CreateTaskRequest,
): Promise<CreateTaskResponse> {
  await sleep();

  const assignment = MOCK_ASSIGNMENTS.find(
    (candidate) => candidate.id === request.assignmentId,
  );

  if (!assignment) {
    throw new MockApiError('not_found', 'Назначение не найдено.', 404);
  }

  const title = request.title.trim();

  if (title.length === 0) {
    throw new MockApiError('invalid_argument', 'Название задачи обязательно.');
  }

  if (request.requirementsCount <= 0 || request.expectedHours <= 0) {
    throw new MockApiError(
      'invalid_argument',
      'Количество требований и ожидаемые часы должны быть больше нуля.',
    );
  }

  if (request.speedrunWindowHours <= 0) {
    throw new MockApiError(
      'invalid_argument',
      'Окно speedrun должно быть больше нуля.',
    );
  }

  const deadline = new Date(request.deadlineAt);

  if (Number.isNaN(deadline.getTime())) {
    throw new MockApiError('invalid_argument', 'Некорректный дедлайн.');
  }

  if (deadline.getTime() <= Date.now()) {
    throw new MockApiError(
      'invalid_argument',
      'Дедлайн должен быть в будущем: иначе задача не публикуется.',
    );
  }

  if (request.taskType === 'TEAM_PROJECT') {
    if (request.teamSize < 2) {
      throw new MockApiError(
        'invalid_argument',
        'Для командного проекта team_size должен быть не меньше 2.',
      );
    }
  } else if (request.teamSize !== 1) {
    throw new MockApiError(
      'invalid_argument',
      'Для этого типа задания team_size должен быть равен 1.',
    );
  }

  const createdAt = new Date();
  const teamSize = request.taskType === 'TEAM_PROJECT' ? request.teamSize : 1;
  const xp = computeXPParts({
    taskType: request.taskType,
    requirementsCount: request.requirementsCount,
    expectedHours: request.expectedHours,
    createdAt,
    deadlineAt: deadline,
    teamSize,
  });
  const slots = buildTeamSlots(request.taskType, teamSize);

  nextTaskID += 1;
  const taskID = nextTaskID;

  createdTasks = [
    {
      taskId: taskID,
      title,
      taskType: request.taskType,
      assignmentId: assignment.id,
      groupCode: assignment.groupCode,
      disciplineCode: assignment.disciplineCode,
      baseXP: xp.baseXP,
      slotsCount: slots.length,
      teamSize,
      deadlineAt: deadline.toISOString(),
      createdAt: createdAt.toISOString(),
      status: 'PUBLISHED',
    },
    ...createdTasks,
  ];

  return {
    taskId: taskID,
    baseXP: xp.baseXP,
    status: 'PUBLISHED',
    slotsCount: slots.length,
  };
}
