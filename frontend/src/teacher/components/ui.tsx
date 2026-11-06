import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';
import type { ToastData } from '../types';
import { formatCountdown } from '../lib/format';
import {
  IconAlert,
  IconCheck,
  IconChevronDown,
  IconRefresh,
  IconX,
} from './icons';

// Единые кнопка и шторка проекта: цвета берутся из токенов темы.
export { Button } from '../../components/Button';
export { Modal } from '../../components/Modal';

/** Смысловые тона акцентов (светлая палитра VK UI). */
export type BadgeTone =
  | 'slate'
  | 'indigo'
  | 'sky'
  | 'emerald'
  | 'amber'
  | 'rose'
  | 'violet';

/** Склейка классов без classnames/clsx — сторонние зависимости не нужны. */
export function cn(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ');
}

// emerald — смысловой «успех» (зелёный VK), indigo/sky — синий акцент.
const badgeTones: Record<BadgeTone, string> = {
  slate: 'bg-sunken text-ink3 ring-line2',
  indigo: 'bg-brandSoft text-brandStrong ring-brandLine',
  sky: 'bg-brandSoft text-brandStrong ring-brandLine',
  emerald: 'bg-okSoft text-ok ring-okLine',
  amber: 'bg-warnSoft text-warn ring-warnLine',
  rose: 'bg-badSoft text-bad ring-badLine',
  violet: 'bg-teamSoft text-team ring-teamLine',
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
        'inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset',
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

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-xl bg-sunken', className)} />;
}

/** SkeletonList — заготовка списка, чтобы экран не «прыгал» при загрузке. */
export function SkeletonList({ rows = 3, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn('space-y-2', className)} aria-hidden="true">
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} className="h-20 w-full" />
      ))}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-line2 bg-muted px-6 py-10 text-center">
      {icon ? (
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-sunken text-ink3">
          {icon}
        </div>
      ) : null}
      <p className="text-sm font-semibold text-ink">{title}</p>
      {description ? (
        <p className="mt-1 max-w-sm text-xs leading-relaxed text-ink3">{description}</p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

/** ErrorState — обязательное состояние ошибки с кнопкой повтора. */
export function ErrorState({
  message,
  onRetry,
  title = 'Не удалось загрузить данные',
}: {
  message: string;
  onRetry?: () => void;
  title?: string;
}) {
  return (
    <div
      role="alert"
      className="rounded-2xl border border-badLine bg-badSoft p-4 text-bad"
    >
      <div className="flex items-start gap-2">
        <IconAlert className="mt-0.5 h-4 w-4 shrink-0 text-bad" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{title}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-bad/80">{message}</p>
          {onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-bad px-2.5 py-1.5 text-[11px] font-semibold text-bad transition hover:bg-bad/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-bad"
            >
              <IconRefresh className="h-3.5 w-3.5" />
              Повторить
            </button>
          ) : null}
        </div>
      </div>
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
      ? 'border-okLine bg-okSoft text-ok'
      : toast.tone === 'error'
        ? 'border-badLine bg-badSoft text-bad'
        : 'border-line2 bg-card text-ink';

  return (
    <div
      role="status"
      className={cn(
        'pointer-events-auto flex w-full items-start gap-3 rounded-2xl border p-3',
        toneStyles,
      )}
    >
      <span
        className={cn(
          'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full',
          toast.tone === 'success'
            ? 'bg-ok text-white'
            : toast.tone === 'error'
              ? 'bg-bad text-white'
              : 'bg-line2 text-ink2',
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

// ---------------------------------------------------------------------------
// Панели и секции
// ---------------------------------------------------------------------------

/** Card — базовая панель кабинета: белая карточка с мягкой тенью. */
export function Card({
  children,
  className,
  padded = true,
}: {
  children: ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <div
      className={cn(
        'rounded-xl border border-line bg-card',
        padded && 'p-4',
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Section — заголовок группы с опциональным действием. */
export function Section({
  title,
  subtitle,
  action,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('space-y-2.5', className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold tracking-tight text-ink">{title}</h2>
          {subtitle ? <p className="mt-0.5 text-[11px] text-ink3">{subtitle}</p> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {children}
    </section>
  );
}

/** ScreenHeader — заголовок экрана: надзаголовок, название, действие. */
export function ScreenHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-brand">
          {eyebrow}
        </p>
        <h1 className="mt-1 text-xl font-semibold tracking-tight text-ink">{title}</h1>
        {description ? (
          <p className="mt-1 text-xs leading-relaxed text-ink3">{description}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0 pt-1">{action}</div> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Метрики и прогресс
// ---------------------------------------------------------------------------

const toneText: Record<BadgeTone, string> = {
  slate: 'text-ink3',
  indigo: 'text-brandStrong',
  sky: 'text-brandStrong',
  emerald: 'text-ok',
  amber: 'text-warn',
  rose: 'text-bad',
  violet: 'text-team',
};

const toneFill: Record<BadgeTone, string> = {
  slate: 'bg-ink4',
  indigo: 'bg-brand',
  sky: 'bg-brand',
  emerald: 'bg-ok',
  amber: 'bg-warn',
  rose: 'bg-bad',
  violet: 'bg-team',
};

/** StatTile — плитка KPI: значение, подпись и необязательная подсказка. */
export function StatTile({
  label,
  value,
  hint,
  tone = 'slate',
  icon,
  onClick,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: BadgeTone;
  icon?: ReactNode;
  onClick?: () => void;
}) {
  const content = (
    <>
      <div className="flex items-center gap-1.5">
        {icon ? <span className={cn('shrink-0', toneText[tone])}>{icon}</span> : null}
        <p className="min-w-0 flex-1 truncate text-[10px] font-medium uppercase tracking-wide text-ink3">
          {label}
        </p>
      </div>
      <p className={cn('mt-1.5 text-xl font-semibold tabular-nums', toneText[tone])}>{value}</p>
      {hint ? <p className="mt-0.5 text-[10px] leading-tight text-ink3">{hint}</p> : null}
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="rounded-2xl border border-line bg-card p-3 text-left transition hover:border-line2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand"
      >
        {content}
      </button>
    );
  }

  return (
    <div className="rounded-2xl border border-line bg-card p-3">
      {content}
    </div>
  );
}

/** Progress — полоса заполнения с подписью и процентом. */
export function Progress({
  value,
  max,
  tone = 'emerald',
  label,
  showPercent = false,
  className,
}: {
  value: number;
  max: number;
  tone?: BadgeTone;
  label?: string;
  showPercent?: boolean;
  className?: string;
}) {
  const percent = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;

  return (
    <div className={className}>
      {label || showPercent ? (
        <div className="mb-1 flex items-center justify-between gap-2 text-[10px] text-ink3">
          <span className="truncate">{label}</span>
          {showPercent ? <span className="tabular-nums">{percent}%</span> : null}
        </div>
      ) : null}
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-sunken">
        <div
          className={cn('h-full rounded-full transition-[width] duration-500', toneFill[tone])}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

/** StackedProgress — распределение карточек по колонкам канбана. */
export function StackedProgress({
  segments,
  className,
}: {
  segments: { value: number; tone: BadgeTone; title: string }[];
  className?: string;
}) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);

  if (total === 0) {
    return <div className={cn('h-1.5 w-full rounded-full bg-sunken', className)} />;
  }

  return (
    <div className={cn('flex h-1.5 w-full overflow-hidden rounded-full bg-sunken', className)}>
      {segments.map((segment, index) =>
        segment.value > 0 ? (
          <div
            key={index}
            title={`${segment.title}: ${segment.value}`}
            className={cn('h-full', toneFill[segment.tone])}
            style={{ width: `${(segment.value / total) * 100}%` }}
          />
        ) : null,
      )}
    </div>
  );
}

/**
 * DeadlineMeter — визуальный индикатор приближения срока.
 *
 * Шкала идёт слева направо: сколько уже прошло (тёмное), остаток бонусного окна
 * (изумрудный) и обычный срок до дедлайна (голубой). Когда срок вышел, шкала
 * целиком красная — преподавателю не нужно считать даты в голове.
 */
export function DeadlineMeter({
  createdAt,
  deadlineAt,
  bonusEndsAt,
  now,
  compact = false,
}: {
  createdAt: string;
  deadlineAt: string;
  bonusEndsAt: string;
  now: number;
  compact?: boolean;
}) {
  const start = new Date(createdAt).getTime();
  const deadline = new Date(deadlineAt).getTime();
  const bonusEnd = new Date(bonusEndsAt).getTime();

  const span = Math.max(1, deadline - start);
  const toPercent = (at: number) => Math.min(100, Math.max(0, ((at - start) / span) * 100));

  const elapsed = toPercent(now);
  const bonusEdge = toPercent(bonusEnd);

  const overdue = now > deadline;
  const inBonus = !overdue && now <= bonusEnd;

  const tone: BadgeTone = overdue ? 'rose' : inBonus ? 'emerald' : 'sky';
  const label = overdue
    ? `Просрочено на ${formatCountdown(new Date(deadline), now).replace('просрочено на ', '')}`
    : `До дедлайна ${formatCountdown(new Date(deadline), now)}`;

  const bonusRemaining = !overdue && inBonus ? Math.max(0, bonusEdge - elapsed) : 0;
  const normalRemaining = overdue ? 0 : Math.max(0, 100 - Math.max(elapsed, bonusEdge));

  return (
    <div className={compact ? 'space-y-1' : 'space-y-1.5'}>
      <div className="flex items-center justify-between gap-2">
        <span className={cn('text-[11px] font-medium', toneText[tone])}>{label}</span>
        <Badge tone={tone}>{overdue ? 'срок прошёл' : inBonus ? 'бонус ×1.5' : 'в срок'}</Badge>
      </div>

      <div className="flex h-2 w-full overflow-hidden rounded-full bg-sunken">
        {overdue ? (
          <div className="h-full w-full bg-bad" />
        ) : (
          <>
            <div className="h-full bg-line2" style={{ width: `${elapsed}%` }} />
            <div className="h-full bg-brand" style={{ width: `${bonusRemaining}%` }} />
            <div className="h-full bg-brand" style={{ width: `${normalRemaining}%` }} />
          </>
        )}
      </div>

      {compact ? null : (
        <div className="flex items-center justify-between gap-2 text-[10px] text-ink3">
          <span className="inline-flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-brand" />
            бонус до {formatDateShort(bonusEndsAt)}
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-brand" />
            дедлайн {formatDateShort(deadlineAt)}
          </span>
        </div>
      )}
    </div>
  );
}

function formatDateShort(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }

  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

/** BarChart — компактная гистограмма нагрузки по дням. */
export function BarChart({
  data,
  height = 72,
}: {
  data: { label: string; value: number; tone?: BadgeTone; title?: string; highlight?: boolean }[];
  height?: number;
}) {
  const max = Math.max(1, ...data.map((item) => item.value));

  return (
    <div className="flex items-end gap-1.5" style={{ height }} role="img" aria-label="График нагрузки">
      {data.map((item, index) => {
        const ratio = item.value / max;
        const barHeight = Math.max(item.value > 0 ? 4 : 2, ratio * height);

        return (
          <div key={index} className="flex min-w-0 flex-1 flex-col items-center gap-1">
            <div
              className="flex w-full items-end justify-center"
              style={{ height }}
              title={item.title ?? `${item.label}: ${item.value}`}
            >
              <div
                className={cn(
                  'w-full rounded-t-md transition-[height] duration-500',
                  item.value > 0
                    ? toneFill[item.tone ?? 'emerald']
                    : 'bg-sunken',
                  item.highlight && 'ring-1 ring-brand',
                )}
                style={{ height: barHeight }}
              />
            </div>
            <span
              className={cn(
                'truncate text-[9px] leading-none',
                item.highlight ? 'font-semibold text-brandStrong' : 'text-ink3',
              )}
            >
              {item.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Элементы управления
// ---------------------------------------------------------------------------

/** Chip — фильтр-таблетка с необязательным счётчиком. */
export function Chip({
  active,
  onClick,
  children,
  count,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  count?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand',
        active
          ? 'border-brandLine bg-brandSoft text-brandStrong'
          : 'border-line bg-card text-ink3 hover:border-line2 hover:text-ink2',
      )}
    >
      {children}
      {typeof count === 'number' ? (
        <span
          className={cn(
            'rounded-full px-1.5 py-0.5 text-[10px] tabular-nums',
            active ? 'bg-brand text-white' : 'bg-sunken text-ink3',
          )}
        >
          {count}
        </span>
      ) : null}
    </button>
  );
}

/** Segmented — переключатель режимов (сортировка, тип задания). */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="flex w-full gap-1 rounded-xl border border-line bg-muted p-1"
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            'flex-1 truncate rounded-lg px-2 py-1.5 text-[11px] font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand',
            value === option.value
              ? 'border border-line bg-card text-ink'
              : 'border border-transparent text-ink3 hover:text-ink2',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

const inputBase =
  'w-full rounded-lg border bg-card px-3 py-2.5 text-sm text-ink placeholder:text-ink4 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brandLine disabled:opacity-50';

/** inputClass — общий стиль текстовых контролов (используется админкой). */
export function inputClass(invalid = false): string {
  return cn(inputBase, invalid ? 'border-bad' : 'border-line2');
}

/** Field — подпись, подсказка и сообщение об ошибке вокруг контрола. */
export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
  className,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  error?: string | null;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="mb-1.5 block text-xs font-medium text-ink2">
        {label}
      </label>
      {children}
      {error ? (
        <p className="mt-1 text-[11px] text-bad">{error}</p>
      ) : hint ? (
        <p className="mt-1 text-[10px] leading-relaxed text-ink3">{hint}</p>
      ) : null}
    </div>
  );
}

export function TextInput({
  invalid,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return <input {...props} className={cn(inputClass(Boolean(invalid)), className)} />;
}

export function TextArea({
  invalid,
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }) {
  return (
    <textarea
      {...props}
      className={cn(inputClass(Boolean(invalid)), 'min-h-[96px] resize-y', className)}
    />
  );
}

export function SelectInput({
  className,
  children,
  invalid,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }) {
  return (
    <div className="relative">
      <select
        {...props}
        className={cn(inputClass(Boolean(invalid)), 'appearance-none pr-9', className)}
      >
        {children}
      </select>
      <IconChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink3" />
    </div>
  );
}

/** Avatar — инициалы в круге, цвет зависит от роли/контекста. */
export function Avatar({
  name,
  tone = 'slate',
  size = 'md',
}: {
  name: string;
  tone?: BadgeTone;
  size?: 'sm' | 'md';
}) {
  const text = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');

  const sizeClass = size === 'sm' ? 'h-7 w-7 text-[10px]' : 'h-9 w-9 text-xs';

  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full font-semibold ring-1 ring-inset',
        sizeClass,
        badgeTones[tone],
      )}
    >
      {text || '?'}
    </span>
  );
}

/** Kbd — подсказка горячей клавиши. */
export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded border border-line2 bg-sunken px-1.5 py-0.5 font-mono text-[10px] text-ink2">
      {children}
    </kbd>
  );
}

/** Callout — смысловой блок-подсказка (ограничение, предупреждение, бонус). */
export function Callout({
  tone = 'slate',
  icon,
  title,
  children,
}: {
  tone?: BadgeTone;
  icon?: ReactNode;
  title?: string;
  children: ReactNode;
}) {
  const surface: Record<BadgeTone, string> = {
    slate: 'border-line2 bg-muted text-ink2',
    indigo: 'border-brandLine bg-brandSoft text-brandStrong',
    sky: 'border-brandLine bg-brandSoft text-brandStrong',
    emerald: 'border-okLine bg-okSoft text-ok',
    amber: 'border-warnLine bg-warnSoft text-warn',
    rose: 'border-badLine bg-badSoft text-bad',
    violet: 'border-teamLine bg-teamSoft text-team',
  };

  return (
    <div className={cn('rounded-xl border p-3', surface[tone])}>
      <div className="flex items-start gap-2">
        {icon ? <span className={cn('mt-0.5 shrink-0', toneText[tone])}>{icon}</span> : null}
        <div className="min-w-0 flex-1">
          {title ? <p className="text-xs font-semibold">{title}</p> : null}
          <div className="text-[11px] leading-relaxed opacity-90">{children}</div>
        </div>
      </div>
    </div>
  );
}

/** KeyValue — пара «подпись → значение» для метаданных карточки. */
export function KeyValue({
  label,
  value,
  tone,
}: {
  label: string;
  value: ReactNode;
  tone?: BadgeTone;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] uppercase tracking-wide text-ink3">{label}</dt>
      <dd className={cn('mt-0.5 truncate text-xs font-medium', tone ? toneText[tone] : 'text-ink2')}>
        {value}
      </dd>
    </div>
  );
}

/** Timeline — журнал доработок/событий. */
export function Timeline({
  items,
  emptyText,
}: {
  items: { at: string; title: string; description?: string; tone?: BadgeTone }[];
  emptyText: string;
}) {
  if (items.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-line2 px-3 py-2.5 text-[11px] text-ink3">
        {emptyText}
      </p>
    );
  }

  return (
    <ol className="space-y-2.5">
      {items.map((item, index) => (
        <li key={index} className="relative pl-4">
          <span
            className={cn(
              'absolute left-0 top-1.5 h-2 w-2 rounded-full ring-2 ring-card',
              toneFill[item.tone ?? 'slate'],
            )}
          />
          <p className="text-[11px] font-medium text-ink2">{item.title}</p>
          {item.description ? (
            <p className="mt-0.5 whitespace-pre-line text-[11px] leading-relaxed text-ink3">
              {item.description}
            </p>
          ) : null}
          <p className="mt-0.5 text-[10px] text-ink3">{item.at}</p>
        </li>
      ))}
    </ol>
  );
}
