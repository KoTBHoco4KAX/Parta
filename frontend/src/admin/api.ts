import { apiFetch } from '../core/api';
import type {
  Assignment as AssignmentDto,
  CreateTaskResponse as CreateTaskResponseDto,
  Task as TaskDto,
} from '../core/types';
import type {
  Assignment,
  CreateTaskRequest,
  CreateTaskResponse,
  CreatedTask,
} from './types';

// admin/api.ts — read/write через те же GET/POST /api, что и остальные экраны.
// Мок-слой удалён: назначения и задачи приходят из backend.

/** GET /api/assignments — пары «группа + дисциплина». */
export async function fetchAssignments(): Promise<Assignment[]> {
  const rows = await apiFetch<AssignmentDto[]>('/assignments');

  return rows.map((row) => ({
    id: row.id,
    groupCode: row.group_code,
    groupTitle: row.group_title,
    disciplineCode: row.discipline_code,
    disciplineTitle: row.discipline_title,
    teacherName: row.teacher_name,
  }));
}

/** GET /api/tasks — созданные задачи; группы подставляются из назначений. */
export async function fetchCreatedTasks(assignments: Assignment[] = []): Promise<CreatedTask[]> {
  const rows = await apiFetch<TaskDto[]>('/tasks');

  return rows.map((row) => {
    const assignment = assignments.find((candidate) => candidate.id === row.assignment_id);

    return {
      taskId: row.id,
      title: row.title,
      taskType: row.task_type,
      assignmentId: row.assignment_id,
      groupCode: assignment?.groupCode ?? '—',
      disciplineCode: assignment?.disciplineCode ?? '—',
      baseXP: row.base_xp_computed,
      slotsCount: row.task_type === 'TEAM_PROJECT' ? row.team_size : 0,
      teamSize: row.team_size,
      deadlineAt: row.deadline_at,
      createdAt: row.created_at,
      status: row.status,
    };
  });
}

/** POST /api/tasks — сервер сам считает Base XP и создаёт слоты. */
export async function createTask(request: CreateTaskRequest): Promise<CreateTaskResponse> {
  const response = await apiFetch<CreateTaskResponseDto>('/tasks', {
    method: 'POST',
    body: {
      assignment_id: request.assignmentId,
      title: request.title,
      description_md: request.descriptionMD,
      task_type: request.taskType,
      requirements_count: request.requirementsCount,
      expected_hours: request.expectedHours,
      deadline_at: request.deadlineAt,
      speedrun_window_hours: request.speedrunWindowHours,
      team_size: request.teamSize,
    },
  });

  return {
    taskId: response.task_id,
    baseXP: response.base_xp_computed,
    status: 'PUBLISHED',
    slotsCount: response.slots_count ?? 0,
  };
}
