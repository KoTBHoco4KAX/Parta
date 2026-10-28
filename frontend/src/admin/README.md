# Админка — `frontend/src/admin`

Самодостаточный модуль роли `admin`. Управляет только пользователями и группами —
создание задач живёт в кабинете преподавателя (`frontend/src/teacher`).
Визуальные правила — в `DESIGN_SPEC.md`, каркас — общий `AppShell` (`max-w-md`,
тёмный фон по бокам, выход в шапке).

## Экран

| Блок | Файл | Что делает |
|---|---|---|
| Пользователи | `components/UsersPanel.tsx` | список, создание (роль, группа) и удаление пользователей |
| Группы | `components/GroupsPanel.tsx` | список, создание и удаление учебных групп |

Корень — `AdminApp.tsx` (табы «Пользователи» / «Группы», тосты, ошибки).

## Как подключить

```tsx
import AdminApp from './admin';

// внутри свитчера ролей
{role === 'admin' ? <AdminApp /> : null}
```

## Данные и интеграция

- `api.ts` реэкспортирует только `fetchUsers` / `createUser` / `deleteUser` и
  `fetchGroups` / `createGroup` / `deleteGroup` из `core/api`.
- Ошибки — общий `ApiError` (`code`, `status`).
- Студент создаётся обязательно с группой: backend проверяет её существование и
  сразу заводит ему карточки TODO по опубликованным заданиям группы.

## Проверка

```bash
cd frontend
npx tsc --noEmit
npm run build
```
