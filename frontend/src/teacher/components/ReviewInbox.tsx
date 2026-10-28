import { useEffect, useMemo, useState } from 'react';
import type { InboxSort, ReviewInboxItem, ToastData, VerdictResult } from '../types';
import {
  formatTime,
  formatWaiting,
  pluralWorks,
} from '../lib/format';
import { VERDICT_LABEL } from '../lib/labels';
import {
  fetchReviewInbox,
} from '../api';
import { ApiError } from '../../core/api';
import { SubmissionCard } from './SubmissionCard';
import { VerdictModal } from './VerdictModal';
import { Badge, Button, EmptyState, Skeleton, cn } from './ui';
import {
  IconAlert,
  IconCheck,
  IconClock,
  IconInbox,
  IconRefresh,
  IconX,
} from './icons';

function waitingSecondsOf(item: ReviewInboxItem, now: number): number {
  return Math.max(
    0,
    Math.round((now - new Date(item.submittedAt).getTime()) / 1000),
  );
}

function Stat({
  label,
  value,
  tone = 'slate',
}: {
  label: string;
  value: string;
  tone?: 'slate' | 'amber' | 'rose';
}) {
  const valueTone =
    tone === 'rose'
      ? 'text-rose-400'
      : tone === 'amber'
        ? 'text-amber-400'
        : 'text-slate-100';

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 px-3 py-2.5 shadow-sm">
      <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
        {label}
      </p>
      <p className={cn('mt-0.5 text-base font-bold tabular-nums', valueTone)}>{value}</p>
    </div>
  );
}

/**
 * Review Inbox — работы в статусе REVIEW.
 *
 * Источник `waiting_seconds` в будущем — событие `review.inbox.created`, сейчас
 * считается моком. Вердикт отправляется через `POST /api/submissions/{id}/verdict`.
 */
export function ReviewInbox({
  notify,
}: {
  notify: (toast: Omit<ToastData, 'id'>) => void;
}) {
  const [items, setItems] = useState<ReviewInboxItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [group, setGroup] = useState('ALL');
  const [sort, setSort] = useState<InboxSort>('waiting');
  const [selected, setSelected] = useState<ReviewInboxItem | null>(null);
  const [log, setLog] = useState<Array<{ result: VerdictResult; item: ReviewInboxItem }>>(
    [],
  );
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    setError(null);

    fetchReviewInbox()
      .then((data) => {
        if (cancelled) {
          return;
        }

        setItems(data);
        setLoading(false);
      })
      .catch((cause: unknown) => {
        if (cancelled) {
          return;
        }

        setError(
          cause instanceof ApiError
            ? cause.message
            : 'Не удалось загрузить инбокс. Проверьте соединение.',
        );
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const groups = useMemo(
    () => Array.from(new Set(items.map((item) => item.groupCode))).sort(),
    [items],
  );

  const effectiveGroup =
    group === 'ALL' || groups.includes(group) ? group : 'ALL';

  const visibleItems = useMemo(() => {
    const filtered = items.filter(
      (item) => effectiveGroup === 'ALL' || item.groupCode === effectiveGroup,
    );

    return [...filtered].sort((left, right) => {
      if (sort === 'waiting') {
        return waitingSecondsOf(right, now) - waitingSecondsOf(left, now);
      }

      return (
        new Date(left.deadlineAt).getTime() - new Date(right.deadlineAt).getTime()
      );
    });
  }, [items, effectiveGroup, sort, now]);

  const maxWaiting = useMemo(() => {
    if (items.length === 0) {
      return 0;
    }

    return Math.max(...items.map((item) => waitingSecondsOf(item, now)));
  }, [items, now]);

  const lateCount = items.filter((item) => !item.onTime).length;

  function handleIssued(result: VerdictResult, item: ReviewInboxItem) {
    setItems((previous) => previous.filter((candidate) => candidate.id !== item.id));
    setSelected(null);
    setLog((previous) => [{ result, item }, ...previous]);

    notify({
      tone: 'success',
      title:
        result.verdict === 'ACCEPT'
          ? `Принято · +${result.xpAwarded} XP`
          : 'Работа отправлена на доработку',
      description:
        result.verdict === 'ACCEPT'
          ? `${item.studentName}: карточка в DONE, on-time стрик ${result.streakAfter}.`
          : `${item.studentName}: XP не начислен, комментарий попал в revision_log.`,
    });
  }

  async function handleRefresh() {
    setRefreshKey((key) => key + 1);
  }

  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold tracking-tight text-slate-100">
            Инбокс ревью
          </h1>
          <p className="mt-0.5 text-xs leading-relaxed text-slate-400">
            Работы в статусе REVIEW. Ожидание и on-time считаются по submitted_at.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setRefreshKey((key) => key + 1)}
          loading={loading}
          aria-label="Обновить инбокс"
        >
          <IconRefresh className="h-4 w-4" />
          <span className="hidden sm:inline">Обновить</span>
        </Button>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <Stat label="В очереди" value={String(items.length)} />
        <Stat
          label="Самое долгое"
          value={items.length > 0 ? formatWaiting(maxWaiting) : '—'}
          tone={maxWaiting >= 24 * 3_600 ? 'amber' : 'slate'}
        />
        <Stat
          label="Нарушен срок"
          value={String(lateCount)}
          tone={lateCount > 0 ? 'rose' : 'slate'}
        />
      </div>

      <div className="mt-3 rounded-2xl border border-slate-800 bg-slate-900 p-2.5 shadow-sm">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setGroup('ALL')}
            aria-pressed={effectiveGroup === 'ALL'}
            className={cn(
              'rounded-lg px-2.5 py-1 text-[11px] font-medium transition',
              effectiveGroup === 'ALL'
                ? 'bg-slate-900 text-white'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700',
            )}
          >
            Все группы
          </button>
          {groups.map((groupCode) => (
            <button
              key={groupCode}
              type="button"
              onClick={() => setGroup(groupCode)}
              aria-pressed={effectiveGroup === groupCode}
              className={cn(
                'rounded-lg px-2.5 py-1 text-[11px] font-medium transition',
                effectiveGroup === groupCode
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700',
              )}
            >
              {groupCode}
            </button>
          ))}

          <span className="ml-auto flex items-center gap-1 rounded-lg bg-slate-800 p-1">
            <button
              type="button"
              onClick={() => setSort('waiting')}
              aria-pressed={sort === 'waiting'}
              className={cn(
                'rounded-md px-2 py-0.5 text-[10px] font-medium transition',
                sort === 'waiting'
                  ? 'bg-slate-900 text-slate-100 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200',
              )}
            >
              Дольше ждут
            </button>
            <button
              type="button"
              onClick={() => setSort('deadline')}
              aria-pressed={sort === 'deadline'}
              className={cn(
                'rounded-md px-2 py-0.5 text-[10px] font-medium transition',
                sort === 'deadline'
                  ? 'bg-slate-900 text-slate-100 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200',
              )}
            >
              Ближе дедлайн
            </button>
          </span>
        </div>
      </div>

      {error ? (
        <div
          role="alert"
          className="mt-3 flex items-start gap-2 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-200"
        >
          <IconAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="flex-1">
            <p className="font-semibold">Инбокс не загрузился</p>
            <p className="mt-0.5">{error}</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={() => setRefreshKey((key) => key + 1)}
            >
              Повторить
            </Button>
          </div>
        </div>
      ) : null}

      <div className="mt-3 space-y-3">
        {loading ? (
          <>
            {[0, 1, 2].map((index) => (
              <div
                key={index}
                className="rounded-2xl border border-slate-800 bg-slate-900 p-4 shadow-sm"
              >
                <div className="flex items-center gap-3">
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-3 w-32" />
                    <Skeleton className="h-2.5 w-24" />
                  </div>
                </div>
                <Skeleton className="mt-3 h-4 w-3/4" />
                <Skeleton className="mt-2 h-3 w-1/2" />
              </div>
            ))}
          </>
        ) : null}

        {!loading && !error && items.length === 0 ? (
          <EmptyState
            icon={<IconInbox className="h-6 w-6" />}
            title="Инбокс пуст"
            description="Все работы разобраны. Новые сдачи появятся здесь после перехода карточки в REVIEW."
            action={
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                loading={loading}
              >
                <IconRefresh className="h-4 w-4" />
                Обновить
              </Button>
            }
          />
        ) : null}

        {!loading &&
        !error &&
        items.length > 0 &&
        visibleItems.length === 0 ? (
          <EmptyState
            icon={<IconInbox className="h-6 w-6" />}
            title={`В группе ${effectiveGroup} нет работ`}
            description="Сбросьте фильтр, чтобы увидеть остальные работы в инбоксе."
            action={
              <Button variant="outline" size="sm" onClick={() => setGroup('ALL')}>
                Показать все группы
              </Button>
            }
          />
        ) : null}

        {!loading && !error
          ? visibleItems.map((item) => (
              <SubmissionCard
                key={item.id}
                item={item}
                now={now}
                onOpen={setSelected}
              />
            ))
          : null}
      </div>

      {items.length > 0 && !loading ? (
        <p className="mt-3 text-center text-[11px] text-slate-400">
          {items.length} {pluralWorks(items.length)} · нажмите на карточку, чтобы вынести
          вердикт
        </p>
      ) : null}

      {log.length > 0 ? (
        <section className="mt-6">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-200">Вердикты за сессию</h2>
            <Badge tone="slate">{log.length}</Badge>
          </div>
          <ul className="mt-2 space-y-1.5">
            {log.map(({ result, item }) => (
              <li
                key={`${result.submissionId}-${result.reviewedAt}`}
                className="flex items-center gap-2.5 rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 shadow-sm"
              >
                <span
                  className={cn(
                    'flex h-7 w-7 shrink-0 items-center justify-center rounded-full',
                    result.verdict === 'ACCEPT'
                      ? 'bg-emerald-500/20 text-emerald-400'
                      : 'bg-rose-500/20 text-rose-300',
                  )}
                >
                  {result.verdict === 'ACCEPT' ? (
                    <IconCheck className="h-4 w-4" />
                  ) : (
                    <IconX className="h-4 w-4" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-slate-200">
                    {item.studentName}
                  </p>
                  <p className="flex items-center gap-1 text-[10px] text-slate-400">
                    <IconClock className="h-3 w-3" />
                    {VERDICT_LABEL[result.verdict]} · {formatTime(result.reviewedAt)}
                  </p>
                </div>
                <span
                  className={cn(
                    'text-xs font-semibold tabular-nums',
                    result.verdict === 'ACCEPT' ? 'text-emerald-400' : 'text-slate-400',
                  )}
                >
                  {result.verdict === 'ACCEPT' ? `+${result.xpAwarded} XP` : '0 XP'}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {selected ? (
        <VerdictModal
          item={selected}
          onClose={() => setSelected(null)}
          onIssued={handleIssued}
        />
      ) : null}
    </div>
  );
}
