import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '../../core/api';
import { FREEZE_PRICE, purchaseFreezes, getProfile, getLedger, getStreakDays, subscribe } from '../api';
import { StreakCalendar } from '../components/StreakCalendar';
import { Button } from '../../components/Button';
import type { LedgerEntry, Profile } from '../types';

// XP_PER_LEVEL — витринный уровень: каждые 1500 XP (демо-градация, в backend
// уровней нет — регуляторика запрещает заменять XP оценками/журналом).
const XP_PER_LEVEL = 1500;

const QUANTITIES = [1, 2, 3];

const REASON_LABEL: Record<LedgerEntry['reason'], string> = {
  TASK_ACCEPT: 'Принятая работа',
  WAGER_ESCROW: 'Пари: ставка',
  WAGER_PAYOUT: 'Пари: выплата',
  STREAK_FREEZE: 'Заморозка стрика',
  ADMIN_ADJUSTMENT: 'Корректировка',
};

// GamificationPage — XP, on-time стрик и заморозки. Данные из мок-профиля;
// покупка заморозки кушает 200 XP за шт. (domain/economy) и при нехватке XP
// отвечает insufficient_xp — сообщение показывает inline.
export default function GamificationPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [streakDays, setStreakDays] = useState<string[]>([]);
  const [quantity, setQuantity] = useState(1);
  const [buying, setBuying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [nextProfile, nextLedger, nextStreakDays] = await Promise.all([
        getProfile(),
        getLedger(),
        getStreakDays(),
      ]);

      setProfile(nextProfile);
      setLedger(nextLedger);
      setStreakDays(nextStreakDays);
      setError(null);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Не удалось загрузить прогресс.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();

    // XP и стрик приходят «по WS» после покупки/вердикта — перечитываем.
    return subscribe(() => {
      void load();
    });
  }, [load]);

  async function handleBuyFreeze() {
    setBuying(true);
    setError(null);

    try {
      const result = await purchaseFreezes(quantity);
      setProfile((current) =>
        current
          ? { ...current, xpBalance: result.xpBalance, streakFreezes: result.streakFreezes }
          : current,
      );
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Не удалось купить заморозку.');
    } finally {
      setBuying(false);
    }
  }

  if (loading || !profile) {
    return (
      <div className="space-y-3">
        <div className="h-24 animate-pulse rounded-xl bg-slate-900/70" />
        <div className="h-40 animate-pulse rounded-xl bg-slate-900/70" />
      </div>
    );
  }

  const level = Math.floor(profile.xpBalance / XP_PER_LEVEL) + 1;
  const inLevel = profile.xpBalance % XP_PER_LEVEL;
  const progress = Math.round((inLevel / XP_PER_LEVEL) * 100);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-bold text-slate-100">Геймификация</h1>
        <p className="mt-0.5 text-xs text-slate-400">
          XP — витрина прогресса: дедлайны и приёмку ведёт преподаватель.
        </p>
      </div>

      {/* Панель XP */}
      <section className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-wide text-slate-500">Баланс</p>
            <p className="text-3xl font-black tabular-nums text-emerald-400">{profile.xpBalance}</p>
            <p className="text-[11px] text-slate-400">уровень {level} · {profile.displayName}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-wide text-slate-500">Стрик</p>
            <p className="text-2xl font-bold text-amber-300">🔥 {profile.onTimeStreak}</p>
            <p className="text-[11px] text-slate-400">❄️ заморозок: {profile.streakFreezes}</p>
          </div>
        </div>

        <div className="mt-3">
          <div className="mb-1 flex justify-between text-[11px] text-slate-400">
            <span>До {XP_PER_LEVEL} XP нового уровня</span>
            <span className="tabular-nums">{inLevel} / {XP_PER_LEVEL}</span>
          </div>
          <div
            className="h-2 overflow-hidden rounded-full bg-slate-800"
            role="progressbar"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${progress}%` }} />
          </div>
        </div>
      </section>

      {/* Стрик: календарь on-time сдач */}
      <section className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-medium text-slate-100">On-time стрик</h2>
            <p className="mt-0.5 text-[11px] text-slate-400">
              Засчитывается только за сдачу до дедлайна.
            </p>
          </div>
          <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] text-amber-300">
            {profile.onTimeStreak} дн.
          </span>
        </div>

        <StreakCalendar daysOnTime={streakDays} />

        <p className="mt-3 flex items-center gap-3 text-[11px] text-slate-500">
          <span className="flex items-center gap-1">
            <span className="h-3 w-3 rounded-[3px] bg-emerald-500" /> сдал вовремя
          </span>
          <span className="flex items-center gap-1">
            <span className="h-3 w-3 rounded-[3px] bg-slate-800" /> без сдачи
          </span>
        </p>
      </section>

      {/* Магазин заморозок */}
      <section className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
        <h2 className="text-sm font-medium text-slate-100">Заморозка стрика</h2>
        <p className="mt-0.5 text-xs text-slate-400">
          Спасает стрик при пропуске дедлайна. Цена — {FREEZE_PRICE} XP за штуку.
        </p>

        <div className="mt-3 flex items-center justify-between gap-3">
          <div className="flex gap-1.5" role="group" aria-label="Сколько заморозок купить">
            {QUANTITIES.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setQuantity(value)}
                aria-pressed={quantity === value}
                className={[
                  'h-9 w-11 rounded-lg text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400',
                  quantity === value
                    ? 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/40'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700',
                ].join(' ')}
              >
                ×{value}
              </button>
            ))}
          </div>

          <Button
            size="sm"
            onClick={handleBuyFreeze}
            loading={buying}
            disabled={FREEZE_PRICE * quantity > profile.xpBalance}
          >
            Купить за {FREEZE_PRICE * quantity} XP
          </Button>
        </div>

        {FREEZE_PRICE * quantity > profile.xpBalance ? (
          <p className="mt-2 text-[11px] text-amber-300">
            Не хватает XP: у вас {profile.xpBalance}, нужно {FREEZE_PRICE * quantity}.
          </p>
        ) : null}

        {error ? (
          <p role="alert" className="mt-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
            {error}
          </p>
        ) : null}
      </section>

      {/* История XP-проводок */}
      <section>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
          История XP
        </h2>
        <ul className="space-y-2">
          {ledger.map((entry) => (
            <li
              key={entry.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900/60 px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-xs text-slate-200">{entry.memo}</p>
                <p className="text-[10px] text-slate-500">
                  <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[9px] text-slate-400">
                    {REASON_LABEL[entry.reason]}
                  </span>{' '}
                  {new Date(entry.createdAt).toLocaleString()}
                </p>
              </div>
              <span
                className={`shrink-0 text-sm font-semibold tabular-nums ${
                  entry.amount > 0 ? 'text-emerald-400' : 'text-rose-300'
                }`}
              >
                {entry.amount > 0 ? '+' : ''}
                {entry.amount}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
