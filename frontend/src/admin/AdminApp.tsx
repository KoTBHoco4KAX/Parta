import { useCallback, useRef, useState } from 'react';
import type { ToastData } from './types';
import { UsersPanel } from './components/UsersPanel';
import { GroupsPanel } from './components/GroupsPanel';
import { Toast, cn } from './components/ui';
import { IconLayers, IconUsers } from './components/icons';
import { AppShell } from '../components/AppShell';

type Tab = 'users' | 'groups';

const TABS: { id: Tab; label: string; icon: typeof IconUsers }[] = [
  { id: 'users', label: 'Пользователи', icon: IconUsers },
  { id: 'groups', label: 'Группы', icon: IconLayers },
];

/**
 * Админка: только пользователи и группы.
 * Создание задач живёт в кабинете преподавателя (роль teacher).
 */
export default function AdminApp() {
  const [tab, setTab] = useState<Tab>('users');
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
    <AppShell subtitle="Админка">
      <nav className="mb-4 flex gap-1 rounded-xl bg-slate-900 p-1" aria-label="Разделы админки">
        {TABS.map((item) => {
          const Icon = item.icon;

          return (
            <button
              key={item.id}
              type="button"
              aria-pressed={tab === item.id}
              onClick={() => setTab(item.id)}
              className={cn(
                'inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-[11px] font-semibold transition',
                tab === item.id
                  ? 'bg-slate-800 text-slate-100 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200',
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </button>
          );
        })}
      </nav>

      {tab === 'users' ? <UsersPanel notify={notify} /> : <GroupsPanel notify={notify} />}

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
    </AppShell>
  );
}
