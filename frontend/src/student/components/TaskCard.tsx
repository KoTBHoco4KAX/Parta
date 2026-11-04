import type { BoardCard } from '../types';

// STATUS_LABEL / STATUS_CHIP — витринные подписи статусов карточки (spec/02_FSM.md).
const STATUS_CHIP: Record<string, string> = {
  TODO: 'bg-slate-800 text-slate-300',
  IN_PROGRESS: 'bg-sky-500/15 text-sky-300',
  REVIEW: 'bg-amber-500/15 text-amber-300',
  DONE: 'bg-emerald-500/15 text-emerald-300',
  REJECTED: 'bg-rose-500/15 text-rose-300',
};

const STATUS_LABEL: Record<string, string> = {
  TODO: 'Не начато',
  IN_PROGRESS: 'в работе',
  REVIEW: 'на проверке',
  DONE: 'принято',
  REJECTED: 'на доработку',
};

export interface TaskCardProps {
  card: BoardCard;
  dragging: boolean;
  // draggable=false у «замороженных» статусов (REVIEW/DONE): FSM их не двигает.
  draggable: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onOpen: () => void;
}

// TaskCard — карточка канбана: HTML5 drag-n-drop + тап открывает список
// доступных действий (fallback для тач-устройств, где DnD недоступен).
export function TaskCard({
  card,
  dragging,
  draggable,
  onDragStart,
  onDragEnd,
  onOpen,
}: TaskCardProps) {
  const { task, submission } = card;
  const status = submission?.status ?? 'TODO';
  const isLocked = status === 'REVIEW' || status === 'DONE';

  return (
    <article
      draggable={draggable && !isLocked}
      onDragStart={isLocked ? undefined : onDragStart}
      onDragEnd={onDragEnd}
      onClick={onOpen}
      className={[
        'rounded-lg border bg-slate-950 p-3 transition',
        dragging ? 'opacity-40' : 'border-slate-800 active:bg-slate-900',
        isLocked ? '' : 'cursor-move hover:border-slate-700',
      ].join(' ')}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="min-w-0 flex-1 text-sm font-medium leading-snug text-slate-100">
          {task.title}
        </h3>
        <span className="shrink-0 text-[11px] font-semibold tabular-nums text-emerald-400">
          +{task.baseXp}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px]">
        <span className="rounded-full bg-slate-800 px-2 py-0.5 text-slate-300">{task.taskType}</span>
        <span className={`rounded-full px-2 py-0.5 ${STATUS_CHIP[status]}`}>
          {STATUS_LABEL[status]}
        </span>
        {status !== 'DONE' ? (
          <span className="text-slate-500">до {new Date(task.deadlineAt).toLocaleDateString()}</span>
        ) : null}
      </div>
    </article>
  );
}

export { STATUS_LABEL, STATUS_CHIP };

export default TaskCard;
