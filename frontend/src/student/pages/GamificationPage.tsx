import { useEffect, useState } from 'react';
import { ApiError, buyStreakFreezes } from '../../core/api';
import { Button } from '../../components/Button';
import { useAuth } from '../../core/auth';
import type { Achievement } from '../types';

const XP_PER_LEVEL = 1500;

function achievementsFor(xp: number, streak: number, freezes: number): Achievement[] {
  return [
    { id: 'first', title: 'Первый шаг', description: 'Получить первый XP', icon: '🎯', unlocked: xp > 0, xpReward: 50 },
    { id: 'week', title: 'Недельный стрик', description: '7 дней подряд', icon: '🔥', unlocked: streak >= 7, xpReward: 100 },
    { id: 'marathon', title: 'Марафонец', description: '30 дней подряд', icon: '⚡', unlocked: streak >= 30, xpReward: 500 },
    { id: 'frost', title: 'Запасливый', description: 'Купить заморозку стрика', icon: '❄️', unlocked: freezes > 0, xpReward: 20 },
  ];
}

// GamificationPage — XP, стрик и заморозки из профиля пользователя.
// Покупка заморозки идёт реальным POST /api/users/me/streak-freezes/purchase.
export default function GamificationPage() {
  const { user } = useAuth();
  const [xp, setXp] = useState(user?.xp_balance ?? 0);
  const [streak, setStreak] = useState(user?.on_time_streak ?? 0);
  const [freezes, setFreezes] = useState(user?.streak_freezes ?? 0);
  const [buying, setBuying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setXp(user?.xp_balance ?? 0);
    setStreak(user?.on_time_streak ?? 0);
    setFreezes(user?.streak_freezes ?? 0);
  }, [user]);

  const level = Math.floor(xp / XP_PER_LEVEL) + 1;
  const progress = Math.min(100, Math.round(((xp % XP_PER_LEVEL) / XP_PER_LEVEL) * 100));

  async function buyFreeze() {
    if (xp < 200) {
      setError('Недостаточно XP: заморозка стоит 200 XP.');
      return;
    }

    setBuying(true);
    setError(null);

    try {
      const response = await buyStreakFreezes(1);
      setFreezes(response.streak_freezes);
      setXp(response.xp_balance);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Не удалось купить заморозку.');
    } finally {
      setBuying(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-bold text-ink">Геймификация</h1>
        <p className="mt-0.5 text-xs text-ink3">XP и стрик обновляются сервером по событиям.</p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Stat label="Уровень" value={String(level)} />
        <Stat label="Стрик" value={`🔥 ${streak}`} />
        <Stat label="Заморозки" value={`❄️ ${freezes}`} />
      </div>

      <section className="rounded-xl border border-line bg-card p-4">
        <div className="mb-2 flex items-baseline justify-between text-xs">
          <span className="font-medium text-ink2">Опыт</span>
          <span className="tabular-nums text-ink3">
            {xp % XP_PER_LEVEL} / {XP_PER_LEVEL} XP
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-sunken">
          <div className="h-full rounded-full bg-brand transition" style={{ width: `${progress}%` }} />
        </div>
      </section>

      <section className="rounded-xl border border-line bg-card p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-medium text-ink">Заморозка стрика</h2>
            <p className="mt-0.5 text-xs text-ink3">Сохранит стрик при пропуске. Цена — 200 XP.</p>
          </div>
          <Button size="sm" onClick={buyFreeze} loading={buying} disabled={xp < 200}>
            Купить
          </Button>
        </div>
        {error ? (
          <p role="alert" className="mt-2 text-xs text-bad">{error}</p>
        ) : null}
      </section>

      <section>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink3">Достижения</h2>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {achievementsFor(xp, streak, freezes).map((achievement) => (
            <div
              key={achievement.id}
              className={[
                'flex items-center gap-3 rounded-xl border p-3',
                achievement.unlocked
                  ? 'border-brandLine bg-brandSoft'
                  : 'border-line bg-muted opacity-60',
              ].join(' ')}
            >
              <span className="text-2xl">{achievement.icon}</span>
              <div className="min-w-0 flex-1">
                <h3 className="text-xs font-medium text-ink">{achievement.title}</h3>
                <p className="text-[11px] text-ink3">{achievement.description}</p>
                <p className="text-[10px] text-brand">+{achievement.xpReward} XP</p>
              </div>
              {achievement.unlocked ? <span className="text-brand">✓</span> : null}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line bg-card px-3 py-2.5">
      <p className="text-[10px] uppercase tracking-wide text-ink0">{label}</p>
      <p className="mt-0.5 text-base font-bold text-ink">{value}</p>
    </div>
  );
}
