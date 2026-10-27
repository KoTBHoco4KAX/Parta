import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  children?: ReactNode;
}

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-emerald-500 text-slate-950 hover:bg-emerald-400 active:bg-emerald-600',
  secondary: 'bg-slate-800 text-slate-100 hover:bg-slate-700 border border-slate-700',
  ghost: 'bg-transparent text-slate-300 hover:bg-slate-800',
  danger: 'bg-rose-500 text-white hover:bg-rose-400',
};

const SIZES: Record<Size, string> = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2.5 text-sm',
};

// Button — базовая кнопка с вариантами и состоянием загрузки.
export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  className = '',
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type="button"
      {...rest}
      disabled={disabled || loading}
      className={[
        'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400',
        'disabled:cursor-not-allowed disabled:opacity-50',
        SIZES[size],
        VARIANTS[variant],
        className,
      ].join(' ')}
    >
      {loading ? <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" /> : null}
      {children}
    </button>
  );
}
