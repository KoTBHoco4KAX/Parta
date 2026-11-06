import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../core/auth';
import { fetchAllSubmissions, fetchTeacherAssignments, fetchTeacherTasks } from '../api';
import { Skeleton } from './ui';

/** Разделы кабинета, в которые ведут плитки профиля. */
export type ProfileSection = 'groups' | 'tasks' | 'review';

/**
 * ProfileScreen — минимальная карточка преподавателя.
 *
 * Только то, что нужно для понимания «кто я и что у меня в работе»: имя и
 * почта, число потоков, заданий и работ на проверке плюс переходы в остальные
 * разделы кабинета.
 */
export function ProfileScreen({
  onNavigate,
}: {
  onNavigate: (section: ProfileSection) => void;
}) {
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
        // Потоки считаем по уникальным группам: у преподавателя может быть
        // несколько дисциплин в одной группе, но поток один.
        streams: new Set(assignments.map((assignment) => assignment.groupId)).size,
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
      <div className="flex items-center gap-3 rounded-xl border border-line bg-card p-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-muted text-lg font-semibold text-ink2">
          {initial}
        </div>
        <div className="min-w-0">
          <p className="truncate text-[15px] font-semibold text-ink">
            {user?.display_name ?? 'Преподаватель'}
          </p>
          <p className="truncate text-xs text-ink3">{user?.external_id ?? '—'}</p>
          <p className="mt-0.5 text-[11px] text-ink4">Преподаватель</p>
        </div>
      </div>

      <div className="mt-4 flex divide-x divide-line border-y border-line py-3">
        {counts === null ? (
          <>
            <Skeleton className="mx-3 h-10 flex-1" />
            <Skeleton className="mx-3 h-10 flex-1" />
            <Skeleton className="mx-3 h-10 flex-1" />
          </>
        ) : (
          <>
            <ProfileMetric
              label="Потоки"
              value={counts.streams}
              onClick={() => onNavigate('groups')}
            />
            <ProfileMetric
              label="Задания"
              value={counts.tasks}
              onClick={() => onNavigate('tasks')}
            />
            <ProfileMetric
              label="На проверке"
              value={counts.review}

              onClick={() => onNavigate('review')}
            />
          </>
        )}
      </div>
    </div>
  );
}

function ProfileMetric({
  label,
  value,
  tone,
  onClick,
}: {
  label: string;
  value: number;
  tone?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="min-w-0 flex-1 px-3 text-left transition first:pl-0 last:pr-0 hover:opacity-80"
    >
      <span className={`block text-lg font-semibold tabular-nums ${tone ?? 'text-ink'}`}>
        {value}
      </span>
      <span className="mt-0.5 block truncate text-[10px] uppercase tracking-wide text-ink3">
        {label}
      </span>
    </button>
  );
}