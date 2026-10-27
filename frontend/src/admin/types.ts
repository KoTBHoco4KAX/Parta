/**
 * DTO админки создания задач.
 *
 * Зеркало `POST /api/tasks` из spec/04_API.md и CHECK-ов `tasks` из
 * spec/01_SCHEMA.sql. XP в запросе отсутствует намеренно: Base XP считает
 * сервер (spec/03_MATH.md §1), ручной ввод запрещён.
 */

/** Типы заданий из CHECK `tasks.task_type`. */
export type TaskType = 'TEST' | 'ESSAY' | 'LAB_CODE' | 'TEAM_PROJECT';

/** Назначение преподавателя: пара «группа + дисциплина». */
export interface Assignment {
  id: number;
  groupCode: string;
  groupTitle: string;
  disciplineCode: string;
  disciplineTitle: string;
  teacherName: string;
}

/** Тело `POST /api/tasks`. */
export interface CreateTaskRequest {
  assignmentId: number;
  title: string;
  descriptionMD: string;
  taskType: TaskType;
  requirementsCount: number;
  expectedHours: number;
  deadlineAt: string;
  speedrunWindowHours: number;
  teamSize: number;
}

/** Ответ `POST /api/tasks` (backend возвращает ещё `slots_count`). */
export interface CreateTaskResponse {
  taskId: number;
  baseXP: number;
  status: 'PUBLISHED';
  slotsCount: number;
}

/** Задача в списке «уже созданные» (read-модель админки). */
export interface CreatedTask {
  taskId: number;
  title: string;
  taskType: TaskType;
  assignmentId: number;
  groupCode: string;
  disciplineCode: string;
  baseXP: number;
  slotsCount: number;
  teamSize: number;
  deadlineAt: string;
  createdAt: string;
  status: string;
}

/** Роль ролевого слота командного проекта (spec/00_ARCHITECTURE.md §IV.1). */
export interface TeamSlotRole {
  code: string;
  title: string;
}

/** Тост админки. */
export interface ToastData {
  id: number;
  tone: 'success' | 'error' | 'info';
  title: string;
  description?: string;
}

/** Ошибки полей формы. */
export type FieldErrors = Record<string, string>;
