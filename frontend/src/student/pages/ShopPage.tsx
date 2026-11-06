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
  SPEEDRUN_BONUS: 'Бонус за спидран',
  STREAK_FREEZE: 'Заморозка стрика',
  ADMIN_ADJUSTMENT: 'Корректировка',
};

interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: string;
  unlocked: boolean;
}

// achievementsFor — витринные достижения по XP, стрику и заморозкам.
function achievementsFor(xp: number, streak: number, freezes: number): Achievement[] {
  return [
    { id: 'first-xp', title: 'Первые XP', description: 'Наберите 100 XP', icon: '✨', unlocked: xp >= 100 },
    { id: 'thousand', title: 'Тысячник', description: 'Наберите 1000 XP', icon: '🏅', unlocked: xp >= 1000 },
    { id: 'streak-7', title: 'Неделя в строю', description: 'Стрик 7 дней', icon: '🔥', unlocked: streak >= 7 },
    { id: 'freeze', title: 'Страховка', description: 'Купите заморозку', icon: '❄️', unlocked: freezes >= 1 },
  ];
}

// ShopPage — магазин ученика: XP, on-time стрик, заморозки и история начислений.
// Здесь же живут покупки: тратить XP можно только тут.
export default function ShopPage() {
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
      setError(cause instanceof ApiError ? cause.message : 'Не удалось загрузить магазин.');
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
        <div className="h-24 animate-pulse rounded-2xl bg-card" />
        <div className="h-40 animate-pulse rounded-2xl bg-card" />
      </div>
    );
  }

  const level = Math.floor(profile.xpBalance / XP_PER_LEVEL) + 1;
  const inLevel = profile.xpBalance % XP_PER_LEVEL;
  const progress = Math.round((inLevel / XP_PER_LEVEL) * 100);
  const totalPrice = FREEZE_PRICE * quantity;

  return (
    <div className="space-y-4">
      {/* Панель XP */}
      <section className="rounded-2xl border border-line bg-card p-4 shadow-[var(--shadow-card)]">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-wide text-ink3">Баланс</p>
            <p className="text-3xl font-black tabular-nums text-brand">{profile.xpBalance}</p>
            <p className="text-[11px] text-ink3">
              уровень {level} · {profile.displayName}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-wide text-ink3">Стрик</p>
            <p className="text-2xl font-bold text-warn">{profile.onTimeStreak} дней</p>
            <p className="text-[11px] text-ink3">заморозок: {profile.streakFreezes}</p>
          </div>
        </div>

        <div className="mt-3">
          <div className="mb-1 flex justify-between text-[11px] text-ink3">
            <span>До нового уровня</span>
            <span className="tabular-nums">
              {inLevel} / {XP_PER_LEVEL} XP
            </span>
          </div>
          <div
            className="h-2 overflow-hidden rounded-full bg-sunken"
            role="progressbar"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${progress}%` }} />
          </div>
        </div>
      </section>

      {/* Стрик: календарь on-time сдач */}
      <section className="rounded-2xl border border-line bg-card p-4 shadow-[var(--shadow-card)]">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-ink">On-time стрик</h2>
            <p className="mt-0.5 text-[11px] text-ink3">
              Засчитывается только за сдачу до дедлайна.
            </p>
          </div>
          <span className="rounded-full bg-warnSoft px-2 py-0.5 text-[11px] font-medium text-warn">
            {profile.onTimeStreak} дн.
          </span>
        </div>

        <StreakCalendar daysOnTime={streakDays} />

        <p className="mt-3 flex items-center gap-3 text-[11px] text-ink4">
          <span className="flex items-center gap-1">
            <span className="h-3 w-3 rounded-[3px] bg-brand" /> сдал вовремя
          </span>
          <span className="flex items-center gap-1">
            <span className="h-3 w-3 rounded-[3px] bg-sunken" /> без сдачи
          </span>
        </p>
      </section>

      {/* Магазин заморозок */}
      <section className="rounded-2xl border border-line bg-card p-4 shadow-[var(--shadow-card)]">
        <h2 className="text-sm font-semibold text-ink">Заморозка стрика</h2>
        <p className="mt-0.5 text-xs text-ink3">
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
                  'h-9 w-11 rounded-lg text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40',
                  quantity === value
                    ? 'bg-brandSoft text-brand ring-1 ring-brandLine'
                    : 'bg-sunken text-ink2 hover:bg-line2',
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
            disabled={totalPrice > profile.xpBalance}
          >
            Купить за {totalPrice} XP
          </Button>
        </div>

        {totalPrice > profile.xpBalance ? (
          <p className="mt-2 text-[11px] text-warn">
            Не хватает XP: у вас {profile.xpBalance}, нужно {totalPrice}.
          </p>
        ) : null}

        {error ? (
          <p role="alert" className="mt-2 rounded-lg border border-badLine bg-badSoft px-3 py-2 text-xs text-bad">
            {error}
          </p>
        ) : null}
      </section>

      {/* Достижения */}
      <section>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink3">Достижения</h2>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {achievementsFor(profile.xpBalance, profile.onTimeStreak, profile.streakFreezes).map((achievement) => (
            <div
              key={achievement.id}
              className={[
                'flex items-center gap-3 rounded-xl border p-3',
                achievement.unlocked ? 'border-brandLine bg-brandSoft' : 'border-line bg-muted opacity-60',
              ].join(' ')}
            >
              <span className="text-2xl">{achievement.icon}</span>
              <div className="min-w-0 flex-1">
                <h3 className="text-xs font-medium text-ink">{achievement.title}</h3>
                <p className="text-[11px] text-ink3">{achievement.description}</p>
              </div>
              {achievement.unlocked ? <span className="text-brand">✓</span> : null}
            </div>
          ))}
        </div>
      </section>

      {/* История XP-проводок */}
      <section>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink3">История XP</h2>
        <ul className="space-y-2">
          {ledger.map((entry) => (
            <li
              key={entry.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-line bg-card px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-xs text-ink2">{entry.memo}</p>
                <p className="text-[10px] text-ink4">
                  <span className="rounded bg-sunken px-1.5 py-0.5 text-[9px] text-ink3">
                    {REASON_LABEL[entry.reason] ?? entry.reason}
                  </span>{' '}
                  {new Date(entry.createdAt).toLocaleString()}
                </p>
              </div>
              <span
                className={`shrink-0 text-sm font-semibold tabular-nums ${
                  entry.amount > 0 ? 'text-ok' : 'text-bad'
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
