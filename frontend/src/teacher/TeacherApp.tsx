import { useCallback, useEffect, useRef, useState } from 'react';
import { AppShell } from '../components/AppShell';
import { useAuth } from '../core/auth';
import type { ToastData } from './types';
import { fetchAllSubmissions } from './api';
import { GroupsScreen } from './components/GroupsScreen';
import { TaskBankScreen } from './components/TaskBankScreen';
import { ProfileScreen } from './components/ProfileScreen';
import { TasksScreen } from './components/TasksScreen';
import { ReviewScreen } from './components/ReviewScreen';
import { Toast } from './components/ui';
import { IconBook, IconClipboard, IconInbox, IconUser, IconUsers } from './components/icons';

export type TeacherTab = 'profile' | 'groups' | 'tasks' | 'bank' | 'review';

const TABS: { id: TeacherTab; label: string; icon: typeof IconInbox }[] = [
  { id: 'profile', label: 'Профиль', icon: IconUser },
  { id: 'groups', label: 'Группы', icon: IconUsers },
  { id: 'tasks', label: 'Задания', icon: IconClipboard },
  { id: 'review', label: 'Проверка', icon: IconInbox },
  { id: 'bank', label: 'База', icon: IconBook },
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
 * Пять разделов: профиль, группы, выдача заданий, база заготовок и проверка.
 * Данные — только с backend; новые сдачи приходят по WebSocket.
 */
export default function TeacherApp() {
  const { events, subscribe } = useAuth();

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
  }, [refreshReviewCount]);

  // Счётчик на вкладке «Проверка» обновляется сразу по WS, а не только по
  // таймеру: новая сдача приходит в комнату teacher:{id}.
  useEffect(
    () =>
      subscribe((event) => {
        if (REFRESH_EVENTS.has(event.event_type)) {
          refreshReviewCount();
        }
      }),
    [refreshReviewCount, subscribe],
  );

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
      nav={TABS.map((item) => {
        const Icon = item.icon;

        return {
          id: item.id,
          label: item.label,
          icon: <Icon className="h-4 w-4" />,
          active: tab === item.id,
          badge: item.id === 'review' ? reviewCount : undefined,
          onClick: () => navigate(item.id),
        };
      })}
    >
      {tab === 'profile' ? <ProfileScreen onNavigate={navigate} /> : null}

      {tab === 'groups' ? <GroupsScreen notify={notify} /> : null}

      {tab === 'bank' ? <TaskBankScreen notify={notify} /> : null}

      {tab === 'tasks' ? (
        <TasksScreen
          key={`tasks-${reloadSignal}`}
          notify={notify}
          reloadSignal={reloadSignal}
        />
      ) : null}

      {tab === 'review' ? (
        <ReviewScreen notify={notify} onReviewed={refreshReviewCount} />
      ) : null}

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
