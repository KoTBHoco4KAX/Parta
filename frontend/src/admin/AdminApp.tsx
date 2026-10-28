import { useCallback, useEffect, useRef, useState } from 'react';
import type { Assignment, CreatedTask, ToastData } from './types';
import { useAuth } from '../core/auth';
import { ApiError } from '../core/api';
import { pluralAssignments } from './lib/format';
import { fetchAssignments, fetchCreatedTasks } from './api';
import { TaskForm } from './components/TaskForm';
import { CreatedTasks } from './components/CreatedTasks';
import { Badge, Button, Skeleton, Toast } from './components/ui';
import { IconAlert, IconInfo, IconRefresh, IconUsers } from './components/icons';

/**
 * Корневой компонент админки.
 *
 * Монтируется свитчером ролей в App.tsx:
 *   {role === 'admin' ? <AdminApp /> : null}
 * Данные — GET /api/assignments и GET /api/tasks.
 */
export default function AdminApp() {
  const { user, logout } = useAuth();
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [tasks, setTasks] = useState<CreatedTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [toasts, setToasts] = useState<ToastData[]>([]);
  const nextToastId = useRef(1);

  const dismissToast = useCallback((id: number) => {
    setToasts((previous) => previous.filter((toast) => toast.id !== id));
  }, []);

  const notify = useCallback((toast: Omit<ToastData, 'id'>) => {
    const id = nextToastId.current;
    nextToastId.current += 1;

    setToasts((previous) => [...previous, { ...toast, id }]);

    window.setTimeout(() => {
      setToasts((previous) => previous.filter((candidate) => candidate.id !== id));
    }, 6_000);
  }, []);

  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    setError(null);

    fetchAssignments()
      .then(async (nextAssignments) => {
        const nextTasks = await fetchCreatedTasks(nextAssignments);
        if (cancelled) {
          return;
        }

        setAssignments(nextAssignments);
        setTasks(nextTasks);
        setLoading(false);
      })
      .catch((cause: unknown) => {
        if (cancelled) {
          return;
        }

        setError(
          cause instanceof ApiError ? cause.message : 'Не удалось загрузить данные админки.',
        );
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const initials = (user?.display_name ?? 'А')
    .split(' ')
    .map((part) => part.charAt(0))
    .join('')
    .slice(0, 2);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 antialiased">
      <header className="sticky top-0 z-30 border-b border-slate-800/80 bg-slate-950/90 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500 text-sm font-black text-slate-950">
              П
            </div>
            <div className="leading-tight">
              <p className="text-sm font-bold tracking-tight text-slate-100">ПАРТА</p>
              <p className="text-[10px] uppercase tracking-wide text-slate-500">Админка</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Badge tone="emerald" className="hidden sm:inline-flex">
              администратор
            </Badge>
            <div className="flex items-center gap-2 rounded-full border border-slate-800 bg-slate-900 py-1 pl-1 pr-2.5">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-800 text-[10px] font-bold text-slate-100">
                {initials}
              </span>
              <div className="hidden leading-tight sm:block">
                <p className="text-[11px] font-semibold text-slate-100">
                  {user?.display_name ?? 'Администратор'}
                </p>
                <p className="text-[10px] text-slate-500">{user?.external_id}</p>
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={logout}>
              Выход
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 pb-16 pt-4">
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <h1 className="text-lg font-bold tracking-tight text-slate-100">Создание задач</h1>
            <p className="mt-0.5 text-xs leading-relaxed text-slate-400">
              Публикация в группы. Base XP считает сервер — поля для ручного ввода XP нет.
            </p>
          </div>
          <Badge tone="emerald" className="shrink-0">
            <IconUsers className="h-3 w-3" />
            {assignments.length} {pluralAssignments(assignments.length)}
          </Badge>
        </div>

        {error ? (
          <div
            role="alert"
            className="mb-3 flex items-start gap-2 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-200"
          >
            <IconAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="flex-1">
              <p className="font-semibold">Админка не загрузилась</p>
              <p className="mt-0.5">{error}</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={() => setRefreshKey((key) => key + 1)}
              >
                <IconRefresh className="h-4 w-4" />
                Повторить
              </Button>
            </div>
          </div>
        ) : null}

        {loading && assignments.length === 0 ? (
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="mt-4 h-10 w-full" />
            <Skeleton className="mt-3 h-10 w-full" />
            <Skeleton className="mt-3 h-20 w-full" />
            <Skeleton className="mt-3 h-10 w-2/3" />
          </div>
        ) : (
          <TaskForm
            assignments={assignments}
            onCreated={() => setRefreshKey((key) => key + 1)}
            notify={notify}
          />
        )}

        <div className="mt-4">
          <CreatedTasks tasks={tasks} loading={loading} />
        </div>

        <section className="mt-4 rounded-2xl border border-slate-800 bg-slate-900 p-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-100">
            <IconInfo className="h-4 w-4 text-slate-500" />
            Что важно помнить
          </h2>
          <ul className="mt-2 space-y-1.5 text-[11px] leading-relaxed text-slate-400">
            <li>· Оценок 2/3/4/5 нет: преподаватель выносит только вердикт ACCEPT или REJECT.</li>
            <li>· XP — внутренняя валюта прогресса, он не покупает зачёты.</li>
            <li>· TEAM_PROJECT создаёт ровно team_size ролевых слотов с независимой приёмкой.</li>
            <li>· Менять можно только R, H, task_type, deadline_at, speedrun_window_hours и team_size.</li>
          </ul>
        </section>
      </main>

      <footer className="mx-auto max-w-4xl px-4 pb-10 text-[10px] leading-relaxed text-slate-600">
        Данные — реальные REST-запросы. Контракт — spec/04_API.md, формула XP —
        spec/03_MATH.md, ролевые слоты — spec/00_ARCHITECTURE.md §IV.
      </footer>

      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center px-4 pb-4">
        <div className="pointer-events-auto flex w-full max-w-md flex-col gap-2">
          {toasts.map((toast) => (
            <Toast
              key={toast.id}
              toast={toast}
              onDismiss={() => dismissToast(toast.id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
