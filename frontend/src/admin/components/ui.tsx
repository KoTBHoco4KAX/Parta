import type { ReactNode } from 'react';
import type { ToastData } from '../types';
import { IconAlert, IconCheck, IconX } from './icons';

// Базовые кнопка и модалка живут в src/components: админка не заводит свои.
export { Button } from '../../components/Button';
export { Modal } from '../../components/Modal';

/** Склейка классов без сторонних зависимостей. */
export function cn(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ');
}

export type BadgeTone =
  | 'slate'
  | 'indigo'
  | 'sky'
  | 'emerald'
  | 'amber'
  | 'rose'
  | 'violet';

const badgeTones: Record<BadgeTone, string> = {
  slate: 'bg-slate-800 text-slate-300 ring-slate-700',
  indigo: 'bg-emerald-500/10 text-emerald-300 ring-emerald-500/30',
  sky: 'bg-sky-500/10 text-sky-300 ring-sky-500/30',
  emerald: 'bg-emerald-500/10 text-emerald-300 ring-emerald-500/30',
  amber: 'bg-amber-500/10 text-amber-300 ring-amber-500/30',
  rose: 'bg-rose-500/10 text-rose-300 ring-rose-500/30',
  violet: 'bg-violet-500/10 text-violet-300 ring-violet-500/30',
};

export function Badge({
  tone = 'slate',
  children,
  className,
}: {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset',
        badgeTones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg
      className={cn('animate-spin', className)}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="9"
        stroke="currentColor"
        strokeWidth="3"
      />
      <path
        className="opacity-90"
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Общие классы полей — чтобы input/select/textarea не разъезжались. */
export const inputClass =
  'w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 transition focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20';

export const inputErrorClass =
  'border-rose-500 focus:border-rose-500 focus:ring-rose-500/20';

export function Field({
  id,
  label,
  hint,
  error,
  required,
  children,
  className,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-xs font-medium text-slate-300">
          {label}
          {required ? (
            <span className="ml-0.5 text-rose-400" aria-hidden="true">
              *
            </span>
          ) : null}
        </label>
        {hint ? <span className="text-[10px] text-slate-500">{hint}</span> : null}
      </div>
      <div className="mt-1.5">{children}</div>
      {error ? (
        <p className="mt-1 flex items-center gap-1 text-[11px] text-rose-400">
          <IconAlert className="h-3 w-3 shrink-0" />
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-xl bg-slate-800', className)} />;
}

export function EmptyState({
  icon,
  title,
  description,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-700 bg-slate-900/40 px-6 py-10 text-center">
      {icon ? (
        <div className="mb-2.5 flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-800 text-slate-400">
          {icon}
        </div>
      ) : null}
      <p className="text-sm font-semibold text-slate-100">{title}</p>
      {description ? (
        <p className="mt-1 max-w-sm text-xs leading-relaxed text-slate-400">{description}</p>
      ) : null}
    </div>
  );
}

export function Toast({
  toast,
  onDismiss,
}: {
  toast: ToastData;
  onDismiss: () => void;
}) {
  const toneStyles =
    toast.tone === 'success'
      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100'
      : toast.tone === 'error'
        ? 'border-rose-500/30 bg-rose-500/10 text-rose-100'
        : 'border-slate-700 bg-slate-900 text-slate-100';

  return (
    <div
      role="status"
      className={cn(
        'pointer-events-auto flex w-full items-start gap-3 rounded-2xl border p-3 shadow-lg shadow-slate-950/40',
        toneStyles,
      )}
    >
      <span
        className={cn(
          'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full',
          toast.tone === 'success'
            ? 'bg-emerald-500 text-slate-950'
            : toast.tone === 'error'
              ? 'bg-rose-500 text-white'
              : 'bg-slate-700 text-slate-200',
        )}
      >
        {toast.tone === 'error' ? (
          <IconAlert className="h-4 w-4" />
        ) : (
          <IconCheck className="h-4 w-4" />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{toast.title}</p>
        {toast.description ? (
          <p className="mt-0.5 text-xs leading-relaxed opacity-80">{toast.description}</p>
        ) : null}
      </div>
      <button
        type="button"
        onClick={onDismiss}
        className="-mr-1 rounded-lg p-1 opacity-60 transition hover:opacity-100"
        aria-label="Скрыть уведомление"
      >
        <IconX className="h-4 w-4" />
      </button>
    </div>
  );
}
