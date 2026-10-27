import { useCallback, useEffect, useState } from 'react';
import { AuthProvider, useAuth } from './core/auth';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { BoardPage } from './pages/BoardPage';
import { InboxPage } from './pages/InboxPage';
import { EconomyPage } from './pages/EconomyPage';

const NAV = [
  { path: '/', label: 'Главная' },
  { path: '/board', label: 'Канбан' },
  { path: '/inbox', label: 'Инбокс' },
  { path: '/economy', label: 'Экономика' },
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
  const { user, role, connection } = useAuth();
  const [route, navigate] = useHashRoute();

  if (!user) {
    return (
      <div className="mx-auto min-h-screen w-full max-w-md bg-slate-950 text-slate-100">
        <LoginPage />
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col bg-slate-950 text-slate-100">
      <header className="sticky top-0 z-40 border-b border-slate-800/80 bg-slate-950/90 px-4 py-3 backdrop-blur">
        <div className="flex items-center justify-between gap-3">
          <button type="button" onClick={() => navigate('/')} className="text-left">
            <p className="text-[11px] uppercase tracking-[0.3em] text-emerald-400">ПАРТА</p>
            <p className="text-sm font-medium text-slate-200">{user.display_name}</p>
          </button>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-slate-800 px-2 py-1 text-[11px] uppercase tracking-wide text-slate-300">
              {role}
            </span>
            <span
              title={connection}
              className={[
                'h-2.5 w-2.5 rounded-full',
                connection === 'online'
                  ? 'bg-emerald-400'
                  : connection === 'connecting'
                    ? 'bg-amber-400'
                    : 'bg-slate-600',
              ].join(' ')}
            />
          </div>
        </div>
      </header>

      <main className="flex-1 px-4 py-5 pb-24">
        {route === '/board' ? <BoardPage /> : null}
        {route === '/inbox' ? <InboxPage /> : null}
        {route === '/economy' ? <EconomyPage /> : null}
        {route === '/' || !NAV.some((item) => item.path === route) ? (
          <DashboardPage navigate={navigate} />
        ) : null}
      </main>

      <nav className="fixed bottom-0 left-1/2 z-40 w-full max-w-md -translate-x-1/2 border-t border-slate-800 bg-slate-950/95 px-2 py-2 backdrop-blur">
        <ul className="grid grid-cols-4 gap-1">
          {NAV.map((item) => {
            const active = item.path === route || (item.path === '/' && route === '/');

            return (
              <li key={item.path}>
                <button
                  type="button"
                  onClick={() => navigate(item.path)}
                  className={[
                    'w-full rounded-lg px-2 py-2 text-[11px] font-medium transition',
                    active ? 'bg-emerald-500/15 text-emerald-300' : 'text-slate-400 hover:bg-slate-900',
                  ].join(' ')}
                >
                  {item.label}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
