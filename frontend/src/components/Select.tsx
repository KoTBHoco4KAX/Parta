import { useEffect, useRef, useState } from 'react';
import { IconChevronDown } from '../teacher/components/icons';

export interface SelectOption {
  value: string;
  label: string;
  description?: string;
}

/**
 * Select — кастомный список вместо нативного <select>.
 *
 * Нативный select в тёмной теме рисует системный белый список и ломает
 * визуальный язык. Здесь кнопка + поповер, закрытие по клику вне и Escape.
 */
export function Select({
  id,
  value,
  options,
  placeholder = 'Выберите',
  onChange,
  disabled = false,
}: {
  id?: string;
  value: string;
  options: SelectOption[];
  placeholder?: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const selected = options.find((option) => option.value === value) ?? null;

  useEffect(() => {
    if (!open) {
      return;
    }

    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        id={id}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((previous) => !previous)}
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-line bg-card px-3 py-2.5 text-left text-sm text-ink transition hover:border-line2 focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/20 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className={selected ? 'truncate' : 'truncate text-ink4'}>
          {selected?.label ?? placeholder}
        </span>
        <IconChevronDown
          className={`h-4 w-4 shrink-0 text-ink3 transition ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open ? (
        <ul
          role="listbox"
          className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-line bg-card p-1"
        >
          {options.map((option) => {
            const active = option.value === value;

            return (
              <li key={option.value}>
                <button
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                  className={`w-full rounded-md px-2.5 py-2 text-left text-sm transition ${
                    active ? 'bg-muted text-ink' : 'text-ink2 hover:bg-muted'
                  }`}
                >
                  <span className="block truncate">{option.label}</span>
                  {option.description ? (
                    <span className="mt-0.5 block truncate text-[11px] text-ink3">
                      {option.description}
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
