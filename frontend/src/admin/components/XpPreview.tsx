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
    <section className="rounded-2xl border border-slate-800 bg-slate-900 p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400">
          <IconSparkles className="h-4 w-4" />
        </span>
        <h2 className="text-sm font-semibold text-slate-100">Расчёт Base XP</h2>
        <Badge tone="slate" className="ml-auto">
          предпросмотр
        </Badge>
      </div>

      {parts ? (
        <>
          <div className="mt-3 rounded-xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/15 to-violet-500/10 p-3.5">
            <p className="text-[10px] font-medium uppercase tracking-wide text-emerald-300/70">
              {taskType === 'TEAM_PROJECT' ? 'Slot Base XP' : 'Base XP'}
            </p>
            <p className="mt-0.5 text-3xl font-black tabular-nums text-emerald-200">
              {parts.baseXP}
              <span className="ml-1 text-sm font-semibold text-emerald-200/70">XP</span>
            </p>
            <p className="mt-1 text-[11px] text-emerald-200/70">
              {taskType === 'TEAM_PROJECT'
                ? `на каждый из ${teamSize} слотов`
                : `за задачу · ${TASK_TYPE_LABEL[taskType]}`}
            </p>
          </div>

          <dl className="mt-3 space-y-1.5 text-[11px]">
            <div className="flex items-baseline justify-between gap-2">
              <dt className="text-slate-400">D, дней до дедлайна</dt>
              <dd className="font-mono tabular-nums text-slate-200">
                {parts.days.toFixed(2)} дн
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <dt className="text-slate-400">C, сложность</dt>
              <dd className="font-mono tabular-nums text-slate-200">
                {parts.complexity.toFixed(2)}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <dt className="text-slate-400">F_d, фактор дедлайна</dt>
              <dd className="font-mono tabular-nums text-slate-200">
                {parts.deadlineFactor.toFixed(2)}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-2 border-t border-slate-800 pt-1.5">
              <dt className="text-slate-400">Base XP задания</dt>
              <dd className="font-mono tabular-nums text-slate-200">
                {parts.rawBaseXP}
              </dd>
            </div>
            {parts.slotBaseXP !== null ? (
              <div className="flex items-baseline justify-between gap-2">
                <dt className="text-slate-400">
                  ÷ {teamSize} × {TEAM_SLOT_FACTOR}
                </dt>
                <dd className="font-mono tabular-nums text-emerald-300">
                  {parts.slotBaseXP} XP
                </dd>
              </div>
            ) : null}
          </dl>

          <div className="mt-3 border-t border-slate-800 pt-3">
            <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
              Итог по скорости сдачи
            </p>
            <div className="mt-1.5 grid grid-cols-3 gap-1.5">
              {MULTIPLIERS.map((entry) => (
                <div
                  key={entry.key}
                  className="rounded-lg bg-slate-900 px-2 py-1.5 text-center"
                >
                  <p className="text-[10px] font-medium text-slate-400">{entry.label}</p>
                  <p className="mt-0.5 text-sm font-bold tabular-nums text-slate-100">
                    {computeFinalXP(parts.baseXP, entry.multiplier)}
                  </p>
                  <p className="text-[9px] text-slate-400">{entry.hint}</p>
                </div>
              ))}
            </div>
          </div>

          {slots.length > 0 ? (
            <div className="mt-3 border-t border-slate-800 pt-3">
              <p className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-slate-400">
                <IconLayers className="h-3.5 w-3.5" />
                Слоты ({slots.length})
              </p>
              <ul className="mt-1.5 space-y-1">
                {slots.map((slot) => (
                  <li
                    key={slot.code}
                    className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/60 px-2 py-1 text-[11px]"
                  >
                    <span className="rounded bg-slate-900 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-emerald-300 ring-1 ring-inset ring-emerald-500/20">
                      {slot.code}
                    </span>
                    <span className="truncate text-slate-300">{slot.title}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      ) : (
        <p className="mt-3 rounded-xl bg-slate-900 p-3 text-[11px] leading-relaxed text-slate-400">
          Заполните R, H и дедлайн — покажем Base XP и Slot Base XP. Значения
          пересчитываются на каждое изменение.
        </p>
      )}

      <p className="mt-3 border-t border-slate-800 pt-3 text-[10px] leading-relaxed text-slate-400">
        Base XP = max(10, round(50 · C · F_d)), C = w · (0.4R + 0.6H),
        F_d = clamp(1 + ln(1 + 7/D), 1.0, 2.5). XP считает сервер, ручной ввод
        запрещён.
      </p>
    </section>
  );
}
