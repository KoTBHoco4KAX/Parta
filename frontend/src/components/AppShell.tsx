import type { ReactNode } from 'react';
import { useAuth } from '../core/auth';
import type { Role } from '../core/types';
import { Button } from './Button';

const ROLE_LABEL: Record<Role, string> = {
  student: 'Студент',
  teacher: 'Преподаватель',
  admin: 'Админ',
};

export interface AppShellProps {
  subtitle: string;
  children: ReactNode;
  bottomNav?: ReactNode;
}

/**
 * AppShell — единый мобильный каркас для всех ролей.
 *
 * Контент всегда центрирован в колонке max-w-md; на широком экране по бокам
 * остаётся тёмный фон. Шапка с профилем и выходом есть на каждом экране.
 */
export function AppShell({ subtitle, children, bottomNav }: AppShellProps) {
  const { user, role, connection, logout } = useAuth();

  return (
    <div className="flex min-h-screen justify-center bg-black">
      <div className="flex min-h-screen w-full max-w-md flex-col bg-slate-950 text-slate-100 shadow-2xl shadow-black/60">
        <header className="sticky top-0 z-40 border-b border-slate-800/80 bg-slate-950/95 px-4 py-3 backdrop-blur">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => {
                window.location.hash = '/';
              }}
              className="min-w-0 text-left"
            >
              <p className="text-[11px] uppercase tracking-[0.3em] text-emerald-400">ПАРТА</p>
              <p className="truncate text-sm font-medium text-slate-100">
                {user?.display_name ?? 'Гость'}
              </p>
              <p className="truncate text-[10px] text-slate-500">
                {subtitle}
                {role ? ` · ${ROLE_LABEL[role]}` : ''}
              </p>
            </button>

            <div className="flex shrink-0 items-center gap-2">
              <span
                title={connection}
                aria-label={`Соединение: ${connection}`}
                className={[
                  'h-2.5 w-2.5 rounded-full',
                  connection === 'online'
                    ? 'bg-emerald-400'
                    : connection === 'connecting'
                      ? 'bg-amber-400'
                      : 'bg-slate-600',
                ].join(' ')}
              />
              <Button variant="ghost" size="sm" onClick={logout}>
                Выход
              </Button>
            </div>
          </div>
        </header>

        <main className="flex-1 px-4 py-5 pb-24">{children}</main>

        {bottomNav}
      </div>
    </div>
  );
}
