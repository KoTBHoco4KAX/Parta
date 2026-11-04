/**
 * Форматирование времени и персональных данных для UI преподавателя.
 *
 * On-time и ожидание всегда считаются по `submitted_at`, не по `reviewed_at`
 * (spec/02_FSM.md §1: «ученик не наказывается за задержку преподавателя»).
 */

const dateTimeFormatter = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

const dateFormatter = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'short',
});

const dateFullFormatter = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

const timeFormatter = new Intl.DateTimeFormat('ru-RU', {
  hour: '2-digit',
  minute: '2-digit',
});

const weekdayFormatter = new Intl.DateTimeFormat('ru-RU', { weekday: 'short' });

/** «27 окт., 18:00» в локальной зоне браузера. */
export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }

  return dateTimeFormatter.format(date);
}

/** «27 окт.» — компактная дата для списков. */
export function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }

  return dateFormatter.format(date);
}

/** «27 октября 2026 г.» — для итоговых карточек. */
export function formatDateFull(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }

  return dateFullFormatter.format(date);
}

/** «18:00» — для журнала вердиктов за сессию. */
export function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }

  return timeFormatter.format(date);
}

/** «пт» — короткий день недели для графика нагрузки. */
export function formatWeekday(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }

  return weekdayFormatter.format(date).replace('.', '');
}

/** «сегодня», «завтра», иначе «27 окт.». */
export function formatDayLabel(iso: string, now: number = Date.now()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }

  const diffDays = Math.round(
    (startOfDay(date).getTime() - startOfDay(new Date(now)).getTime()) / 86_400_000,
  );

  if (diffDays === 0) {
    return 'сегодня';
  }

  if (diffDays === 1) {
    return 'завтра';
  }

  if (diffDays === -1) {
    return 'вчера';
  }

  return dateFormatter.format(date);
}

/** «3 ч 05 мин», «2 дн 4 ч», «48 мин». */
export function formatDuration(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const days = Math.floor(safe / 86_400);
  const hours = Math.floor((safe % 86_400) / 3_600);
  const minutes = Math.floor((safe % 3_600) / 60);

  if (days > 0) {
    return hours > 0 ? `${days} дн ${hours} ч` : `${days} дн`;
  }

  if (hours > 0) {
    return minutes > 0 ? `${hours} ч ${String(minutes).padStart(2, '0')} мин` : `${hours} ч`;
  }

  return `${Math.max(1, minutes)} мин`;
}

/** Сколько ждёт работа: «2 ч 05 мин». */
export function formatWaiting(waitingSeconds: number): string {
  return formatDuration(waitingSeconds);
}

/** Дедлайн относительно сейчас: «осталось 2 дн», «просрочен на 5 ч». */
export function formatDeadline(deadlineIso: string, now: number): string {
  const deadline = new Date(deadlineIso).getTime();
  if (Number.isNaN(deadline)) {
    return '—';
  }

  const diffSeconds = Math.round((deadline - now) / 1000);

  if (diffSeconds >= 0) {
    return `осталось ${formatDuration(diffSeconds)}`;
  }

  return `дедлайн прошёл ${formatDuration(-diffSeconds)} назад`;
}

/**
 * formatCountdown — короткий отсчёт до момента: «2 дн 4 ч», «47 мин»,
 * для прошедшего момента — «просрочено на 3 ч».
 */
export function formatCountdown(targetIso: string | Date, now: number = Date.now()): string {
  const target = new Date(targetIso).getTime();
  if (Number.isNaN(target)) {
    return '—';
  }

  const diffSeconds = Math.round((target - now) / 1000);

  if (diffSeconds <= 0) {
    return `просрочено на ${formatDuration(-diffSeconds)}`;
  }

  if (diffSeconds < 60) {
    return 'меньше минуты';
  }

  return formatDuration(diffSeconds);
}

/** Цвет ожидания: чем дольше висит работа, тем тревожнее бейдж. */
export function waitingTone(waitingSeconds: number): 'neutral' | 'warning' | 'danger' {
  if (waitingSeconds >= 48 * 3_600) {
    return 'danger';
  }

  if (waitingSeconds >= 24 * 3_600) {
    return 'warning';
  }

  return 'neutral';
}

/** Русское склонение по числу: pluralize(3, ['работа', 'работы', 'работ']). */
export function pluralize(count: number, forms: [string, string, string]): string {
  const abs = Math.abs(count);
  const mod10 = abs % 10;
  const mod100 = abs % 100;

  if (mod10 === 1 && mod100 !== 11) {
    return forms[0];
  }

  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return forms[1];
  }

  return forms[2];
}

/** Склонение: 1 работа / 2 работы / 5 работ. */
export function pluralWorks(count: number): string {
  return pluralize(count, ['работа', 'работы', 'работ']);
}

/** Инициалы для аватара: «Артём Кузнецов» → «АК». */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((part) => part.charAt(0).toUpperCase()).join('') || '?';
}

/** Анонимизация персоны: «Артём Кузнецов» → «Артём К.». */
export function shortenName(name: string): string {
  const [first, second] = name.trim().split(/\s+/);
  if (!first) {
    return 'Ученик';
  }

  return second ? `${first} ${second.charAt(0)}.` : first;
}

/** Анонимный идентификатор для peer-review sandbox. */
export function anonymousId(prefix: 'S' | 'R', id: number): string {
  return `${prefix}-${String(id).padStart(3, '0')}`;
}

/** Короткий хвост sha256-хеша для карточки. */
export function shortHash(hash: string): string {
  if (hash.length <= 19) {
    return hash;
  }

  return `${hash.slice(0, 12)}…${hash.slice(-6)}`;
}

/** «1 250» — разряды через неразрывный пробел. */
export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) {
    return '—';
  }

  return new Intl.NumberFormat('ru-RU').format(Math.round(value));
}

/** «1 250 XP» — сумма опыта. */
export function formatXP(value: number): string {
  return `${formatNumber(value)} XP`;
}

/** «42%» — доля с защитой от деления на ноль. */
export function formatPercent(part: number, total: number): string {
  if (total <= 0) {
    return '0%';
  }

  return `${Math.round((part / total) * 100)}%`;
}

/** daysBetween — целое число суток между датами (для группировки по дням). */
export function daysBetween(from: string | Date, to: string | Date): number {
  const a = startOfDay(new Date(from)).getTime();
  const b = startOfDay(new Date(to)).getTime();

  return Math.round((b - a) / 86_400_000);
}

/** startOfDay — локальная полночь указанной даты. */
export function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);

  return copy;
}
