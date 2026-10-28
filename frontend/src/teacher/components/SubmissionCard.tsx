import type { ReviewInboxItem } from '../types';
import {
  formatDateTime,
  formatDeadline,
  formatWaiting,
  initials,
  waitingTone,
} from '../lib/format';
import { TASK_TYPE_LABEL, TASK_TYPE_TONE } from '../lib/labels';
import { Badge } from './ui';
import { IconChevronRight } from './icons';

/**
 * Карточка работы в инбоксе. Вся карточка — одна кнопка: вложенных интерактивных
 * элементов нет, поэтому доступность и клавиатура работают «из коробки».
 */
export function SubmissionCard({
  item,
  now,
  onOpen,
}: {
  item: ReviewInboxItem;
  now: number;
  onOpen: (item: ReviewInboxItem) => void;
}) {
  const submittedAt = new Date(item.submittedAt).getTime();
  const waitingSeconds = Math.max(0, Math.round((now - submittedAt) / 1000));
  const waiting = waitingTone(waitingSeconds);
  const waitingBadgeTone =
    waiting === 'danger' ? 'rose' : waiting === 'warning' ? 'amber' : 'slate';
  const lastRevision = item.revisions[item.revisions.length - 1];

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(item)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpen(item);
        }
      }}
      data-testid={`submission-card-${item.id}`}
      aria-label={`Открыть работу: ${item.studentName}, ${item.taskTitle}`}
      className="group w-full cursor-pointer rounded-2xl border border-slate-800 bg-slate-900 p-4 text-left shadow-sm transition hover:border-emerald-500/40 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500"
    >
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-xs font-semibold text-emerald-300">
          {initials(item.studentName)}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-100">
                {item.studentName}
              </p>
              <p className="mt-0.5 text-[11px] text-slate-400">
                {item.groupCode} · сдано {formatDateTime(item.submittedAt)}
              </p>
            </div>
            <Badge tone={waitingBadgeTone} className="shrink-0">
              ждёт {formatWaiting(waitingSeconds)}
            </Badge>
          </div>

          <p className="mt-2 line-clamp-2 text-sm font-medium leading-snug text-slate-200">
            {item.taskTitle}
          </p>

          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Badge tone={TASK_TYPE_TONE[item.taskType]}>
              {TASK_TYPE_LABEL[item.taskType]}
            </Badge>
            {item.teamSlotRole ? (
              <Badge tone="violet">слот {item.teamSlotRole}</Badge>
            ) : null}
            {item.attempt > 1 ? (
              <Badge tone="amber">попытка {item.attempt}</Badge>
            ) : null}
            <span
              className={
                item.onTime
                  ? 'inline-flex items-center gap-1 text-[11px] font-medium text-emerald-400'
                  : 'inline-flex items-center gap-1 text-[11px] font-medium text-rose-400'
              }
            >
              <span
                className={
                  item.onTime
                    ? 'h-1.5 w-1.5 rounded-full bg-emerald-500'
                    : 'h-1.5 w-1.5 rounded-full bg-rose-500'
                }
              />
              {item.onTime ? 'сдано вовремя' : 'после дедлайна'}
            </span>
          </div>

          {lastRevision ? (
            <div className="mt-2.5 rounded-lg bg-amber-500/10 px-2.5 py-2 text-[11px] leading-relaxed text-amber-200">
              <span className="font-semibold">Прошлое отклонение:</span>{' '}
              {lastRevision.comment}
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-800 pt-2.5 text-[11px] text-slate-400">
        <span>{formatDeadline(item.deadlineAt, now)}</span>
        <span className="inline-flex items-center gap-1 font-medium text-emerald-400 group-hover:text-emerald-300">
          Проверить
          <IconChevronRight className="h-3.5 w-3.5" />
        </span>
      </div>
    </div>
  );
}
