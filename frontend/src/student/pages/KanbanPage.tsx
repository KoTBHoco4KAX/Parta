import { useMemo, useState } from 'react';
import { ApiError, moveSubmission } from '../../core/api';
import type { Submission, Task } from '../../core/types';
import TaskDetailsModal from '../components/TaskDetailsModal';
import { useKanbanBoard } from '../hooks/useKanbanBoard';

// Колонки канбана — статусы карточки напрямую из submissions.status.
const columns: { id: Submission['status']; title: string }[] = [
  { id: 'TODO', title: 'К выполнению' },
  { id: 'IN_PROGRESS', title: 'В работе' },
  { id: 'REVIEW', title: 'На проверке' },
  { id: 'DONE', title: 'Готово' },
  { id: 'REJECTED', title: 'На доработке' },
];

// statusOf — исходный статус карточки; REJECTED живёт в своей колонке.
function statusOf(submission: Submission | null): Submission['status'] {
  return submission?.status ?? 'TODO';
}

// KanbanPage — доска ученика без drag-n-drop: клик по карточке открывает
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
      tasks.map((task) => {
        const submission = submissionByTask.get(task.id) ?? null;

        return { task, submission, status: statusOf(submission) };
      }),
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
    return (
      <div className="space-y-3">
        {[0, 1, 2].map((row) => (
          <div key={row} className="h-20 animate-pulse rounded-2xl bg-card" />
        ))}
      </div>
    );
  }

  return (
    <div>
      {error ? (
        <p role="alert" className="mb-3 rounded-xl border border-badLine bg-badSoft px-3 py-2 text-xs text-bad">
          {error}
        </p>
      ) : null}

      {tasks.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line px-5 py-8 text-center text-sm text-ink3">
          Заданий пока нет — они появятся, когда преподаватель опубликует работу.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {columns.map((column) => {
            const columnCards = cards.filter((card) => card.status === column.id);

            return (
              <section key={column.id} className="rounded-2xl border border-line bg-muted p-3">
                <h2 className="mb-2 flex items-center justify-between px-1 text-xs font-semibold uppercase tracking-wide text-ink3">
                  <span>{column.title}</span>
                  <span className="tabular-nums">{columnCards.length}</span>
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
                      className="cursor-pointer rounded-xl border border-line bg-card p-3 shadow-[var(--shadow-card)] transition hover:border-brandLine focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="min-w-0 flex-1 text-sm font-semibold text-ink">{task.title}</h3>
                        <span className="shrink-0 text-[11px] font-semibold tabular-nums text-brand">
                          +{task.base_xp_computed}
                        </span>
                      </div>
                      <p className="mt-1 line-clamp-2 text-xs text-ink3">{task.description_md}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px]">
                        <span className="rounded-full bg-sunken px-2 py-0.5 text-ink3">
                          {task.task_type}
                        </span>
                        <span className="text-ink4">до {new Date(task.deadline_at).toLocaleDateString()}</span>
                        {submission?.status === 'TODO' ? (
                          <span className="text-brand">нажмите, чтобы взять в работу</span>
                        ) : null}
                        {submission?.status === 'REJECTED' ? (
                          <span className="text-warn">нажмите, чтобы вернуть в работу</span>
                        ) : null}
                        {submission?.status === 'IN_PROGRESS' ? (
                          <span className="text-brand">нажмите, чтобы сдать</span>
                        ) : null}
                      </div>
                    </article>
                  ))}

                  {columnCards.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-line px-2 py-4 text-center text-[11px] text-ink4">
                      пусто
                    </p>
                  ) : null}
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
