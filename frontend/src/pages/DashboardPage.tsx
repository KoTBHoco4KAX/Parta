import { Button } from '../components/Button';
import { useAuth } from '../core/auth';
import type { WsEvent } from '../core/types';

interface Props {
  navigate: (path: string) => void;
}

// DashboardPage — профиль и живые события: проверка WS-канала без чтения REST.
export function DashboardPage({ navigate }: Props) {
  const { user, role, connection, events, logout } = useAuth();

  if (!user) {
    return null;
  }

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-widest text-slate-500">{role}</p>
            <h1 className="mt-1 text-xl font-semibold text-slate-50">{user.display_name}</h1>
            <p className="text-sm text-slate-400">{user.external_id}</p>
          </div>
          <span
            className={[
              'rounded-full px-2.5 py-1 text-xs font-medium',
              connection === 'online'
                ? 'bg-emerald-500/15 text-emerald-300'
                : connection === 'connecting'
                  ? 'bg-amber-500/15 text-amber-300'
                  : 'bg-slate-700/60 text-slate-400',
            ].join(' ')}
          >
            {connection === 'online' ? 'онлайн' : connection === 'connecting' ? 'подключение' : 'оффлайн'}
          </span>
        </div>

        <dl className="mt-5 grid grid-cols-3 gap-2">
          <Stat label="XP" value={user.xp_balance} />
          <Stat label="Стрик" value={user.on_time_streak} />
          <Stat label="Заморозки" value={user.streak_freezes} />
        </dl>
      </section>

      <section className="grid grid-cols-2 gap-3">
        <Button variant="secondary" onClick={() => navigate('/kanban')}>
          Канбан
        </Button>
        <Button variant="secondary" onClick={() => navigate('/inbox')}>
          Инбокс
        </Button>
        <Button variant="secondary" onClick={() => navigate('/economy')}>
          Экономика
        </Button>
        <Button variant="ghost" onClick={logout}>
          Выйти
        </Button>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium uppercase tracking-widest text-slate-500">Живая лента</h2>
          <span className="text-xs text-slate-600">{events.length} событий</span>
        </div>

        {events.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-800 p-4 text-sm text-slate-500">
            Пока тихо. События появятся после действий в канбане, приёмки или экономики.
          </p>
        ) : (
          <ul className="space-y-2">
            {events.slice(0, 12).map((event) => (
              <EventRow key={event.event_id} event={event} />
            ))}
          </ul>
        )}
      </section>

      <p className="text-xs leading-relaxed text-slate-600">
        Профиль обновляется по событиям <code>xp.ledger.posted</code> и <code>streak.updated</code>. Чтение
        списков (задания, карточки, инбокс) появится в Фазе 7 — сейчас экраны работают как каркас.
      </p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-slate-950/60 px-3 py-2">
      <dt className="text-[11px] uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="text-lg font-semibold text-slate-100">{value}</dd>
    </div>
  );
}

function EventRow({ event }: { event: WsEvent }) {
  return (
    <li className="rounded-xl border border-slate-800 bg-slate-900/70 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[11px] text-emerald-400">{event.event_type}</span>
        <span className="text-[11px] text-slate-500">{event.room}</span>
      </div>
      <p className="mt-1 truncate text-xs text-slate-400">{JSON.stringify(event.payload)}</p>
    </li>
  );
}
