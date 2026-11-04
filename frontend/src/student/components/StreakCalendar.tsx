// StreakCalendar — «трешница» on-time сдач: 8 недель × 7 дней, как в habit-трекерах.
// On-time считается по факту сдачи (submitted_at ≤ deadline), поэтому за задержку
// преподавателя стрелок не сбрасывается (spec: «студент не наказывается за
// задержку преподавателя»).

export interface StreakCalendarProps {
  daysOnTime: string[];
  weeks?: number;
}

function dateKey(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function StreakCalendar({ daysOnTime, weeks = 8 }: StreakCalendarProps) {
  const onTime = new Set(daysOnTime);
  const today = new Date();
  const columns: { key: string; cells: { key: string; on: boolean; weekday: number }[] }[] = [];

  for (let week = weeks - 1; week >= 0; week -= 1) {
    // Понедельник недели: ((getDay() + 6) % 7) — корректно и в воскресенье
    // (getDay()=0); наивная формула «date - getDay() + 1» там сдвигала сетку.
    const monday = new Date(today);
    monday.setDate(today.getDate() - ((today.getDay() + 6) % 7) - week * 7);
    const cells: { key: string; on: boolean; weekday: number }[] = [];

    for (let day = 0; day < 7; day += 1) {
      const cell = new Date(monday);
      cell.setDate(monday.getDate() + day);

      if (cell > today) {
        continue;
      }

      cells.push({
        key: dateKey(cell),
        on: onTime.has(dateKey(cell)),
        weekday: day,
      });
    }

    columns.push({ key: `week-${week}`, cells });
  }

  return (
    <div className="flex gap-1 overflow-x-auto" role="img" aria-label="Календарь сданных вовремя работ">
      {columns.map((column) => (
        <div key={column.key} className="grid grid-rows-7 gap-1">
          {column.cells.map((cell) => (
            <span
              key={cell.key}
              title={`${cell.key}${cell.on ? ' · сдано вовремя' : ''}`}
              className={[
                'h-3 w-3 rounded-[3px]',
                cell.on ? 'bg-brand' : 'bg-sunken',
              ].join(' ')}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
