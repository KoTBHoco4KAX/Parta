import { useCallback, useEffect, useState } from 'react';
import { AuthProvider, useAuth } from './core/auth';
import { initMaxBridge } from './core/max';
import { ThemeProvider } from './core/theme';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import KanbanPage from './student/pages/KanbanPage';
import ShopPage from './student/pages/ShopPage';
import PeerReviewPage from './pages/PeerReviewPage';
import TeacherApp from './teacher';
import AdminApp from './admin';
import { AppShell } from './components/AppShell';
import { ErrorBoundary } from './components/ErrorBoundary';

// Меню ученика: отдельной экономики нет — покупки живут в магазине,
// а бонус за спидран назначается на самом задании.
const NAV = [
  { path: '/', label: 'Главная' },
  { path: '/kanban', label: 'Канбан' },
  { path: '/shop', label: 'Магазин' },
  { path: '/peer', label: 'Взаимопроверка' },
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

// App — провайдеры темы и сессии, плюс роутинг по hash.
export default function App() {
  // MAX/VK Bridge инициализируется один раз. В обычном браузере
  // initMaxBridge сразу возвращает graceful fallback и ничего не шлёт.
  useEffect(() => {
    void initMaxBridge().then((status) => {
      if (status.supported && !status.initialized) {
        console.info('MAX bridge: fallback —', status.reason);
      }
    });
  }, []);

  return (
    <ThemeProvider>
      <ErrorBoundary fullScreen>
        <AuthProvider>
          <Shell />
        </AuthProvider>
      </ErrorBoundary>
    </ThemeProvider>
  );
}

function Shell() {
  const { user, role } = useAuth();
  const [route, navigate] = useHashRoute();

  if (!user) {
    return <LoginPage />;
  }

  // Кабинеты преподавателя и админа используют тот же AppShell, что и ученик.
  if (role === 'teacher') {
    return (
      <ErrorBoundary>
        <TeacherApp />
      </ErrorBoundary>
    );
  }

  if (role === 'admin') {
    return (
      <ErrorBoundary>
        <AdminApp />
      </ErrorBoundary>
    );
  }

  return (
    <AppShell
      subtitle="Кабинет ученика"
      bottomNav={
        <nav className="fixed bottom-0 left-1/2 z-40 w-full max-w-md -translate-x-1/2 border-t border-line bg-card/95 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur">
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
                        ? 'bg-brandSoft text-brand'
                        : 'text-ink3 hover:bg-muted',
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
      <ErrorBoundary key={route}>
        {route === '/kanban' ? <KanbanPage /> : null}
        {route === '/shop' ? <ShopPage /> : null}
        {route === '/peer' ? <PeerReviewPage /> : null}
        {route === '/' || !NAV.some((item) => item.path === route) ? (
          <DashboardPage />
        ) : null}
      </ErrorBoundary>
    </AppShell>
  );
}
