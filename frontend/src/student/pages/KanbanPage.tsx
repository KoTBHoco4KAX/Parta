import { useMemo, useState } from 'react';
import { ApiError, moveSubmission } from '../../core/api';
import type { Submission, Task } from '../../core/types';
import TaskDetailsModal from '../components/TaskDetailsModal';
import { useKanbanBoard } from '../hooks/useKanbanBoard';
import type { TaskStatus } from '../types';

const columns: { id: TaskStatus; title: string }[] = [
  { id: 'todo', title: 'К выполнению' },
  { id: 'in-progress', title: 'В работе' },
  { id: 'review', title: 'На проверке' },
  { id: 'done', title: 'Готово' },
];

function statusFromSubmission(status: Submission['status'] | undefined): TaskStatus {
  switch (status) {
    case 'IN_PROGRESS':
      return 'in-progress';
    case 'REVIEW':
      return 'review';
    case 'DONE':
      return 'done';
    case 'TODO':
    case 'REJECTED':
    default:
      return 'todo';
  }
}

// KanbanPage — доска студента без drag-n-drop: клик по карточке открывает
// задание, а карточка TODO/REJECTED сразу переводится в работу.
export default function KanbanPage() {
  const { tasks, submissions, loading, error: loadError, reload } = useKanbanBoard();
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const error = actionError ?? loadError;

  const submissionByTask = useMemo(() => {
    const map = new Map<number, Submission>();
    for (const submission of submissions) {
      map.set(submission.task_id, submission);
    }

    return map;
  }, [submissions]);

  const cards = useMemo(
    () =>
      tasks.map((task) => ({
        task,
        submission: submissionByTask.get(task.id) ?? null,
        status: statusFromSubmission(submissionByTask.get(task.id)?.status),
      })),
    [tasks, submissionByTask],
  );

  const selectedCard = useMemo(() => {
    const card = cards.find((candidate) => candidate.task.id === selectedTaskId);

    if (!card || !card.submission) {
      return null;
    }

    return { task: card.task, submission: card.submission };
  }, [cards, selectedTaskId]);

  async function handleCardClick(task: Task) {
    if (busy) {
      return;
    }

    const card = cards.find((candidate) => candidate.task.id === task.id);
    const submission = card?.submission ?? null;

    if (!submission) {
      setActionError('Карточка ещё не создана сервером. Подождите — доска обновится автоматически.');
      return;
    }

    setSelectedTaskId(task.id);

    // Первый клик по входящей карточке — это и есть «взять в работу».
    if (submission.status !== 'TODO' && submission.status !== 'REJECTED') {
      return;
    }

    setBusy(true);
    setActionError(null);

    try {
      await moveSubmission(submission.id, submission.status === 'TODO' ? 'START' : 'REOPEN');
      reload();
    } catch (cause) {
      setActionError(cause instanceof ApiError ? cause.message : 'Не удалось взять задание в работу.');
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <p className="py-10 text-center text-sm text-slate-400">Загружаем доску…</p>;
  }

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-lg font-bold text-slate-100">Канбан-доска</h1>
        <p className="mt-0.5 text-xs text-slate-400">
          Нажмите на карточку: откроется задание, а входящая сразу перейдёт в работу.
        </p>
      </div>

      {error ? (
        <p role="alert" className="mb-3 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
          {error}
        </p>
      ) : null}

      {tasks.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-800 p-6 text-center text-sm text-slate-500">
          Заданий пока нет. Они появятся, когда преподаватель опубликует работу.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {columns.map((column) => {
            const columnCards = cards.filter((card) => card.status === column.id);

            return (
              <section
                key={column.id}
                className="rounded-xl border border-slate-800 bg-slate-900/60 p-3"
              >
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  {column.title} · {columnCards.length}
                </h2>

                <div className="space-y-2">
                  {columnCards.map(({ task, submission }) => (
                    <article
                      key={task.id}
                      role="button"
                      tabIndex={0}
                      aria-busy={busy || undefined}
                      onClick={() => void handleCardClick(task)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          void handleCardClick(task);
                        }
                      }}
                      className="cursor-pointer rounded-lg border border-slate-800 bg-slate-950 p-3 transition hover:border-emerald-500/40 hover:bg-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
                    >
                      <h3 className="text-sm font-medium text-slate-100">{task.title}</h3>
                      <p className="mt-1 line-clamp-2 text-xs text-slate-400">{task.description_md}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px]">
                        <span className="rounded-full bg-slate-800 px-2 py-0.5 text-slate-300">
                          {task.task_type}
                        </span>
                        <span className="text-slate-500">до {new Date(task.deadline_at).toLocaleDateString()}</span>
                        {submission?.status === 'REJECTED' ? (
                          <span className="rounded-full bg-rose-500/15 px-2 py-0.5 text-rose-300">доработка</span>
                        ) : null}
                        {submission?.status === 'TODO' ? (
                          <span className="text-emerald-400">нажмите, чтобы взять в работу</span>
                        ) : null}
                        {submission?.status === 'REJECTED' ? (
                          <span className="text-amber-400">нажмите, чтобы вернуть в работу</span>
                        ) : null}
                        {submission?.status === 'IN_PROGRESS' ? (
                          <span className="text-emerald-400">нажмите, чтобы сдать</span>
                        ) : null}
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {selectedCard ? (
        <TaskDetailsModal
          task={selectedCard.task}
          submission={selectedCard.submission}
          onClose={() => setSelectedTaskId(null)}
          onSubmitted={() => {
            setSelectedTaskId(null);
            reload();
          }}
        />
      ) : null}
    </div>
  );
}
