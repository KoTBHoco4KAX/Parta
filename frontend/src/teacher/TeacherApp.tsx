import { useCallback, useRef, useState } from 'react';
import type { ToastData } from './types';
import { MOCK_TEACHER } from './mock/data';
import { PeerReviewScreen } from './components/PeerReviewScreen';
import { ReviewInbox } from './components/ReviewInbox';
import { Badge, Toast, cn } from './components/ui';
import { IconInbox, IconUsers } from './components/icons';

type Tab = 'inbox' | 'peer';

/**
 * Корневой компонент кабинета преподавателя.
 *
 * Монтируется одной строкой в общий свитчер ролей:
 *   import TeacherApp from './teacher';
 *   … {role === 'teacher' ? <TeacherApp /> : null}
 *
 * Зависимостей от общего api-клиента нет: всё общение с данными идёт через
 * `mock/api.ts`, который повторяет контракты spec/04_API.md.
 */
export default function TeacherApp() {
  const [tab, setTab] = useState<Tab>('inbox');
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

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 antialiased">
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-x-0 top-0 -z-10 h-72 bg-gradient-to-b from-indigo-100/70 via-slate-100 to-slate-100"
      />

      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/85 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 pt-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-sm font-black text-white shadow-sm">
              П
            </div>
            <div className="leading-tight">
              <p className="text-sm font-bold tracking-tight text-slate-900">ПАРТА</p>
              <p className="text-[10px] uppercase tracking-wide text-slate-500">
                Кабинет преподавателя
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
                {MOCK_TEACHER.name
                  .split(' ')
                  .map((part) => part.charAt(0))
                  .join('')}
              </span>
              <div className="hidden leading-tight sm:block">
                <p className="text-[11px] font-semibold text-slate-900">
                  {MOCK_TEACHER.name}
                </p>
                <p className="text-[10px] text-slate-500">преподаватель</p>
              </div>
            </div>
          </div>
        </div>

        <div className="mx-auto max-w-3xl px-4 pb-2.5 pt-2">
          <nav
            className="flex gap-1 rounded-xl bg-slate-100 p-1"
            aria-label="Разделы кабинета"
            role="tablist"
          >
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'inbox'}
              data-testid="tab-inbox"
              onClick={() => setTab('inbox')}
              className={cn(
                'inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition',
                tab === 'inbox'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800',
              )}
            >
              <IconInbox className="h-4 w-4" />
              Инбокс ревью
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'peer'}
              data-testid="tab-peer"
              onClick={() => setTab('peer')}
              className={cn(
                'inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition',
                tab === 'peer'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800',
              )}
            >
              <IconUsers className="h-4 w-4" />
              P2P-ревью
            </button>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 pb-16 pt-4">
        {tab === 'inbox' ? <ReviewInbox notify={notify} /> : <PeerReviewScreen />}
      </main>

      <footer className="mx-auto max-w-3xl px-4 pb-10 text-[10px] leading-relaxed text-slate-400">
        Демо-режим: данные из мока, backend не подключён. XP, speedrun и on-time
        считаются по spec/03_MATH.md, переходы статусов — по spec/02_FSM.md.
        Оценки 2/3/4/5 в системе не выставляются.
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
