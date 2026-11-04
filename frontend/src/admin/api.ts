// admin/api.ts — данные админки: пользователи, группы, назначения и задания.
// Задания создаёт только преподаватель, поэтому здесь нет createTask.

import {
  apiFetch,
  createGroup,
  createUser,
  deleteGroup,
  deleteUser,
  fetchAssignments,
  fetchGroups,
  fetchPeerReviews,
  fetchSubmissions,
  fetchTasks,
  fetchUsers,
} from '../core/api';
import type { Assignment, Group, PeerReview, Submission, Task, User } from '../core/types';

export {
  createGroup,
  createUser,
  deleteGroup,
  deleteUser,
  fetchAssignments,
  fetchGroups,
  fetchPeerReviews,
  fetchSubmissions,
  fetchTasks,
  fetchUsers,
};

export type { Assignment, Group, PeerReview, Submission, Task, User };

/**
 * PATCH /api/users/{id} — перенос ученика в другую группу.
 *
 * `group_id: null` убирает ученика из группы, число — добавляет/переводит.
 * Используется панелью групп для состава учебной группы.
 */
export function updateUserGroup(id: number, groupId: number | null): Promise<User> {
  return apiFetch<User>(`/users/${id}`, {
    method: 'PATCH',
    body: { group_id: groupId },
  });
}
