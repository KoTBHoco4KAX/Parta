// admin/api.ts — управление пользователями и группами. Задачи создаёт только
// преподаватель, поэтому admin больше не импортирует task-эндпоинты.

export {
  createGroup,
  createUser,
  deleteGroup,
  deleteUser,
  fetchGroups,
  fetchUsers,
} from '../core/api';
