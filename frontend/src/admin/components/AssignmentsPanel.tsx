import { useEffect, useMemo, useState } from 'react';
import { ApiError } from '../../core/api';
import type { Assignment, Group, Submission, Task, User } from '../api';
import { fetchAssignments, fetchGroups, fetchSubmissions, fetchTasks, fetchUsers } from '../api';
import {
  Badge,
  Button,
  Callout,
  Card,
  Chip,
  DeadlineMeter,
  EmptyState,
  ErrorState,
  ScreenHeader,
  Section,
  SkeletonList,
  StackedProgress,
  StatTile,
} from '../../teacher/components/ui';
import { speedrunEndsAt } from '../../teacher/lib/economy';
import { formatDateTime, pluralize } from '../../teacher/lib/format';
import {
  STATUS_LABEL,
  STATUS_ORDER,
  STATUS_TONE,
  TASK_TYPE_LABEL,
  TASK_TYPE_TONE,
} from '../../teacher/lib/labels';
import {
  IconAlert,
  IconBook,
  IconClipboard,
  IconLayers,
  IconRefresh,
  IconUsers,
} from '../../teacher/components/icons';

type TaskFilter = 'all' | 'active' | 'past';

/**
 * AssignmentsPanel — что выдано в контуре.
 *
 * Админ не выдаёт задания (это делает преподаватель), но видит связки
 * «группа + дисциплина + преподаватель» и все задания с прогрессом колонок:
 * так проще заметить поток без назначений или зависшую очередь проверки.
 */
export function AssignmentsPanel({ reloadSignal = 0 }: { reloadSignal?: number }) {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [filter, setFilter] = useState<TaskFilter>('all');

  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    setError(null);

    Promise.all([
      fetchAssignments(),
      fetchTasks(),
      fetchSubmissions(),
      fetchGroups(),
      fetchUsers(),
    ])
      .then(([nextAssignments, nextTasks, nextSubmissions, nextGroups, nextUsers]) => {
        if (cancelled) {
          return;
        }

        setAssignments(nextAssignments);
        setTasks(nextTasks);
        setSubmissions(nextSubmissions);
        setGroups(nextGroups);
        setUsers(nextUsers);
        setLoading(false);
      })
      .catch((cause: unknown) => {
        if (cancelled) {
          return;
        }

        setError(
          cause instanceof ApiError ? cause.message : 'Не удалось загрузить задания.',
        );
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [reloadKey, reloadSignal]);

  const teacherName = (id: number): string =>
    users.find((user) => user.id === id)?.display_name ?? `#${id}`;

  const groupCode = (id: number): string =>
    groups.find((group) => group.id === id)?.code ?? `#${id}`;

  const tasksByAssignment = useMemo(() => {
    const map = new Map<number, Task[]>();
    for (const task of tasks) {
      const list = map.get(task.assignment_id) ?? [];
      list.push(task);
      map.set(task.assignment_id, list);
    }

    return map;
  }, [tasks]);

  const countsByTask = useMemo(() => {
    const map = new Map<number, Record<Submission['status'], number>>();

    for (const submission of submissions) {
      const bucket =
        map.get(submission.task_id) ??
        ({ TODO: 0, IN_PROGRESS: 0, REVIEW: 0, DONE: 0, REJECTED: 0 } as Record<
          Submission['status'],
          number
        >);
      bucket[submission.status] += 1;
      map.set(submission.task_id, bucket);
    }

    return map;
  }, [submissions]);

  const visibleTasks = useMemo(() => {
    const now = Date.now();
    const items = tasks.filter((task) => {
      const past = new Date(task.deadline_at).getTime() < now;

      if (filter === 'active') {
        return !past;
      }

      if (filter === 'past') {
        return past;
      }

      return true;
    });

    const active = items
      .filter((task) => new Date(task.deadline_at).getTime() >= now)
      .sort((a, b) => new Date(a.deadline_at).getTime() - new Date(b.deadline_at).getTime());

    const past = items
      .filter((task) => new Date(task.deadline_at).getTime() < now)
      .sort((a, b) => new Date(b.deadline_at).getTime() - new Date(a.deadline_at).getTime());

    return [...active, ...past];
  }, [tasks, filter]);

  const metrics = useMemo(() => {
    const active = tasks.filter((task) => new Date(task.deadline_at).getTime() > Date.now());
    const review = submissions.filter((submission) => submission.status === 'REVIEW');

    return { active, review };
  }, [tasks, submissions]);

  return (
    <div>
      <ScreenHeader
        eyebrow="Контур"
        title="Задания и пары"
        description="Что выдано по потокам и как движется."
        action={
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setReloadKey((key) => key + 1)}
            aria-label="Обновить задания"
          >
            <IconRefresh className="h-4 w-4" />
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
              label="Назначений"
              value={assignments.length}
              hint="группа + дисциплина"
              tone="emerald"
              icon={<IconBook className="h-3.5 w-3.5" />}
            />
            <StatTile
              label="Заданий"
              value={tasks.length}
              hint={`${metrics.active.length} в работе`}
              tone="sky"
              icon={<IconClipboard className="h-3.5 w-3.5" />}
            />
            <StatTile
              label="Карточек"
              value={submissions.length}
              hint="на досках учеников"
              tone="violet"
              icon={<IconLayers className="h-3.5 w-3.5" />}
            />
            <StatTile
              label="На проверке"
              value={metrics.review.length}
              hint="ждут преподавателя"
              tone={metrics.review.length > 0 ? 'amber' : 'slate'}
              icon={<IconUsers className="h-3.5 w-3.5" />}
            />
          </div>

          <Section
            title="Назначения"
            subtitle="Кто за какую группу и дисциплину отвечает"
          >
            {assignments.length === 0 ? (
              <EmptyState
                icon={<IconBook className="h-5 w-5" />}
                title="Назначений нет"
                description="Создать назначение может только backend/администратор через API: в интерфейсе оно read-only."
              />
            ) : (
              <div className="space-y-1.5">
                {assignments.map((assignment) => {
                  const assignmentTasks = tasksByAssignment.get(assignment.id) ?? [];

                  return (
                    <Card key={assignment.id} className="flex items-center gap-2.5 p-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brandSoft text-brandStrong">
                        <IconBook className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[12px] font-medium text-ink">
                          {assignment.group_code} · {assignment.discipline_title}
                        </p>
                        <p className="truncate text-[10px] text-ink3">
                          {assignment.teacher_name} · {assignment.discipline_code}
                        </p>
                      </div>
                      <Badge tone={assignmentTasks.length > 0 ? 'sky' : 'slate'}>
                        {assignmentTasks.length}{' '}
                        {pluralize(assignmentTasks.length, ['задание', 'задания', 'заданий'])}
                      </Badge>
                    </Card>
                  );
                })}
              </div>
            )}
          </Section>

          <Section
            title="Задания"
            action={
              <div className="flex gap-1">
                {(
                  [
                    { value: 'all', label: 'Все' },
                    { value: 'active', label: 'Активные' },
                    { value: 'past', label: 'Прошли' },
                  ] as { value: TaskFilter; label: string }[]
                ).map((item) => (
                  <Chip
                    key={item.value}
                    active={filter === item.value}
                    onClick={() => setFilter(item.value)}
                  >
                    {item.label}
                  </Chip>
                ))}
              </div>
            }
          >
            {visibleTasks.length === 0 ? (
              <EmptyState
                icon={<IconClipboard className="h-5 w-5" />}
                title="Заданий нет"
                description="Преподаватель выдаёт задание — оно появится здесь со всеми карточками."
              />
            ) : (
              <div className="space-y-2">
                {visibleTasks.map((task) => {
                  const counts = countsByTask.get(task.id);
                  const total = counts
                    ? Object.values(counts).reduce((sum, value) => sum + value, 0)
                    : 0;

                  return (
                    <Card key={task.id} className="space-y-2 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="line-clamp-2 text-[12px] font-medium leading-snug text-ink">
                            {task.title}
                          </p>
                          <p className="mt-0.5 truncate text-[10px] text-ink3">
                            {groupCode(task.group_id)} · {teacherName(task.assigned_teacher_id)} ·{' '}
                            {TASK_TYPE_LABEL[task.task_type]}
                          </p>
                        </div>
                        <Badge tone={TASK_TYPE_TONE[task.task_type]}>
                          {task.base_xp_computed} XP
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

                      {counts ? (
                        <>
                          <StackedProgress
                            segments={STATUS_ORDER.map((status) => ({
                              value: counts[status],
                              tone: STATUS_TONE[status],
                              title: STATUS_LABEL[status],
                            }))}
                          />
                          <p className="text-[10px] text-ink3">
                            {total} {pluralize(total, ['карточка', 'карточки', 'карточек'])} ·
                            на проверке {counts.REVIEW} · зачтено {counts.DONE}
                          </p>
                        </>
                      ) : (
                        <p className="text-[10px] text-ink3">
                          Карточек нет — задание выдано в поток без учеников.
                        </p>
                      )}

                      <p className="text-[10px] text-ink3">
                        дедлайн {formatDateTime(task.deadline_at)}
                      </p>
                    </Card>
                  );
                })}
              </div>
            )}
          </Section>

          <Callout tone="slate" icon={<IconAlert className="h-4 w-4" />} title="Границы админки">
            Создание назначений и изменение ролей — вне текущего API: админка
            показывает связи и правит только пользователей и состав групп.
          </Callout>
        </div>
      ) : null}
    </div>
  );
}
