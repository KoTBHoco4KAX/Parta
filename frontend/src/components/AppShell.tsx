import type { ReactNode } from 'react';
import { useAuth } from '../core/auth';
import type { Role } from '../core/types';
import { ThemeToggle } from './ThemeToggle';

const ROLE_LABEL: Record<Role, string> = {
  admin: 'Админ',
  teacher: 'Преподаватель',
  student: 'Студент',
};

export interface AppShellProps {
  subtitle: string;
  children: ReactNode;
  bottomNav?: ReactNode;
}

/**
 * AppShell — единый каркас приложения в визуальном языке Сферума (VK UI).
 *
 * Белая (в тёмной теме — тёмная) шапка с синим вордмарком, переключателем темы,
 * статусом соединения и выходом; колонка max-w-md, серый фон страницы; нижняя
 * навигация мини-приложения. Цвета приходят из токенов темы.
 */
export function AppShell({ subtitle, children, bottomNav }: AppShellProps) {
  const { user, role, connection, logout } = useAuth();

  const connectionTone =
    connection === 'online'
      ? 'bg-ok'
      : connection === 'connecting'
        ? 'bg-warn'
        : 'bg-ink4';

  return (
    <div className="flex min-h-screen justify-center bg-page">
      <div className="flex min-h-screen w-full max-w-md flex-col bg-page text-ink">
        <header className="sticky top-0 z-40 border-b border-line bg-card/95 px-4 py-2.5 backdrop-blur">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => {
                window.location.hash = '/';
              }}
              className="min-w-0 text-left"
            >
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-brand">ПАРТА</p>
              <p className="truncate text-[13px] font-semibold text-ink">
                {user?.display_name ?? 'Гость'}
              </p>
              <p className="truncate text-[11px] text-ink3">
                {subtitle}
                {role ? ` · ${ROLE_LABEL[role]}` : ''}
              </p>
            </button>

            <div className="flex shrink-0 items-center gap-1">
              <span
                title={connection}
                aria-label={`Соединение: ${connection}`}
                className={`h-2 w-2 rounded-full ${connectionTone}`}
              />
              <ThemeToggle />
              <button
                type="button"
                onClick={logout}
                className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-brand transition hover:bg-brandSoft focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
              >
                Выход
              </button>
            </div>
          </div>
        </header>

        <main className="flex-1 px-4 py-4 pb-24">{children}</main>

        {bottomNav}
      </div>
    </div>
  );
}
