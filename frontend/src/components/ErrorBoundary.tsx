import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
  /** fullScreen — отдельный экран вместо контента внутри AppShell. */
  fullScreen?: boolean;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * ErrorBoundary — последняя линия обороны UI.
 *
 * Ошибка рендера одного экрана не должна оставлять пользователя с белым
 * экраном: boundary показывает понятное сообщение и даёт восстановиться.
 * Границы ставятся на два уровня: корень приложения и контент текущего
 * маршрута (шапка и навигация остаются рабочими).
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // В проде здесь будет отправка в телеметрию; в dev достаточно консоли.
    console.error('ui: unhandled render error', error, info.componentStack);
  }

  private reset = (): void => {
    this.setState({ error: null });
  };

  private goHome = (): void => {
    window.location.hash = '/';
    this.setState({ error: null });
  };

  render(): ReactNode {
    const { error } = this.state;
    const { children, fullScreen = false } = this.props;

    if (!error) {
      return children;
    }

    return (
      <div
        className={[
          'flex w-full items-center justify-center bg-slate-950 p-4 text-slate-100',
          fullScreen ? 'min-h-screen' : 'min-h-[60vh]',
        ].join(' ')}
      >
        <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900/80 p-6 text-center shadow-2xl shadow-black/40">
          <div
            aria-hidden="true"
            className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-500/15 text-2xl"
          >
            ⚠️
          </div>

          <p className="text-[11px] uppercase tracking-[0.3em] text-emerald-400">ПАРТА</p>
          <h1 className="mt-2 text-xl font-semibold text-slate-50">Что-то пошло не так</h1>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            Этот экран не смог отрисоваться. Остальное приложение работает — можно
            попробовать снова или вернуться на главную.
          </p>

          <div className="mt-6 flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={this.reset}
              className="flex-1 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-400/60"
            >
              Попробовать снова
            </button>
            <button
              type="button"
              onClick={this.goHome}
              className="flex-1 rounded-xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm font-medium text-slate-200 transition hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-600"
            >
              На главную
            </button>
          </div>

          <details className="mt-5 text-left">
            <summary className="cursor-pointer text-xs text-slate-500 hover:text-slate-400">
              Технические детали
            </summary>
            <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-black/40 p-3 text-[11px] leading-5 text-rose-300">
              {error.message || String(error)}
            </pre>
          </details>
        </div>
      </div>
    );
  }
}
