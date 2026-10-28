# Админка — `frontend/src/admin`

Самодостаточный модуль роли `admin`. Управляет только пользователями и группами —
создание задач живёт в кабинете преподавателя (`frontend/src/teacher`).
Визуальные правила — в `DESIGN_SPEC.md`, каркас — общий `AppShell` (`max-w-md`,
тёмный фон по бокам, выход в шапке).

## Экран

| Блок | Файл | Что делает |
|---|---|---|
| Пользователи | `components/UsersPanel.tsx` | список, создание (роль, группа) и удаление пользователей |
| Группы | `components/GroupsPanel.tsx` | список, создание, удаление групп и счётчик студентов |
| Состав группы | `components/GroupMembersModal.tsx` | добавление/удаление студентов, создание нового студента сразу в группе |

Корень — `AdminApp.tsx` (табы «Пользователи» / «Группы», тосты, ошибки).

## Как подключить

```tsx
import AdminApp from './admin';

// внутри свитчера ролей
{role === 'admin' ? <AdminApp /> : null}
```

## Данные и интеграция

- `api.ts` реэкспортирует `fetchUsers` / `createUser` / `deleteUser` и
  `fetchGroups` / `createGroup` / `deleteGroup` из `core/api`, а также добавляет
  `updateUserGroup`.
- `updateUserGroup(id, groupId)` — `PATCH /api/users/{id}` с телом
  `{group_id}`. `group_id = null` убирает студента из группы; число добавляет или
  переводит его в другую группу. После каждой мутации список перечитывается.
- Нового студента можно завести прямо из модалки группы:
  `POST /api/users` с `{external_id, display_name, role: "student", group_id}`.
- Ошибки — общий `ApiError` (`code`, `status`). Если `PATCH /api/users/{id}` ещё не
  развёрнут, модалка показывает inline-ошибку с кодом 404.
- Студент создаётся обязательно с группой: backend проверяет её существование и
  сразу заводит ему карточки TODO по опубликованным заданиям группы.

## Проверка

```bash
cd frontend
npx tsc --noEmit
npm run build
```
