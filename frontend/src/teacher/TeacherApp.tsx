import { useCallback, useEffect, useRef, useState } from 'react';
import { AppShell } from '../components/AppShell';
import { useAuth } from '../core/auth';
import type { ToastData } from './types';
import { fetchAllSubmissions } from './api';
import { ProfileScreen } from './components/ProfileScreen';
import { TasksScreen } from './components/TasksScreen';
import { ReviewScreen } from './components/ReviewScreen';
import { Toast, cn } from './components/ui';
import { IconClipboard, IconInbox, IconUser } from './components/icons';

export type TeacherTab = 'profile' | 'tasks' | 'review';

const TABS: { id: TeacherTab; label: string; icon: typeof IconInbox }[] = [
  { id: 'profile', label: 'Профиль', icon: IconUser },
  { id: 'tasks', label: 'Задания', icon: IconClipboard },
  { id: 'review', label: 'Проверка', icon: IconInbox },
];

/** События, после которых кабинет перечитывает данные с сервера. */
const REFRESH_EVENTS = new Set([
  'submission.card.moved',
  'review.inbox.created',
  'submission.verdict.issued',
  'task.created',
]);

/** tabFromHash читает раздел из адресной строки: #tasks, #review. */
function tabFromHash(fallback: TeacherTab): TeacherTab {
  const raw = window.location.hash.replace(/^#\/?/, '').split('?')[0];
  const found = TABS.find((item) => item.id === raw);

  return found ? found.id : fallback;
}

/**
 * TeacherApp — кабинет преподавателя ПАРТА.
 *
 * Три раздела: карточка профиля, выдача заданий (список + форма) и проверка
 * работ учеников. Данные — только с backend; новые сдачи приходят по WebSocket
 * и перечитывают экран без ручного обновления.
 */
export default function TeacherApp() {
  const { events } = useAuth();

  const [tab, setTab] = useState<TeacherTab>(() => tabFromHash('profile'));
  const [reviewCount, setReviewCount] = useState(0);
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

  const refreshReviewCount = useCallback(() => {
    fetchAllSubmissions()
      .then((items) => {
        setReviewCount(items.filter((item) => item.status === 'REVIEW').length);
      })
      .catch(() => {
        // Счётчик в навигации — вспомогательный: сбой не ломает экран.
      });
  }, []);

  useEffect(() => {
    refreshReviewCount();

    const timer = window.setInterval(refreshReviewCount, 60_000);

    return () => window.clearInterval(timer);
  }, [refreshReviewCount, reloadSignal]);

  useEffect(() => {
    const latest = events[0];

    if (!latest || latest.event_id === lastEventId.current) {
      return;
    }

    lastEventId.current = latest.event_id;

    if (REFRESH_EVENTS.has(latest.event_type)) {
      setReloadSignal((value) => value + 1);
    }
  }, [events]);

  useEffect(() => {
    const onHashChange = () => setTab(tabFromHash('profile'));
    window.addEventListener('hashchange', onHashChange);

    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const navigate = useCallback((next: TeacherTab) => {
    setTab(next);
    window.location.hash = `/${next}`;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  return (
    <AppShell
      subtitle="Кабинет преподавателя"
      bottomNav={
        <nav className="fixed bottom-0 left-1/2 z-40 w-full max-w-md -translate-x-1/2 border-t border-line bg-card/95 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur">
          <ul className="flex gap-1 overflow-x-auto">
            {TABS.map((item) => {
              const Icon = item.icon;
              const active = tab === item.id;
              const badge = item.id === 'review' && reviewCount > 0 ? reviewCount : null;

              return (
                <li key={item.id} className="min-w-[64px] flex-1 shrink-0">
                  <button
                    type="button"
                    aria-current={active ? 'page' : undefined}
                    onClick={() => navigate(item.id)}
                    className={cn(
                      'relative flex w-full flex-col items-center gap-0.5 rounded-lg px-1 py-1.5 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand',
                      active
                        ? 'bg-brandSoft text-brandStrong'
                        : 'text-ink3 hover:bg-card hover:text-ink2',
                    )}
                  >
                    <span className="relative">
                      <Icon className="h-4 w-4" />
                      {badge !== null ? (
                        <span className="absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[9px] font-bold text-white">
                          {badge > 99 ? '99+' : badge}
                        </span>
                      ) : null}
                    </span>
                    <span className="text-[10px] font-medium leading-none">{item.label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>
      }
    >
      {tab === 'profile' ? <ProfileScreen onNavigate={navigate} /> : null}

      {tab === 'tasks' ? (
        <TasksScreen
          key={`tasks-${reloadSignal}`}
          notify={notify}
          reloadSignal={reloadSignal}
        />
      ) : null}

      {tab === 'review' ? (
        <ReviewScreen
          notify={notify}
          reloadSignal={reloadSignal}
          onReviewed={() => setReviewCount((count) => Math.max(0, count - 1))}
        />
      ) : null}

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
