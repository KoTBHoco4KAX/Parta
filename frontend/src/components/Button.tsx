import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'accept' | 'reject' | 'outline';
type Size = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  block?: boolean;
  children?: ReactNode;
}

// Кнопка в стиле VK UI (Сферум): синий primary, мягкие вторичные заливки,
// зелёный accept, светлый красный reject. Цвета — семантические токены темы.
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-ink text-page hover:opacity-90',
  secondary: 'bg-muted text-ink hover:bg-sunken',
  ghost: 'bg-transparent text-ink2 hover:bg-muted',
  danger: 'bg-bad text-white hover:opacity-90',
  accept: 'bg-ok text-white hover:opacity-90',
  reject: 'bg-badSoft text-bad hover:bg-badLine',
  outline: 'border border-line2 bg-card text-ink2 hover:bg-muted',
};

const SIZES: Record<Size, string> = {
  sm: 'rounded-lg px-3 py-1.5 text-xs',
  md: 'rounded-lg px-4 py-2.5 text-sm',
  lg: 'rounded-xl px-5 py-3 text-sm',
};

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  block = false,
  disabled,
  className = '',
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      {...rest}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={[
        'inline-flex items-center justify-center gap-2 font-medium transition',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40',
        'disabled:cursor-not-allowed disabled:opacity-50',
        SIZES[size],
        VARIANTS[variant],
        block ? 'w-full' : '',
        className,
      ].join(' ')}
    >
      {loading ? (
        <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
      ) : null}
      {children}
    </button>
  );
}
