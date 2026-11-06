import { useEffect, useState } from 'react';
import { useAuth } from '../core/auth';
import { fetchSubmissions } from '../core/api';
import type { Submission } from '../core/types';

// DashboardPage — карточка ученика: имя, баланс XP, стрик и заморозки.
export function DashboardPage() {
  const { user, connection } = useAuth();
  const [submissions, setSubmissions] = useState<Submission[]>([]);

  useEffect(() => {
    fetchSubmissions()
      .then(setSubmissions)
      .catch(() => {
        // Счётчики — вспомогательные: карточка работает и без них.
      });
  }, []);

  if (!user) {
    return null;
  }

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-line bg-card p-5">
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
          <Stat label="XP" value={user.xp_balance} />
          <Stat label="Стрик" value={user.on_time_streak} />
          <Stat label="Заморозки" value={user.streak_freezes} />
        </dl>
      </section>

      <div className="flex divide-x divide-line border-y border-line py-3">
        <Counter label="К выполнению" value={countByStatus(submissions, 'TODO')} />
        <Counter label="В работе" value={countByStatus(submissions, 'IN_PROGRESS')} />
        <Counter label="На проверке" value={countByStatus(submissions, 'REVIEW')} />
        <Counter label="Готово" value={countByStatus(submissions, 'DONE')} />
      </div>
    </div>
  );
}

function countByStatus(submissions: Submission[], status: Submission['status']): number {
  return submissions.filter((submission) => submission.status === status).length;
}

function Counter({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-0 flex-1 px-3 first:pl-0 last:pr-0">
      <p className="text-[10px] text-ink4">{label}</p>
      <p className="text-base font-semibold tabular-nums text-ink">{value}</p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-0 flex-1 px-3 first:pl-0 last:pr-0">
      <dt className="text-[11px] uppercase tracking-wide text-ink4">{label}</dt>
      <dd className="text-lg font-semibold text-ink">{value}</dd>
    </div>
  );
}
