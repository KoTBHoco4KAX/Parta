import { useAuth } from '../core/auth';
import type { WsEvent } from '../core/types';

// DashboardPage — профиль и живые события: проверка WS-канала без чтения REST.
// Навигация живёт в нижнем меню, поэтому дублирующих кнопок здесь нет.
export function DashboardPage() {
  const { user, role, connection, events } = useAuth();

  if (!user) {
    return null;
  }

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-line bg-card p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-widest text-ink4">{role}</p>
            <h1 className="mt-1 text-xl font-semibold text-ink">{user.display_name}</h1>
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

        <dl className="mt-5 grid grid-cols-3 gap-2">
          <Stat label="XP" value={user.xp_balance} />
          <Stat label="Стрик" value={user.on_time_streak} />
          <Stat label="Заморозки" value={user.streak_freezes} />
        </dl>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium uppercase tracking-widest text-ink4">Живая лента</h2>
          <span className="text-xs text-ink4">{events.length} событий</span>
        </div>

        {events.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line p-4 text-sm text-ink4">
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

      <p className="text-xs leading-relaxed text-ink4">
        Профиль обновляется по событиям <code>xp.ledger.posted</code> и <code>streak.updated</code>. Чтение
        списков (задания, карточки) появится в Фазе 7 — сейчас экраны работают как каркас.
      </p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-muted px-3 py-2">
      <dt className="text-[11px] uppercase tracking-wide text-ink4">{label}</dt>
      <dd className="text-lg font-semibold text-ink">{value}</dd>
    </div>
  );
}

function EventRow({ event }: { event: WsEvent }) {
  return (
    <li className="rounded-xl border border-line bg-card/70 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[11px] text-brand">{event.event_type}</span>
        <span className="text-[11px] text-ink4">{event.room}</span>
      </div>
      <p className="mt-1 truncate text-xs text-ink3">{JSON.stringify(event.payload)}</p>
    </li>
  );
}
