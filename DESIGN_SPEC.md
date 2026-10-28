# DESIGN_SPEC — визуальные и API-правила ПАРТА

Документ обязателен для людей и ИИ-агентов, которые добавляют экраны в
`frontend/src`. Его цель — не дать проекту снова расползтись на три несовместимых
дизайна и мок-данные.

## 1. Базовые компоненты

Любой интерактивный элемент действия создаётся только из
`frontend/src/components/`:

### Button (`src/components/Button.tsx`)

```tsx
import { Button } from '../../components/Button';

<Button onClick={save} loading={saving}>Сохранить</Button>
<Button variant="secondary" size="sm">Отмена</Button>
```

| Prop | Значения | Назначение |
| --- | --- | --- |
| `variant` | `primary` (по умолчанию), `secondary`, `ghost`, `outline`, `danger`, `accept`, `reject` | Иерархия действия |
| `size` | `sm`, `md` (по умолчанию), `lg` | Плотность |
| `loading` | `boolean` | Спиннер + `disabled` + `aria-busy` |
| `block` | `boolean` | Растянуть на всю ширину |
| `type` | `button` / `submit` | По умолчанию `button` |

Запрещено:

- писать `<button className="bg-blue-600 ...">` для действий;
- заводить второй `Button` в `student/`, `teacher/`, `admin/` (они реэкспортируют
  общий);
- использовать `alert()` для бизнес-ошибок — только inline-сообщения и тосты.

### Modal (`src/components/Modal.tsx`)

```tsx
import { Modal } from '../../components/Modal';

<Modal
  open={open}
  onClose={close}
  title="Сдать работу"
  subtitle={taskTitle}
  size="md" // md | lg
  footer={<Button onClick={submit}>Отправить</Button>}
>
  …
</Modal>
```

Modal сам отвечает за:

- затемнение `bg-slate-950/70`;
- закрытие по `Escape` и клику по фону;
- `role="dialog"`, `aria-modal`, блокировку скролла body;
- мобильный bottom-sheet (`items-end`) и центрирование на `sm+`;
- тёмную панель `bg-slate-900 border-slate-800`.

Самописные оверлеи (`fixed inset-0 bg-black …`) запрещены.

### Прочие примитивы

`Badge`, `Skeleton`, `EmptyState`, `Toast`, `cn` живут в
`teacher/components/ui.tsx` и `admin/components/ui.tsx` и обязаны использовать
только классы из палитры ниже. Для новых общих примитивов — выносить в
`src/components/`.

## 2. Палитра и классы Tailwind

Единая тема — **тёмная**, как в главном меню (`App.tsx`).

| Роль | Классы |
| --- | --- |
| Фон приложения | `bg-slate-950` |
| Панель / карточка | `bg-slate-900`, `border border-slate-800` |
| Углублённая поверхность | `bg-slate-900/60`, `bg-slate-950` |
| Текст основной | `text-slate-100` |
| Текст вторичный | `text-slate-400` |
| Текст третичный | `text-slate-500` |
| Акцент / успех | `emerald-400/500` (`bg-emerald-500`, `text-emerald-300`) |
| Опасность | `rose-500`, `text-rose-300` |
| Предупреждение | `amber-500`, `text-amber-300` |
| Информация | `sky-500`, `text-sky-300` |
| Границы | `border-slate-800`, реже `border-slate-700` |
| Радиус | `rounded-lg` для контролов, `rounded-xl`/`rounded-2xl` для панелей |
| Фокус | `focus-visible:ring-2 focus-visible:ring-emerald-400` |
| Тени | `shadow-sm` допустим; не плодить `shadow-2xl` |

Правила:

1. Никаких светлых подложек (`bg-white`, `bg-slate-50`, `bg-slate-100`) и
   светлого текста на них.
2. Никаких «чужих» акцентов: `indigo`, `violet`, `blue` как основной цвет
   запрещены. Допустимы только как смысловые бейджи на тёмной подложке
   (`bg-violet-500/10 text-violet-300`).
3. Прозрачность акцентов — только через `/10`, `/15`, `/20`, `/30`.
4. Нельзя смешивать в одном экране `rounded-md`, `rounded-lg`, `rounded-2xl`
   произвольно: контролы — `rounded-lg`, панели — `rounded-2xl`.
5. Отступы кратны 4: `p-3`, `p-4`, `gap-2`, `space-y-3`. Не использовать
   произвольные `p-[13px]`.
6. Сетки: `grid-cols-1` на мобильном, `sm:grid-cols-2`, `lg:grid-cols-4`.

## 3. Адаптивность

- Приложение мобильное: shell — `max-w-md`, контент — одна колонка.
- Нижняя навигация — `fixed bottom-0`, горизонтальный скролл
  (`flex overflow-x-auto`), `env(safe-area-inset-bottom)`; пункты не переносятся
  на второй ряд.
- Шапка — `sticky top-0`, содержит имя, роль, статус соединения и `Выход`.
- Кнопки и тапы — не меньше 36–40 px по высоте; длинные заголовки —
  `truncate`/`line-clamp-2`.
- Горизонтальный скролл страницы запрещён: контент обязан влезать в вертикальный
  вьюпорт.

## 4. Паттерн работы с API

Единственный вход — `apiFetch` из `src/core/api.ts`. Он сам подставляет JWT из
`localStorage` (`parta.auth`) и разбирает конверт `{ error, code }`.

```tsx
import { ApiError, apiFetch } from '../../core/api';
import type { Submission } from '../../core/types';

async function loadInbox() {
  try {
    setLoading(true);
    const items = await apiFetch<Submission[]>('/submissions?status=REVIEW');
    setItems(items);
  } catch (cause) {
    setError(cause instanceof ApiError ? cause.message : 'Не удалось загрузить инбокс');
  } finally {
    setLoading(false);
  }
}
```

Правила:

1. **Никаких моков.** Папки `mock/`, `mocks/` и константы `MOCK_*` запрещены.
   Данные — только с backend.
2. Типы ответов — в `src/core/types.ts` (snake_case, как в JSON backend). Не
   придумывать параллельные DTO в экранах; маппинг в UI-модели — в
   `*/api.ts`.
3. Для частых запросов есть типизированные обёртки:
   `fetchTasks`, `fetchSubmissions`, `fetchWagers`, `fetchPeerReviews`,
   `fetchAssignments`, `createSubmissionCard`, `moveSubmission`, `issueVerdict`,
   `buyStreakFreezes`, `placeWager`, `createTaskReal`.
4. Ошибка всегда `ApiError` (`status`, `code`, `message`). Показывать
   `cause.message`, а не сырой `err.toString()`. Сетевой сбой (не `ApiError`) —
   общий текст «Проверьте соединение».
5. Каждый экран обязан иметь три состояния: `loading`, `error`, `empty`.
   Ошибка — `role="alert"`, кнопка «Повторить».
6. После мутации (POST/PATCH) перечитывать список с сервера, а не править
   локальную копию «на глаз».
7. Токен не передаётся вручную через props — `apiFetch` берёт его из сессии.
   Явный `token: null` нужен только публичным запросам (dev-login).

### Read-эндпоинты backend

| Метод | Путь | Роль | Что отдаёт |
| --- | --- | --- | --- |
| GET | `/api/tasks` | student / teacher / admin | Задания: студент — своей группы, преподаватель — своих назначений, админ — все |
| GET | `/api/submissions?status=REVIEW` | student / teacher / admin | Карточки с `task_title`, `group_code`, `student_name`, `attempt`, `revision_log` |
| GET | `/api/wagers` | student | Пари студента |
| GET | `/api/peer-reviews` | teacher / admin | P2P-сессии с чек-листом |
| GET | `/api/assignments` | teacher / admin | Пары «группа + дисциплина + преподаватель» |

## 5. Чек-лист перед коммитом

- [ ] Действия — `<Button>`, модалки — `<Modal>` из `src/components/`.
- [ ] Нет `bg-white`, `bg-slate-50`, `indigo-600`, самописных модалок.
- [ ] Нет `mock/`, `mocks/`, `MOCK_*`, `setTimeout`-имитации сети.
- [ ] Все запросы — через `apiFetch`/обёртки, ошибки — `ApiError`.
- [ ] Есть loading / error / empty.
- [ ] Нижняя навигация не ломается на 360 px; нет горизонтального скролла.
- [ ] `npm run build` и `go test ./...` проходят.
