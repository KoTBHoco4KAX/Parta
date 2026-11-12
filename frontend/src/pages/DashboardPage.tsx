import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../core/auth';
import { fetchSubmissions } from '../core/api';
import { isSubmissionBoardEvent } from '../core/ws';
import type { Submission } from '../core/types';

// Страховочный опрос: счётчики обновляются и без события, если кадр потерялся.
const REFRESH_INTERVAL_MS = 10_000;

// DashboardPage — карточка ученика: имя, баланс XP, стрик и заморозки.
export function DashboardPage({ onNavigate }: { onNavigate: (path: string) => void }) {
  const { user, connection, subscribe } = useAuth();
  const [submissions, setSubmissions] = useState<Submission[]>([]);

  const load = useCallback(() => {
    fetchSubmissions()
      .then(setSubmissions)
      .catch(() => {
        // Счётчики — вспомогательные: карточка работает и без них.
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Реалтайм: новое задание и смена статуса меняют счётчики без перезагрузки.
  useEffect(
    () =>
      subscribe((event) => {
        if (isSubmissionBoardEvent(event)) {
          load();
        }
      }),
    [load, subscribe],
  );

  // Фолбэк, если событие не дошло.
  useEffect(() => {
    const interval = window.setInterval(load, REFRESH_INTERVAL_MS);
    const onFocus = () => load();

    window.addEventListener('focus', onFocus);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, [load]);

  if (!user) {
    return null;
  }

  return (
    <div className="space-y-5">
      <section className="theme-pattern rounded-2xl border border-line bg-card p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-ink">{user.display_name}</h1>
            <p className="text-sm text-ink3">{user.external_id}</p>
          </div>
          <span
            className={[
              'rounded-full px-2.5 py-1 text-xs font-medium',
              connection === 'online'
                ? 'bg-brandSoft text-brand'
                : connection === 'connecting'
                  ? 'bg-warnSoft text-warn'
                  : 'bg-line2/60 text-ink3',
            ].join(' ')}
          >
            {connection === 'online' ? 'онлайн' : connection === 'connecting' ? 'подключение' : 'оффлайн'}
          </span>
        </div>

        <dl className="mt-5 flex divide-x divide-line border-y border-line py-3">
          <Stat label="XP" value={user.xp_balance} onClick={() => onNavigate('/shop')} />
          <Stat
            label="Стрик"
            value={user.on_time_streak}
            onClick={() => onNavigate('/shop')}
          />
          <Stat
            label="Заморозки"
            value={user.streak_freezes}
            onClick={() => onNavigate('/shop')}
          />
        </dl>
      </section>

      <div className="flex divide-x divide-line border-y border-line py-3">
        <Counter
          label="К выполнению"
          value={countByStatus(submissions, 'TODO')}
          onClick={() => onNavigate('/kanban')}
        />
        <Counter
          label="В работе"
          value={countByStatus(submissions, 'IN_PROGRESS')}
          onClick={() => onNavigate('/kanban')}
        />
        <Counter
          label="На проверке"
          value={countByStatus(submissions, 'REVIEW')}
          onClick={() => onNavigate('/kanban')}
        />
        <Counter
          label="Готово"
          value={countByStatus(submissions, 'DONE')}
          onClick={() => onNavigate('/kanban')}
        />
      </div>
    </div>
  );
}

function countByStatus(submissions: Submission[], status: Submission['status']): number {
  return submissions.filter((submission) => submission.status === status).length;
}

function Counter({
  label,
  value,
  onClick,
}: {
  label: string;
  value: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group min-w-0 flex-1 cursor-pointer rounded-lg px-3 py-1 text-left transition first:pl-0 last:pr-0 hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/30 active:scale-[0.99]"
    >
      <span className="block text-[10px] text-ink4 transition group-hover:text-ink3">
        {label}
      </span>
      <span className="block text-base font-semibold tabular-nums text-ink">{value}</span>
    </button>
  );
}

function Stat({
  label,
  value,
  onClick,
}: {
  label: string;
  value: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group min-w-0 flex-1 cursor-pointer rounded-lg px-3 py-1 text-left transition first:pl-0 last:pr-0 hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/30 active:scale-[0.99]"
    >
      <dt className="text-[11px] uppercase tracking-wide text-ink4 transition group-hover:text-ink3">
        {label}
      </dt>
      <dd className="text-lg font-semibold text-ink">{value}</dd>
    </button>
  );
}
