import { useEffect, useRef, useState } from 'react';
import { formatDeadline24, parseLocalInput, toLocalInput } from '../lib/format';
import { cn } from './ui';

export interface DeadlineInputProps {
  /** Значение в формате `YYYY-MM-DDTHH:mm` (как у input[type=datetime-local]). */
  value: string;
  onChange: (value: string) => void;
  invalid?: boolean;
  /** Дополнительная подпись под полями. */
  hint?: string;
}

interface Parts {
  day: string;
  month: string;
  year: string;
  hour: string;
  minute: string;
}

function partsFromValue(value: string): Parts | null {
  const parsed = parseLocalInput(value);

  if (!parsed) {
    return null;
  }

  return {
    day: String(parsed.getDate()).padStart(2, '0'),
    month: String(parsed.getMonth() + 1).padStart(2, '0'),
    year: String(parsed.getFullYear()),
    hour: String(parsed.getHours()).padStart(2, '0'),
    minute: String(parsed.getMinutes()).padStart(2, '0'),
  };
}

/** build собирает Date из шести частей; null — набор не закончен или дата битая. */
function build(next: Parts): Date | null {
  if (
    next.day.length !== 2 ||
    next.month.length !== 2 ||
    next.year.length !== 4 ||
    next.hour.length !== 2 ||
    next.minute.length !== 2
  ) {
    return null;
  }

  const dayNumber = Number(next.day);
  const monthNumber = Number(next.month);
  const yearNumber = Number(next.year);
  const hourNumber = Number(next.hour);
  const minuteNumber = Number(next.minute);

  if (monthNumber < 1 || monthNumber > 12 || dayNumber < 1 || dayNumber > 31) {
    return null;
  }

  if (hourNumber > 23 || minuteNumber > 59) {
    return null;
  }

  const date = new Date(yearNumber, monthNumber - 1, dayNumber, hourNumber, minuteNumber, 0, 0);

  // Отсекаем 31.02 и подобные: Date молча переносит день в следующий месяц.
  if (
    date.getFullYear() !== yearNumber ||
    date.getMonth() !== monthNumber - 1 ||
    date.getDate() !== dayNumber
  ) {
    return null;
  }

  return date;
}

/**
 * DeadlineInput — дата и время, полностью нарисованные вручную.
 *
 * Нативные input[type=date]/[type=time] подчиняются системной локали: на
 * английской Windows они показывают MM/DD/YYYY и AM/PM. Поэтому здесь шесть
 * отдельных полей: ДД, ММ, ГГГГ, ЧЧ, ММ — всегда в русском формате и 24 часа.
 * Значение наружу отдаётся строкой `YYYY-MM-DDTHH:mm`, как у нативного поля.
 */
export function DeadlineInput({ value, onChange, invalid = false, hint }: DeadlineInputProps) {
  const initial = partsFromValue(value);

  const [day, setDay] = useState(initial?.day ?? '');
  const [month, setMonth] = useState(initial?.month ?? '');
  const [year, setYear] = useState(initial?.year ?? '');
  const [hour, setHour] = useState(initial?.hour ?? '');
  const [minute, setMinute] = useState(initial?.minute ?? '');

  const monthRef = useRef<HTMLInputElement | null>(null);
  const yearRef = useRef<HTMLInputElement | null>(null);
  const hourRef = useRef<HTMLInputElement | null>(null);
  const minuteRef = useRef<HTMLInputElement | null>(null);

  // Внешнее значение меняется кнопками-пресетами и при открытии формы.
  useEffect(() => {
    const next = partsFromValue(value);

    if (!next) {
      return;
    }

    setDay(next.day);
    setMonth(next.month);
    setYear(next.year);
    setHour(next.hour);
    setMinute(next.minute);
  }, [value]);

  function commit(next: Parts) {
    const date = build(next);

    // Незаконченный или битый набор отдаём пустым значением: родитель должен
    // видеть, что дедлайн не задан, а не сохранять старую дату.
    onChange(date ? toLocalInput(date) : '');
  }

  function digits(raw: string, maxLength: number): string {
    return raw.replace(/\D/g, '').slice(0, maxLength);
  }

  /**
   * update меняет одну часть. Родитель уведомляется только когда все шесть
   * частей заполнены — иначе первая цифра «2» тут же переписывалась бы в «02»
   * и вторую цифру ввести было бы невозможно.
   */
  function update(part: keyof Parts, raw: string, maxLength: number) {
    const next = digits(raw, maxLength);
    const state: Parts = { day, month, year, hour, minute, [part]: next };

    switch (part) {
      case 'day':
        setDay(next);
        if (next.length === 2) monthRef.current?.focus();
        break;
      case 'month':
        setMonth(next);
        if (next.length === 2) yearRef.current?.focus();
        break;
      case 'year':
        setYear(next);
        if (next.length === 4) hourRef.current?.focus();
        break;
      case 'hour':
        setHour(next);
        if (next.length === 2) minuteRef.current?.focus();
        break;
      case 'minute':
        setMinute(next);
        break;
    }

    commit(state);
  }

  /** normalize дополняет часть нулём при уходе из поля и коммитит результат. */
  function normalize(part: keyof Parts, raw: string, min: number, max: number) {
    const number = raw === '' ? min : Number(raw);
    const safe = String(Math.min(Math.max(number, min), max)).padStart(2, '0');
    const state: Parts = { day, month, year, hour, minute, [part]: safe };

    switch (part) {
      case 'day':
        setDay(safe);
        break;
      case 'month':
        setMonth(safe);
        break;
      case 'hour':
        setHour(safe);
        break;
      case 'minute':
        setMinute(safe);
        break;
      default:
        break;
    }

    commit(state);
  }

  const previewDate = build({ day, month, year, hour, minute });
  const preview = previewDate ? formatDeadline24(previewDate) : null;
  const complete =
    day.length === 2 &&
    month.length === 2 &&
    year.length === 4 &&
    hour.length === 2 &&
    minute.length === 2;
  const broken = complete && preview === null;

  const boxClass = cn(
    'rounded-lg border bg-card py-2 text-center text-sm tabular-nums text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brandLine',
    invalid ? 'border-bad' : 'border-line2',
  );

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5">
        <input
          aria-label="День"
          inputMode="numeric"
          autoComplete="off"
          placeholder="ДД"
          maxLength={2}
          value={day}
          onChange={(event) => update('day', event.target.value, 2)}
          onFocus={(event) => event.target.select()}
          onClick={(event) => event.currentTarget.select()}
          onBlur={() => normalize('day', day, 1, 31)}
          className={cn(boxClass, 'w-10')}
        />
        <span className="text-sm font-semibold text-ink3" aria-hidden="true">
          .
        </span>
        <input
          ref={monthRef}
          aria-label="Месяц"
          inputMode="numeric"
          autoComplete="off"
          placeholder="ММ"
          maxLength={2}
          value={month}
          onChange={(event) => update('month', event.target.value, 2)}
          onFocus={(event) => event.target.select()}
          onClick={(event) => event.currentTarget.select()}
          onBlur={() => normalize('month', month, 1, 12)}
          className={cn(boxClass, 'w-10')}
        />
        <span className="text-sm font-semibold text-ink3" aria-hidden="true">
          .
        </span>
        <input
          ref={yearRef}
          aria-label="Год"
          inputMode="numeric"
          autoComplete="off"
          placeholder="ГГГГ"
          maxLength={4}
          value={year}
          onChange={(event) => update('year', event.target.value, 4)}
          onFocus={(event) => event.target.select()}
          onClick={(event) => event.currentTarget.select()}
          className={cn(boxClass, 'w-14')}
        />

        <span className="mx-1 h-5 w-px bg-line2" aria-hidden="true" />

        <input
          ref={hourRef}
          aria-label="Часы"
          inputMode="numeric"
          autoComplete="off"
          placeholder="ЧЧ"
          maxLength={2}
          value={hour}
          onChange={(event) => update('hour', event.target.value, 2)}
          onFocus={(event) => event.target.select()}
          onClick={(event) => event.currentTarget.select()}
          onBlur={() => normalize('hour', hour, 0, 23)}
          className={cn(boxClass, 'w-10')}
        />
        <span className="text-sm font-semibold text-ink3" aria-hidden="true">
          :
        </span>
        <input
          ref={minuteRef}
          aria-label="Минуты"
          inputMode="numeric"
          autoComplete="off"
          placeholder="ММ"
          maxLength={2}
          value={minute}
          onChange={(event) => update('minute', event.target.value, 2)}
          onFocus={(event) => event.target.select()}
          onClick={(event) => event.currentTarget.select()}
          onBlur={() => normalize('minute', minute, 0, 59)}
          className={cn(boxClass, 'w-10')}
        />
      </div>

      <p className={cn('mt-1 text-[10px]', invalid || broken ? 'text-bad' : 'text-ink3')}>
        {broken
          ? 'Такой даты нет — проверьте ДД.ММ.ГГГГ и ЧЧ:ММ'
          : preview
            ? `${preview} · ДД.ММ.ГГГГ, 24 ч`
            : 'Заполните ДД.ММ.ГГГГ и ЧЧ:ММ · 24 ч'}
        {hint ? ` · ${hint}` : ''}
      </p>
    </div>
  );
}
