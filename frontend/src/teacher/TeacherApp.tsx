import { useCallback, useRef, useState } from 'react';
import type { ToastData } from './types';
import { useAuth } from '../core/auth';
import { PeerReviewScreen } from './components/PeerReviewScreen';
import { ReviewInbox } from './components/ReviewInbox';
import { Badge, Button, Toast, cn } from './components/ui';
import { IconInbox, IconUsers } from './components/icons';

type Tab = 'inbox' | 'peer';

/**
 * Корневой компонент кабинета преподавателя.
 *
 * Монтируется свитчером ролей в App.tsx:
 *   {role === 'teacher' ? <TeacherApp /> : null}
 * Данные — только реальные REST-запросы через teacher/api.ts.
 */
export default function TeacherApp() {
  const { user, logout } = useAuth();
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

  const initials = (user?.display_name ?? 'П')
    .split(' ')
    .map((part) => part.charAt(0))
    .join('')
    .slice(0, 2);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 antialiased">
      <header className="sticky top-0 z-30 border-b border-slate-800/80 bg-slate-950/90 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 pt-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500 text-sm font-black text-slate-950">
              П
            </div>
            <div className="leading-tight">
              <p className="text-sm font-bold tracking-tight text-slate-100">ПАРТА</p>
              <p className="text-[10px] uppercase tracking-wide text-slate-500">
                Кабинет преподавателя
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Badge tone="emerald" className="hidden sm:inline-flex">
              преподаватель
            </Badge>
            <div className="flex items-center gap-2 rounded-full border border-slate-800 bg-slate-900 py-1 pl-1 pr-2.5">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-800 text-[10px] font-bold text-slate-100">
                {initials}
              </span>
              <div className="hidden leading-tight sm:block">
                <p className="text-[11px] font-semibold text-slate-100">
                  {user?.display_name ?? 'Преподаватель'}
                </p>
                <p className="text-[10px] text-slate-500">{user?.external_id}</p>
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={logout}>
              Выход
            </Button>
          </div>
        </div>

        <div className="mx-auto max-w-3xl px-4 pb-2.5 pt-2">
          <nav
            className="flex gap-1 rounded-xl bg-slate-900 p-1"
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
                  ? 'bg-slate-800 text-slate-100 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200',
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
                  ? 'bg-slate-800 text-slate-100 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200',
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

      <footer className="mx-auto max-w-3xl px-4 pb-10 text-[10px] leading-relaxed text-slate-500">
        XP, speedrun и on-time считаются сервером по spec/03_MATH.md, переходы
        статусов — по spec/02_FSM.md. Оценки 2/3/4/5 в системе не выставляются.
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
