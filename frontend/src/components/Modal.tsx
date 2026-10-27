import { useEffect, type ReactNode } from 'react';
import { Button } from './Button';

export interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}

// Modal — базовая модалка: затемнение, закрытие по Escape и клику по фону.
export function Modal({ open, title, onClose, children, footer }: ModalProps) {
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

    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/70 p-0 sm:items-center sm:p-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="w-full max-w-md rounded-t-2xl border border-slate-800 bg-slate-900 p-5 shadow-xl sm:rounded-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 className="text-lg font-semibold text-slate-100">{title}</h2>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Закрыть">
            ✕
          </Button>
        </div>

        <div className="space-y-3 text-sm text-slate-300">{children}</div>

        {footer ? <div className="mt-5 flex justify-end gap-2">{footer}</div> : null}
      </div>
    </div>
  );
}
