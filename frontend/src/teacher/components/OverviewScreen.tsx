import { useEffect, useMemo, useState } from 'react';
import { ApiError } from '../../core/api';
import type { Submission, Task } from '../../core/types';
import {
  fetchAllSubmissions,
  fetchPeerReviewSessions,
  fetchTeacherTasks,
} from '../api';
import type { ToastData } from '../types';
import { speedrunEndsAt, submissionWindow } from '../lib/economy';
import {
  formatCountdown,
  formatDate,
  formatDateTime,
  formatWaiting,
  formatWeekday,
  startOfDay,
  waitingTone,
} from '../lib/format';
import {
  STATUS_LABEL,
  STATUS_ORDER,
  STATUS_TONE,
  TASK_TYPE_LABEL,
  TASK_TYPE_TONE,
  slotRoleTitle,
} from '../lib/labels';
import {
  Avatar,
  Badge,
  BarChart,
  Button,
  Callout,
  Card,
  DeadlineMeter,
  EmptyState,
  ErrorState,
  ScreenHeader,
  Section,
  SkeletonList,
  StackedProgress,
  StatTile,
  cn,
} from './ui';
import {
  IconAlert,
  IconBolt,
  IconChart,
  IconCheckCircle,
  IconClock,
  IconGift,
  IconInbox,
  IconRefresh,
  IconTrend,
  IconUsers,
} from './icons';

type Tab = 'overview' | 'review' | 'tasks' | 'teams' | 'peer';

/**
 * OverviewScreen — сводка нагрузки преподавателя.
 *
 * Отвечает на вопрос «что делать сейчас»: очередь проверки, просрочки, пик
 * сдачи по дням, ближайшие дедлайны, открытые бонусные окна и прогресс потоков.
 */
export function OverviewScreen({
  onNavigate,
  reloadSignal = 0,
}: {
  onNavigate: (tab: Tab, taskId?: number | null) => void;
  reloadSignal?: number;
}) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [activePeerReviews, setActivePeerReviews] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    setError(null);

    Promise.all([fetchTeacherTasks(), fetchAllSubmissions(), fetchPeerReviewSessions()])
      .then(([nextTasks, nextSubmissions, peerReviews]) => {
        if (cancelled) {
          return;
        }

        setTasks(nextTasks);
        setSubmissions(nextSubmissions);
        setActivePeerReviews(
          peerReviews.filter((item) => item.status === 'CREATED' || item.status === 'IN_REVIEW')
            .length,
        );
        setLoading(false);
      })
      .catch((cause: unknown) => {
        if (cancelled) {
          return;
        }

        setError(
          cause instanceof ApiError
            ? cause.message
            : 'Не удалось загрузить обзор. Проверьте соединение.',
        );
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [reloadKey, reloadSignal]);

  const metrics = useMemo(() => {
    const now = Date.now();
    const reviewQueue = submissions.filter((item) => item.status === 'REVIEW');
    const overdue = reviewQueue.filter(
      (item) => item.submitted_at !== null && new Date(item.submitted_at).getTime() > new Date(item.deadline_at).getTime(),
    );
    const longWaiting = reviewQueue.filter(
      (item) =>
        item.submitted_at !== null &&
        now - new Date(item.submitted_at).getTime() >= 24 * 3_600_000,
    );
    const submittedToday = submissions.filter(
      (item) =>
        item.submitted_at !== null &&
        startOfDay(new Date(item.submitted_at)).getTime() === startOfDay(new Date(now)).getTime(),
    );

    const waitingSeconds = reviewQueue
      .filter((item) => item.submitted_at !== null)
      .map((item) => (now - new Date(item.submitted_at as string).getTime()) / 1000);
    const avgWaiting =
      waitingSeconds.length > 0
        ? waitingSeconds.reduce((sum, value) => sum + value, 0) / waitingSeconds.length
        : 0;

    return {
      reviewQueue,
      overdue,
      longWaiting,
      submittedToday,
      avgWaiting,
    };
  }, [submissions]);

  // Окно −3…+3 дня: слева видно, как сдавали раньше, справа — когда горят дедлайны.
  const days = useMemo(() => {
    const today = startOfDay(new Date());

    return Array.from({ length: 7 }, (_, index) => {
      const day = new Date(today.getTime() + (index - 3) * 86_400_000);
      const next = new Date(day.getTime() + 86_400_000);

      const count = submissions.filter((item) => {
        if (item.submitted_at === null) {
          return false;
        }

        const at = new Date(item.submitted_at).getTime();

        return at >= day.getTime() && at < next.getTime();
      }).length;

      const deadlines = tasks.filter((task) => {
        const at = new Date(task.deadline_at).getTime();

        return at >= day.getTime() && at < next.getTime();
      }).length;

      return {
        label: formatWeekday(day.toISOString()),
        value: count,
        deadlines,
        tone: 'sky' as const,
        highlight: index === 3,
        title: `${formatDate(day.toISOString())}: сдано ${count}, дедлайнов ${deadlines}`,
      };
    });
  }, [submissions, tasks]);

  const nextDeadlines = useMemo(() => {
    const now = Date.now();

    return tasks
      .filter((task) => new Date(task.deadline_at).getTime() > now)
      .sort(
        (a, b) => new Date(a.deadline_at).getTime() - new Date(b.deadline_at).getTime(),
      )
      .slice(0, 3);
  }, [tasks]);

  const bonusWindows = useMemo(() => {
    const now = Date.now();

    return tasks
      .filter((task) => {
        const bonusEnd = speedrunEndsAt(task.deadline_at, task.speedrun_window_hours).getTime();

        return bonusEnd > now && new Date(task.deadline_at).getTime() > now;
      })
      .sort(
        (a, b) =>
          speedrunEndsAt(a.deadline_at, a.speedrun_window_hours).getTime() -
          speedrunEndsAt(b.deadline_at, b.speedrun_window_hours).getTime(),
      )
      .slice(0, 3);
  }, [tasks]);

  const groups = useMemo(() => {
    const map = new Map<
      string,
      { total: number; counts: Record<Submission['status'], number>; review: number }
    >();

    for (const submission of submissions) {
      const entry =
        map.get(submission.group_code) ?? {
          total: 0,
          review: 0,
          counts: { TODO: 0, IN_PROGRESS: 0, REVIEW: 0, DONE: 0, REJECTED: 0 },
        };

      entry.total += 1;
      entry.counts[submission.status] += 1;
      if (submission.status === 'REVIEW') {
        entry.review += 1;
      }

      map.set(submission.group_code, entry);
    }

    return [...map.entries()]
      .map(([code, value]) => ({ code, ...value }))
      .sort((a, b) => b.review - a.review || b.total - a.total);
  }, [submissions]);

  const attention = useMemo(() => {
    const now = Date.now();

    return [...metrics.reviewQueue]
      .filter((item) => item.submitted_at !== null)
      .sort(
        (a, b) =>
          new Date(a.submitted_at as string).getTime() -
          new Date(b.submitted_at as string).getTime(),
      )
      .slice(0, 4)
      .map((item) => ({
        submission: item,
        waitingSeconds: Math.max(
          0,
          Math.round((now - new Date(item.submitted_at as string).getTime()) / 1000),
        ),
      }));
  }, [metrics.reviewQueue]);

  return (
    <div>
      <ScreenHeader
        eyebrow="Обзор"
        title="Нагрузка"
        description="Что требует внимания прямо сейчас."
        action={
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setReloadKey((key) => key + 1)}
            aria-label="Обновить обзор"
          >
            <IconRefresh className={cn('h-4 w-4', loading && 'animate-spin')} />
          </Button>
        }
      />

      {loading ? <SkeletonList rows={4} /> : null}

      {!loading && error ? (
        <ErrorState message={error} onRetry={() => setReloadKey((key) => key + 1)} />
      ) : null}

      {!loading && !error ? (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-2">
            <StatTile
              label="На проверке"
              value={metrics.reviewQueue.length}
              hint={
                metrics.avgWaiting > 0
                  ? `среднее ожидание ${formatWaiting(metrics.avgWaiting)}`
                  : 'очередь пуста'
              }
              tone="amber"
              icon={<IconInbox className="h-3.5 w-3.5" />}
              onClick={() => onNavigate('review')}
            />
            <StatTile
              label="Просрочили"
              value={metrics.overdue.length}
              hint="сдано после дедлайна"
              tone={metrics.overdue.length > 0 ? 'rose' : 'slate'}
              icon={<IconAlert className="h-3.5 w-3.5" />}
              onClick={() => onNavigate('review')}
            />
            <StatTile
              label="Сдано сегодня"
              value={metrics.submittedToday.length}
              hint="новые поступления"
              tone="sky"
              icon={<IconTrend className="h-3.5 w-3.5" />}
            />
            <StatTile
              label="Ждут > 24 ч"
              value={metrics.longWaiting.length}
              hint="пора проверить"
              tone={metrics.longWaiting.length > 0 ? 'violet' : 'slate'}
              icon={<IconClock className="h-3.5 w-3.5" />}
              onClick={() => onNavigate('review')}
            />
          </div>

          <Card className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <IconChart className="h-4 w-4 text-brand" />
                <h2 className="text-sm font-semibold text-ink">Пик сдачи</h2>
              </div>
              <Badge tone="slate">7 дней</Badge>
            </div>
            <BarChart data={days} />

            <div className="flex items-center gap-1.5">
              {days.map((day, index) => (
                <div key={index} className="flex flex-1 justify-center">
                  <span
                    title={`${day.label}: дедлайнов ${day.deadlines}`}
                    className={cn(
                      'h-2 w-2 rounded-full',
                      day.deadlines > 0 ? 'bg-warn' : 'bg-sunken',
                    )}
                  />
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-ink3">
              <span className="inline-flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-brand" />
                сдачи
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-warn" />
                дедлайны
              </span>
            </div>

            <p className="text-[10px] leading-relaxed text-ink3">
              Сдачи по дням и дни, на которые назначены дедлайны. Бонусное окно
              разгружает пик: сильные студенты закрывают работу в первые часы.
            </p>
          </Card>

          <Section
            title="Требуют внимания"
            subtitle={attention.length === 0 ? 'Очередь пуста' : 'Дольше всех ждут вердикта'}
            action={
              attention.length > 0 ? (
                <Button size="sm" variant="ghost" onClick={() => onNavigate('review')}>
                  Открыть
                </Button>
              ) : null
            }
          >
            {attention.length === 0 ? (
              <EmptyState
                icon={<IconCheckCircle className="h-5 w-5" />}
                title="Всё проверено"
                description="Новые сдачи появятся здесь и в инбоксе."
              />
            ) : (
              <div className="space-y-1.5">
                {attention.map(({ submission, waitingSeconds }) => {
                  const tone = waitingTone(waitingSeconds);

                  return (
                    <button
                      key={submission.id}
                      type="button"
                      onClick={() => onNavigate('review')}
                      className="flex w-full items-center gap-2.5 rounded-xl border border-line bg-card px-3 py-2.5 text-left transition hover:border-line2 hover:bg-sunken/50"
                    >
                      <Avatar name={submission.student_name} tone="sky" size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12px] font-medium text-ink">
                          {submission.student_name}
                        </span>
                        <span className="block truncate text-[10px] text-ink3">
                          {submission.task_title}
                        </span>
                      </span>
                      <Badge tone={tone === 'danger' ? 'rose' : tone === 'warning' ? 'amber' : 'slate'}>
                        {formatWaiting(waitingSeconds)}
                      </Badge>
                    </button>
                  );
                })}
              </div>
            )}
          </Section>

          <Section
            title="Ближайшие дедлайны"
            action={
              <Button size="sm" variant="ghost" onClick={() => onNavigate('tasks')}>
                Все задания
              </Button>
            }
          >
            {nextDeadlines.length === 0 ? (
              <EmptyState
                title="Активных дедлайнов нет"
                description="Выдайте задание, чтобы запустить конвейер."
              />
            ) : (
              <div className="space-y-2">
                {nextDeadlines.map((task) => (
                  <Card key={task.id} className="space-y-2 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="min-w-0 flex-1 line-clamp-2 text-[12px] font-medium leading-snug text-ink">
                        {task.title}
                      </p>
                      <Badge tone={TASK_TYPE_TONE[task.task_type]}>
                        {TASK_TYPE_LABEL[task.task_type]}
                      </Badge>
                    </div>
                    <DeadlineMeter
                      createdAt={task.created_at}
                      deadlineAt={task.deadline_at}
                      bonusEndsAt={speedrunEndsAt(task.deadline_at, task.speedrun_window_hours).toISOString()}
                      now={Date.now()}
                      compact
                    />
                  </Card>
                ))}
              </div>
            )}
          </Section>

          <Section title="Бонусные окна" subtitle="×1.5 за раннюю сдачу ещё действует">
            {bonusWindows.length === 0 ? (
              <Card className="p-3">
                <p className="text-[11px] leading-relaxed text-ink3">
                  Открытых бонусных окон нет: либо бонус уже отработал, либо задания
                  выданы без него.
                </p>
              </Card>
            ) : (
              <div className="space-y-2">
                {bonusWindows.map((task) => {
                  const bonusEnd = speedrunEndsAt(task.deadline_at, task.speedrun_window_hours);
                  const inBonus = submissions.filter(
                    (item) =>
                      item.task_id === task.id &&
                      submissionWindow(
                        item.submitted_at,
                        item.deadline_at,
                        item.speedrun_window_hours,
                      ) === 'speedrun',
                  ).length;

                  return (
                    <Callout
                      key={task.id}
                      tone="emerald"
                      icon={<IconGift className="h-4 w-4" />}
                      title={task.title}
                    >
                      Бонус до {formatCountdown(bonusEnd)} · уже воспользовались {inBonus}{' '}
                      {inBonus === 1 ? 'студент' : 'студентов'}.
                    </Callout>
                  );
                })}
              </div>
            )}
          </Section>

          <Section title="Потоки" subtitle="Распределение карточек по колонкам">
            {groups.length === 0 ? (
              <EmptyState
                icon={<IconUsers className="h-5 w-5" />}
                title="Нет карточек"
                description="После выдачи задания здесь появится прогресс каждого потока."
              />
            ) : (
              <div className="space-y-2">
                {groups.map((group) => (
                  <Card key={group.code} className="space-y-2 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[12px] font-semibold text-ink">{group.code}</p>
                      <div className="flex items-center gap-1">
                        {group.review > 0 ? (
                          <Badge tone="amber">{group.review} на проверке</Badge>
                        ) : null}
                        <Badge tone="slate">{group.total}</Badge>
                      </div>
                    </div>
                    <StackedProgress
                      segments={STATUS_ORDER.map((status) => ({
                        value: group.counts[status],
                        tone: STATUS_TONE[status],
                        title: STATUS_LABEL[status],
                      }))}
                    />
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-ink3">
                      <span>К выполнению {group.counts.TODO}</span>
                      <span>В работе {group.counts.IN_PROGRESS}</span>
                      <span>Зачтено {group.counts.DONE}</span>
                      <span>Возврат {group.counts.REJECTED}</span>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </Section>

          <Section title="Взаимопроверка" subtitle="P2P-сессии в работе">
            <Card className="flex items-center gap-3 p-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-teamSoft text-team">
                <IconUsers className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[12px] font-medium text-ink">
                  {activePeerReviews > 0
                    ? `${activePeerReviews} активных сессий`
                    : 'Активных сессий нет'}
                </p>
                <p className="text-[10px] text-ink3">
                  Студенты проверяют работы друг друга по чек-листу
                </p>
              </div>
              <Button size="sm" variant="outline" onClick={() => onNavigate('peer')}>
                <IconBolt className="h-3.5 w-3.5" />
                Открыть
              </Button>
            </Card>
          </Section>

          <Callout tone="slate" icon={<IconClock className="h-4 w-4" />} title="Как работает конвейер">
            Студент двигает карточку по колонкам сам. «В работе» — сигнал о старте,
            «На проверке» фиксирует время сдачи и блокирует правки, вердикт
            возвращает работу в «Зачтено» или «На доработку».
          </Callout>
        </div>
      ) : null}
    </div>
  );
}

export type { Tab };
