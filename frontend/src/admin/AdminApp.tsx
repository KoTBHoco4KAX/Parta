import { useCallback, useEffect, useRef, useState } from 'react';
import { AppShell } from '../components/AppShell';
import { useAuth } from '../core/auth';
import type { ToastData } from './types';
import { AdminOverview } from './components/AdminOverview';
import { UsersPanel } from './components/UsersPanel';
import { GroupsPanel } from './components/GroupsPanel';
import { AssignmentsPanel } from './components/AssignmentsPanel';
import { Toast, cn } from './components/ui';
import {
  IconChart,
  IconClipboard,
  IconLayers,
  IconUsers,
} from '../teacher/components/icons';

export type AdminTab = 'overview' | 'users' | 'groups' | 'assignments';

const TABS: { id: AdminTab; label: string; icon: typeof IconChart }[] = [
  { id: 'overview', label: 'Обзор', icon: IconChart },
  { id: 'users', label: 'Люди', icon: IconUsers },
  { id: 'groups', label: 'Группы', icon: IconLayers },
  { id: 'assignments', label: 'Задания', icon: IconClipboard },
];

/** tabFromHash читает раздел админки из адресной строки. */
function tabFromHash(fallback: AdminTab): AdminTab {
  const raw = window.location.hash.replace(/^#\/?/, '').split('?')[0];
  const found = TABS.find((item) => item.id === raw);

  return found ? found.id : fallback;
}

/**
 * AdminApp — админка контура ПАРТА.
 *
 * Четыре раздела: состояние контура, люди, потоки и выдачи. Админ управляет
 * пользователями и составом групп; задания и назначения — read-only, их
 * создаёт преподаватель.
 */
export default function AdminApp() {
  const { user, events } = useAuth();

  const [tab, setTab] = useState<AdminTab>(() => tabFromHash('overview'));
  const [reloadSignal, setReloadSignal] = useState(0);
  const [toasts, setToasts] = useState<ToastData[]>([]);

  const nextToastId = useRef(1);
  const lastEventId = useRef<string | null>(null);

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
    const onHashChange = () => setTab(tabFromHash('overview'));
    window.addEventListener('hashchange', onHashChange);

    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  useEffect(() => {
    const latest = events[0];

    if (!latest || latest.event_id === lastEventId.current) {
      return;
    }

    lastEventId.current = latest.event_id;

    if (
      latest.event_type === 'submission.card.moved' ||
      latest.event_type === 'submission.verdict.issued' ||
      latest.event_type === 'review.inbox.created'
    ) {
      setReloadSignal((value) => value + 1);
    }
  }, [events]);

  return (
    <AppShell
      subtitle="Админка"
      bottomNav={
        <nav className="fixed bottom-0 left-1/2 z-40 w-full max-w-md -translate-x-1/2 border-t border-line bg-card/95 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur">
          <ul className="flex gap-1 overflow-x-auto">
            {TABS.map((item) => {
              const Icon = item.icon;
              const active = tab === item.id;

              return (
                <li key={item.id} className="min-w-[72px] flex-1 shrink-0">
                  <button
                    type="button"
                    aria-current={active ? 'page' : undefined}
                    onClick={() => {
                      setTab(item.id);
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    className={cn(
                      'flex w-full flex-col items-center gap-0.5 rounded-lg px-1 py-1.5 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand',
                      active
                        ? 'bg-brandSoft text-brandStrong'
                        : 'text-ink3 hover:bg-card hover:text-ink2',
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    <span className="text-[10px] font-medium leading-none">{item.label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>
      }
    >
      {tab === 'overview' ? (
        <AdminOverview onNavigate={setTab} reloadSignal={reloadSignal} />
      ) : null}

      {tab === 'users' ? (
        <UsersPanel
          notify={notify}
          currentUserId={user?.id ?? null}
          reloadSignal={reloadSignal}
        />
      ) : null}

      {tab === 'groups' ? <GroupsPanel notify={notify} reloadSignal={reloadSignal} /> : null}

      {tab === 'assignments' ? <AssignmentsPanel reloadSignal={reloadSignal} /> : null}

      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center px-4 pb-20">
        <div className="pointer-events-auto flex w-full max-w-md flex-col gap-2">
          {toasts.map((toast) => (
            <Toast key={toast.id} toast={toast} onDismiss={() => dismissToast(toast.id)} />
          ))}
        </div>
      </div>
    </AppShell>
  );
}
