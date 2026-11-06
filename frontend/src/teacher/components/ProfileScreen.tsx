import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../core/auth';
import { fetchAllSubmissions, fetchTeacherAssignments, fetchTeacherTasks } from '../api';
import { Card, ScreenHeader, Skeleton, StatTile } from './ui';

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
            <StatTile
              label="Потоки"
              value={counts.streams}
              onClick={() => onNavigate('groups')}
            />
            <StatTile
              label="Задания"
              value={counts.tasks}
              onClick={() => onNavigate('tasks')}
            />
            <StatTile
              label="На проверке"
              value={counts.review}
              tone={counts.review > 0 ? 'amber' : 'slate'}
              onClick={() => onNavigate('review')}
            />
          </>
        )}
      </div>

      <p className="mt-3 text-[11px] leading-relaxed text-ink3">
        Плитки кликабельны: «Потоки» ведут к группам и составу, «Задания» — к
        выдаче, «На проверке» — к работам, ожидающим вердикта.
      </p>
    </div>
  );
}