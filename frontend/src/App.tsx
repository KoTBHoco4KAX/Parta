import { useCallback, useEffect, useState } from 'react';
import { AuthProvider, useAuth } from './core/auth';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { InboxPage } from './pages/InboxPage';
import { EconomyPage } from './pages/EconomyPage';
import KanbanPage from './student/pages/KanbanPage';
import GamificationPage from './student/pages/GamificationPage';
import BetsPage from './student/pages/BetsPage';
import TeacherApp from './teacher';
import AdminApp from './admin';
import { AppShell } from './components/AppShell';

const NAV = [
  { path: '/', label: 'Главная' },
  { path: '/kanban', label: 'Канбан' },
  { path: '/inbox', label: 'Инбокс' },
  { path: '/economy', label: 'Экономика' },
  { path: '/gamification', label: 'XP' },
  { path: '/bets', label: 'Пари' },
] as const;

// useHashRoute — минимальный роутер без внешних зависимостей: hash переживает
// перезагрузку и не требует настройки history-fallback на сервере.
function useHashRoute(): [string, (path: string) => void] {
  const [path, setPath] = useState(() => normalizeRoute(window.location.hash));

  useEffect(() => {
    const onHashChange = () => setPath(normalizeRoute(window.location.hash));
    window.addEventListener('hashchange', onHashChange);

    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const navigate = useCallback((next: string) => {
    window.location.hash = next;
    setPath(normalizeRoute(next));
  }, []);

  return [path, navigate];
}

function normalizeRoute(hash: string): string {
  const path = hash.replace(/^#/, '');

  return path === '' ? '/' : path;
}

// App — провайдер сессии и роутинг по hash.
export default function App() {
  return (
    <AuthProvider>
      <Shell />
    </AuthProvider>
  );
}

function Shell() {
  const { user, role } = useAuth();
  const [route, navigate] = useHashRoute();

  if (!user) {
    return <LoginPage />;
  }

  // Кабинеты преподавателя и админа используют тот же AppShell, что и студент.
  if (role === 'teacher') {
    return <TeacherApp />;
  }

  if (role === 'admin') {
    return <AdminApp />;
  }

  return (
    <AppShell
      subtitle="Кабинет студента"
      bottomNav={
        <nav className="fixed bottom-0 left-1/2 z-40 w-full max-w-md -translate-x-1/2 border-t border-slate-800 bg-slate-950/95 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur">
          <ul className="flex gap-1 overflow-x-auto">
            {NAV.map((item) => {
              const active = item.path === route || (item.path === '/' && route === '/');

              return (
                <li key={item.path} className="min-w-[64px] flex-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => navigate(item.path)}
                    className={[
                      'w-full whitespace-nowrap rounded-lg px-2 py-2 text-[10px] font-medium transition',
                      active
                        ? 'bg-emerald-500/15 text-emerald-300'
                        : 'text-slate-400 hover:bg-slate-900',
                    ].join(' ')}
                  >
                    {item.label}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>
      }
    >
      {route === '/kanban' ? <KanbanPage /> : null}
      {route === '/inbox' ? <InboxPage /> : null}
      {route === '/economy' ? <EconomyPage /> : null}
      {route === '/gamification' ? <GamificationPage /> : null}
      {route === '/bets' ? <BetsPage /> : null}
      {route === '/' || !NAV.some((item) => item.path === route) ? (
        <DashboardPage navigate={navigate} />
      ) : null}
    </AppShell>
  );
}
