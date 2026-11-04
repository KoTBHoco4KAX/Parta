import { useEffect, useRef, useState } from 'react';
import { formatDeadline24, parseLocalInput, toLocalInput } from '../lib/format';
import { cn } from './ui';

/** Время по умолчанию, если поле ещё не заполнено. */
const DEFAULT_HOURS = '08';
const DEFAULT_MINUTES = '00';

export interface DeadlineInputProps {
  /** Значение в формате `YYYY-MM-DDTHH:mm` (как у input[type=datetime-local]). */
  value: string;
  onChange: (value: string) => void;
  invalid?: boolean;
  /** Дополнительная подпись под полями. */
  hint?: string;
}

/**
 * DeadlineInput — дата и время в двух полях с гарантированным 24-часовым
 * форматом.
 *
 * Нативный input[type=time]/[type=datetime-local] рисует AM/PM, если системная
 * локаль браузера английская, поэтому часы набираются вручную: 00–23 и 00–59.
 * Наружу значение отдаётся в том же виде, что и у нативного поля.
 */
export function DeadlineInput({ value, onChange, invalid = false, hint }: DeadlineInputProps) {
  const parsed = parseLocalInput(value);
  const date = parsed ? toLocalInput(parsed).slice(0, 10) : value.slice(0, 10);

  // Введённые значения хранятся строкой без ведущего нуля: «8» → «08» только
  // при потере фокуса, иначе после первой цифры «1» поле нельзя донабрать.
  const [hours, setHours] = useState(
    parsed ? String(parsed.getHours()).padStart(2, '0') : DEFAULT_HOURS,
  );
  const [minutes, setMinutes] = useState(
    parsed ? String(parsed.getMinutes()).padStart(2, '0') : DEFAULT_MINUTES,
  );

  const minutesRef = useRef<HTMLInputElement | null>(null);

  // Внешнее значение (пресеты «+1 день», кнопка «сброс») подхватывается здесь.
  useEffect(() => {
    const current = parseLocalInput(value);

    if (!current) {
      return;
    }

    setHours(String(current.getHours()).padStart(2, '0'));
    setMinutes(String(current.getMinutes()).padStart(2, '0'));
  }, [value]);

  function commit(nextDate: string, nextHours: string, nextMinutes: string) {
    const hourNumber = Math.min(Number(nextHours || DEFAULT_HOURS), 23);
    const minuteNumber = Math.min(Number(nextMinutes || DEFAULT_MINUTES), 59);

    onChange(
      `${nextDate}T${String(hourNumber).padStart(2, '0')}:${String(minuteNumber).padStart(2, '0')}`,
    );
  }

  function digitsOnly(raw: string): string {
    return raw.replace(/\D/g, '').slice(0, 2);
  }

  function handleHours(raw: string) {
    const digits = digitsOnly(raw);

    if (digits === '') {
      setHours('');
      return;
    }

    // «7» → 7, «25» → 2 и сразу переход к минутам.
    const first = digits.slice(0, 1);
    const valueAsNumber = Number(digits.length === 1 ? digits : digits.slice(0, 2));

    if (valueAsNumber > 23) {
      setHours(first);
      commit(date, first, minutes || DEFAULT_MINUTES);
      minutesRef.current?.focus();
      return;
    }

    setHours(digits);
    commit(date, digits, minutes || DEFAULT_MINUTES);

    if (digits.length === 2) {
      minutesRef.current?.focus();
    }
  }

  function handleMinutes(raw: string) {
    const digits = digitsOnly(raw);

    if (digits === '') {
      setMinutes('');
      return;
    }

    const first = digits.slice(0, 1);
    const valueAsNumber = Number(digits.length === 1 ? digits : digits.slice(0, 2));

    if (valueAsNumber > 59) {
      setMinutes(first);
      commit(date, hours || DEFAULT_HOURS, first);
      return;
    }

    setMinutes(digits);
    commit(date, hours || DEFAULT_HOURS, digits);
  }

  function normalizeOnBlur(
    draft: string,
    fallback: string,
    max: number,
    setDraft: (next: string) => void,
  ) {
    const number = draft === '' ? Number(fallback) : Number(draft);

    setDraft(String(Math.min(Math.max(number, 0), max)).padStart(2, '0'));
  }

  const fieldClass = cn(
    'w-full rounded-lg border bg-card px-2 py-2 text-center text-sm tabular-nums text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brandLine',
    invalid ? 'border-bad' : 'border-line2',
  );

  return (
    <div>
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <input
          aria-label="Дата"
          type="date"
          value={date}
          onChange={(event) =>
            commit(event.target.value, hours || DEFAULT_HOURS, minutes || DEFAULT_MINUTES)
          }
          className={cn(
            'w-full rounded-lg border bg-card px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brandLine',
            invalid ? 'border-bad' : 'border-line2',
          )}
        />

        <div className="flex items-center gap-1">
          <input
            aria-label="Часы (00–23)"
            inputMode="numeric"
            autoComplete="off"
            maxLength={2}
            value={hours}
            onChange={(event) => handleHours(event.target.value)}
            onFocus={(event) => event.target.select()}
            onBlur={() => {
              normalizeOnBlur(hours, DEFAULT_HOURS, 23, setHours);
              commit(date, hours || DEFAULT_HOURS, minutes || DEFAULT_MINUTES);
            }}
            className={cn(fieldClass, 'w-12')}
          />
          <span className="text-sm font-semibold text-ink3">:</span>
          <input
            ref={minutesRef}
            aria-label="Минуты (00–59)"
            inputMode="numeric"
            autoComplete="off"
            maxLength={2}
            value={minutes}
            onChange={(event) => handleMinutes(event.target.value)}
            onFocus={(event) => event.target.select()}
            onBlur={() => {
              normalizeOnBlur(minutes, DEFAULT_MINUTES, 59, setMinutes);
              commit(date, hours || DEFAULT_HOURS, minutes || DEFAULT_MINUTES);
            }}
            className={cn(fieldClass, 'w-12')}
          />
        </div>
      </div>

      <p className={cn('mt-1 text-[10px]', invalid ? 'text-bad' : 'text-ink3')}>
        {parsed ? `${formatDeadline24(parsed)} · 24 ч (ЧЧ:ММ)` : 'Укажите дату и время · 24 ч (ЧЧ:ММ)'}
        {hint ? ` · ${hint}` : ''}
      </p>
    </div>
  );
}
