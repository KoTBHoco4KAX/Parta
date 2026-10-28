import { useEffect, useMemo, useState } from 'react';
import type {
  PeerReview,
  PeerReviewFilter,
  PeerReviewStatus,
  ReviewerAwardResult,
  ToastData,
} from '../types';
import {
  anonymousId,
  formatDateTime,
  formatDuration,
  shortenName,
} from '../lib/format';
import {
  PEER_FILTER_LABEL,
  PEER_STATUS_LABEL,
  PEER_STATUS_TONE,
} from '../lib/labels';
import { fetchPeerReviewSessions } from '../api';
import { ApiError } from '../../core/api';
import { ReviewerAwardModal } from './ReviewerAwardModal';
import { Badge, Button, EmptyState, Modal, Skeleton, cn } from './ui';
import {
  IconAlert,
  IconCheck,
  IconChevronRight,
  IconClock,
  IconEye,
  IconLock,
  IconRefresh,
  IconShield,
  IconSparkles,
  IconUsers,
  IconX,
} from './icons';

const EXPIRING_SOON_SECONDS = 2 * 3_600;
const STATUS_ORDER: Record<PeerReviewStatus, number> = {
  IN_REVIEW: 0,
  CREATED: 1,
  COMPLETED: 2,
  EXPIRED: 3,
};

/** Фрагмент «потока» артефакта: файл целиком не отдаётся (spec/02_FSM.md §3). */
const ARTIFACT_SNIPPET = `-- artifact stream · read-only
CREATE TABLE enrollment (
  id          INTEGER PRIMARY KEY,
  student_id  INTEGER NOT NULL REFERENCES students(id),
  course_id   INTEGER NOT NULL REFERENCES courses(id),
  enrolled_at TEXT    NOT NULL
);

CREATE UNIQUE INDEX uq_enrollment
  ON enrollment (student_id, course_id);

-- watermark: peer_review / reviewer / issued_at`;

function isActive(status: PeerReviewStatus): boolean {
  return status === 'CREATED' || status === 'IN_REVIEW';
}

function expiresInSeconds(review: PeerReview, now: number): number {
  return Math.round((new Date(review.expiresAt).getTime() - now) / 1000);
}

function checklistProgress(review: PeerReview) {
  const resultByCode = new Map(
    review.checklistResults.map((result) => [result.code, result.passed]),
  );

  let passed = 0;
  let passedWeight = 0;
  let totalWeight = 0;

  for (const item of review.checklist) {
    totalWeight += item.weight;
    if (resultByCode.get(item.code) === true) {
      passed += 1;
      passedWeight += item.weight;
    }
  }

  return {
    resultByCode,
    passed,
    total: review.checklist.length,
    passedWeight,
    totalWeight,
    percent:
      review.checklist.length === 0
        ? 0
        : Math.round((passed / review.checklist.length) * 100),
  };
}

function personLabel(
  id: number | null,
  name: string | null,
  kind: 'author' | 'reviewer',
  anonymize: boolean,
): string {
  if (id === null) {
    return kind === 'reviewer' ? 'не назначен' : '—';
  }

  if (anonymize) {
    return kind === 'author' ? anonymousId('S', id) : anonymousId('R', id);
  }

  return name ? shortenName(name) : `#${id}`;
}

function Stat({
  label,
  value,
  tone = 'slate',
}: {
  label: string;
  value: string;
  tone?: 'slate' | 'sky' | 'rose' | 'emerald';
}) {
  const valueTone =
    tone === 'sky'
      ? 'text-sky-300'
      : tone === 'rose'
        ? 'text-rose-400'
        : tone === 'emerald'
          ? 'text-emerald-400'
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

function PeerReviewCard({
  review,
  now,
  anonymize,
  awardedXP,
  onOpen,
}: {
  review: PeerReview;
  now: number;
  anonymize: boolean;
  awardedXP: number | null;
  onOpen: (review: PeerReview) => void;
}) {
  const progress = checklistProgress(review);
  const active = isActive(review.status);
  const remaining = expiresInSeconds(review, now);
  const expiringSoon = active && remaining > 0 && remaining <= EXPIRING_SOON_SECONDS;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(review)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpen(review);
        }
      }}
      data-testid={`peer-card-${review.id}`}
      aria-label={`Открыть P2P-ревью #${review.id}: ${review.taskTitle}`}
      className="group w-full cursor-pointer rounded-2xl border border-slate-800 bg-slate-900 p-4 text-left shadow-sm transition hover:border-emerald-500/40 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Badge tone={PEER_STATUS_TONE[review.status]}>
            {PEER_STATUS_LABEL[review.status]}
          </Badge>
          <span className="text-[10px] tabular-nums text-slate-400">#{review.id}</span>
        </div>

        {active ? (
          <Badge tone={expiringSoon ? 'rose' : 'slate'} className="shrink-0">
            <IconClock className="h-3 w-3" />
            {remaining > 0
              ? `осталось ${formatDuration(remaining)}`
              : 'истекает'}
          </Badge>
        ) : (
          <span className="text-[10px] text-slate-400">
            {review.status === 'COMPLETED' && review.completedAt
              ? formatDateTime(review.completedAt)
              : formatDateTime(review.expiresAt)}
          </span>
        )}
      </div>

      <p className="mt-2 line-clamp-1 text-sm font-medium text-slate-200">
        {review.taskTitle}
      </p>

      <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-400">
        <span>
          Автор{' '}
          <span className="font-medium text-slate-300">
            {personLabel(review.authorId, review.authorName, 'author', anonymize)}
          </span>
        </span>
        <span aria-hidden="true">·</span>
        <span>
          Рецензент{' '}
          <span className="font-medium text-slate-300">
            {personLabel(
              review.reviewerId,
              review.reviewerName,
              'reviewer',
              anonymize,
            )}
          </span>
        </span>
      </p>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <Badge tone="slate">{review.groupCode}</Badge>
        <Badge tone="violet">
          escrow {review.escrowAmount} XP
        </Badge>
        {review.status === 'COMPLETED' ? (
          <Badge tone={progress.percent === 100 ? 'emerald' : 'amber'}>
            {progress.passed}/{progress.total} критериев
          </Badge>
        ) : review.status === 'IN_REVIEW' ? (
          <span className="text-[11px] text-slate-400">
            чек-лист заполняет рецензент
          </span>
        ) : review.status === 'CREATED' ? (
          <span className="text-[11px] text-slate-400">ожидает рецензента</span>
        ) : (
          <span className="text-[11px] text-slate-400">возвращён автору</span>
        )}
        {awardedXP !== null ? (
          <Badge tone="emerald">бонус +{awardedXP} XP</Badge>
        ) : null}
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-slate-800 pt-2.5 text-[11px]">
        <span className="inline-flex items-center gap-1 text-slate-400">
          <IconShield className="h-3.5 w-3.5" />
          sandbox · read-only
        </span>
        <span className="inline-flex items-center gap-1 font-medium text-emerald-400 group-hover:text-emerald-300">
          Открыть
          <IconChevronRight className="h-3.5 w-3.5" />
        </span>
      </div>
    </div>
  );
}

function PeerReviewDetails({
  review,
  anonymize,
  now,
  awardedXP,
  onAward,
  onClose,
}: {
  review: PeerReview;
  anonymize: boolean;
  now: number;
  awardedXP: number | null;
  onAward: (review: PeerReview) => void;
  onClose: () => void;
}) {
  const progress = checklistProgress(review);
  const active = isActive(review.status);
  const remaining = expiresInSeconds(review, now);
  const tokenOpen =
    review.status === 'IN_REVIEW' || review.status === 'COMPLETED';

  return (
    <Modal
      open
      size="lg"
      onClose={onClose}
      title={`P2P-ревью #${review.id}`}
      subtitle={`${review.taskTitle} · ${review.groupCode}`}
      footer={
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="inline-flex items-center gap-1.5 text-[11px] text-slate-400">
            <IconLock className="h-3.5 w-3.5" />
            Экспорт артефакта отключён политикой sandbox.
          </p>
          <Button variant="outline" onClick={onClose}>
            Закрыть
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        <section className="flex flex-wrap items-center gap-1.5">
          <Badge tone={PEER_STATUS_TONE[review.status]}>
            {PEER_STATUS_LABEL[review.status]}
          </Badge>
          <Badge tone="slate">{review.groupCode}</Badge>
          {active && remaining > 0 ? (
            <Badge tone={remaining <= EXPIRING_SOON_SECONDS ? 'rose' : 'slate'}>
              <IconClock className="h-3 w-3" />
              до истечения {formatDuration(remaining)}
            </Badge>
          ) : null}
        </section>

        <dl className="grid grid-cols-2 gap-x-3 gap-y-2 rounded-xl bg-slate-900 p-3 text-[11px]">
          <div>
            <dt className="text-slate-400">Автор</dt>
            <dd className="mt-0.5 font-medium text-slate-200">
              {personLabel(review.authorId, review.authorName, 'author', anonymize)}
            </dd>
          </div>
          <div>
            <dt className="text-slate-400">Рецензент</dt>
            <dd className="mt-0.5 font-medium text-slate-200">
              {personLabel(review.reviewerId, review.reviewerName, 'reviewer', anonymize)}
            </dd>
          </div>
          <div>
            <dt className="text-slate-400">Escrow автора</dt>
            <dd className="mt-0.5 font-medium text-slate-200">
              {review.escrowAmount} XP
            </dd>
          </div>
          <div>
            <dt className="text-slate-400">Награда рецензенту</dt>
            <dd className="mt-0.5 font-medium text-slate-200">
              {review.rewardAmount} XP
            </dd>
          </div>
          <div>
            <dt className="text-slate-400">Создано</dt>
            <dd className="mt-0.5 font-medium text-slate-200">
              {formatDateTime(review.createdAt)}
            </dd>
          </div>
          <div>
            <dt className="text-slate-400">Истекает</dt>
            <dd className="mt-0.5 font-medium text-slate-200">
              {formatDateTime(review.expiresAt)}
            </dd>
          </div>
        </dl>

        <section className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3">
          <p className="flex items-start gap-2 text-[11px] leading-relaxed text-emerald-100">
            <IconShield className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
            <span>
              Рецензент получает поток через backend-прокси, а не файл: одноразовый
              токен на 15 минут, watermark с reviewer_id/peer_review_id, экспорт и
              скачивание отсутствуют. Чек-лист существует только в UI.
            </span>
          </p>
        </section>

        <section>
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-xs font-semibold text-slate-300">Артефакт</h4>
            {review.status === 'IN_REVIEW' ? (
              <span className="text-[10px] text-slate-400">
                токен TTL {review.accessTokenTtlSeconds / 60} мин
              </span>
            ) : null}
          </div>

          {tokenOpen ? (
            <div className="relative mt-2 overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <span className="rotate-[-18deg] select-none whitespace-nowrap text-[10px] font-semibold uppercase tracking-[0.28em] text-white/10">
                  peer_review:{review.id} · reviewer:{review.reviewerId ?? '—'}
                </span>
              </div>
              <pre className="relative select-none whitespace-pre-wrap px-4 py-3 font-mono text-[10.5px] leading-relaxed text-slate-300">
                {ARTIFACT_SNIPPET}
              </pre>
              <div className="relative flex items-center justify-between border-t border-white/10 px-4 py-2 text-[10px] text-slate-400">
                <span className="inline-flex items-center gap-1">
                  <IconEye className="h-3 w-3" />
                  поток только для чтения
                </span>
                <span>watermark активен</span>
              </div>
            </div>
          ) : (
            <div className="mt-2 flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-700 bg-slate-900 px-4 py-8 text-center">
              <IconLock className="h-5 w-5 text-slate-400" />
              <p className="mt-2 text-xs font-medium text-slate-300">
                {review.status === 'CREATED'
                  ? 'Поток откроется, когда ревью возьмут'
                  : 'Срок ревью истёк — поток закрыт'}
              </p>
              <p className="mt-1 max-w-xs text-[11px] leading-relaxed text-slate-400">
                {review.status === 'CREATED'
                  ? 'До CLAIM артефакт не покидает backend и недоступен даже преподавателю.'
                  : 'Escrow возвращён автору по EXPIRE, доступ к потоку аннулирован.'}
              </p>
            </div>
          )}
        </section>

        <section>
          <div className="flex items-end justify-between gap-2">
            <h4 className="text-xs font-semibold text-slate-300">Чек-лист</h4>
            <span className="text-[10px] tabular-nums text-slate-400">
              {review.status === 'COMPLETED'
                ? `${progress.passed}/${progress.total} · вес ${progress.passedWeight}/${progress.totalWeight}`
                : `${progress.total} критериев`}
            </span>
          </div>

          {review.status === 'COMPLETED' ? (
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-800">
              <div
                className={cn(
                  'h-full rounded-full transition',
                  progress.percent === 100 ? 'bg-emerald-500' : 'bg-amber-500',
                )}
                style={{ width: `${progress.percent}%` }}
                role="progressbar"
                aria-valuenow={progress.percent}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Пройдено критериев"
              />
            </div>
          ) : null}

          <ul className="mt-2 space-y-1.5">
            {review.checklist.map((item) => {
              const passed = progress.resultByCode.get(item.code);
              const done = review.status === 'COMPLETED';

              return (
                <li
                  key={item.code}
                  className="flex items-center gap-2.5 rounded-xl border border-slate-800 bg-slate-900 px-3 py-2"
                >
                  <span
                    className={cn(
                      'flex h-6 w-6 shrink-0 items-center justify-center rounded-full',
                      done
                        ? passed
                          ? 'bg-emerald-500/20 text-emerald-400'
                          : 'bg-rose-500/20 text-rose-300'
                        : 'bg-slate-800 text-slate-400',
                    )}
                  >
                    {done ? (
                      passed ? (
                        <IconCheck className="h-3.5 w-3.5" />
                      ) : (
                        <IconX className="h-3.5 w-3.5" />
                      )
                    ) : (
                      <IconClock className="h-3.5 w-3.5" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-medium text-slate-200">{item.title}</p>
                    <p className="text-[10px] text-slate-400">
                      {item.code} · вес {item.weight}
                    </p>
                  </div>
                  <span
                    className={cn(
                      'text-[10px] font-medium',
                      done
                        ? passed
                          ? 'text-emerald-400'
                          : 'text-rose-400'
                        : 'text-slate-400',
                    )}
                  >
                    {done
                      ? passed
                        ? 'пройден'
                        : 'не пройден'
                      : review.status === 'IN_REVIEW'
                        ? 'в работе'
                        : '—'}
                  </span>
                </li>
              );
            })}
          </ul>

          {review.status === 'IN_REVIEW' ? (
            <p className="mt-2 text-[10px] leading-relaxed text-slate-400">
              Результаты чек-листа не отдаются до COMPLETE: иначе ревью можно
              «подсмотреть» и повлиять на оценку работы.
            </p>
          ) : null}
        </section>

        {review.summary ? (
          <section>
            <h4 className="text-xs font-semibold text-slate-300">Итог рецензента</h4>
            <blockquote className="mt-2 rounded-xl border-l-2 border-emerald-500 bg-slate-900 px-3 py-2 text-[11px] leading-relaxed text-slate-300">
              {review.summary}
            </blockquote>
          </section>
        ) : null}

        {review.status === 'COMPLETED' && review.reviewerId !== null ? (
          <section className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3">
            <div className="flex items-start gap-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-300">
                <IconSparkles className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <h4 className="text-xs font-semibold text-emerald-50">
                  Качество проверки
                </h4>
                <p className="mt-0.5 text-[11px] leading-relaxed text-emerald-100/80">
                  {awardedXP !== null
                    ? `Бонус +${awardedXP} XP уже начислен рецензенту и записан в XP-журнал.`
                    : 'Ревью завершено. Поощрите рецензента бонусным XP за качественный чек-лист и разбор работы.'}
                </p>
                {awardedXP === null ? (
                  <Button
                    variant="accept"
                    size="sm"
                    className="mt-2"
                    onClick={() => onAward(review)}
                  >
                    <IconSparkles className="h-3.5 w-3.5" />
                    Начислить XP рецензенту
                  </Button>
                ) : null}
              </div>
              {awardedXP !== null ? (
                <Badge tone="emerald" className="shrink-0">
                  +{awardedXP} XP
                </Badge>
              ) : null}
            </div>
          </section>
        ) : null}

        <section>
          <h4 className="text-xs font-semibold text-slate-300">Хронология</h4>
          <ol className="mt-2 space-y-1.5 text-[11px]">
            <li className="flex items-center gap-2 text-slate-300">
              <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
              Создано · {formatDateTime(review.createdAt)}
            </li>
            <li className="flex items-center gap-2 text-slate-300">
              <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
              {review.takenAt
                ? `Взято в работу · ${formatDateTime(review.takenAt)}`
                : 'Ещё не взято в работу'}
            </li>
            {review.completedAt ? (
              <li className="flex items-center gap-2 text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                Завершено · {formatDateTime(review.completedAt)}
              </li>
            ) : null}
            <li
              className={cn(
                'flex items-center gap-2',
                review.status === 'EXPIRED' ? 'text-rose-400' : 'text-slate-300',
              )}
            >
              <span
                className={cn(
                  'h-1.5 w-1.5 rounded-full',
                  review.status === 'EXPIRED' ? 'bg-rose-500' : 'bg-slate-400',
                )}
              />
              {review.status === 'EXPIRED' ? 'Истекло' : 'Истекает'} ·{' '}
              {formatDateTime(review.expiresAt)}
            </li>
          </ol>
        </section>

        <p className="flex items-start gap-2 text-[11px] leading-relaxed text-slate-400">
          <IconLock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Преподаватель наблюдает за сессией, но не завершает ревью за студента:
          COMPLETE доступен только рецензенту, иначе рушится анонимность P2P.
        </p>
      </div>
    </Modal>
  );
}

/**
 * Экран P2P-ревью для преподавателя: мониторинг sandbox-сессий и бонус XP
 * рецензенту за качественную проверку.
 *
 * Завершить ревью за студента нельзя (spec/02_FSM.md §3), поэтому все действия
 * экрана сводятся к наблюдению и поощрению уже завершённых сессий.
 */
export function PeerReviewScreen({
  notify,
}: {
  notify?: (toast: Omit<ToastData, 'id'>) => void;
} = {}) {
  const [reviews, setReviews] = useState<PeerReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<PeerReviewFilter>('ALL');
  const [anonymize, setAnonymize] = useState(true);
  const [selected, setSelected] = useState<PeerReview | null>(null);
  const [awards, setAwards] = useState<Record<number, number>>({});
  const [awardTarget, setAwardTarget] = useState<PeerReview | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    setError(null);

    fetchPeerReviewSessions()
      .then((data) => {
        if (cancelled) {
          return;
        }

        setReviews(data);
        setLoading(false);
      })
      .catch((cause: unknown) => {
        if (cancelled) {
          return;
        }

        setError(
          cause instanceof ApiError
            ? cause.message
            : 'Не удалось загрузить P2P-сессии.',
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

  const counts = useMemo(
    () => ({
      ALL: reviews.length,
      ACTIVE: reviews.filter((review) => isActive(review.status)).length,
      COMPLETED: reviews.filter((review) => review.status === 'COMPLETED').length,
      EXPIRED: reviews.filter((review) => review.status === 'EXPIRED').length,
    }),
    [reviews],
  );

  const expiringSoon = reviews.filter((review) => {
    const remaining = expiresInSeconds(review, now);
    return (
      isActive(review.status) && remaining > 0 && remaining <= EXPIRING_SOON_SECONDS
    );
  }).length;

  const visible = useMemo(() => {
    const filtered = reviews.filter((review) => {
      if (filter === 'ALL') {
        return true;
      }

      if (filter === 'ACTIVE') {
        return isActive(review.status);
      }

      return review.status === filter;
    });

    return [...filtered].sort((left, right) => {
      const statusDiff = STATUS_ORDER[left.status] - STATUS_ORDER[right.status];

      if (statusDiff !== 0) {
        return statusDiff;
      }

      return new Date(left.expiresAt).getTime() - new Date(right.expiresAt).getTime();
    });
  }, [reviews, filter]);

  function handleAwarded(result: ReviewerAwardResult) {
    setAwards((previous) => ({
      ...previous,
      [result.peerReviewId]: result.xpAwarded,
    }));
    setAwardTarget(null);

    notify?.({
      tone: 'success',
      title: `+${result.xpAwarded} XP рецензенту`,
      description: `P2P-ревью #${result.peerReviewId}: бонус за качественную проверку начислен.`,
    });
  }

  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold tracking-tight text-slate-100">P2P-ревью</h1>
          <p className="mt-0.5 text-xs leading-relaxed text-slate-400">
            Наблюдение за sandbox-сессиями и бонус XP рецензенту за качественную
            проверку. Завершить ревью за студента нельзя.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setRefreshKey((key) => key + 1)}
          loading={loading}
          aria-label="Обновить P2P-сессии"
        >
          <IconRefresh className="h-4 w-4" />
          <span className="hidden sm:inline">Обновить</span>
        </Button>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Активных" value={String(counts.ACTIVE)} tone="sky" />
        <Stat
          label="Ждут рецензента"
          value={String(
            reviews.filter((review) => review.status === 'CREATED').length,
          )}
          tone="slate"
        />
        <Stat
          label="Истекает < 2 ч"
          value={String(expiringSoon)}
          tone={expiringSoon > 0 ? 'rose' : 'slate'}
        />
        <Stat label="Завершено" value={String(counts.COMPLETED)} tone="emerald" />
      </div>

      <div className="mt-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-3.5">
        <div className="flex items-start gap-3">
          <IconShield className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" />
          <div>
            <p className="text-xs font-semibold text-emerald-50">
              P2P-ревью идёт в sandbox
            </p>
            <ul className="mt-1 space-y-0.5 text-[11px] leading-relaxed text-emerald-100/80">
              <li>· Рецензенту отдаётся поток, а не файл: скачивание и экспорт закрыты.</li>
              <li>· Одноразовый read-only токен живёт 15 минут, поток помечен watermark.</li>
              <li>· Ревью нельзя взять у себя и нельзя держать больше 3 активных.</li>
              <li>· После COMPLETED можно начислить бонус XP рецензенту за качество.</li>
            </ul>
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1 rounded-xl bg-slate-800 p-1">
          {(['ALL', 'ACTIVE', 'COMPLETED', 'EXPIRED'] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setFilter(value)}
              aria-pressed={filter === value}
              className={cn(
                'rounded-lg px-2.5 py-1 text-[11px] font-medium transition',
                filter === value
                  ? 'bg-slate-900 text-slate-100 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200',
              )}
            >
              {PEER_FILTER_LABEL[value]}
              <span className="ml-1 tabular-nums text-slate-400">{counts[value]}</span>
            </button>
          ))}
        </div>

        <label className="ml-auto flex cursor-pointer items-center gap-2 rounded-xl border border-slate-800 bg-slate-900 px-2.5 py-1.5 shadow-sm">
          <input
            type="checkbox"
            className="peer sr-only"
            checked={anonymize}
            onChange={(event) => setAnonymize(event.target.checked)}
          />
          <span className="relative h-5 w-9 rounded-full bg-slate-600 transition after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-slate-100 after:transition after:content-[''] peer-checked:bg-emerald-500 peer-checked:after:translate-x-4 peer-focus-visible:ring-2 peer-focus-visible:ring-emerald-500/40" />
          <span className="text-[11px] font-medium text-slate-300">Анонимизация</span>
        </label>
      </div>

      {error ? (
        <div
          role="alert"
          className="mt-3 flex items-start gap-2 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-200"
        >
          <IconAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="flex-1">
            <p className="font-semibold">P2P-сессии не загрузились</p>
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
        {loading
          ? [0, 1, 2].map((index) => (
              <div
                key={index}
                className="rounded-2xl border border-slate-800 bg-slate-900 p-4 shadow-sm"
              >
                <div className="flex justify-between">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-20" />
                </div>
                <Skeleton className="mt-3 h-4 w-3/4" />
                <Skeleton className="mt-2 h-3 w-1/2" />
              </div>
            ))
          : null}

        {!loading && !error && visible.length === 0 ? (
          <EmptyState
            icon={<IconUsers className="h-6 w-6" />}
            title="Сессий нет"
            description={
              filter === 'ALL'
                ? 'Как только студенты создадут P2P-ревью, они появятся здесь.'
                : 'В этом статусе сейчас ничего нет — переключите фильтр.'
            }
            action={
              filter !== 'ALL' ? (
                <Button variant="outline" size="sm" onClick={() => setFilter('ALL')}>
                  Показать все
                </Button>
              ) : undefined
            }
          />
        ) : null}

        {!loading && !error
          ? visible.map((review) => (
              <PeerReviewCard
                key={review.id}
                review={review}
                now={now}
                anonymize={anonymize}
                awardedXP={awards[review.id] ?? null}
                onOpen={setSelected}
              />
            ))
          : null}
      </div>

      {selected ? (
        <PeerReviewDetails
          review={selected}
          anonymize={anonymize}
          now={now}
          awardedXP={awards[selected.id] ?? null}
          onAward={(review) => {
            setSelected(null);
            setAwardTarget(review);
          }}
          onClose={() => setSelected(null)}
        />
      ) : null}

      {awardTarget ? (
        <ReviewerAwardModal
          review={awardTarget}
          onClose={() => setAwardTarget(null)}
          onAwarded={handleAwarded}
        />
      ) : null}
    </div>
  );
}
