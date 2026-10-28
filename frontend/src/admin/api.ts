// admin/api.ts — управление пользователями и группами. Задачи создаёт только
// преподаватель, поэтому admin больше не импортирует task-эндпоинты.

import { apiFetch } from '../core/api';
import type { User } from '../core/types';

export {
  createGroup,
  createUser,
  deleteGroup,
  deleteUser,
  fetchGroups,
  fetchUsers,
} from '../core/api';

/**
 * PATCH /api/users/{id} — перенос студента в другую группу.
 *
 * `group_id: null` убирает студента из группы, число — добавляет/переводит.
 * Используется панелью групп для состава учебной группы.
 */
export function updateUserGroup(id: number, groupId: number | null): Promise<User> {
  return apiFetch<User>(`/users/${id}`, {
    method: 'PATCH',
    body: { group_id: groupId },
  });
}
