/**
 * Форматирование времени и персональных данных для UI преподавателя.
 *
 * On-time и ожидание всегда считаются по `submitted_at`, не по `reviewed_at`
 * (spec/02_FSM.md §1: «студент не наказывается за задержку преподавателя»).
 */

const dateTimeFormatter = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

const timeFormatter = new Intl.DateTimeFormat('ru-RU', {
  hour: '2-digit',
  minute: '2-digit',
});

/** «27 окт., 18:00» в локальной зоне браузера. */
export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }

  return dateTimeFormatter.format(date);
}

/** «18:00» — для журнала вердиктов за сессию. */
export function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }

  return timeFormatter.format(date);
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

/** Склонение: 1 работа / 2 работы / 5 работ. */
export function pluralWorks(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;

  if (mod10 === 1 && mod100 !== 11) {
    return 'работа';
  }

  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return 'работы';
  }

  return 'работ';
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
    return 'Студент';
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
