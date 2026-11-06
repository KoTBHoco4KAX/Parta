import { useEffect, useMemo, useState } from 'react';
import type { Task } from '../../core/types';
import { fetchTeacherTasks } from '../api';
import type { ReviewInboxItem, ToastData } from '../types';
import { useReviewInbox } from '../hooks/useReviewInbox';
import { ReviewDetailModal } from './ReviewDetailModal';
import { EmptyState, ErrorState, SkeletonList } from './ui';
import { IconCheckCircle, IconChevronRight } from './icons';

/**
 * ReviewScreen — очередь проверки работ учеников.
 *
 * Обновляется сама: по WebSocket о новых сдачах, при возврате на вкладку и
 * страховочным опросом. Нажатие на карточку открывает сдачу и вердикт.
 */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);

  return parts.map((part) => part.charAt(0).toUpperCase()).join('') || '?';
}

export function ReviewScreen({
  notify,
  onReviewed,
}: {
  notify: (toast: Omit<ToastData, 'id'>) => void;
  /** Обновляет счётчик на вкладке сразу после вердикта. */
  onReviewed?: () => void;
}) {
  const { items, loading, error, reload } = useReviewInbox();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selected, setSelected] = useState<ReviewInboxItem | null>(null);

  useEffect(() => {
    fetchTeacherTasks()
      .then(setTasks)
      .catch(() => {
        // Текст задания — вспомогательный: сдача и файлы открываются и без него.
      });
  }, []);

  const taskById = useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks]);

  return (
    <div>
      <div className="mb-3 text-[11px] text-ink3">В очереди: {items.length}</div>

      {loading ? <SkeletonList rows={3} /> : null}

      {error && !loading ? <ErrorState message={error} onRetry={reload} /> : null}

      {!loading && !error && items.length === 0 ? (
        <EmptyState
          icon={<IconCheckCircle className="h-5 w-5" />}
          title="Всё проверено"
          description="Как только ученик отправит работу, она появится здесь сама."
        />
      ) : null}

      {!loading && !error && items.length > 0 ? (
        <ul className="divide-y divide-line/70 border-y border-line">
          {items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => setSelected(item)}
                className="flex w-full items-center gap-3 py-3 text-left transition hover:bg-muted/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/20"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-[10px] font-semibold text-ink2">
                  {initials(item.studentName)}
                </span>

                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium text-ink">
                    {item.taskTitle}
                  </span>
                  <span className="mt-0.5 block truncate text-[11px] text-ink3">
                    {item.studentName} · {item.groupCode}
                  </span>
                </span>

                <span className="flex shrink-0 items-center gap-2">
                  <span className="hidden text-[10px] text-ink4 sm:inline">
                    {item.onTime ? 'в срок' : 'просрочено'}
                  </span>
                  <span className="rounded-md border border-line px-1.5 py-0.5 text-[10px] text-ink3">
                    1 работа
                  </span>
                  <IconChevronRight className="h-3.5 w-3.5 text-ink4" />
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {selected ? (
        <ReviewDetailModal
          item={selected}
          task={taskById.get(selected.taskId) ?? null}
          notify={notify}
          onClose={() => setSelected(null)}
          onDecided={() => {
            setSelected(null);
            reload();
            onReviewed?.();
          }}
        />
      ) : null}
    </div>
  );
}
