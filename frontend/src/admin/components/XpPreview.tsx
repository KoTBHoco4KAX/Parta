import type { TaskType } from '../types';
import {
  MULTIPLIERS,
  TEAM_SLOT_FACTOR,
  TASK_TYPE_LABEL,
  buildTeamSlots,
  computeFinalXP,
  type XPParts,
} from '../lib/xp';
import { Badge } from './ui';
import { IconLayers, IconSparkles } from './icons';

/**
 * Живой предпросмотр формулы Base XP. Значение справа — то, что вернёт сервер
 * (backend/internal/domain/xp), а не то, что можно отредактировать.
 */
export function XpPreview({
  parts,
  taskType,
  teamSize,
}: {
  parts: XPParts | null;
  taskType: TaskType;
  teamSize: number;
}) {
  const slots = buildTeamSlots(taskType, teamSize);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
          <IconSparkles className="h-4 w-4" />
        </span>
        <h2 className="text-sm font-semibold text-slate-900">Расчёт Base XP</h2>
        <Badge tone="slate" className="ml-auto">
          предпросмотр
        </Badge>
      </div>

      {parts ? (
        <>
          <div className="mt-3 rounded-xl bg-gradient-to-br from-indigo-50 to-violet-50 p-3.5">
            <p className="text-[10px] font-medium uppercase tracking-wide text-indigo-700/70">
              {taskType === 'TEAM_PROJECT' ? 'Slot Base XP' : 'Base XP'}
            </p>
            <p className="mt-0.5 text-3xl font-black tabular-nums text-indigo-950">
              {parts.baseXP}
              <span className="ml-1 text-sm font-semibold text-indigo-900/60">XP</span>
            </p>
            <p className="mt-1 text-[11px] text-indigo-900/60">
              {taskType === 'TEAM_PROJECT'
                ? `на каждый из ${teamSize} слотов`
                : `за задачу · ${TASK_TYPE_LABEL[taskType]}`}
            </p>
          </div>

          <dl className="mt-3 space-y-1.5 text-[11px]">
            <div className="flex items-baseline justify-between gap-2">
              <dt className="text-slate-500">D, дней до дедлайна</dt>
              <dd className="font-mono tabular-nums text-slate-800">
                {parts.days.toFixed(2)} дн
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <dt className="text-slate-500">C, сложность</dt>
              <dd className="font-mono tabular-nums text-slate-800">
                {parts.complexity.toFixed(2)}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <dt className="text-slate-500">F_d, фактор дедлайна</dt>
              <dd className="font-mono tabular-nums text-slate-800">
                {parts.deadlineFactor.toFixed(2)}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-2 border-t border-slate-100 pt-1.5">
              <dt className="text-slate-500">Base XP задания</dt>
              <dd className="font-mono tabular-nums text-slate-800">
                {parts.rawBaseXP}
              </dd>
            </div>
            {parts.slotBaseXP !== null ? (
              <div className="flex items-baseline justify-between gap-2">
                <dt className="text-slate-500">
                  ÷ {teamSize} × {TEAM_SLOT_FACTOR}
                </dt>
                <dd className="font-mono tabular-nums text-indigo-700">
                  {parts.slotBaseXP} XP
                </dd>
              </div>
            ) : null}
          </dl>

          <div className="mt-3 border-t border-slate-100 pt-3">
            <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
              Итог по скорости сдачи
            </p>
            <div className="mt-1.5 grid grid-cols-3 gap-1.5">
              {MULTIPLIERS.map((entry) => (
                <div
                  key={entry.key}
                  className="rounded-lg bg-slate-50 px-2 py-1.5 text-center"
                >
                  <p className="text-[10px] font-medium text-slate-500">{entry.label}</p>
                  <p className="mt-0.5 text-sm font-bold tabular-nums text-slate-900">
                    {computeFinalXP(parts.baseXP, entry.multiplier)}
                  </p>
                  <p className="text-[9px] text-slate-400">{entry.hint}</p>
                </div>
              ))}
            </div>
          </div>

          {slots.length > 0 ? (
            <div className="mt-3 border-t border-slate-100 pt-3">
              <p className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-slate-500">
                <IconLayers className="h-3.5 w-3.5" />
                Слоты ({slots.length})
              </p>
              <ul className="mt-1.5 space-y-1">
                {slots.map((slot) => (
                  <li
                    key={slot.code}
                    className="flex items-center gap-2 rounded-lg border border-slate-100 bg-slate-50/60 px-2 py-1 text-[11px]"
                  >
                    <span className="rounded bg-white px-1.5 py-0.5 font-mono text-[10px] font-semibold text-indigo-700 ring-1 ring-inset ring-indigo-100">
                      {slot.code}
                    </span>
                    <span className="truncate text-slate-600">{slot.title}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      ) : (
        <p className="mt-3 rounded-xl bg-slate-50 p-3 text-[11px] leading-relaxed text-slate-500">
          Заполните R, H и дедлайн — покажем Base XP и Slot Base XP. Значения
          пересчитываются на каждое изменение.
        </p>
      )}

      <p className="mt-3 border-t border-slate-100 pt-3 text-[10px] leading-relaxed text-slate-400">
        Base XP = max(10, round(50 · C · F_d)), C = w · (0.4R + 0.6H),
        F_d = clamp(1 + ln(1 + 7/D), 1.0, 2.5). XP считает сервер, ручной ввод
        запрещён.
      </p>
    </section>
  );
}
