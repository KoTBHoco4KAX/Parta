import { useCallback, useEffect, useState } from 'react';
import { fetchReviewInbox } from '../api';
import type { ReviewInboxItem, ToastData } from '../types';
import { Badge, Button, Card, EmptyState, ErrorState, ScreenHeader, SkeletonList, cn } from './ui';
import { IconCheckCircle, IconInbox, IconRefresh } from './icons';

/**
 * ReviewScreen — очередь проверки работ учеников.
 *
 * Пока показывает работы в статусе REVIEW; инструменты вердикта (баллы,
 * комментарий, влияние взаимопроверки) будут добавлены следующим шагом.
 */
export function ReviewScreen({
  notify,
  reloadSignal = 0,
  onReviewed: _onReviewed,
}: {
  notify: (toast: Omit<ToastData, 'id'>) => void;
  reloadSignal?: number;
  onReviewed?: () => void;
}) {
  const [items, setItems] = useState<ReviewInboxItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      setItems(await fetchReviewInbox());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось загрузить очередь.');
      notify({ tone: 'error', title: 'Ошибка загрузки', description: 'Попробуйте обновить список.' });
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    void load();
  }, [load, reloadSignal]);

  return (
    <div>
      <ScreenHeader
        eyebrow="Очередь"
        title="Проверка"
        description="Работы, сданные на вердикт. Инструменты оценки — следующий шаг."
        action={
          <Button variant="secondary" size="sm" onClick={() => void load()}>
            <IconRefresh className="h-3.5 w-3.5" />
            Обновить
          </Button>
        }
      />

      {loading ? <SkeletonList rows={3} /> : null}

      {error && !loading ? <ErrorState message={error} onRetry={() => void load()} /> : null}

      {!loading && !error && items.length === 0 ? (
        <EmptyState
          icon={<IconCheckCircle className="h-5 w-5" />}
          title="Всё проверено"
          description="Новые сдачи появятся здесь автоматически, как только ученики отправят работу."
        />
      ) : null}

      {!loading && !error && items.length > 0 ? (
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={item.id}>
              <Card className="flex items-start gap-3">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-brandSoft text-brandStrong">
                  <IconInbox className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink">{item.taskTitle}</p>
                  <p className="mt-0.5 truncate text-xs text-ink3">
                    {item.studentName} · {item.groupCode}
                  </p>
                </div>
                <Badge tone={item.onTime ? 'emerald' : 'amber'}>
                  {item.onTime ? 'в срок' : 'просрочено'}
                </Badge>
              </Card>
            </li>
          ))}
        </ul>
      ) : null}

      <p className={cn('mt-4 text-[11px] leading-relaxed text-ink4')}>
        Проверка пока в режиме чтения: вердикт, баллы и комментарий появятся на этом шаге
        следом.
      </p>
    </div>
  );
}
