import { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError } from '../../core/api';
import type { Submission } from '../../core/types';
import { fetchAllSubmissions, issueVerdict } from '../api';
import type { ToastData } from '../types';
import type { SubmissionWindow } from '../lib/economy';
import {
  estimateFinalXP,
  speedrunEndsAt,
  submissionWindow,
} from '../lib/economy';
import {
  formatDateTime,
  formatWaiting,
  pluralize,
  waitingTone,
} from '../lib/format';
import {
  TASK_TYPE_LABEL,
  TASK_TYPE_TONE,
  WINDOW_LABEL,
  WINDOW_TONE,
  slotRoleTitle,
} from '../lib/labels';
import { AttachmentsPanel } from './AttachmentsPanel';
import {
  Avatar,
  Badge,
  Button,
  Callout,
  Chip,
  EmptyState,
  ErrorState,
  Field,
  KeyValue,
  Modal,
  ScreenHeader,
  Segmented,
  SkeletonList,
  TextArea,
  cn,
} from './ui';
import {
  IconAlert,
  IconCheck,
  IconClock,
  IconInbox,
  IconRefresh,
  IconSparkles,
  IconX,
} from './icons';

type Filter = 'all' | 'overdue' | 'bonus' | 'long';
type Sort = 'waiting' | 'deadline' | 'student';

/** InboxRow — сдача на проверке плюс производные величины для очереди. */
interface InboxRow {
  submission: Submission;
  waitingSeconds: number;
  onTime: boolean;
  window: SubmissionWindow;
  expectedXP: number;
}

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'Все' },
  { value: 'overdue', label: 'После срока' },
  { value: 'bonus', label: 'Бонус ×1.5' },
  { value: 'long', label: 'Ждут > 24 ч' },
];

const SORTS: { value: Sort; label: string }[] = [
  { value: 'waiting', label: 'Дольше ждут' },
  { value: 'deadline', label: 'По дедлайну' },
  { value: 'student', label: 'По ученику' },
];

/**
 * InboxScreen — сквозной экран проверки.
 *
 * Один список всех сдач «На проверке» по всем заданиям и потокам: фильтры по
 * сроку и бонусу, сортировка по ожиданию и вердикт в один клик прямо в шторке.
 */
export function InboxScreen({
  notify,
  initialTaskId = null,
  reloadSignal = 0,
  onReviewed,
}: {
  notify: (toast: Omit<ToastData, 'id'>) => void;
  initialTaskId?: number | null;
  reloadSignal?: number;
  onReviewed?: () => void;
}) {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<Sort>('waiting');
  const [search, setSearch] = useState('');
  const [taskFilter, setTaskFilter] = useState<number | null>(initialTaskId);

  const [selectedId, setSelectedId] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    setError(null);

    fetchAllSubmissions()
      .then((items) => {
        if (cancelled) {
          return;
        }

        setSubmissions(items.filter((item) => item.status === 'REVIEW'));
        setLoading(false);
      })
      .catch((cause: unknown) => {
        if (cancelled) {
          return;
        }

        setError(
          cause instanceof ApiError
            ? cause.message
            : 'Не удалось загрузить очередь проверки. Проверьте соединение.',
        );
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [reloadKey, reloadSignal]);

  const rows = useMemo<InboxRow[]>(() => {
    const now = Date.now();

    return submissions.map((submission) => {
      const submittedAt = submission.submitted_at;
      const window = submissionWindow(
        submittedAt,
        submission.deadline_at,
        submission.speedrun_window_hours,
      );

      return {
        submission,
        waitingSeconds: submittedAt
          ? Math.max(0, Math.round((now - new Date(submittedAt).getTime()) / 1000))
          : 0,
        onTime: submittedAt
          ? new Date(submittedAt).getTime() <= new Date(submission.deadline_at).getTime()
          : false,
        window,
        expectedXP: estimateFinalXP(
          submission.base_xp_computed,
          submittedAt,
          submission.deadline_at,
          submission.speedrun_window_hours,
        ),
      };
    });
  }, [submissions]);

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();

    const filtered = rows.filter((row) => {
      if (taskFilter !== null && row.submission.task_id !== taskFilter) {
        return false;
      }

      if (filter === 'overdue' && row.onTime) {
        return false;
      }

      if (filter === 'bonus' && row.window !== 'speedrun') {
        return false;
      }

      if (filter === 'long' && row.waitingSeconds < 24 * 3_600) {
        return false;
      }

      if (query === '') {
        return true;
      }

      return [row.submission.student_name, row.submission.task_title, row.submission.group_code]
        .join(' ')
        .toLowerCase()
        .includes(query);
    });

    return filtered.sort((a, b) => {
      switch (sort) {
        case 'deadline':
          return (
            new Date(a.submission.deadline_at).getTime() -
            new Date(b.submission.deadline_at).getTime()
          );
        case 'student':
          return a.submission.student_name.localeCompare(b.submission.student_name, 'ru');
        default:
          return b.waitingSeconds - a.waitingSeconds;
      }
    });
  }, [rows, filter, sort, search, taskFilter]);

  const taskContext = useMemo(() => {
    if (taskFilter === null) {
      return null;
    }

    const row = rows.find((item) => item.submission.task_id === taskFilter);

    return row
      ? { taskId: taskFilter, title: row.submission.task_title }
      : { taskId: taskFilter, title: `Задание #${taskFilter}` };
  }, [rows, taskFilter]);

  const selected = useMemo(
    () => rows.find((row) => row.submission.id === selectedId) ?? null,
    [rows, selectedId],
  );

  const handleDecided = useCallback(
    (submissionId: number) => {
      setSubmissions((previous) => previous.filter((item) => item.id !== submissionId));
      setSelectedId(null);
      onReviewed?.();
    },
    [onReviewed],
  );

  const overdueCount = rows.filter((row) => !row.onTime).length;
  const bonusCount = rows.filter((row) => row.window === 'speedrun').length;
  const longCount = rows.filter((row) => row.waitingSeconds >= 24 * 3_600).length;

  return (
    <div>
      <ScreenHeader
        eyebrow="Проверка"
        title="Единый инбокс"
        description={
          rows.length === 0
            ? 'Все сданные работы проверены.'
            : visible.length !== rows.length
              ? `${visible.length} из ${rows.length} · фильтр активен`
              : `${rows.length} ${pluralize(rows.length, ['работа ждёт', 'работы ждут', 'работ ждут'])} вердикта`
        }
        action={
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setReloadKey((key) => key + 1)}
            aria-label="Обновить инбокс"
          >
            <IconRefresh className={cn('h-4 w-4', loading && 'animate-spin')} />
          </Button>
        }
      />

      {taskContext ? (
        <div className="mb-3 flex items-center gap-2 rounded-xl border border-brandLine bg-brandSoft px-3 py-2">
          <IconInbox className="h-4 w-4 shrink-0 text-brandStrong" />
          <p className="min-w-0 flex-1 truncate text-[11px] text-brandStrong">
            Только задание: {taskContext.title}
          </p>
          <button
            type="button"
            onClick={() => setTaskFilter(null)}
            className="rounded-lg p-1 text-brandStrong transition hover:bg-brandSoft"
            aria-label="Сбросить фильтр по заданию"
          >
            <IconX className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : null}

      <div className="space-y-2.5">
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Ученик, задание или группа"
          aria-label="Поиск по ученику, заданию или группе"
          className="w-full rounded-lg border border-line2 bg-card px-3 py-2.5 text-sm text-ink placeholder:text-ink4 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brandLine"
        />

        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((item) => (
            <Chip
              key={item.value}
              active={filter === item.value}
              onClick={() => setFilter(item.value)}
              count={
                item.value === 'all'
                  ? rows.length
                  : item.value === 'overdue'
                    ? overdueCount
                    : item.value === 'bonus'
                      ? bonusCount
                      : longCount
              }
            >
              {item.label}
            </Chip>
          ))}
        </div>

        <Segmented options={SORTS} value={sort} onChange={setSort} ariaLabel="Сортировка инбокса" />
      </div>

      <div className="mt-4 space-y-2">
        {loading ? <SkeletonList rows={4} /> : null}

        {!loading && error ? (
          <ErrorState message={error} onRetry={() => setReloadKey((key) => key + 1)} />
        ) : null}

        {!loading && !error && visible.length === 0 ? (
          <EmptyState
            icon={<IconCheck className="h-5 w-5" />}
            title={rows.length === 0 ? 'Очередь пуста' : 'Ничего не найдено'}
            description={
              rows.length === 0
                ? 'Как только ученик переведёт карточку в «На проверке», работа появится здесь.'
                : 'Сбросьте фильтры или измените поисковый запрос.'
            }
            action={
              rows.length === 0 ? null : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setFilter('all');
                    setSearch('');
                  }}
                >
                  Сбросить фильтры
                </Button>
              )
            }
          />
        ) : null}

        {!loading && !error
          ? visible.map((row) => (
              <InboxRowCard
                key={row.submission.id}
                row={row}
                onOpen={() => setSelectedId(row.submission.id)}
              />
            ))
          : null}
      </div>

      {selected ? (
        <ReviewDetailModal
          row={selected}
          notify={notify}
          onClose={() => setSelectedId(null)}
          onDecided={handleDecided}
        />
      ) : null}
    </div>
  );
}

/** InboxRowCard — строка очереди: кто, что, сколько ждёт и какой бонус. */
function InboxRowCard({ row, onOpen }: { row: InboxRow; onOpen: () => void }) {
  const { submission } = row;
  const tone = waitingTone(row.waitingSeconds);

  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full rounded-2xl border border-line bg-card p-3 text-left transition hover:border-line2 hover:bg-sunken/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand"
    >
      <div className="flex items-start gap-2.5">
        <Avatar name={submission.student_name} tone="sky" />

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="min-w-0 truncate text-sm font-semibold text-ink">
              {submission.student_name}
            </p>
            <Badge tone={tone === 'danger' ? 'rose' : tone === 'warning' ? 'amber' : 'slate'}>
              <IconClock className="h-3 w-3" />
              {formatWaiting(row.waitingSeconds)}
            </Badge>
          </div>

          <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-ink3">
            {submission.task_title}
          </p>

          <div className="mt-1.5 flex flex-wrap items-center gap-1">
            <Badge tone="slate">{submission.group_code}</Badge>
            <Badge tone={TASK_TYPE_TONE[submission.task_type]}>
              {TASK_TYPE_LABEL[submission.task_type]}
            </Badge>
            {submission.team_slot_role ? (
              <Badge tone="violet">{slotRoleTitle(submission.team_slot_role)}</Badge>
            ) : null}
            {row.window === 'speedrun' ? (
              <Badge tone="emerald">
                <IconSparkles className="h-3 w-3" />
                +{row.expectedXP} XP
              </Badge>
            ) : null}
            {!row.onTime ? <Badge tone="rose">после срока</Badge> : null}
            {submission.attempt > 1 ? (
              <Badge tone="amber">попытка {submission.attempt}</Badge>
            ) : null}
          </div>
        </div>
      </div>
    </button>
  );
}

/** ReviewDetailModal — проверка и вердикт без перехода на другие экраны. */
function ReviewDetailModal({
  row,
  notify,
  onClose,
  onDecided,
}: {
  row: InboxRow;
  notify: (toast: Omit<ToastData, 'id'>) => void;
  onClose: () => void;
  onDecided: (submissionId: number) => void;
}) {
  const { submission } = row;

  const [mode, setMode] = useState<'idle' | 'reject'>('idle');
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState<'ACCEPT' | 'REJECT' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const bonusEndsAt = speedrunEndsAt(
    submission.deadline_at,
    submission.speedrun_window_hours,
  ).toISOString();

  async function decide(verdict: 'ACCEPT' | 'REJECT') {
    if (verdict === 'REJECT' && comment.trim() === '') {
      setError('Комментарий обязателен: ученик должен понять, что исправить.');

      return;
    }

    setBusy(verdict);
    setError(null);

    try {
      const result = await issueVerdict({
        submissionId: submission.id,
        verdict,
        comment: comment.trim(),
      });

      notify(
        verdict === 'ACCEPT'
          ? {
              tone: 'success',
              title: 'Работа зачтена',
              description:
                result.xpAwarded > 0
                  ? `${submission.student_name}: +${result.xpAwarded} XP`
                  : submission.student_name,
            }
          : {
              tone: 'info',
              title: 'Возвращено на доработку',
              description: submission.student_name,
            },
      );

      onDecided(submission.id);
    } catch (cause) {
      setError(
        cause instanceof ApiError
          ? cause.message
          : 'Не удалось применить вердикт. Проверьте соединение.',
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={submission.student_name}
      subtitle={submission.task_title}
      size="lg"
      footer={
        <div className="flex w-full flex-col gap-2">
          {error ? (
            <p role="alert" className="text-[11px] text-bad">
              {error}
            </p>
          ) : null}

          {mode === 'reject' ? (
            <>
              <Field
                label="Что вернуть на доработку"
                htmlFor="reject-comment"
                hint="Комментарий увидит ученик в истории карточки."
              >
                <TextArea
                  id="reject-comment"
                  value={comment}
                  onChange={(event) => setComment(event.target.value)}
                  placeholder="Например: нет нормализации до 3НФ, добавьте миграции и повторите сдачу."
                  invalid={comment.trim() === '' && error !== null}
                />
              </Field>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  block
                  onClick={() => {
                    setMode('idle');
                    setError(null);
                  }}
                  disabled={busy !== null}
                >
                  Отмена
                </Button>
                <Button
                  variant="reject"
                  block
                  loading={busy === 'REJECT'}
                  onClick={() => void decide('REJECT')}
                >
                  Вернуть
                </Button>
              </div>
            </>
          ) : (
            <div className="flex gap-2">
              <Button
                variant="reject"
                block
                onClick={() => setMode('reject')}
                disabled={busy !== null}
              >
                На доработку
              </Button>
              <Button
                variant="accept"
                block
                loading={busy === 'ACCEPT'}
                onClick={() => void decide('ACCEPT')}
              >
                <IconCheck className="h-4 w-4" />
                Зачесть
              </Button>
            </div>
          )}
        </div>
      }
    >
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3 rounded-xl border border-line bg-muted p-3">
          <KeyValue label="Группа" value={submission.group_code} />
          <KeyValue label="Тип" value={TASK_TYPE_LABEL[submission.task_type]} />
          <KeyValue
            label="Сдано"
            value={submission.submitted_at ? formatDateTime(submission.submitted_at) : '—'}
          />
          <KeyValue label="Дедлайн" value={formatDateTime(submission.deadline_at)} />
          <KeyValue
            label="Ожидает"
            value={formatWaiting(row.waitingSeconds)}
            tone={waitingTone(row.waitingSeconds) === 'danger' ? 'rose' : 'slate'}
          />
          <KeyValue label="Попытка" value={submission.attempt} />
          {submission.team_slot_role ? (
            <KeyValue label="Слот команды" value={slotRoleTitle(submission.team_slot_role)} />
          ) : null}
          <KeyValue label="Базовый XP" value={`${submission.base_xp_computed} XP`} />
        </div>

        {row.window === 'speedrun' ? (
          <Callout tone="emerald" icon={<IconSparkles className="h-4 w-4" />} title="Сдано в бонусное окно">
            Бонус ×1.5 действует до {formatDateTime(bonusEndsAt)}. Ученик получит{' '}
            <span className="font-semibold">{row.expectedXP} XP</span> вместо{' '}
            {submission.base_xp_computed} XP.
          </Callout>
        ) : !row.onTime ? (
          <Callout tone="rose" icon={<IconAlert className="h-4 w-4" />} title="Сдача после дедлайна">
            Множитель ×0.5: к начислению <span className="font-semibold">{row.expectedXP} XP</span>{' '}
            из {submission.base_xp_computed} базовых.
          </Callout>
        ) : (
          <Callout tone="sky" icon={<IconClock className="h-4 w-4" />} title="Сдано в срок">
            Множитель ×1.0, к начислению {row.expectedXP} XP. Бонусное окно ×1.5 уже закрыто.
          </Callout>
        )}

        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone={WINDOW_TONE[row.window]}>{WINDOW_LABEL[row.window]}</Badge>
          <Badge tone="slate">×{row.window === 'speedrun' ? '1.5' : row.onTime ? '1.0' : '0.5'}</Badge>
          {submission.attempt > 1 ? <Badge tone="amber">повторная сдача</Badge> : null}
          {submission.revision_log.length > 0 ? (
            <Badge tone="rose">
              возвратов: {submission.revision_log.length}
            </Badge>
          ) : null}
        </div>

        <AttachmentsPanel
          submissionId={submission.id}
          artifactUrl={submission.artifact_url}
          artifactHash={submission.artifact_hash}
          notify={notify}
        />

        <section>
          <h4 className="mb-2 text-xs font-semibold text-ink2">История доработок</h4>
          {submission.revision_log.length === 0 ? (
            <p className="rounded-lg border border-dashed border-line2 px-3 py-2.5 text-[11px] text-ink3">
              Возвратов не было — это первая сдача.
            </p>
          ) : (
            <ol className="space-y-2">
              {submission.revision_log
                .slice()
                .reverse()
                .map((revision, index) => (
                  <li
                    key={`${revision.at}-${index}`}
                    className="rounded-lg border border-line bg-muted px-3 py-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <Badge tone="rose">возврат</Badge>
                      <span className="text-[10px] text-ink3">
                        {formatDateTime(revision.at)}
                      </span>
                    </div>
                    <p className="mt-1 whitespace-pre-line text-[11px] leading-relaxed text-ink2">
                      {revision.comment}
                    </p>
                  </li>
                ))}
            </ol>
          )}
        </section>
      </div>
    </Modal>
  );
}
