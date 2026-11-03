import { useTheme } from '../core/theme';

// ThemeToggle — переключатель светлой и тёмной темы в шапке кабинета.
// Иконки рисуются инлайном, чтобы не тянуть зависимости.

export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const nextLabel = theme === 'light' ? 'Включить тёмную тему' : 'Включить светлую тему';

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={nextLabel}
      title={nextLabel}
      className="flex h-8 w-8 items-center justify-center rounded-lg text-ink3 transition hover:bg-sunken hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
    >
      {theme === 'light' ? (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-4 w-4"
          aria-hidden="true"
        >
          <path d="M20.25 12A8.25 8.25 0 1 1 12 3.75a6.75 6.75 0 0 0 8.25 8.25Z" />
        </svg>
      ) : (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-4 w-4"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="4.5" />
          <path d="M12 2.25v2.25M12 19.5v2.25M4.5 12H2.25M21.75 12H19.5M6.34 6.34 4.75 4.75M19.25 19.25l-1.59-1.59M6.34 17.66l-1.59 1.59M19.25 4.75l-1.59 1.59" />
        </svg>
      )}
    </button>
  );
}
