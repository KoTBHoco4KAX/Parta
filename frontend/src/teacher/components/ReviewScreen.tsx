import { useEffect, useMemo, useState } from 'react';
import type { Task } from '../../core/types';
import { fetchTeacherTasks } from '../api';
import type { ReviewInboxItem, ToastData } from '../types';
import { useReviewInbox } from '../hooks/useReviewInbox';
import { ReviewDetailModal } from './ReviewDetailModal';
import { Badge, Card, EmptyState, ErrorState, SkeletonList } from './ui';
import { IconCheckCircle, IconChevronRight, IconInbox } from './icons';

/**
 * ReviewScreen — очередь проверки работ учеников.
 *
 * Обновляется сама: по WebSocket о новых сдачах, при возврате на вкладку и
 * страховочным опросом. Нажатие на карточку открывает сдачу и вердикт.
 */
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
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => setSelected(item)}
                className="block w-full rounded-2xl text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand"
              >
                <Card className="flex items-center gap-3 transition hover:border-line2">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brandSoft text-brandStrong">
                    <IconInbox className="h-4 w-4" />
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-ink">
                      {item.taskTitle}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-ink3">
                      {item.studentName} · {item.groupCode}
                    </span>
                    <span className="mt-1 flex flex-wrap items-center gap-1">
                      <Badge tone={item.onTime ? 'emerald' : 'amber'}>
                        {item.onTime ? 'в срок' : 'просрочено'}
                      </Badge>
                      {item.attempt > 1 ? (
                        <Badge tone="slate">попытка {item.attempt}</Badge>
                      ) : null}
                    </span>
                  </span>

                  <span className="flex shrink-0 items-center gap-1 text-[11px] font-medium text-brand">
                    Проверить
                    <IconChevronRight className="h-4 w-4" />
                  </span>
                </Card>
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
