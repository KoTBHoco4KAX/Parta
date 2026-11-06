import { useCallback, useEffect, useRef, useState } from 'react';
import { AppShell } from '../components/AppShell';
import { useAuth } from '../core/auth';
import type { ToastData } from './types';
import { AdminOverview } from './components/AdminOverview';
import { UsersPanel } from './components/UsersPanel';
import { GroupsPanel } from './components/GroupsPanel';
import { AssignmentsPanel } from './components/AssignmentsPanel';
import { Toast } from './components/ui';
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
      nav={TABS.map((item) => {
        const Icon = item.icon;

        return {
          id: item.id,
          label: item.label,
          icon: <Icon className="h-4 w-4" />,
          active: tab === item.id,
          onClick: () => {
            setTab(item.id);
            window.scrollTo({ top: 0, behavior: 'smooth' });
          },
        };
      })}
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

      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center px-4 pb-20 md:bottom-6 md:left-auto md:right-6 md:block md:w-80 md:pb-0">
        <div className="pointer-events-auto flex w-full flex-col gap-2">
          {toasts.map((toast) => (
            <Toast key={toast.id} toast={toast} onDismiss={() => dismissToast(toast.id)} />
          ))}
        </div>
      </div>
    </AppShell>
  );
}
