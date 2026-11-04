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
  autoSpeedrunEnd,
  estimateBaseXP,
  speedrunEndsAt,
} from '../lib/economy';
import {
  defaultDeadlineLocal,
  formatDateTime,
  formatDeadline24,
  formatNumber,
  parseLocalInput,
  pluralize,
  toLocalInput,
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
import { DeadlineInput } from './DeadlineInput';
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

const TASK_TYPES: TaskType[] = ['TEST', 'NOTES', 'ESSAY', 'LAB_CODE', 'TEAM_PROJECT'];

// Базовые значения для расчёта XP и бонуса: форма их не спрашивает.
const DEFAULT_REQUIREMENTS = 8;
const DEFAULT_HOURS = 4;
const DEFAULT_BONUS_HOURS = 48;

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
  reloadSignal = 0,
}: {
  notify: (toast: Omit<ToastData, 'id'>) => void;
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
  muted = false,
}: {
  task: Task;
  counts: Record<Submission['status'], number>;
  total: number;
  groupCode: string | null;
  muted?: boolean;
}) {
  const bonusEnd = task.speedrun_bonus_until || speedrunEndsAt(task.deadline_at, task.speedrun_window_hours).toISOString();
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

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] text-ink3">
          {reviewCount > 0 ? `На проверке: ${reviewCount}` : 'Проверять пока нечего'}
        </span>
        <span className="ml-auto self-center text-[10px] text-ink3">
          дедлайн {formatDateTime(task.deadline_at)}
        </span>
      </div>
    </Card>
  );
}

/** IssueTaskModal — выдача задания: потоки → тип → текст → файлы → дедлайн → бонус → XP. */
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
  const [taskType, setTaskType] = useState<TaskType>('LAB_CODE');
  const [title, setTitle] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  // Дедлайн — по умолчанию завтра в 08:00 от текущего времени; дата и время
  // можно выбрать самому, тогда подставится выбранное значение.
  const [deadline, setDeadline] = useState(() => defaultDeadlineLocal());
  // Бонус до: пока преподаватель не трогал поле, показывается автоматическая
  // дата (дедлайн − 48 ч). Как только поле тронуто, действует введённое значение.
  const [bonusUntilLocal, setBonusUntilLocal] = useState('');
  const [bonusTouched, setBonusTouched] = useState(false);
  const [xpOverride, setXpOverride] = useState('');
  const [teamSize, setTeamSize] = useState(2);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const deadlineDate = parseLocalInput(deadline);
  const deadlineValid = deadlineDate !== null && deadlineDate.getTime() > Date.now();

  const selectedAssignments = assignments.filter((item) => selectedIds.includes(item.id));

  const estimatedBaseXP = useMemo(() => {
    if (deadlineDate === null) {
      return 0;
    }

    return estimateBaseXP({
      taskType,
      requirementsCount: DEFAULT_REQUIREMENTS,
      expectedHours: DEFAULT_HOURS,
      createdAt: new Date(),
      deadlineAt: deadlineDate,
      teamSize: taskType === 'TEAM_PROJECT' ? teamSize : 1,
    });
  }, [taskType, deadline, teamSize, deadlineDate]);

  const knownStudents = selectedAssignments.reduce(
    (sum, assignment) => sum + (studentsByAssignment.get(assignment.id)?.size ?? 0),
    0,
  );

  // Дата бонуса считается динамически от дедлайна (см. autoSpeedrunEnd):
  // на следующий день — сегодняшний вечер, на несколько дней — вечер
  // следующего дня. Преподаватель может переписать её вручную.
  const autoBonusEnd = deadlineDate !== null ? autoSpeedrunEnd(deadlineDate) : null;
  const autoBonusValue = autoBonusEnd ? toLocalInput(autoBonusEnd) : '';
  const bonusValue = bonusTouched ? bonusUntilLocal : autoBonusValue;
  const bonusUntilDate = bonusValue ? parseLocalInput(bonusValue) : null;
  const bonusUntilValid =
    !bonusTouched ||
    (bonusUntilDate !== null &&
      deadlineDate !== null &&
      bonusUntilDate.getTime() < deadlineDate.getTime() &&
      bonusUntilDate.getTime() > Date.now());

  const bonusEnd = bonusUntilDate ?? autoBonusEnd;

  // Окно бонуса в часах: сервер хранит его для формул и старых клиентов.
  const bonusWindowHours =
    bonusUntilDate !== null
      ? Math.max(1, Math.round((bonusUntilDate.getTime() - Date.now()) / 3_600_000))
      : DEFAULT_BONUS_HOURS;

  const xpNumber = Number(xpOverride);
  const xpValid = xpOverride.trim() === '' || (Number.isFinite(xpNumber) && xpNumber > 0);
  const finalXP = xpOverride.trim() !== '' && xpValid ? Math.round(xpNumber) : estimatedBaseXP;

  const titleError = submitted && title.trim().length < 3 ? 'Опишите задание' : null;
  const assignmentError =
    submitted && selectedIds.length === 0 ? 'Выберите хотя бы один поток' : null;
  const deadlineError = submitted && !deadlineValid ? 'Дедлайн должен быть в будущем' : null;

  // Смена дедлайна пересчитывает бонус заново: он всегда «привязан» к сроку.
  function changeDeadline(next: string) {
    setDeadline(next);
    setBonusTouched(false);
  }

  async function handleSubmit() {
    setSubmitted(true);
    setError(null);

    if (
      title.trim().length < 3 ||
      selectedIds.length === 0 ||
      deadlineDate === null ||
      !deadlineValid ||
      !bonusUntilValid ||
      !xpValid
    ) {
      return;
    }

    setSubmitting(true);

    const created: { assignment: TeacherAssignment; taskId: number; slots: number }[] = [];
    const failed: { assignment: TeacherAssignment; message: string }[] = [];

    for (const assignment of selectedAssignments) {
      try {
        const result = await createTeacherTask({
          assignmentId: assignment.id,
          topic: title.trim(),
          title: title.trim(),
          descriptionMD: '',
          taskType,
          deadlineAt: deadlineDate.toISOString(),
          speedrunWindowHours: bonusWindowHours,
          speedrunBonusUntil: bonusUntilDate ? bonusUntilDate.toISOString() : undefined,
          teamSize: taskType === 'TEAM_PROJECT' ? teamSize : 1,
          xp: finalXP,
          files,
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
              {selectedIds.length > 1 ? `Выдать · ${selectedIds.length}` : 'Выдать задание'}
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
          <div className="grid grid-cols-5 gap-1.5" role="group" aria-label="Тип задания">
            {TASK_TYPES.map((value) => {
              const active = taskType === value;

              return (
                <button
                  key={value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setTaskType(value)}
                  className={cn(
                    'rounded-lg border px-1 py-2 text-[11px] font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand',
                    active
                      ? 'border-brand bg-brandSoft text-brandStrong'
                      : 'border-line2 bg-card text-ink2 hover:border-line2',
                  )}
                >
                  {TASK_TYPE_SHORT[value]}
                </button>
              );
            })}
          </div>
        </Field>

        <Field
          label="Текст задания"
          htmlFor="task-text"
          error={titleError}
          hint="Что нужно сделать — ученик увидит это в карточке."
        >
          <TextArea
            id="task-text"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            invalid={Boolean(titleError)}
            placeholder="Задание: привести схему к 3НФ, описать миграции и отчёт"
          />
        </Field>

        <Field
          label="Файлы (необязательно)"
          htmlFor="task-files"
          hint="Методички, шаблоны, тесты. До 5 файлов по 20 МБ."
        >
          <input
            id="task-files"
            type="file"
            multiple
            onChange={(event) => setFiles(Array.from(event.target.files ?? []))}
            className="w-full rounded-lg border border-line2 bg-card px-3 py-2 text-xs text-ink2 file:mr-3 file:rounded-md file:border-0 file:bg-sunken file:px-2 file:py-1 file:text-xs file:text-ink2"
          />
          {files.length > 0 ? (
            <p className="mt-1 text-[10px] text-ink3">{files.map((file) => file.name).join(', ')}</p>
          ) : null}
        </Field>

        <Field
          label="Дедлайн"
          error={deadlineError}
          hint={deadlineError ?? undefined}
        >
          <DeadlineInput
            value={deadline}
            onChange={changeDeadline}
            invalid={Boolean(deadlineError)}
          />
        </Field>

        <div className="flex flex-wrap gap-1.5">
          {[
            { label: '+1 день', days: 1 },
            { label: '+3 дня', days: 3 },
            { label: '+1 неделя', days: 7 },
            { label: '+2 недели', days: 14 },
          ].map((preset) => (
            <Button
              key={preset.label}
              size="sm"
              variant="outline"
              onClick={() => changeDeadline(defaultDeadlineLocal(preset.days))}
            >
              {preset.label}
            </Button>
          ))}
        </div>

        <Field
          label="Бонус до (спидран)"
          hint={
            submitted && !bonusUntilValid
              ? 'Дата должна быть в будущем и раньше дедлайна'
              : !bonusTouched && autoBonusEnd
                ? `Автоматически: ${formatDeadline24(autoBonusEnd)} — можно изменить`
                : undefined
          }
          error={submitted && !bonusUntilValid ? 'Дата должна быть в будущем и раньше дедлайна' : null}
        >
          <DeadlineInput
            value={bonusValue}
            onChange={(next) => {
              setBonusTouched(true);
              setBonusUntilLocal(next);
            }}
            invalid={submitted && !bonusUntilValid}
          />
        </Field>

        <Field
          label="XP за задание"
          htmlFor="task-xp"
          error={submitted && !xpValid ? 'XP должно быть положительным числом' : null}
        >
          <TextInput
            id="task-xp"
            type="number"
            min={1}
            max={100000}
            value={xpOverride || (estimatedBaseXP > 0 ? String(estimatedBaseXP) : '')}
            onChange={(event) => setXpOverride(event.target.value)}
            invalid={submitted && !xpValid}
            className="tabular-nums"
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
          </Field>
        ) : null}

        <p className="text-[11px] text-ink3">
          Получат карточку: {knownStudents > 0 ? `${knownStudents} учеников` : 'все ученики потоков'}.
          Дедлайн — {deadlineDate ? formatDeadline24(deadlineDate) : '—'}.
        </p>
      </div>
    </Modal>
  );
}
