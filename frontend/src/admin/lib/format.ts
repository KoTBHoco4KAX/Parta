const dateTimeFormatter = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'short',
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

/** Русское склонение: 1 слот / 2 слота / 5 слотов. */
export function plural(count: number, one: string, few: string, many: string): string {
  const mod10 = count % 10;
  const mod100 = count % 100;

  if (mod10 === 1 && mod100 !== 11) {
    return one;
  }

  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return few;
  }

  return many;
}

export function pluralSlots(count: number): string {
  return plural(count, 'слот', 'слота', 'слотов');
}

export function pluralAssignments(count: number): string {
  return plural(count, 'назначение', 'назначения', 'назначений');
}
