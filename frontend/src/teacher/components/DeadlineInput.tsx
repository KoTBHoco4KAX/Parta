import { useEffect, useState } from 'react';
import { formatDeadline24, parseLocalInput, toLocalInput } from '../lib/format';
import { cn } from './ui';

/** Время по умолчанию, если поле ещё не заполнено. */
const DEFAULT_TIME = '08:00';

export interface DeadlineInputProps {
  /** Значение в формате `YYYY-MM-DDTHH:mm` (как у input[type=datetime-local]). */
  value: string;
  onChange: (value: string) => void;
  invalid?: boolean;
  /** Текст под полями (подсказка или ошибка). */
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
  const hours = parsed ? String(parsed.getHours()).padStart(2, '0') : DEFAULT_TIME.slice(0, 2);
  const minutes = parsed ? String(parsed.getMinutes()).padStart(2, '0') : DEFAULT_TIME.slice(3, 5);
  const date = parsed ? toLocalInput(parsed).slice(0, 10) : value.slice(0, 10);

  // Черновик часов/минут: пустое поле не сбрасывает значение в 00, пока
  // пользователь не закончит набор (две цифры).
  const [hourDraft, setHourDraft] = useState(hours);
  const [minuteDraft, setMinuteDraft] = useState(minutes);

  useEffect(() => {
    setHourDraft(hours);
    setMinuteDraft(minutes);
  }, [hours, minutes]);

  function commit(nextDate: string, nextHour: string, nextMinute: string) {
    onChange(`${nextDate}T${nextHour}:${nextMinute}`);
  }

  function clamp(raw: string, max: number): string {
    const digits = raw.replace(/\D/g, '').slice(0, 2);

    if (digits === '') {
      return '';
    }

    return String(Math.min(Number(digits), max)).padStart(2, '0');
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
          onChange={(event) => commit(event.target.value, hourDraft || DEFAULT_TIME.slice(0, 2), minuteDraft || '00')}
          className={cn(
            'w-full rounded-lg border bg-card px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brandLine',
            invalid ? 'border-bad' : 'border-line2',
          )}
        />

        <div className="flex items-center gap-1">
          <input
            aria-label="Часы (00–23)"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={2}
            value={hourDraft}
            onChange={(event) => {
              const next = clamp(event.target.value, 23);
              setHourDraft(next);

              if (next.length === 2) {
                commit(date, next, minuteDraft || '00');
              }
            }}
            onBlur={() => {
              const next = clamp(hourDraft || DEFAULT_TIME.slice(0, 2), 23);
              setHourDraft(next);
              commit(date, next, minuteDraft || '00');
            }}
            className={cn(fieldClass, 'w-12')}
          />
          <span className="text-sm font-semibold text-ink3">:</span>
          <input
            aria-label="Минуты (00–59)"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={2}
            value={minuteDraft}
            onChange={(event) => {
              const next = clamp(event.target.value, 59);
              setMinuteDraft(next);

              if (next.length === 2) {
                commit(date, hourDraft || '00', next);
              }
            }}
            onBlur={() => {
              const next = clamp(minuteDraft || '00', 59);
              setMinuteDraft(next);
              commit(date, hourDraft || '00', next);
            }}
            className={cn(fieldClass, 'w-12')}
          />
        </div>
      </div>

      <p className={cn('mt-1 text-[10px]', invalid ? 'text-bad' : 'text-ink3')}>
        {invalid && hint ? hint : `${parsed ? formatDeadline24(parsed) : '—'} · 24 ч (ЧЧ:ММ)${hint ? ` · ${hint}` : ''}`}
      </p>
    </div>
  );
}
