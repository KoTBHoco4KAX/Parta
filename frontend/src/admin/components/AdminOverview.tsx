import { useEffect, useMemo, useState } from 'react';
import { ApiError } from '../../core/api';
import {
  fetchAssignments,
  fetchGroups,
  fetchPeerReviews,
  fetchSubmissions,
  fetchTasks,
  fetchUsers,
} from '../api';
import type { Assignment, Group, PeerReview, Submission, Task, User } from '../api';
import {
  Badge,
  BarChart,
  Button,
  Card,
  DeadlineMeter,
  EmptyState,
  ErrorState,
  KeyValue,
  ScreenHeader,
  Section,
  SkeletonList,
  StackedProgress,
  StatTile,
  cn,
} from '../../teacher/components/ui';
import { speedrunEndsAt } from '../../teacher/lib/economy';
import {
  formatDate,
  formatDateTime,
  formatWeekday,
  startOfDay,
} from '../../teacher/lib/format';
import {
  ROLE_LABEL,
  ROLE_TONE,
  STATUS_LABEL,
  STATUS_ORDER,
  STATUS_TONE,
  TASK_TYPE_LABEL,
  TASK_TYPE_TONE,
} from '../../teacher/lib/labels';
import {
  IconAlert,
  IconBook,
  IconChart,
  IconClipboard,
  IconClock,
  IconInbox,
  IconLayers,
  IconRefresh,
  IconShield,
  IconUsers,
} from '../../teacher/components/icons';

export type AdminTab = 'overview' | 'users' | 'groups' | 'assignments';

/**
 * AdminOverview — состояние контура: люди, потоки, задания и очередь проверки.
 */
export function AdminOverview({
  onNavigate,
  reloadSignal = 0,
}: {
  onNavigate: (tab: AdminTab) => void;
  reloadSignal?: number;
}) {
  const [users, setUsers] = useState<User[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [peerReviews, setPeerReviews] = useState<PeerReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    setError(null);

    Promise.all([
      fetchUsers(),
      fetchGroups(),
      fetchTasks(),
      fetchSubmissions(),
      fetchAssignments(),
      fetchPeerReviews(),
    ])
      .then(([nextUsers, nextGroups, nextTasks, nextSubmissions, nextAssignments, nextPeerReviews]) => {
        if (cancelled) {
          return;
        }

        setUsers(nextUsers);
        setGroups(nextGroups);
        setTasks(nextTasks);
        setSubmissions(nextSubmissions);
        setAssignments(nextAssignments);
        setPeerReviews(nextPeerReviews);
        setLoading(false);
      })
      .catch((cause: unknown) => {
        if (cancelled) {
          return;
        }

        setError(
          cause instanceof ApiError
            ? cause.message
            : 'Не удалось загрузить сводку. Проверьте соединение.',
        );
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [reloadKey, reloadSignal]);

  const metrics = useMemo(() => {
    const students = users.filter((user) => user.role === 'student');
    const teachers = users.filter((user) => user.role === 'teacher');
    const admins = users.filter((user) => user.role === 'admin');
    const review = submissions.filter((item) => item.status === 'REVIEW');
    const rejected = submissions.filter((item) => item.status === 'REJECTED');
    const activePeer = peerReviews.filter(
      (item) => item.status === 'CREATED' || item.status === 'IN_REVIEW',
    );
    const activeTasks = tasks.filter(
      (task) => new Date(task.deadline_at).getTime() > Date.now(),
    );

    return { students, teachers, admins, review, rejected, activePeer, activeTasks };
  }, [users, tasks, submissions, peerReviews]);

  const groupsView = useMemo(
    () =>
      groups
        .map((group) => {
          const members = users.filter((user) => user.group_id === group.id);
          const groupSubmissions = submissions.filter(
            (submission) => submission.group_id === group.id,
          );
          const counts = { TODO: 0, IN_PROGRESS: 0, REVIEW: 0, DONE: 0, REJECTED: 0 };

          for (const submission of groupSubmissions) {
            counts[submission.status] += 1;
          }

          return {
            group,
            members: members.length,
            total: groupSubmissions.length,
            counts,
            review: counts.REVIEW,
            assignments: assignments.filter((assignment) => assignment.group_code === group.code)
              .length,
          };
        })
        .sort((a, b) => b.review - a.review || b.members - a.members),
    [groups, users, submissions, assignments],
  );

  const days = useMemo(() => {
    const today = startOfDay(new Date());

    return Array.from({ length: 7 }, (_, index) => {
      const day = new Date(today.getTime() - (6 - index) * 86_400_000);
      const next = new Date(day.getTime() + 86_400_000);

      const submitted = submissions.filter((submission) => {
        if (!submission.submitted_at) {
          return false;
        }

        const at = new Date(submission.submitted_at).getTime();

        return at >= day.getTime() && at < next.getTime();
      }).length;

      return {
        label: formatWeekday(day.toISOString()),
        value: submitted,
        tone: 'sky' as const,
        highlight: index === 6,
        title: `${formatDate(day.toISOString())}: сдано ${submitted}`,
      };
    });
  }, [submissions]);

  const nextDeadlines = useMemo(
    () =>
      tasks
        .filter((task) => new Date(task.deadline_at).getTime() > Date.now())
        .sort(
          (a, b) => new Date(a.deadline_at).getTime() - new Date(b.deadline_at).getTime(),
        )
        .slice(0, 3),
    [tasks],
  );

  const groupCodes = useMemo(() => {
    const map = new Map<number, string>();
    for (const group of groups) {
      map.set(group.id, group.code);
    }

    return map;
  }, [groups]);

  const assignmentStats = useMemo(() => {
    const byAssignment = new Map<number, number>();
    for (const task of tasks) {
      byAssignment.set(task.assignment_id, (byAssignment.get(task.assignment_id) ?? 0) + 1);
    }

    return { byAssignment };
  }, [tasks]);

  return (
    <div>
      <ScreenHeader
        eyebrow="Админка"
        title="Состояние контура"
        description="Люди, потоки, выдачи и очередь проверки."
        action={
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setReloadKey((key) => key + 1)}
            aria-label="Обновить сводку"
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
              label="Студентов"
              value={metrics.students.length}
              hint={`${metrics.teachers.length} преподавателей`}
              tone="sky"
              icon={<IconUsers className="h-3.5 w-3.5" />}
              onClick={() => onNavigate('users')}
            />
            <StatTile
              label="Групп"
              value={groups.length}
              hint={`${assignments.length} назначений`}
              tone="emerald"
              icon={<IconLayers className="h-3.5 w-3.5" />}
              onClick={() => onNavigate('groups')}
            />
            <StatTile
              label="Заданий в работе"
              value={metrics.activeTasks.length}
              hint={`всего ${tasks.length}`}
              tone="violet"
              icon={<IconClipboard className="h-3.5 w-3.5" />}
              onClick={() => onNavigate('assignments')}
            />
            <StatTile
              label="На проверке"
              value={metrics.review.length}
              hint={metrics.rejected.length > 0 ? `${metrics.rejected.length} возвращено` : 'очередь'}
              tone={metrics.review.length > 0 ? 'amber' : 'slate'}
              icon={<IconInbox className="h-3.5 w-3.5" />}
            />
          </div>

          <Card className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <IconChart className="h-4 w-4 text-brand" />
                <h2 className="text-sm font-semibold text-ink">Активность сдач</h2>
              </div>
              <Badge tone="slate">7 дней</Badge>
            </div>
            <BarChart data={days} />
          </Card>

          <Section
            title="Потоки"
            subtitle="Состав, выдачи и очередь проверки"
            action={
              <Button size="sm" variant="ghost" onClick={() => onNavigate('groups')}>
                Управлять
              </Button>
            }
          >
            {groupsView.length === 0 ? (
              <EmptyState
                icon={<IconLayers className="h-5 w-5" />}
                title="Групп нет"
                description="Создайте первую группу — на неё можно назначать преподавателей и задания."
                action={<Button onClick={() => onNavigate('groups')}>Создать группу</Button>}
              />
            ) : (
              <div className="space-y-2">
                {groupsView.map((item) => (
                  <Card key={item.group.id} className="space-y-2 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-[12px] font-semibold text-ink">
                          {item.group.code}
                        </p>
                        <p className="truncate text-[10px] text-ink3">{item.group.title}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        {item.review > 0 ? <Badge tone="amber">{item.review}</Badge> : null}
                        <Badge tone="slate">
                          <IconUsers className="h-3 w-3" />
                          {item.members}
                        </Badge>
                      </div>
                    </div>

                    <StackedProgress
                      segments={STATUS_ORDER.map((status) => ({
                        value: item.counts[status],
                        tone: STATUS_TONE[status],
                        title: STATUS_LABEL[status],
                      }))}
                    />

                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-ink3">
                      <span>{item.assignments} назначений</span>
                      <span>{item.total} карточек</span>
                      <span>зачтено {item.counts.DONE}</span>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </Section>

          <Section
            title="Ближайшие дедлайны"
            action={
              <Button size="sm" variant="ghost" onClick={() => onNavigate('assignments')}>
                Все задания
              </Button>
            }
          >
            {nextDeadlines.length === 0 ? (
              <EmptyState
                icon={<IconClock className="h-5 w-5" />}
                title="Активных дедлайнов нет"
              />
            ) : (
              <div className="space-y-2">
                {nextDeadlines.map((task) => (
                  <Card key={task.id} className="space-y-2 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="min-w-0 line-clamp-2 flex-1 text-[12px] font-medium text-ink">
                        {task.title}
                      </p>
                      <Badge tone={TASK_TYPE_TONE[task.task_type]}>
                        {TASK_TYPE_LABEL[task.task_type]}
                      </Badge>
                    </div>
                    <DeadlineMeter
                      createdAt={task.created_at}
                      deadlineAt={task.deadline_at}
                      bonusEndsAt={speedrunEndsAt(
                        task.deadline_at,
                        task.speedrun_window_hours,
                      ).toISOString()}
                      now={Date.now()}
                      compact
                    />
                    <p className="text-[10px] text-ink3">
                      дедлайн {formatDateTime(task.deadline_at)} ·{' '}
                      {groupCodes.get(task.group_id) ?? `группа #${task.group_id}`}
                    </p>
                  </Card>
                ))}
              </div>
            )}
          </Section>

          <Section title="Роли" subtitle="Кто в контуре">
            <div className="grid grid-cols-3 gap-2">
              {(['student', 'teacher', 'admin'] as const).map((role) => {
                const count = users.filter((user) => user.role === role).length;

                return (
                  <Card key={role} className="p-3">
                    <Badge tone={ROLE_TONE[role]}>{ROLE_LABEL[role]}</Badge>
                    <p className="mt-1.5 text-lg font-semibold tabular-nums text-ink">
                      {count}
                    </p>
                  </Card>
                );
              })}
            </div>
          </Section>

          <Section
            title="Взаимопроверка"
            subtitle="P2P-сессии по всем преподавателям"
            action={
              <Button size="sm" variant="ghost" onClick={() => onNavigate('assignments')}>
                <IconShield className="h-3.5 w-3.5" />
                Детали
              </Button>
            }
          >
            <Card className="flex items-center gap-3 p-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-teamSoft text-team">
                <IconBook className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[12px] font-medium text-ink">
                  {metrics.activePeer.length} активных · {peerReviews.length} всего
                </p>
                <p className="text-[10px] text-ink3">
                  {assignments.length} назначений · {groups.length} групп
                </p>
              </div>
            </Card>
          </Section>

          {error ? (
            <p role="alert" className="text-[11px] text-bad">
              {error}
            </p>
          ) : null}

          <Card className="space-y-2 p-3">
            <div className="flex items-center gap-1.5">
              <IconAlert className="h-4 w-4 text-warn" />
              <p className="text-[11px] font-semibold text-ink2">Что админ меняет</p>
            </div>
            <dl className="grid grid-cols-2 gap-2">
              <KeyValue label="Пользователи" value="создание · роли · группы" />
              <KeyValue label="Группы" value="создание · состав" />
              <KeyValue label="Назначения" value="только просмотр" />
              <KeyValue
                label="Выдача заданий"
                value={`${assignmentStats.byAssignment.size} назначений с задачами`}
              />
            </dl>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
