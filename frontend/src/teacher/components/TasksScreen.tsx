import { useEffect, useMemo, useState } from 'react';
import { ApiError } from '../../core/api';
import type { Submission, Task, TaskType } from '../../core/types';
import {
  createTeacherTask,
  fetchAllSubmissions,
  fetchTeacherAssignments,
  fetchTeacherTasks,
  type TeacherAssignment,
} from '../api';
import type { ToastData } from '../types';
import {
  SPEEDRUN_MULTIPLIER,
  estimateBaseXP,
  speedrunEndsAt,
} from '../lib/economy';
import {
  formatDateTime,
  formatNumber,
  pluralize,
} from '../lib/format';
import {
  SLOT_ROLE_ORDER,
  STATUS_LABEL,
  STATUS_ORDER,
  STATUS_TONE,
  TASK_TYPE_HINT,
  TASK_TYPE_LABEL,
  TASK_TYPE_SHORT,
  TASK_TYPE_TONE,
  slotRoleTitle,
} from '../lib/labels';
import {
  Badge,
  Button,
  Callout,
  Card,
  DeadlineMeter,
  EmptyState,
  ErrorState,
  Field,
  Modal,
  ScreenHeader,
  Segmented,
  SelectInput,
  SkeletonList,
  StackedProgress,
  TextArea,
  TextInput,
  cn,
} from './ui';
import {
  IconAlert,
  IconBolt,
  IconCheck,
  IconClipboard,
  IconPlus,
  IconRefresh,
  IconSparkles,
  IconUsers,
} from './icons';

const TASK_TYPES: { value: TaskType; label: string }[] = [
  { value: 'TEST', label: 'Тест' },
  { value: 'ESSAY', label: 'Эссе' },
  { value: 'LAB_CODE', label: 'Лабораторная' },
  { value: 'TEAM_PROJECT', label: 'Командный проект' },
];

const STATUS_SEGMENTS = STATUS_ORDER.filter((status) => status !== 'REJECTED');

/**
 * TasksScreen — пакетная выдача заданий.
 *
 * Одна форма создаёт задание сразу для нескольких потоков: backend на каждый
 * POST /api/tasks рассылает персональные карточки всем ученикам группы, а для
 * командного проекта — ещё и слоты ответственности.
 */
export function TasksScreen({
  notify,
  onOpenReviews,
  onOpenTeams,
  reloadSignal = 0,
}: {
  notify: (toast: Omit<ToastData, 'id'>) => void;
  onOpenReviews: (taskId: number) => void;
  onOpenTeams: (taskId: number | null) => void;
  reloadSignal?: number;
}) {
  const [assignments, setAssignments] = useState<TeacherAssignment[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    setError(null);

    Promise.all([fetchTeacherAssignments(), fetchTeacherTasks(), fetchAllSubmissions()])
      .then(([nextAssignments, nextTasks, nextSubmissions]) => {
        if (cancelled) {
          return;
        }

        setAssignments(nextAssignments);
        setTasks(nextTasks);
        setSubmissions(nextSubmissions);
        setLoading(false);
      })
      .catch((cause: unknown) => {
        if (cancelled) {
          return;
        }

        setError(
          cause instanceof ApiError
            ? cause.message
            : 'Не удалось загрузить задания. Проверьте соединение.',
        );
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [reloadKey, reloadSignal]);

  // Сколько учеников в каждом потоке — по уже созданным карточкам задания.
  const studentsByAssignment = useMemo(() => {
    const assignmentOfTask = new Map(tasks.map((task) => [task.id, task.assignment_id]));
    const map = new Map<number, Set<number>>();

    for (const submission of submissions) {
      const assignmentId = assignmentOfTask.get(submission.task_id);
      if (assignmentId === undefined) {
        continue;
      }

      const bucket = map.get(assignmentId) ?? new Set<number>();
      bucket.add(submission.student_id);
      map.set(assignmentId, bucket);
    }

    return map;
  }, [tasks, submissions]);

  const grouped = useMemo(() => {
    const now = Date.now();
    const counts = new Map<number, Record<Submission['status'], number>>();
    const groupCodes = new Map<number, string>();

    for (const submission of submissions) {
      if (!groupCodes.has(submission.group_id)) {
        groupCodes.set(submission.group_id, submission.group_code);
      }

      const bucket =
        counts.get(submission.task_id) ??
        ({ TODO: 0, IN_PROGRESS: 0, REVIEW: 0, DONE: 0, REJECTED: 0 } as Record<
          Submission['status'],
          number
        >);
      bucket[submission.status] += 1;
      counts.set(submission.task_id, bucket);
    }

    const sorted = [...tasks].sort(
      (a, b) => new Date(a.deadline_at).getTime() - new Date(b.deadline_at).getTime(),
    );

    return sorted.map((task) => {
      const bucket =
        counts.get(task.id) ??
        ({ TODO: 0, IN_PROGRESS: 0, REVIEW: 0, DONE: 0, REJECTED: 0 } as Record<
          Submission['status'],
          number
        >);
      const total = Object.values(bucket).reduce((sum, value) => sum + value, 0);

      return {
        task,
        counts: bucket,
        total,
        groupCode: groupCodes.get(task.group_id) ?? null,
        past: new Date(task.deadline_at).getTime() < now,
      };
    });
  }, [tasks, submissions]);

  const upcoming = grouped.filter((item) => !item.past);
  const past = grouped.filter((item) => item.past);

  return (
    <div>
      <ScreenHeader
        eyebrow="Задания"
        title="Выдача заданий"
        description="Одна форма — карточки на досках всех учеников потока."
        action={
          <Button size="sm" onClick={() => setCreating(true)} disabled={assignments.length === 0}>
            <IconPlus className="h-4 w-4" />
            Выдать
          </Button>
        }
      />

      {loading ? <SkeletonList rows={3} /> : null}

      {!loading && error ? (
        <ErrorState message={error} onRetry={() => setReloadKey((key) => key + 1)} />
      ) : null}

      {!loading && !error ? (
        <div className="space-y-5">
          {assignments.length === 0 ? (
            <Callout tone="amber" icon={<IconAlert className="h-4 w-4" />} title="Нет назначений">
              За вами не закреплены группы и дисциплины. Выдача задания станет доступна
              после назначения: этим управляет администратор.
            </Callout>
          ) : null}

          {grouped.length === 0 ? (
            <EmptyState
              icon={<IconClipboard className="h-5 w-5" />}
              title="Заданий пока нет"
              description="Выдайте первое задание: карточки появятся у всех учеников выбранных потоков автоматически."
              action={
                <Button onClick={() => setCreating(true)} disabled={assignments.length === 0}>
                  <IconPlus className="h-4 w-4" />
                  Выдать задание
                </Button>
              }
            />
          ) : null}

          {upcoming.length > 0 ? (
            <div className="space-y-2.5">
              <h2 className="text-sm font-semibold text-ink">Активные</h2>
              {upcoming.map((item) => (
                <TaskCard
                  key={item.task.id}
                  task={item.task}
                  counts={item.counts}
                  total={item.total}
                  groupCode={item.groupCode}
                  onOpenReviews={onOpenReviews}
                  onOpenTeams={onOpenTeams}
                />
              ))}
            </div>
          ) : null}

          {past.length > 0 ? (
            <div className="space-y-2.5">
              <h2 className="text-sm font-semibold text-ink">Дедлайн прошёл</h2>
              {past.map((item) => (
                <TaskCard
                  key={item.task.id}
                  task={item.task}
                  counts={item.counts}
                  total={item.total}
                  groupCode={item.groupCode}
                  onOpenReviews={onOpenReviews}
                  onOpenTeams={onOpenTeams}
                  muted
                />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {creating ? (
        <IssueTaskModal
          assignments={assignments}
          studentsByAssignment={studentsByAssignment}
          notify={notify}
          onClose={() => setCreating(false)}
          onIssued={() => {
            setCreating(false);
            setReloadKey((key) => key + 1);
          }}
        />
      ) : null}
    </div>
  );
}

/** TaskCard — выданное задание с прогрессом по колонкам канбана. */
function TaskCard({
  task,
  counts,
  total,
  groupCode,
  onOpenReviews,
  onOpenTeams,
  muted = false,
}: {
  task: Task;
  counts: Record<Submission['status'], number>;
  total: number;
  groupCode: string | null;
  onOpenReviews: (taskId: number) => void;
  onOpenTeams: (taskId: number | null) => void;
  muted?: boolean;
}) {
  const bonusEnd = speedrunEndsAt(task.deadline_at, task.speedrun_window_hours).toISOString();
  const reviewCount = counts.REVIEW;

  return (
    <Card className={cn('space-y-3', muted && 'opacity-80')}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-ink">
            {task.title}
          </h3>
          <div className="mt-1 flex flex-wrap items-center gap-1">
            <Badge tone={TASK_TYPE_TONE[task.task_type]}>{TASK_TYPE_LABEL[task.task_type]}</Badge>
            <Badge tone="slate">{groupCode ?? `группа #${task.group_id}`}</Badge>
            {task.team_size > 1 ? (
              <Badge tone="violet">
                <IconUsers className="h-3 w-3" />
                {task.team_size} слота
              </Badge>
            ) : null}
            {task.status !== 'PUBLISHED' ? <Badge tone="slate">{task.status}</Badge> : null}
          </div>
          <p className="mt-1 text-[10px] text-ink3">
            {task.expected_hours} ч · {task.requirements_count} требований · бонусное окно{' '}
            {task.speedrun_window_hours} ч
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[10px] uppercase tracking-wide text-ink3">Base XP</p>
          <p className="text-sm font-semibold tabular-nums text-brandStrong">
            {formatNumber(task.base_xp_computed)}
          </p>
        </div>
      </div>

      <DeadlineMeter
        createdAt={task.created_at}
        deadlineAt={task.deadline_at}
        bonusEndsAt={bonusEnd}
        now={Date.now()}
        compact
      />

      <div>
        <StackedProgress
          segments={STATUS_SEGMENTS.map((status) => ({
            value: counts[status],
            tone: STATUS_TONE[status],
            title: STATUS_LABEL[status],
          }))}
        />
        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-ink3">
          {STATUS_SEGMENTS.map((status) => (
            <span key={status} className="inline-flex items-center gap-1">
              <span
                className={cn(
                  'h-1.5 w-1.5 rounded-full',
                  status === 'TODO'
                    ? 'bg-line2'
                    : status === 'IN_PROGRESS'
                      ? 'bg-brand'
                      : status === 'REVIEW'
                        ? 'bg-warn'
                        : 'bg-brand',
                )}
              />
              {STATUS_LABEL[status]} {counts[status]}
            </span>
          ))}
          <span className="ml-auto tabular-nums">
            {total} {pluralize(total, ['карточка', 'карточки', 'карточек'])}
          </span>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => onOpenReviews(task.id)}>
          Проверка{reviewCount > 0 ? ` · ${reviewCount}` : ''}
        </Button>
        {task.task_type === 'TEAM_PROJECT' ? (
          <Button size="sm" variant="ghost" onClick={() => onOpenTeams(task.id)}>
            <IconUsers className="h-3.5 w-3.5" />
            Слоты команды
          </Button>
        ) : null}
        <span className="ml-auto self-center text-[10px] text-ink3">
          дедлайн {formatDateTime(task.deadline_at)}
        </span>
      </div>
    </Card>
  );
}

/** IssueTaskModal — конструктор пакетной выдачи задания. */
function IssueTaskModal({
  assignments,
  studentsByAssignment,
  notify,
  onClose,
  onIssued,
}: {
  assignments: TeacherAssignment[];
  studentsByAssignment: Map<number, Set<number>>;
  notify: (toast: Omit<ToastData, 'id'>) => void;
  onClose: () => void;
  onIssued: () => void;
}) {
  const [selectedIds, setSelectedIds] = useState<number[]>(() =>
    assignments.length > 0 ? [assignments[0].id] : [],
  );
  const [title, setTitle] = useState('');
  const [taskType, setTaskType] = useState<TaskType>('LAB_CODE');
  const [description, setDescription] = useState('');
  const [requirements, setRequirements] = useState('8');
  const [hours, setHours] = useState('4');
  const [deadline, setDeadline] = useState(() => defaultDeadlineLocal());
  const [speedrunHours, setSpeedrunHours] = useState(24);
  // Пустая строка — бонус считается автоматически: дедлайн − бонусное окно.
  const [bonusUntilLocal, setBonusUntilLocal] = useState('');
  const [teamSize, setTeamSize] = useState(2);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const deadlineDate = new Date(deadline);
  const deadlineValid = !Number.isNaN(deadlineDate.getTime()) && deadlineDate.getTime() > Date.now();

  const requirementsNumber = Number(requirements);
  const hoursNumber = Number(hours);

  const selectedAssignments = assignments.filter((item) => selectedIds.includes(item.id));

  const estimatedBaseXP = useMemo(() => {
    if (!deadlineValid) {
      return 0;
    }

    return estimateBaseXP({
      taskType,
      requirementsCount: Math.max(1, Math.round(requirementsNumber || 1)),
      expectedHours: Math.max(0.5, hoursNumber || 1),
      createdAt: new Date(),
      deadlineAt: deadlineDate,
      teamSize: taskType === 'TEAM_PROJECT' ? teamSize : 1,
    });
  }, [taskType, requirementsNumber, hoursNumber, deadline, teamSize, deadlineValid]);

  const knownStudents = selectedAssignments.reduce(
    (sum, assignment) => sum + (studentsByAssignment.get(assignment.id)?.size ?? 0),
    0,
  );
  const unknownStreams = selectedAssignments.filter(
    (assignment) => !studentsByAssignment.has(assignment.id),
  ).length;

  const bonusUntilDate = bonusUntilLocal ? new Date(bonusUntilLocal) : null;
  const bonusUntilValid =
    bonusUntilDate === null ||
    (!Number.isNaN(bonusUntilDate.getTime()) &&
      bonusUntilDate.getTime() > Date.now() &&
      deadlineValid &&
      bonusUntilDate.getTime() < deadlineDate.getTime());

  const bonusEnd = !deadlineValid
    ? null
    : bonusUntilDate !== null && bonusUntilValid
      ? bonusUntilDate
      : speedrunEndsAt(deadlineDate, speedrunHours);

  const slots = taskType === 'TEAM_PROJECT' ? Array.from({ length: teamSize }, (_, index) => {
    const base = SLOT_ROLE_ORDER[index % SLOT_ROLE_ORDER.length];

    return index < SLOT_ROLE_ORDER.length
      ? base
      : `${base}_${Math.floor(index / SLOT_ROLE_ORDER.length) + 1}`;
  }) : [];

  const titleError = submitted && title.trim().length < 3 ? 'Введите тему задания' : null;
  const assignmentError =
    submitted && selectedIds.length === 0 ? 'Выберите хотя бы один поток' : null;
  const deadlineError = submitted && !deadlineValid ? 'Дедлайн должен быть в будущем' : null;

  async function handleSubmit() {
    setSubmitted(true);
    setError(null);

    if (title.trim().length < 3 || selectedIds.length === 0 || !deadlineValid) {
      return;
    }

    setSubmitting(true);

    const created: { assignment: TeacherAssignment; taskId: number; slots: number }[] = [];
    const failed: { assignment: TeacherAssignment; message: string }[] = [];

    for (const assignment of selectedAssignments) {
      try {
        const result = await createTeacherTask({
          assignmentId: assignment.id,
          title: title.trim(),
          descriptionMD: description.trim(),
          taskType,
          requirementsCount: Math.max(1, Math.round(requirementsNumber || 1)),
          expectedHours: Math.max(0.5, hoursNumber || 1),
          deadlineAt: deadlineDate.toISOString(),
          speedrunWindowHours: speedrunHours,
          speedrunBonusUntil:
            bonusUntilLocal && bonusUntilValid ? bonusUntilDate?.toISOString() : undefined,
          teamSize: taskType === 'TEAM_PROJECT' ? teamSize : 1,
        });

        created.push({ assignment, taskId: result.taskId, slots: result.slotsCount });
      } catch (cause) {
        failed.push({
          assignment,
          message: cause instanceof ApiError ? cause.message : 'Сетевая ошибка',
        });
      }
    }

    setSubmitting(false);

    if (created.length > 0) {
      notify({
        tone: 'success',
        title:
          created.length === 1
            ? 'Задание выдано'
            : `Задание выдано в ${created.length} ${pluralize(created.length, ['поток', 'потока', 'потоков'])}`,
        description: `Карточки созданы для всех учеников: ${created
          .map((item) => item.assignment.groupCode)
          .join(', ')}${taskType === 'TEAM_PROJECT' ? ` · слоты по ${teamSize}` : ''}`,
      });
    }

    if (failed.length > 0) {
      setError(
        `Не удалось выдать в ${failed
          .map((item) => item.assignment.groupCode)
          .join(', ')}: ${failed[0].message}`,
      );

      return;
    }

    onIssued();
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Выдать задание"
      subtitle="Карточки появятся у всех учеников выбранных потоков"
      size="lg"
      footer={
        <div className="flex w-full flex-col gap-2">
          {error ? (
            <p role="alert" className="text-[11px] leading-relaxed text-bad">
              {error}
            </p>
          ) : null}
          <div className="flex gap-2">
            <Button variant="ghost" block onClick={onClose} disabled={submitting}>
              Отмена
            </Button>
            <Button
              block
              className="whitespace-nowrap"
              loading={submitting}
              onClick={() => void handleSubmit()}
            >
              <IconBolt className="h-4 w-4" />
              {selectedIds.length > 1
                ? `Выдать · ${selectedIds.length}`
                : 'Выдать задание'}
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-3.5">
        <Field label="Потоки" error={assignmentError} hint="Можно выбрать несколько — это и есть пакетная выдача.">
          <div className="flex flex-col gap-1.5">
            {assignments.map((assignment) => {
              const active = selectedIds.includes(assignment.id);
              const known = studentsByAssignment.get(assignment.id)?.size ?? null;

              return (
                <button
                  key={assignment.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() =>
                    setSelectedIds((previous) =>
                      previous.includes(assignment.id)
                        ? previous.filter((id) => id !== assignment.id)
                        : [...previous, assignment.id],
                    )
                  }
                  className={cn(
                    'flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand',
                    active
                      ? 'border-brandLine bg-brandSoft'
                      : 'border-line bg-card hover:border-line2',
                  )}
                >
                  <span
                    className={cn(
                      'flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                      active
                        ? 'border-brand bg-brand text-white'
                        : 'border-line2 text-transparent',
                    )}
                  >
                    <IconCheck className="h-3 w-3" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[11px] font-medium text-ink2">
                      {assignment.groupCode} · {assignment.disciplineTitle}
                    </span>
                    <span className="block truncate text-[10px] text-ink3">
                      {assignment.groupTitle}
                      {known !== null ? ` · ${known} учеников` : ' · состав появится после первой выдачи'}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </Field>

        <Field label="Тип задания">
          <Segmented
            options={TASK_TYPES.map((item) => ({
              value: item.value,
              label: TASK_TYPE_SHORT[item.value],
            }))}
            value={taskType}
            onChange={setTaskType}
            ariaLabel="Тип задания"
          />
          <p className="mt-1 text-[10px] text-ink3">{TASK_TYPE_HINT[taskType]}</p>
        </Field>

        <Field label="Тема" htmlFor="task-title" error={titleError} hint="Коротко и по делу: ученик видит её на карточке.">
          <TextInput
            id="task-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Лабораторная №2: индексы и планы запросов"
            invalid={Boolean(titleError)}
          />
        </Field>

        <Field
          label="Методические материалы"
          htmlFor="task-description"
          hint="Markdown: требования, ссылки на методички, критерии. Показываются ученику в карточке."
        >
          <TextArea
            id="task-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder={'1. Схема в 3НФ\n2. Миграции\n3. Отчёт с EXPLAIN ANALYZE\n\nМетодичка: https://…'}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Дедлайн" htmlFor="task-deadline" error={deadlineError}>
            <TextInput
              id="task-deadline"
              type="datetime-local"
              value={deadline}
              onChange={(event) => setDeadline(event.target.value)}
              invalid={Boolean(deadlineError)}
            />
          </Field>

          <Field label="Требований" htmlFor="task-requirements">
            <TextInput
              id="task-requirements"
              type="number"
              min={1}
              max={50}
              value={requirements}
              onChange={(event) => setRequirements(event.target.value)}
            />
          </Field>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {[
            { label: '+3 дня', days: 3 },
            { label: '+1 неделя', days: 7 },
            { label: '+2 недели', days: 14 },
          ].map((preset) => (
            <Button
              key={preset.label}
              size="sm"
              variant="outline"
              onClick={() => setDeadline(defaultDeadlineLocal(preset.days))}
            >
              {preset.label}
            </Button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Ожидаемые часы" htmlFor="task-hours" hint="Влияет на Base XP.">
            <TextInput
              id="task-hours"
              type="number"
              min={0.5}
              step={0.5}
              value={hours}
              onChange={(event) => setHours(event.target.value)}
            />
          </Field>

          <Field label="Бонусное окно" htmlFor="task-speedrun" hint="×1.5 за сдачу в первые часы.">
            <SelectInput
              id="task-speedrun"
              value={String(speedrunHours)}
              onChange={(event) => setSpeedrunHours(Number(event.target.value))}
            >
              <option value="24">24 часа</option>
              <option value="48">48 часов</option>
              <option value="72">72 часа</option>
            </SelectInput>
          </Field>
        </div>

        <Field
          label="Бонус до (необязательно)"
          htmlFor="task-bonus-until"
          hint="Своя дата окончания ×1.5. Пусто — считается автоматически от дедлайна."
          error={submitted && !bonusUntilValid ? 'Дата должна быть в будущем и раньше дедлайна' : null}
        >
          <TextInput
            id="task-bonus-until"
            type="datetime-local"
            value={bonusUntilLocal}
            onChange={(event) => setBonusUntilLocal(event.target.value)}
          />
        </Field>

        {taskType === 'TEAM_PROJECT' ? (
          <Field label="Размер команды" hint="Каждый слот — отдельная зона ответственности.">
            <SelectInput
              value={String(teamSize)}
              onChange={(event) => setTeamSize(Number(event.target.value))}
            >
              <option value="2">2 участника</option>
              <option value="3">3 участника</option>
              <option value="4">4 участника</option>
            </SelectInput>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {slots.map((code) => (
                <Badge key={code} tone="violet">
                  {slotRoleTitle(code)}
                </Badge>
              ))}
            </div>
          </Field>
        ) : null}

        <Card className="space-y-2 bg-muted">
          <div className="flex items-center gap-2">
            <IconSparkles className="h-4 w-4 text-brand" />
            <p className="text-xs font-semibold text-ink2">Что произойдёт после выдачи</p>
          </div>

          <ul className="space-y-1 text-[11px] leading-relaxed text-ink3">
            <li>
              • Карточки «К выполнению» появятся у{' '}
              {knownStudents > 0
                ? `${knownStudents} учеников`
                : unknownStreams > 0
                  ? 'всех учеников выбранных потоков'
                  : 'всех учеников потока'}
              {unknownStreams > 0 && knownStudents > 0
                ? ' (часть потоков ещё без карточек — число уточнится)'
                : ''}
              .
            </li>
            <li>
              • Base XP ≈ <span className="font-semibold text-brandStrong">{estimatedBaseXP} XP</span>{' '}
              на человека{taskType === 'TEAM_PROJECT' ? ' за слот' : ''}.
            </li>
            <li>
              • Бонус ×{SPEEDRUN_MULTIPLIER} действует до{' '}
              {bonusEnd ? formatDateTime(bonusEnd.toISOString()) : '—'}.
            </li>
            {taskType === 'TEAM_PROJECT' ? (
              <li>• Будет создано {teamSize} {pluralize(teamSize, ['слот', 'слота', 'слотов'])} ответственности.</li>
            ) : null}
          </ul>

          <p className="rounded-lg border border-line bg-muted px-2.5 py-2 text-[10px] leading-relaxed text-ink3">
            База XP — предварительная оценка по формуле проекта; точное значение
            фиксирует backend при создании задания.
          </p>
        </Card>
      </div>
    </Modal>
  );
}

/** defaultDeadlineLocal возвращает значение для input[type=datetime-local]. */
function defaultDeadlineLocal(days = 14): string {
  const date = new Date(Date.now() + days * 24 * 3_600_000);
  date.setHours(18, 0, 0, 0);

  const pad = (value: number) => String(value).padStart(2, '0');

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}
