import type { ReactNode } from 'react';
import { useAuth } from '../core/auth';
import type { Role } from '../core/types';
import { ThemeToggle } from './ThemeToggle';

const ROLE_LABEL: Record<Role, string> = {
  admin: 'Админ',
  teacher: 'Преподаватель',
  student: 'Ученик',
};

export interface AppNavItem {
  id: string;
  label: string;
  icon: ReactNode;
  active: boolean;
  onClick: () => void;
  badge?: number;
}

export interface AppShellProps {
  subtitle: string;
  children: ReactNode;
  nav: AppNavItem[];
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);

  return parts.map((part) => part.charAt(0).toUpperCase()).join('') || '?';
}

/**
 * AppShell — web-first каркас ПАРТЫ.
 *
 * На desktop это левый сайдбар с навигацией и профилем; на мобильном —
 * компактная шапка и нижний таббар с safe-area.
 */
export function AppShell({ subtitle, children, nav }: AppShellProps) {
  const { user, role, connection, logout } = useAuth();

  const connectionTone =
    connection === 'online'
      ? 'bg-ok'
      : connection === 'connecting'
        ? 'bg-warn'
        : 'bg-ink4';

  return (
    <div className="min-h-screen bg-page text-ink">
      <aside className="fixed inset-y-0 left-0 z-40 theme-pattern hidden w-60 flex-col border-r border-line bg-card md:flex">
        <div className="px-4 pb-4 pt-5">
          <button
            type="button"
            onClick={() => {
              window.location.hash = '/';
            }}
            className="flex items-center gap-2 text-left"
          >
            <span className="text-[13px] font-bold tracking-[0.24em] text-ink">ПАРТА</span>
            {role ? (
              <span className="rounded-md border border-line px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-ink3">
                {ROLE_LABEL[role]}
              </span>
            ) : null}
          </button>
          <p className="mt-1 text-[10px] uppercase tracking-[0.16em] text-ink4">{subtitle}</p>
        </div>

        <nav className="flex-1 overflow-y-auto px-2">
          <ul className="space-y-0.5">
            {nav.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  aria-current={item.active ? 'page' : undefined}
                  onClick={item.onClick}
                  className={`group flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] transition ${
                    item.active
                      ? 'bg-brandSoft font-medium text-brandStrong'
                      : 'text-ink3 hover:bg-muted/60 hover:text-ink2'
                  }`}
                >
                  <span
                    className={`flex h-4 w-4 shrink-0 items-center justify-center ${
                      item.active ? 'text-brand' : 'text-ink4 group-hover:text-ink2'
                    }`}
                  >
                    {item.icon}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-left">{item.label}</span>
                  {item.badge && item.badge > 0 ? (
                    <span className="rounded-md border border-line bg-card px-1.5 py-0.5 text-[10px] tabular-nums text-ink2">
                      {item.badge > 99 ? '99+' : item.badge}
                    </span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <div className="border-t border-line p-3">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-[10px] font-semibold text-ink2">
              {initials(user?.display_name ?? 'П')}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[12px] font-medium text-ink">
                {user?.display_name ?? 'Гость'}
              </span>
              <span className="block truncate text-[10px] text-ink3">{user?.external_id ?? '—'}</span>
            </span>
            <span
              title={connection}
              aria-label={`Соединение: ${connection}`}
              className={`h-1.5 w-1.5 shrink-0 rounded-full ${connectionTone}`}
            />
          </div>

          <div className="mt-2 flex items-center justify-between">
            <ThemeToggle />
            <button
              type="button"
              onClick={logout}
              className="rounded-md px-2 py-1 text-[11px] text-ink3 transition hover:bg-muted hover:text-ink"
            >
              Выйти
            </button>
          </div>
        </div>
      </aside>

      <div className="min-w-0 md:pl-60">
        <header className="sticky top-0 z-30 theme-pattern border-b border-line bg-card px-4 py-3 md:hidden">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-ink">ПАРТА</p>
              <p className="truncate text-[10px] text-ink3">
                {role ? ROLE_LABEL[role] : 'Гость'} · {subtitle}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <span
                title={connection}
                aria-label={`Соединение: ${connection}`}
                className={`mr-1 h-1.5 w-1.5 rounded-full ${connectionTone}`}
              />
              <ThemeToggle />
              <button
                type="button"
                onClick={logout}
                className="rounded-md px-2 py-1 text-[11px] text-ink3 transition hover:bg-muted hover:text-ink"
              >
                Выйти
              </button>
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-7xl px-4 py-5 pb-24 md:px-8 md:py-8 md:pb-10">
          {children}
        </main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-card px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 md:hidden">
        <ul className="flex gap-0.5">
          {nav.map((item) => (
            <li key={item.id} className="min-w-0 flex-1">
              <button
                type="button"
                aria-current={item.active ? 'page' : undefined}
                onClick={item.onClick}
                className={`relative flex w-full flex-col items-center gap-1 rounded-md px-1 py-1.5 text-[9px] font-medium transition ${
                  item.active ? 'text-brand' : 'text-ink4 hover:text-ink2'
                }`}
              >
                <span className="relative flex h-4 w-4 items-center justify-center">
                  {item.icon}
                  {item.badge && item.badge > 0 ? (
                    <span className="absolute -right-2 -top-1.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-ink px-0.5 text-[8px] font-bold text-page">
                      {item.badge > 99 ? '99+' : item.badge}
                    </span>
                  ) : null}
                </span>
                <span className="truncate">{item.label}</span>
              </button>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
