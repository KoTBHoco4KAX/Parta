import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '../../core/api';
import { getBoard, getProfile, getWagers, placeWager, subscribe } from '../api';
import { Button } from '../../components/Button';
import { Modal } from '../../components/Modal';
import type { Profile, StudentWager } from '../types';

const STATUS_LABEL: Record<StudentWager['status'], string> = {
  PLACED: 'Активно',
  WON: 'Выиграно',
  LOST: 'Проиграно',
  CANCELLED: 'Отменено',
};

const STATUS_CLASS: Record<StudentWager['status'], string> = {
  PLACED: 'bg-brandSoft text-brand',
  WON: 'bg-okSoft text-ok',
  LOST: 'bg-badSoft text-bad',
  CANCELLED: 'bg-sunken text-ink3',
};

// toLocalInput — ISO → значение для <input type="datetime-local">.
function toLocalInput(iso: string): string {
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, '0');

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

interface WagerableTask {
  id: number;
  title: string;
  deadlineAt: string;
}

// BetsPage — пари студента: ставка XP на собственный результат. Escrow списывается
// сразу, победа возвращает ×2 (spec §6.3: победа ⇔ работа DONE до дедлайна пари).
export default function BetsPage() {
  const [wagers, setWagers] = useState<StudentWager[]>([]);
  const [tasks, setTasks] = useState<WagerableTask[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Поля формы создания пари.
  const [taskId, setTaskId] = useState('');
  const [stake, setStake] = useState('100');
  const [deadline, setDeadline] = useState('');

  const load = useCallback(async () => {
    try {
      const [nextWagers, nextProfile] = await Promise.all([getWagers(), getProfile()]);
      setWagers(nextWagers);
      setProfile(nextProfile);

      // Ставить можно на задания, где ещё нет DONE (парный дедлайн — из доски).
      const board = await getBoard();
      const nextTasks = board.cards
        .filter((card) => card.submission?.status !== 'DONE')
        .map((card) => ({
          id: card.task.id,
          title: card.task.title,
          deadlineAt: card.task.deadlineAt,
        }));

      setTasks(nextTasks);
      setError(null);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Не удалось загрузить пари.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();

    // Разрешение пари (WON) в моке приезжает после вердикта — перечитываем.
    return subscribe(() => {
      void load();
    });
  }, [load]);

  const active = wagers.filter((wager) => wager.status === 'PLACED');
  const resolved = wagers.filter((wager) => wager.status !== 'PLACED');
  const selectedTask = tasks.find((task) => String(task.id) === taskId) ?? null;
  const stakeAmount = Number(stake);

  function afterTaskSelected(nextTaskId: string) {
    setTaskId(nextTaskId);
    const task = tasks.find((candidate) => String(candidate.id) === nextTaskId);

    if (task) {
      setDeadline(toLocalInput(task.deadlineAt));
    }
  }

  function openCreate() {
    const first = tasks[0];

    if (first) {
      afterTaskSelected(String(first.id));
    }

    setError(null);
    setShowCreate(true);
  }

  async function handleCreate() {
    if (!selectedTask) {
      setError('Выберите задание.');
      return;
    }

    if (!Number.isFinite(stakeAmount) || stakeAmount <= 0) {
      setError('Ставка должна быть положительной.');
      return;
    }

    const deadlineDate = new Date(deadline);

    if (deadline === '' || !Number.isFinite(deadlineDate.getTime())) {
      setError('Укажите дедлайн пари.');
      return;
    }

    if (profile && stakeAmount > profile.xpBalance) {
      setError(`Ставка больше баланса: ${profile.xpBalance} XP.`);
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      await placeWager({
        taskId: selectedTask.id,
        stakeAmount,
        deadlineAt: deadlineDate.toISOString(),
      });
      setShowCreate(false);
      await load();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Не удалось создать пари.');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading || !profile) {
    return (
      <div className="space-y-3">
        <div className="h-20 animate-pulse rounded-2xl bg-card" />
        <div className="h-32 animate-pulse rounded-2xl bg-card" />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink">Пари</h1>
          <p className="mt-0.5 text-sm text-ink3">Ставка XP на собственный результат.</p>
        </div>
        <Button size="sm" onClick={openCreate} disabled={tasks.length === 0}>
          Создать
        </Button>
      </div>

      <section className="mb-4 flex items-center justify-between rounded-2xl border border-line bg-card px-4 py-3 shadow-[var(--shadow-card)]">
        <div>
          <p className="text-[10px] uppercase tracking-wide text-ink3">Свободный XP</p>
          <p className="text-xl font-bold tabular-nums text-brand">{profile.xpBalance}</p>
        </div>
        <p className="max-w-[55%] text-right text-[11px] leading-snug text-ink3">
          Ставка блокируется в escrow. Победа — <span className="font-semibold text-ok">×2</span>,
          проигрыш — ставка не возвращается.
        </p>
      </section>

      {error ? (
        <p role="alert" className="mb-3 rounded-xl border border-badLine bg-badSoft px-3 py-2 text-xs text-bad">
          {error}
        </p>
      ) : null}

      {/* Активные пари */}
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink3">
        Активные · {active.length}
      </h2>
      {active.length === 0 ? (
        <p className="mb-4 rounded-2xl border border-dashed border-line2 bg-card px-4 py-6 text-center text-xs text-ink3">
          Активных пари нет. Поставьте XP на задание с дедлайном — проверка самого себя.
        </p>
      ) : (
        <ul className="mb-4 space-y-2">
          {active.map((wager) => (
            <li
              key={wager.id}
              className="rounded-2xl border border-brandLine bg-brandSoft p-4"
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="min-w-0 flex-1 text-sm font-semibold text-ink">{wager.taskTitle}</h3>
                <span className="shrink-0 rounded-full bg-card px-2 py-0.5 text-[11px] font-medium text-brand">
                  Активно
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-ink3">
                <span>
                  Ставка: <b className="tabular-nums text-ink">{wager.stakeAmount} XP</b>
                </span>
                <span>
                  Возможная выплата:{' '}
                  <b className="tabular-nums text-ok">{wager.stakeAmount * 2} XP</b>
                </span>
                <span>до {new Date(wager.deadlineAt).toLocaleDateString()}</span>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* История */}
      {resolved.length > 0 ? (
        <>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink3">
            История · {resolved.length}
          </h2>
          <ul className="space-y-2">
            {resolved.map((wager) => (
              <li
                key={wager.id}
                className="rounded-2xl border border-line bg-card p-4 shadow-[var(--shadow-card)]"
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">
                    {wager.taskTitle}
                  </h3>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_CLASS[wager.status]}`}
                  >
                    {STATUS_LABEL[wager.status]}
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-ink3">
                  Ставка {wager.stakeAmount} XP · {new Date(wager.createdAt).toLocaleDateString()}
                </p>
                {wager.resolutionNote ? (
                  <p className="mt-1 text-[11px] text-ink4">{wager.resolutionNote}</p>
                ) : null}
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {/* Модалка создания пари */}
      {showCreate ? (
        <Modal
          open
          onClose={() => setShowCreate(false)}
          title="Создать пари"
          subtitle={`Баланс: ${profile.xpBalance} XP`}
          footer={
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setShowCreate(false)} disabled={submitting}>
                Отмена
              </Button>
              <Button onClick={handleCreate} loading={submitting}>
                Поставить
              </Button>
            </div>
          }
        >
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-ink2" htmlFor="wager-task">
                Задание
              </label>
              <select
                id="wager-task"
                value={taskId}
                onChange={(event) => afterTaskSelected(event.target.value)}
                className="w-full rounded-lg border border-line2 bg-card px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brandLine"
              >
                {selectedTask ? null : <option value="">— выберите —</option>}
                {tasks.map((task) => (
                  <option key={task.id} value={task.id}>
                    {task.title}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-ink2" htmlFor="wager-stake">
                Ставка, XP
              </label>
              <input
                id="wager-stake"
                type="number"
                min={1}
                max={profile.xpBalance}
                value={stake}
                onChange={(event) => setStake(event.target.value)}
                className="w-full rounded-lg border border-line2 bg-card px-3 py-2 text-sm tabular-nums text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brandLine"
              />
              <p className="mt-1 text-[11px] text-ink3">
                При победе вернётся{' '}
                <span className="font-semibold text-ok">
                  {Number.isFinite(stakeAmount) ? stakeAmount * 2 : '—'} XP
                </span>
              </p>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-ink2" htmlFor="wager-deadline">
                Дедлайн пари
              </label>
              <input
                id="wager-deadline"
                type="datetime-local"
                value={deadline}
                max={selectedTask ? toLocalInput(selectedTask.deadlineAt) : undefined}
                onChange={(event) => setDeadline(event.target.value)}
                className="w-full rounded-lg border border-line2 bg-card px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brandLine"
              />
              <p className="mt-1 text-[11px] text-ink3">
                Не позже дедлайна задания — иначе guard вернёт ошибку.
              </p>
            </div>

            {error ? (
              <p role="alert" className="rounded-lg border border-badLine bg-badSoft px-3 py-2 text-xs text-bad">
                {error}
              </p>
            ) : null}
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
