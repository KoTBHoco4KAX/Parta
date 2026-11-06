import { useEffect, type ReactNode } from 'react';

export interface ModalProps {
  open: boolean;
  title: ReactNode;
  subtitle?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'md' | 'lg';
}

const SIZES: Record<'md' | 'lg', string> = {
  md: 'sm:max-w-md',
  lg: 'sm:max-w-2xl',
};

// Modal — шторка в стиле VK UI: карточка на токенах темы, затемнение,
// закрытие по Escape и клику по фону, на мобильном прижата к низу.
export function Modal({ open, title, subtitle, onClose, children, footer, size = 'md' }: ModalProps) {
  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-page/40 p-0 sm:items-center sm:p-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
        className={[
          'flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl bg-card sm:rounded-2xl',
          SIZES[size],
        ].join(' ')}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-base font-semibold leading-tight text-ink">{title}</h2>
            {subtitle ? <p className="mt-0.5 text-xs text-ink3">{subtitle}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="-mr-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ink3 transition hover:bg-sunken hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
          >
            ✕
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 text-sm text-ink2">{children}</div>

        {footer ? <div className="border-t border-line bg-muted px-5 py-3.5">{footer}</div> : null}
      </div>
    </div>
  );
}
