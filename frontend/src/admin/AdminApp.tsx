import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  Assignment,
  CreatedTask,
  ToastData,
} from './types';
import { MOCK_ADMIN } from './mock/data';
import { pluralAssignments } from './lib/format';
import {
  fetchAssignments,
  fetchCreatedTasks,
  isMockApiError,
} from './mock/api';
import { TaskForm } from './components/TaskForm';
import { CreatedTasks } from './components/CreatedTasks';
import { Badge, Button, Skeleton, Toast } from './components/ui';
import { IconAlert, IconInfo, IconRefresh, IconUsers } from './components/icons';

/**
 * Корневой компонент админки.
 *
 * Монтируется в свитчер ролей:
 *   import AdminApp from './admin';
 *   … {role === 'admin' ? <AdminApp /> : null}
 */
export default function AdminApp() {
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

    Promise.all([fetchAssignments(), fetchCreatedTasks()])
      .then(([nextAssignments, nextTasks]) => {
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
          isMockApiError(cause)
            ? cause.message
            : 'Не удалось загрузить данные админки.',
        );
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const reloadTasks = useCallback(async () => {
    try {
      const nextTasks = await fetchCreatedTasks();
      setTasks(nextTasks);
    } catch (cause) {
      notify({
        tone: 'error',
        title: 'Список задач не обновился',
        description: isMockApiError(cause)
          ? cause.message
          : 'Задача создана, но список не перечитался.',
      });
    }
  }, [notify]);

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 antialiased">
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-x-0 top-0 -z-10 h-72 bg-gradient-to-b from-indigo-100/70 via-slate-100 to-slate-100"
      />

      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/85 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-sm font-black text-white shadow-sm">
              П
            </div>
            <div className="leading-tight">
              <p className="text-sm font-bold tracking-tight text-slate-900">ПАРТА</p>
              <p className="text-[10px] uppercase tracking-wide text-slate-500">
                Админка
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Badge tone="amber" className="hidden sm:inline-flex">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
              демо
            </Badge>
            <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white py-1 pl-1 pr-2.5 shadow-sm sm:pr-3">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-900 text-[10px] font-bold text-white">
                {MOCK_ADMIN.name
                  .split(' ')
                  .map((part) => part.charAt(0))
                  .join('')}
              </span>
              <div className="hidden leading-tight sm:block">
                <p className="text-[11px] font-semibold text-slate-900">
                  {MOCK_ADMIN.name}
                </p>
                <p className="text-[10px] text-slate-500">администратор</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 pb-16 pt-4">
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <h1 className="text-lg font-bold tracking-tight text-slate-900">
              Создание задач
            </h1>
            <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
              Публикация в группы. Base XP считает сервер — поля для ручного ввода XP
              нет и не будет.
            </p>
          </div>
          <Badge tone="indigo" className="shrink-0">
            <IconUsers className="h-3 w-3" />
            {assignments.length} {pluralAssignments(assignments.length)}
          </Badge>
        </div>

        {error ? (
          <div
            role="alert"
            className="mb-3 flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800"
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
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="mt-4 h-10 w-full" />
            <Skeleton className="mt-3 h-10 w-full" />
            <Skeleton className="mt-3 h-20 w-full" />
            <Skeleton className="mt-3 h-10 w-2/3" />
          </div>
        ) : (
          <TaskForm
            assignments={assignments}
            onCreated={reloadTasks}
            notify={notify}
          />
        )}

        <div className="mt-4">
          <CreatedTasks tasks={tasks} loading={loading} />
        </div>

        <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <IconInfo className="h-4 w-4 text-slate-400" />
            Что важно помнить
          </h2>
          <ul className="mt-2 space-y-1.5 text-[11px] leading-relaxed text-slate-600">
            <li>
              · Оценок 2/3/4/5 нет: преподаватель выносит только вердикт ACCEPT или
              REJECT.
            </li>
            <li>
              · XP — внутренняя валюта прогресса. Он не двигает официальные дедлайны
              и не покупает зачёты.
            </li>
            <li>
              · TEAM_PROJECT создаёт ровно team_size ролевых слотов с независимой
              приёмкой.
            </li>
            <li>
              · Менять можно только R, H, task_type, deadline_at,
              speedrun_window_hours и team_size.
            </li>
          </ul>
        </section>
      </main>

      <footer className="mx-auto max-w-4xl px-4 pb-10 text-[10px] leading-relaxed text-slate-400">
        Демо-режим: данные из мока, backend не подключён. Контракт — spec/04_API.md,
        формула XP — spec/03_MATH.md, ролевые слоты — spec/00_ARCHITECTURE.md §IV.
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
