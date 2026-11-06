import { useCallback, useEffect, useState } from 'react';
import { apiFetch, ApiError } from '../../core/api';
import { Button } from '../../components/Button';

// LeaderboardPage — недельный рейтинг учебной группы.
//
// Ранжирование только по weekly_xp. Общий баланс xp_balance не участвует.
// Если weekly_xp_week устарел, backend уже отдаёт 0 — фронтенд ничего не досчитывает.

interface Entry {
  user_id: number;
  display_name: string;
  weekly_xp: number;
  rank: number;
  growth_xp?: number;
  growth_percent?: number;
  is_current?: boolean;
}

interface Me {
  user_id: number;
  display_name: string;
  weekly_xp: number;
  rank: number;
  xp_to_next_rank: number;
  group_code: string;
}

interface Leaderboard {
  group: string;
  group_title: string;
  week_start: string;
  week_ends_at: string;
  me: Me;
  top: Entry[];
  breakthrough: Entry[];
}

const MEDALS = ['🥇', '🥈', '🥉'];

export default function LeaderboardPage() {
  const [data, setData] = useState<Leaderboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'top' | 'breakthrough'>('top');
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    try {
      setData(await apiFetch<Leaderboard>('/leaderboard'));
      setError(null);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Не удалось загрузить рейтинг.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Таймер до воскресенья 23:59:59 обновляем раз в минуту.
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);

    return () => window.clearInterval(timer);
  }, []);

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="h-24 animate-pulse rounded-2xl bg-card" />
        <div className="h-40 animate-pulse rounded-2xl bg-card" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="space-y-3">
        <h1 className="text-xl font-semibold text-ink">Лидерборд</h1>
        <p role="alert" className="rounded-xl border border-badLine bg-badSoft px-3 py-2 text-xs text-bad">
          {error ?? 'Рейтинг недоступен.'}
        </p>
        <Button variant="secondary" onClick={() => void load()}>
          Повторить
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-brand">
            Рейтинг
          </p>
          <h1 className="mt-1 text-xl font-semibold text-ink">Лидерборд</h1>
          <p className="mt-0.5 text-xs text-ink3">
            Группа {data.group} · {data.group_title}
          </p>
          <p className="mt-1 text-[11px] text-ink3">
            Участников: {data.top.length} · Прорывов: {data.breakthrough.length}
          </p>
        </div>
        <div className="shrink-0 rounded-xl border border-line bg-card px-2.5 py-2 text-right">
          <p className="text-[9px] uppercase tracking-wide text-ink4">Итоги недели через</p>
          <p className="text-[12px] font-semibold tabular-nums text-ink">
            {formatRemaining(data.week_ends_at, now)}
          </p>
        </div>
      </div>

      <CurrentUserCard me={data.me} />

      <div className="grid grid-cols-2 gap-1 rounded-xl border border-line bg-card p-1">
        <button
          type="button"
          onClick={() => setTab('top')}
          className={`rounded-lg px-3 py-2 text-xs font-medium transition ${
            tab === 'top' ? 'bg-brandSoft text-brandStrong' : 'text-ink3 hover:text-ink2'
          }`}
        >
          Топ недели
        </button>
        <button
          type="button"
          onClick={() => setTab('breakthrough')}
          className={`rounded-lg px-3 py-2 text-xs font-medium transition ${
            tab === 'breakthrough' ? 'bg-brandSoft text-brandStrong' : 'text-ink3 hover:text-ink2'
          }`}
        >
          Прорыв недели
        </button>
      </div>

      {tab === 'top' ? <TopWeek data={data} /> : <Breakthrough data={data} />}
    </div>
  );
}

function CurrentUserCard({ me }: { me: Me }) {
  return (
    <section className="rounded-2xl border border-brandLine bg-brandSoft p-4">
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-card text-sm font-bold text-brandStrong">
          {initials(me.display_name)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-semibold text-ink">{me.display_name}</p>
            <span className="shrink-0 rounded-full bg-card px-1.5 py-0.5 text-[10px] font-semibold text-brandStrong">
              #{me.rank}
            </span>
          </div>
          <p className="mt-0.5 text-[11px] text-brandStrong/80">
            {me.weekly_xp > 0
              ? `${me.weekly_xp} XP за неделю`
              : 'На этой неделе пока 0 XP'}
          </p>
        </div>
      </div>

      <p className="mt-3 rounded-lg bg-muted px-2.5 py-2 text-[11px] leading-relaxed text-brandStrong">
        {me.rank === 1
          ? 'Вы на первом месте в группе. Держите темп.'
          : `До ${me.rank - 1} места осталось ${me.xp_to_next_rank} XP`}
      </p>
    </section>
  );
}

function TopWeek({ data }: { data: Leaderboard }) {
  const meIndex = data.top.findIndex((entry) => entry.user_id === data.me.user_id);
  const top3 = data.top.slice(0, 3);
  const focusStart = Math.max(3, meIndex - 2);
  const focus = meIndex >= 3 ? data.top.slice(focusStart, meIndex + 3) : [];

  return (
    <section className="space-y-2">
      <ul className="space-y-2">
        {top3.map((entry) => (
          <LeaderRow
            key={entry.user_id}
            entry={entry}
            medal={MEDALS[entry.rank - 1]}
            current={entry.user_id === data.me.user_id}
          />
        ))}
      </ul>

      {focus.length > 0 ? (
        <>
          <div className="flex items-center gap-2 py-1">
            <span className="h-px flex-1 bg-line" />
            <span className="text-[10px] uppercase tracking-wide text-ink4">Рядом с вами</span>
            <span className="h-px flex-1 bg-line" />
          </div>
          <ul className="space-y-2">
            {focus.map((entry) => (
              <LeaderRow
                key={entry.user_id}
                entry={entry}
                current={entry.user_id === data.me.user_id}
              />
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}

function LeaderRow({
  entry,
  medal,
  current = false,
}: {
  entry: Entry;
  medal?: string;
  current?: boolean;
}) {
  return (
    <li
      className={`flex items-center gap-2 rounded-2xl border px-3 py-2.5 ${
        current ? 'border-brandLine bg-brandSoft' : 'border-line bg-card'
      }`}
    >
      <span className="flex w-7 shrink-0 justify-center text-sm font-bold tabular-nums text-ink3">
        {medal ?? entry.rank}
      </span>
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sunken text-[10px] font-semibold text-ink2">
        {initials(entry.display_name)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12px] font-medium text-ink">{entry.display_name}</span>
        <span className="block text-[10px] text-ink3">{entry.rank} место</span>
      </span>
      <span className="shrink-0 text-right">
        <span className="block text-[12px] font-semibold tabular-nums text-brandStrong">
          {entry.weekly_xp} XP
        </span>
      </span>
    </li>
  );
}

function Breakthrough({ data }: { data: Leaderboard }) {
  if (data.breakthrough.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-line px-4 py-8 text-center text-xs text-ink3">
        На этой неделе ещё нет начислений XP. Первые сдачи появятся здесь.
      </p>
    );
  }

  return (
    <section>
      <p className="mb-2 text-[11px] leading-relaxed text-ink3">
        Самый резкий рост относительно прошлой недели.
      </p>
      <ul className="space-y-2">
        {data.breakthrough.map((entry, index) => (
          <li
            key={entry.user_id}
            className={`flex items-center gap-2 rounded-2xl border px-3 py-2.5 ${
              entry.user_id === data.me.user_id ? 'border-brandLine bg-brandSoft' : 'border-line bg-card'
            }`}
          >
            <span className="flex w-7 shrink-0 justify-center text-sm font-bold tabular-nums text-ink3">
              {MEDALS[index] ?? index + 1}
            </span>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sunken text-[10px] font-semibold text-ink2">
              {initials(entry.display_name)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[12px] font-medium text-ink">
                {entry.display_name}
              </span>
              <span className="block text-[10px] text-ink3">
                {entry.weekly_xp} XP за неделю
              </span>
            </span>
            <span className="shrink-0 text-right">
              <span className="block text-[12px] font-semibold tabular-nums text-brandStrong">
                +{entry.growth_xp ?? 0} XP
              </span>
              <span className="block text-[10px] text-ok">
                +{Math.round(entry.growth_percent ?? 0)}%
              </span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function formatRemaining(weekEndsAt: string, now: number): string {
  const remaining = Math.max(0, new Date(weekEndsAt).getTime() - now);
  const days = Math.floor(remaining / 86_400_000);
  const hours = Math.floor((remaining % 86_400_000) / 3_600_000);
  const minutes = Math.floor((remaining % 3_600_000) / 60_000);

  if (days > 0) {
    return `${days} дн. ${hours} ч.`;
  }

  return `${hours} ч. ${minutes} мин.`;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);

  return parts.map((part) => part.charAt(0).toUpperCase()).join('') || '?';
}
