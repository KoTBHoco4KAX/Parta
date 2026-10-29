import { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError, fetchSubmissions, fetchTasks, moveSubmission } from '../../core/api';
import { useAuth } from '../../core/auth';
import { isSubmissionBoardEvent } from '../../core/ws';
import type { Submission, Task } from '../../core/types';
import { Button } from '../../components/Button';
import SubmitWorkModal from '../components/SubmitWorkModal';
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

// KanbanPage — реальная доска студента: GET /api/tasks + /api/submissions,
// движения через POST /api/submissions и PATCH /api/submissions/{id}/status.
export default function KanbanPage() {
  const { subscribe } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draggedTaskId, setDraggedTaskId] = useState<number | null>(null);
  const [selected, setSelected] = useState<Submission | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);

    try {
      const [nextTasks, nextSubmissions] = await Promise.all([
        fetchTasks(),
        fetchSubmissions(),
      ]);

      setTasks(nextTasks);
      setSubmissions(nextSubmissions);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Не удалось загрузить доску.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Реалтайм: сдача работы студентом и вердикт преподавателя приходят по WS.
  // Перечитываем доску с сервера, а не правим локальную копию «на глаз».
  useEffect(
    () =>
      subscribe((event) => {
        if (isSubmissionBoardEvent(event)) {
          void load();
        }
      }),
    [load, subscribe],
  );

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

  async function handleDrop(task: Task, target: TaskStatus) {
    const submission = submissionByTask.get(task.id) ?? null;
    const current = statusFromSubmission(submission?.status);

    if (busy || current === target) {
      return;
    }

    setBusy(true);
    setError(null);

    try {
      if (!submission) {
        setError('Карточка ещё не создана сервером. Обновите доску.');
        return;
      }

      if (target === 'in-progress') {
        if (submission.status === 'TODO') {
          await moveSubmission(submission.id, 'START');
        } else if (submission.status === 'REJECTED') {
          await moveSubmission(submission.id, 'REOPEN');
        }
      } else if (target === 'review') {
        // Сдавать можно из TODO или IN_PROGRESS: сначала START, затем модалка.
        if (submission.status === 'TODO') {
          await moveSubmission(submission.id, 'START');
        }

        if (submission.status === 'TODO' || submission.status === 'IN_PROGRESS') {
          setSelected(submission);
        }
      }

      await load();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Не удалось переместить карточку.');
    } finally {
      setBusy(false);
      setDraggedTaskId(null);
    }
  }

  if (loading) {
    return <p className="py-10 text-center text-sm text-slate-400">Загружаем доску…</p>;
  }

  return (
    <div>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-slate-100">Канбан-доска</h1>
          <p className="mt-0.5 text-xs text-slate-400">Перетащите карточку, чтобы сменить статус.</p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => void load()}>
          Обновить
        </Button>
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
                onDrop={() => {
                  const task = tasks.find((candidate) => candidate.id === draggedTaskId);
                  if (task) {
                    void handleDrop(task, column.id);
                  }
                }}
                onDragOver={(event) => event.preventDefault()}
                className="rounded-xl border border-slate-800 bg-slate-900/60 p-3"
              >
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  {column.title} · {columnCards.length}
                </h2>

                <div className="space-y-2">
                  {columnCards.map(({ task, submission, status }) => (
                    <article
                      key={task.id}
                      draggable
                      onDragStart={() => setDraggedTaskId(task.id)}
                      onClick={() => {
                        if (submission?.status === 'IN_PROGRESS') {
                          setSelected(submission);
                        }
                      }}
                      className="cursor-move rounded-lg border border-slate-800 bg-slate-950 p-3 hover:border-slate-700"
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
                        {status === 'in-progress' ? (
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

      {selected ? (
        <SubmitWorkModal
          submissionId={selected.id}
          taskTitle={selected.task_title}
          initialUrl={selected.artifact_url}
          initialHash={selected.artifact_hash}
          onClose={() => setSelected(null)}
          onSubmitted={() => {
            setSelected(null);
            void load();
          }}
        />
      ) : null}
    </div>
  );
}
