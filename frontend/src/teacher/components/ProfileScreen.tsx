import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../core/auth';
import { fetchAllSubmissions, fetchTeacherAssignments, fetchTeacherTasks } from '../api';
import { Card, ScreenHeader, Skeleton, cn } from './ui';

/**
 * ProfileScreen — минимальная карточка преподавателя.
 *
 * Только то, что нужно для понимания «кто я и что у меня в работе»: имя и
 * почта, число потоков, заданий и работ на проверке плюс переходы в остальные
 * разделы кабинета.
 */
export function ProfileScreen() {
  const { user } = useAuth();
  const [counts, setCounts] = useState<{ streams: number; tasks: number; review: number } | null>(
    null,
  );

  const load = useCallback(async () => {
    try {
      const [assignments, tasks, submissions] = await Promise.all([
        fetchTeacherAssignments(),
        fetchTeacherTasks(),
        fetchAllSubmissions(),
      ]);

      setCounts({
        streams: assignments.length,
        tasks: tasks.length,
        review: submissions.filter((item) => item.status === 'REVIEW').length,
      });
    } catch {
      // Карточка профиля — вспомогательная: без счётчиков она тоже работает.
      setCounts({ streams: 0, tasks: 0, review: 0 });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const initial = (user?.display_name ?? 'П').trim().charAt(0).toUpperCase();

  return (
    <div>
      <ScreenHeader eyebrow="Кабинет" title="Профиль" />

      <Card className="flex items-center gap-3">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-brandSoft text-xl font-bold text-brandStrong">
          {initial}
        </div>
        <div className="min-w-0">
          <p className="truncate text-base font-semibold text-ink">
            {user?.display_name ?? 'Преподаватель'}
          </p>
          <p className="truncate text-xs text-ink3">{user?.external_id ?? '—'}</p>
          <p className="mt-1 text-[11px] text-ink4">Преподаватель</p>
        </div>
      </Card>

      <div className="mt-3 grid grid-cols-3 gap-2">
        {counts === null ? (
          <>
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
          </>
        ) : (
          <>
            <Stat label="Потоки" value={counts.streams} />
            <Stat label="Задания" value={counts.tasks} />
            <Stat label="На проверке" value={counts.review} highlight={counts.review > 0} />
          </>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, highlight = false }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className="rounded-2xl border border-line bg-card px-3 py-2.5">
      <p className="text-[10px] uppercase tracking-wide text-ink4">{label}</p>
      <p
        className={cn(
          'mt-0.5 text-lg font-bold tabular-nums',
          highlight ? 'text-warn' : 'text-ink',
        )}
      >
        {value}
      </p>
    </div>
  );
}
