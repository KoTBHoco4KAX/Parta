import { useCallback, useEffect, useState } from 'react';
import { AuthProvider, useAuth } from './core/auth';
import { initMaxBridge } from './core/max';
import { ThemeProvider } from './core/theme';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import KanbanPage from './student/pages/KanbanPage';
import ShopPage from './student/pages/ShopPage';
import AnswersPage from './student/pages/AnswersPage';
import LeaderboardPage from './student/pages/LeaderboardPage';
import TeacherApp from './teacher';
import AdminApp from './admin';
import { AppShell } from './components/AppShell';
import { ErrorBoundary } from './components/ErrorBoundary';
import {
  IconChart,
  IconGift,
  IconInbox,
  IconLayers,
  IconTrend,
} from './teacher/components/icons';

// Меню ученика: отдельной экономики нет — покупки живут в магазине,
// а бонус за спидран назначается на самом задании.
const NAV = [
  { path: '/', label: 'Главная', icon: <IconChart className="h-4 w-4" /> },
  { path: '/kanban', label: 'Канбан', icon: <IconLayers className="h-4 w-4" /> },
  { path: '/shop', label: 'Магазин', icon: <IconGift className="h-4 w-4" /> },
  { path: '/answers', label: 'Ответы', icon: <IconInbox className="h-4 w-4" /> },
  { path: '/leaderboard', label: 'Рейтинг', icon: <IconTrend className="h-4 w-4" /> },
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
      nav={NAV.map((item) => ({
        id: item.path,
        label: item.label,
        icon: item.icon,
        active: item.path === route || (item.path === '/' && route === '/'),
        onClick: () => navigate(item.path),
      }))}
    >
      <ErrorBoundary key={route}>
        {route === '/kanban' ? <KanbanPage /> : null}
        {route === '/shop' ? <ShopPage /> : null}
        {route === '/answers' ? <AnswersPage /> : null}
        {route === '/leaderboard' ? <LeaderboardPage /> : null}
        {route === '/' || !NAV.some((item) => item.path === route) ? (
          <DashboardPage onNavigate={navigate} />
        ) : null}
      </ErrorBoundary>
    </AppShell>
  );
}
