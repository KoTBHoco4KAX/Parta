import { useState } from 'react';
import { Button } from '../components/Button';
import { ApiError, api } from '../core/api';
import { useAuth } from '../core/auth';

// EconomyPage — каркас экономики: заморозки, пари, peer-review, слоты.
// Пока доступны операции, которым хватает мутаций из spec/04_API.md.
export function EconomyPage() {
  const { token, user, role } = useAuth();
  const [quantity, setQuantity] = useState('1');
  const [taskId, setTaskId] = useState('');
  const [stake, setStake] = useState('');
  const [deadline, setDeadline] = useState(defaultDeadline());
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!user) {
    return null;
  }

  const run = async (key: string, action: () => Promise<string>) => {
    setBusy(key);
    setError(null);
    setMessage(null);

    try {
      setMessage(await action());
    } catch (err) {
      setError(err instanceof ApiError ? `${err.message} (${err.code})` : 'Операция не выполнена');
    } finally {
      setBusy(null);
    }
  };

  const buyFreezes = () =>
    run('freeze', async () => {
      const response = await api.purchaseFreezes(token, Number(quantity));
      return `Заморозок: ${response.streak_freezes}, баланс: ${response.xp_balance} XP`;
    });

  const placeWager = () =>
    run('wager', async () => {
      const response = await api.createWager(token, {
        task_id: Number(taskId),
        stake_amount: Number(stake),
        deadline_at: new Date(deadline).toISOString(),
      });
      return `Пари #${response.wager_id} на ${response.stake_amount} XP, статус ${response.status}`;
    });

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-semibold text-slate-50">Экономика</h1>
        <p className="text-sm text-slate-400">
          XP — внутренняя валюта прогресса, не оценка и не допуск к зачёту.
        </p>
      </header>

      <section className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
        <h2 className="text-sm font-medium text-slate-200">Заморозки стрика</h2>
        <p className="mt-1 text-xs text-slate-400">200 XP за штуку. Тратятся вместо сброса on-time стрика.</p>
        <div className="mt-3 flex items-end gap-2">
          <label className="flex-1 space-y-1">
            <span className="text-[11px] uppercase tracking-wide text-slate-500">Количество</span>
            <input
              type="number"
              min={1}
              max={10}
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
            />
          </label>
          <Button loading={busy === 'freeze'} onClick={() => void buyFreezes()} disabled={role !== 'student'}>
            Купить
          </Button>
        </div>
        {role !== 'student' ? <p className="mt-2 text-xs text-slate-600">Покупка доступна студенту.</p> : null}
      </section>

      <section className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
        <h2 className="text-sm font-medium text-slate-200">Пари на собственный результат</h2>
        <p className="mt-1 text-xs text-slate-400">Победа — работа принята до дедлайна пари; выплата ×2.</p>
        <div className="mt-3 space-y-2">
          <Input label="ID задания" type="number" value={taskId} onChange={setTaskId} />
          <Input label="Ставка, XP" type="number" value={stake} onChange={setStake} />
          <Input label="Дедлайн пари" type="datetime-local" value={deadline} onChange={setDeadline} />
          <Button
            loading={busy === 'wager'}
            onClick={() => void placeWager()}
            disabled={role !== 'student' || !taskId || !stake}
          >
            Заключить пари
          </Button>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-800 bg-slate-900 p-4 text-sm text-slate-400">
        <h2 className="text-sm font-medium text-slate-200">Peer-review и командные слоты</h2>
        <p className="mt-1 text-xs leading-relaxed">
          Создание ревью, claim по чек-листу и carry-over слота уже есть в API-клиенте
          (<code>api.createPeerReview</code>, <code>api.claimPeerReview</code>, <code>api.carryOverSlot</code>),
          но требуют списков работ и слотов из read-эндпоинтов Фазы 7.
        </p>
      </section>

      {message ? (
        <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">
          {message}
        </p>
      ) : null}

      {error ? (
        <p className="rounded-lg border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-200">{error}</p>
      ) : null}
    </div>
  );
}

function defaultDeadline(): string {
  const date = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const pad = (value: number) => String(value).padStart(2, '0');

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(
    date.getMinutes(),
  )}`;
}

interface InputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}

function Input({ label, value, onChange, type = 'text' }: InputProps) {
  return (
    <label className="block space-y-1">
      <span className="text-[11px] uppercase tracking-wide text-slate-500">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
      />
    </label>
  );
}
