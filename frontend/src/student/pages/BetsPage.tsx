import { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError, fetchTasks, fetchWagers, placeWager } from '../../core/api';
import type { Task, Wager } from '../../core/types';
import { Button } from '../../components/Button';
import { Modal } from '../../components/Modal';
import { useAuth } from '../../core/auth';

const STATUS_LABEL: Record<Wager['status'], string> = {
  PLACED: 'Активно',
  WON: 'Выиграно',
  LOST: 'Проиграно',
  CANCELLED: 'Отменено',
};

const STATUS_CLASS: Record<Wager['status'], string> = {
  PLACED: 'bg-sky-500/15 text-sky-300',
  WON: 'bg-emerald-500/15 text-emerald-300',
  LOST: 'bg-rose-500/15 text-rose-300',
  CANCELLED: 'bg-slate-700 text-slate-300',
};

function toLocalInput(iso: string): string {
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, '0');

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// BetsPage — пари студента: GET /api/wagers и POST /api/wagers.
export default function BetsPage() {
  const { user } = useAuth();
  const [wagers, setWagers] = useState<Wager[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [taskId, setTaskId] = useState<number | ''>('');
  const [stake, setStake] = useState('50');
  const [deadline, setDeadline] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setError(null);

    try {
      const [nextWagers, nextTasks] = await Promise.all([fetchWagers(), fetchTasks()]);
      setWagers(nextWagers);
      setTasks(nextTasks);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Не удалось загрузить пари.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const selectedTask = useMemo(
    () => tasks.find((task) => task.id === taskId) ?? null,
    [tasks, taskId],
  );

  function openCreate() {
    const firstTask = tasks[0] ?? null;
    setTaskId(firstTask?.id ?? '');
    setDeadline(firstTask ? toLocalInput(firstTask.deadline_at) : '');
    setStake('50');
    setShowCreate(true);
  }

  async function handleCreate() {
    if (!selectedTask || taskId === '') {
      setError('Выберите задание.');
      return;
    }

    const amount = Number(stake);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Ставка должна быть положительной.');
      return;
    }

    if (user && amount > user.xp_balance) {
      setError('Ставка больше баланса XP.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      await placeWager({
        task_id: selectedTask.id,
        stake_amount: amount,
        deadline_at: new Date(deadline).toISOString(),
      });
      setShowCreate(false);
      await load();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Не удалось создать пари.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-slate-100">Пари</h1>
          <p className="mt-0.5 text-xs text-slate-400">Ставка XP на собственный результат.</p>
        </div>
        <Button size="sm" onClick={openCreate} disabled={tasks.length === 0}>
          Создать пари
        </Button>
      </div>

      {error ? (
        <p role="alert" className="mb-3 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="py-8 text-center text-sm text-slate-400">Загружаем пари…</p>
      ) : wagers.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-800 p-6 text-center text-sm text-slate-500">
          Активных пари нет. Создайте пари на задание, чтобы проверить себя.
        </p>
      ) : (
        <ul className="space-y-2">
          {wagers.map((wager) => (
            <li key={wager.id} className="rounded-xl border border-slate-800 bg-slate-900 p-4">
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-sm font-medium text-slate-100">{wager.task_title}</h2>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] ${STATUS_CLASS[wager.status]}`}>
                  {STATUS_LABEL[wager.status]}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-400">Ставка: {wager.stake_amount} XP</p>
              <p className="mt-0.5 text-[11px] text-slate-500">
                Дедлайн пари: {new Date(wager.deadline_at).toLocaleString()}
              </p>
              {wager.resolution_note ? (
                <p className="mt-1 text-[11px] text-slate-400">{wager.resolution_note}</p>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {showCreate ? (
        <Modal
          open
          onClose={() => setShowCreate(false)}
          title="Создать пари"
          footer={
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setShowCreate(false)} disabled={submitting}>
                Отмена
              </Button>
              <Button onClick={handleCreate} loading={submitting}>
                Создать
              </Button>
            </div>
          }
        >
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-300" htmlFor="wager-task">
                Задание
              </label>
              <select
                id="wager-task"
                value={taskId}
                onChange={(event) => {
                  const nextId = Number(event.target.value);
                  const task = tasks.find((candidate) => candidate.id === nextId);
                  setTaskId(nextId);
                  if (task) {
                    setDeadline(toLocalInput(task.deadline_at));
                  }
                }}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none"
              >
                {tasks.map((task) => (
                  <option key={task.id} value={task.id}>
                    {task.title}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-300" htmlFor="wager-stake">
                Ставка, XP
              </label>
              <input
                id="wager-stake"
                type="number"
                min={1}
                value={stake}
                onChange={(event) => setStake(event.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-300" htmlFor="wager-deadline">
                Дедлайн пари
              </label>
              <input
                id="wager-deadline"
                type="datetime-local"
                value={deadline}
                max={selectedTask ? toLocalInput(selectedTask.deadline_at) : undefined}
                onChange={(event) => setDeadline(event.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none"
              />
            </div>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
