import { useReviewInbox } from '../hooks/useReviewInbox';
import { Badge, Card, EmptyState, ErrorState, ScreenHeader, SkeletonList } from './ui';
import { IconCheckCircle, IconInbox } from './icons';

/**
 * ReviewScreen — очередь проверки работ учеников.
 *
 * Обновляется сама по WebSocket: как только ученик отправил работу, backend
 * публикует `review.inbox.created` в комнату преподавателя, и карточка
 * появляется здесь без кнопки «Обновить».
 */
export function ReviewScreen() {
  const { items, loading, error, reload } = useReviewInbox();

  return (
    <div>
      <ScreenHeader
        eyebrow="Очередь"
        title="Проверка"
        description="Новые сдачи приходят сюда сами, по WebSocket."
        action={
          <span className="inline-flex items-center gap-1.5 rounded-full bg-okSoft px-2 py-1 text-[10px] font-medium text-ok">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-ok" aria-hidden="true" />
            live
          </span>
        }
      />

      {loading ? <SkeletonList rows={3} /> : null}

      {error && !loading ? <ErrorState message={error} onRetry={reload} /> : null}

      {!loading && !error && items.length === 0 ? (
        <EmptyState
          icon={<IconCheckCircle className="h-5 w-5" />}
          title="Всё проверено"
          description="Как только ученик нажмёт «Отправить на проверку», работа появится здесь автоматически."
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
    </div>
  );
}
