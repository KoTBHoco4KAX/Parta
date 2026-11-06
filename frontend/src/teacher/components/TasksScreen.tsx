import { useEffect, useMemo, useState } from 'react';
import { ApiError } from '../../core/api';
import type { Submission, Task, TaskTemplate, TaskType } from '../../core/types';
import {
  createTaskTemplate,
  createTeacherTask,
  fetchAllSubmissions,
  fetchGroupMembers,
  fetchTaskTemplates,
  fetchTeacherAssignments,
  fetchTeacherTasks,
  issueTaskTemplate,
  repeatTeacherTask,
  teacherErrorMessage,
  type GroupMember,
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
  const [templates, setTemplates] = useState<TaskTemplate[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [creating, setCreating] = useState(false);
  const [repeatingTask, setRepeatingTask] = useState<Task | null>(null);

  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    setError(null);

    Promise.all([
      fetchTeacherAssignments(),
      fetchTeacherTasks(),
      fetchAllSubmissions(),
      fetchTaskTemplates(),
    ])
      .then(([nextAssignments, nextTasks, nextSubmissions, nextTemplates]) => {
        if (cancelled) {
          return;
        }

        setAssignments(nextAssignments);
        setTasks(nextTasks);
        setSubmissions(nextSubmissions);
        setTemplates(nextTemplates);
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
                  onRepeat={() => setRepeatingTask(item.task)}
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
                  onRepeat={() => setRepeatingTask(item.task)}
                />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {creating ? (
        <IssueTaskModal
          assignments={assignments}
          templates={templates}
          studentsByAssignment={studentsByAssignment}
          notify={notify}
          onClose={() => setCreating(false)}
          onIssued={() => {
            setCreating(false);
            setReloadKey((key) => key + 1);
          }}
        />
      ) : null}

      {repeatingTask ? (
        <RepeatTaskModal
          task={repeatingTask}
          notify={notify}
          onClose={() => setRepeatingTask(null)}
          onIssued={() => {
            setRepeatingTask(null);
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
  onRepeat,
}: {
  task: Task;
  counts: Record<Submission['status'], number>;
  total: number;
  groupCode: string | null;
  muted?: boolean;
  onRepeat?: () => void;
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
        {onRepeat ? (
          <Button
            size="sm"
            variant="outline"
            className="ml-auto"
            onClick={onRepeat}
          >
            <IconRefresh className="h-3.5 w-3.5" />
            Повторить
          </Button>
        ) : null}
        <span className={cn('self-center text-[10px] text-ink3', onRepeat ? '' : 'ml-auto')}>
          дедлайн {formatDateTime(task.deadline_at)}
        </span>
      </div>
    </Card>
  );
}

/** IssueTaskModal — выдача: новое задание или готовое из базы. */
function IssueTaskModal({
  assignments,
  templates,
  studentsByAssignment,
  notify,
  onClose,
  onIssued,
}: {
  assignments: TeacherAssignment[];
  templates: TaskTemplate[];
  studentsByAssignment: Map<number, Set<number>>;
  notify: (toast: Omit<ToastData, 'id'>) => void;
  onClose: () => void;
  onIssued: () => void;
}) {
  const [selectedIds, setSelectedIds] = useState<number[]>(() =>
    assignments.length > 0 ? [assignments[0].id] : [],
  );
  const [sourceMode, setSourceMode] = useState<'new' | 'bank'>('new');
  const [selectedTemplateID, setSelectedTemplateID] = useState<number | null>(null);
  const [taskType, setTaskType] = useState<TaskType>('LAB_CODE');
  const [title, setTitle] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  // Получатели: вся группа выбранного потока или отдельные ученики.
  const [recipientMode, setRecipientMode] = useState<'group' | 'selected'>('group');
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [selectedStudentIDs, setSelectedStudentIDs] = useState<number[]>([]);
  const [saveToBase, setSaveToBase] = useState(false);
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
  const singleAssignment = selectedAssignments.length === 1 ? selectedAssignments[0] : null;
  const singleGroupID = singleAssignment?.groupId ?? null;

  // Для базы — только заготовки той дисциплины, в которую выдаём.
  const availableTemplates = useMemo(
    () =>
      singleAssignment === null
        ? []
        : templates.filter(
            (template) => template.discipline_id === singleAssignment.disciplineId,
          ),
    [templates, singleAssignment],
  );

  const selectedTemplate =
    availableTemplates.find((template) => template.id === selectedTemplateID) ?? null;

  useEffect(() => {
    if (selectedTemplateID !== null && selectedTemplate === null) {
      setSelectedTemplateID(null);
    }
  }, [selectedTemplate, selectedTemplateID]);

  // Состав группы нужен и для выбора получателей, и для честного счётчика.
  useEffect(() => {
    let cancelled = false;

    setSelectedStudentIDs([]);

    if (singleGroupID === null) {
      setMembers([]);
      setRecipientMode('group');
      setMembersLoading(false);

      return () => {
        cancelled = true;
      };
    }

    setMembersLoading(true);

    fetchGroupMembers(singleGroupID)
      .then((nextMembers) => {
        if (!cancelled) {
          setMembers(nextMembers);
        }
      })
      .catch(() => {
        if (!cancelled) {
          // Состав — вспомогательные данные: выдача всей группе работает и без него.
          setMembers([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setMembersLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [singleGroupID]);

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

  const knownStudents = singleAssignment
    ? members.length
    : selectedAssignments.reduce(
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

  const titleError =
    sourceMode === 'new' && submitted && title.trim().length < 3 ? 'Опишите задание' : null;
  const assignmentError =
    submitted && selectedIds.length === 0 ? 'Выберите хотя бы один поток' : null;
  const recipientError =
    submitted && singleAssignment !== null && recipientMode === 'selected' && selectedStudentIDs.length === 0
      ? 'Выберите хотя бы одного ученика'
      : null;
  const deadlineError = submitted && !deadlineValid ? 'Дедлайн должен быть в будущем' : null;
  const templateError =
    sourceMode === 'bank' && submitted && selectedTemplate === null
      ? 'Выберите задание из базы'
      : null;
  const sourceError =
    sourceMode === 'bank' && selectedAssignments.length !== 1
      ? 'Для выдачи из базы выберите один поток'
      : null;

  function changeSourceMode(next: 'new' | 'bank') {
    setSourceMode(next);
    setSelectedTemplateID(null);
    setSaveToBase(false);

    // База выдаётся в один поток: при переключении оставляем первый выбранный.
    if (next === 'bank' && selectedIds.length > 1) {
      setSelectedIds((previous) => previous.slice(0, 1));
    }
  }

  // Смена дедлайна пересчитывает бонус заново: он всегда «привязан» к сроку.
  function changeDeadline(next: string) {
    setDeadline(next);
    setBonusTouched(false);
  }

  async function handleSubmit() {
    setSubmitted(true);
    setError(null);

    if (sourceMode === 'bank') {
      if (
        selectedTemplate === null ||
        singleAssignment === null ||
        deadlineDate === null ||
        !deadlineValid ||
        (recipientMode === 'selected' && selectedStudentIDs.length === 0)
      ) {
        return;
      }

      setSubmitting(true);

      try {
        const result = await issueTaskTemplate(selectedTemplate.id, {
          assignmentId: singleAssignment.id,
          deadlineAt: deadlineDate.toISOString(),
          studentIds: recipientMode === 'selected' ? selectedStudentIDs : undefined,
        });

        notify({
          tone: 'success',
          title: 'Задание выдано из базы',
          description: `${selectedTemplate.title} · ${singleAssignment.groupCode}${
            recipientMode === 'selected' ? ` · ${selectedStudentIDs.length} учеников` : ' · вся группа'
          }${result.slotsCount > 0 ? ` · ${result.slotsCount} слота` : ''}.`,
        });
        onIssued();
      } catch (cause) {
        setError(teacherErrorMessage(cause, 'Не удалось выдать задание. Проверьте соединение.'));
      } finally {
        setSubmitting(false);
      }

      return;
    }

    if (
      title.trim().length < 3 ||
      selectedIds.length === 0 ||
      deadlineDate === null ||
      !deadlineValid ||
      !bonusUntilValid ||
      !xpValid ||
      (singleAssignment !== null &&
        recipientMode === 'selected' &&
        selectedStudentIDs.length === 0)
    ) {
      return;
    }

    setSubmitting(true);

    const created: { assignment: TeacherAssignment; taskId: number; slots: number }[] = [];
    const failed: { assignment: TeacherAssignment; message: string }[] = [];
    const studentIds =
      singleAssignment !== null && recipientMode === 'selected'
        ? selectedStudentIDs
        : undefined;

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
          studentIds,
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
        description: `Карточки созданы${
          studentIds ? ` для ${studentIds.length} ${pluralize(studentIds.length, ['ученика', 'учеников', 'учеников'])}` : ' для всех учеников'
        }: ${created.map((item) => item.assignment.groupCode).join(', ')}${
          taskType === 'TEAM_PROJECT' ? ` · слоты по ${teamSize}` : ''
        }`,
      });
    }

    if (saveToBase && created.length > 0) {
      try {
        // При пакетной выдаче в разные дисциплины сохраняем по заготовке на
        // каждую: шаблон в базе привязан к дисциплине.
        const disciplineIDs = [
          ...new Set(created.map((item) => item.assignment.disciplineId)),
        ];

        for (const disciplineID of disciplineIDs) {
          await createTaskTemplate({
            discipline_id: disciplineID,
            title: title.trim(),
            description_md: '',
            task_type: taskType,
            requirements_count: DEFAULT_REQUIREMENTS,
            expected_hours: DEFAULT_HOURS,
            speedrun_window_hours: bonusWindowHours,
            team_size: taskType === 'TEAM_PROJECT' ? teamSize : 1,
          });
        }

        notify({
          tone: 'success',
          title: 'Сохранено в базу заданий',
          description:
            disciplineIDs.length === 1
              ? 'Заготовку можно выдать повторно из раздела «База заданий».'
              : `Заготовки сохранены по дисциплинам: ${disciplineIDs.length}.`,
        });
      } catch (cause) {
        notify({
          tone: 'error',
          title: 'Задание выдано, но в базу не сохранено',
          description: teacherErrorMessage(cause, 'Проверьте соединение и повторите.'),
        });
      }
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
      subtitle={
        sourceMode === 'bank'
          ? 'Готовая заготовка из базы — заполнять заново не нужно'
          : 'Карточки появятся у всех учеников выбранных потоков'
      }
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
              disabled={
                sourceMode === 'bank' &&
                (selectedTemplate === null || singleAssignment === null)
              }
              onClick={() => void handleSubmit()}
            >
              <IconBolt className="h-4 w-4" />
              {sourceMode === 'bank'
                ? 'Выдать из базы'
                : selectedIds.length > 1
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

        <Field label="Источник задания">
          <div className="grid grid-cols-2 gap-1 rounded-xl border border-line bg-card p-1">
            {[
              { value: 'new' as const, label: 'Новое задание' },
              { value: 'bank' as const, label: 'Из базы' },
            ].map((option) => {
              const active = sourceMode === option.value;

              return (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => changeSourceMode(option.value)}
                  className={cn(
                    'rounded-lg px-3 py-2 text-xs font-medium transition',
                    active
                      ? 'bg-brandSoft text-brandStrong'
                      : 'text-ink3 hover:text-ink2',
                  )}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </Field>

        {sourceError ? (
          <p role="alert" className="text-[11px] text-bad">
            {sourceError}
          </p>
        ) : null}

        {sourceMode === 'bank' ? (
          <Field
            label="Задание из базы"
            error={templateError}
            hint="Берётся сохранённая заготовка: тип, текст и параметры менять не нужно."
          >
            {availableTemplates.length === 0 ? (
              <Callout tone="amber" icon={<IconAlert className="h-4 w-4" />} title="В базе пусто">
                Для этой дисциплины нет заготовок. Создайте их во вкладке «База».
              </Callout>
            ) : (
              <>
                <SelectInput
                  value={selectedTemplateID === null ? '' : String(selectedTemplateID)}
                  onChange={(event) =>
                    setSelectedTemplateID(
                      event.target.value === '' ? null : Number(event.target.value),
                    )
                  }
                >
                  <option value="">Выберите заготовку</option>
                  {availableTemplates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.title}
                    </option>
                  ))}
                </SelectInput>

                {selectedTemplate ? (
                  <Card className="mt-2 space-y-2 bg-muted">
                    <p className="text-sm font-semibold text-ink">{selectedTemplate.title}</p>
                    <div className="flex flex-wrap gap-1">
                      <Badge tone={TASK_TYPE_TONE[selectedTemplate.task_type]}>
                        {TASK_TYPE_LABEL[selectedTemplate.task_type]}
                      </Badge>
                      <Badge tone="indigo">{selectedTemplate.discipline_title}</Badge>
                      <Badge tone="slate">
                        {selectedTemplate.expected_hours} ч ·{' '}
                        {selectedTemplate.requirements_count} требований
                      </Badge>
                    </div>
                    {selectedTemplate.description_md.trim() !== '' ? (
                      <p className="whitespace-pre-line text-[11px] leading-relaxed text-ink3">
                        {selectedTemplate.description_md}
                      </p>
                    ) : null}
                    <p className="text-[10px] text-ink3">
                      XP и бонусное окно рассчитаются по параметрам заготовки.
                    </p>
                  </Card>
                ) : null}
              </>
            )}
          </Field>
        ) : null}

        {singleAssignment ? (
          <Field
            label="Получатели"
            error={recipientError}
            hint="Можно выдать всей группе или отметить отдельных учеников."
          >
            <RecipientsField
              mode={recipientMode}
              onModeChange={setRecipientMode}
              members={members}
              loading={membersLoading}
              selectedIDs={selectedStudentIDs}
              onToggle={(studentID) =>
                setSelectedStudentIDs((previous) =>
                  previous.includes(studentID)
                    ? previous.filter((id) => id !== studentID)
                    : [...previous, studentID],
                )
              }
            />
          </Field>
        ) : selectedAssignments.length > 1 ? (
          <Callout tone="slate" title="Пакетная выдача">
            Выбрано потоков: {selectedAssignments.length}. Чтобы выдать задание
            отдельным ученикам, оставьте один поток.
          </Callout>
        ) : null}

        {sourceMode === 'new' ? (
          <>
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
          </>
        ) : null}

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

        {sourceMode === 'new' ? (
          <>
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

        <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-line bg-muted px-3 py-2.5">
          <input
            type="checkbox"
            checked={saveToBase}
            onChange={(event) => setSaveToBase(event.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-line2 text-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand"
          />
          <span className="min-w-0">
            <span className="block text-xs font-medium text-ink2">Сохранить в базу</span>
            <span className="mt-0.5 block text-[10px] leading-relaxed text-ink3">
              Заготовка появится в «Базе заданий» — её можно будет выдать повторно
              без заполнения формы.
            </span>
          </span>
        </label>
          </>
        ) : null}

        <p className="text-[11px] text-ink3">
          Получат карточку: {knownStudents > 0 ? `${knownStudents} учеников` : 'все ученики потоков'}.
          Дедлайн — {deadlineDate ? formatDeadline24(deadlineDate) : '—'}.
        </p>
      </div>
    </Modal>
  );
}

/** RecipientsField — переключатель «вся группа / выбранные ученики». */
function RecipientsField({
  mode,
  onModeChange,
  members,
  loading,
  selectedIDs,
  onToggle,
}: {
  mode: 'group' | 'selected';
  onModeChange: (mode: 'group' | 'selected') => void;
  members: GroupMember[];
  loading: boolean;
  selectedIDs: number[];
  onToggle: (studentID: number) => void;
}) {
  return (
    <div className="space-y-2">
      <Segmented<'group' | 'selected'>
        options={[
          { value: 'group', label: 'Вся группа' },
          { value: 'selected', label: 'Выбранные студенты' },
        ]}
        value={mode}
        onChange={onModeChange}
        ariaLabel="Получатели задания"
      />

      {mode === 'group' ? (
        <p className="text-[11px] leading-relaxed text-ink3">
          {members.length > 0
            ? `Карточки получат все ученики группы: ${members.length}.`
            : 'Карточки получат все ученики выбранного потока.'}
        </p>
      ) : loading ? (
        <p className="text-[11px] text-ink3">Загружаем состав группы…</p>
      ) : members.length === 0 ? (
        <p className="text-[11px] text-ink3">
          В группе пока нет учеников. Переведите их на вкладке «Группы».
        </p>
      ) : (
        <div className="max-h-56 space-y-1 overflow-y-auto rounded-xl border border-line p-1.5">
          {members.map((member) => {
            const active = selectedIDs.includes(member.id);

            return (
              <button
                key={member.id}
                type="button"
                aria-pressed={active}
                onClick={() => onToggle(member.id)}
                className={cn(
                  'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand',
                  active ? 'bg-brandSoft' : 'hover:bg-muted',
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
                <span className="min-w-0">
                  <span className="block truncate text-[11px] font-medium text-ink2">
                    {member.fullName}
                  </span>
                  <span className="block truncate text-[10px] text-ink3">{member.email}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}

      {mode === 'selected' ? (
        <p className="text-[10px] text-ink3">
          Выбрано: {selectedIDs.length} из {members.length}
        </p>
      ) : null}
    </div>
  );
}

/** RepeatTaskModal — повтор выданного задания с новым дедлайном. */
function RepeatTaskModal({
  task,
  notify,
  onClose,
  onIssued,
}: {
  task: Task;
  notify: (toast: Omit<ToastData, 'id'>) => void;
  onClose: () => void;
  onIssued: () => void;
}) {
  const [deadline, setDeadline] = useState(() => defaultDeadlineLocal(7));
  const [mode, setMode] = useState<'group' | 'selected'>('group');
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(true);
  const [selectedIDs, setSelectedIDs] = useState<number[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    setMembersLoading(true);

    fetchGroupMembers(task.group_id)
      .then((nextMembers) => {
        if (!cancelled) {
          setMembers(nextMembers);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setMembers([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setMembersLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [task.group_id]);

  const deadlineDate = parseLocalInput(deadline);
  const deadlineValid = deadlineDate !== null && deadlineDate.getTime() > Date.now();
  const deadlineError = submitted && !deadlineValid ? 'Дедлайн должен быть в будущем' : null;
  const recipientError =
    submitted && mode === 'selected' && selectedIDs.length === 0
      ? 'Выберите хотя бы одного ученика'
      : null;

  async function handleSubmit() {
    setSubmitted(true);
    setError(null);

    if (
      deadlineDate === null ||
      !deadlineValid ||
      (mode === 'selected' && selectedIDs.length === 0)
    ) {
      return;
    }

    setSubmitting(true);

    try {
      const result = await repeatTeacherTask(task.id, {
        deadlineAt: deadlineDate.toISOString(),
        studentIds: mode === 'selected' ? selectedIDs : undefined,
      });

      notify({
        tone: 'success',
        title: 'Задание повторено',
        description: `${task.title} · новый дедлайн ${
          deadlineDate ? formatDeadline24(deadlineDate) : '—'
        }${result.slotsCount > 0 ? ` · ${result.slotsCount} слота` : ''}.`,
      });
      onIssued();
    } catch (cause) {
      setError(teacherErrorMessage(cause, 'Не удалось повторить задание. Проверьте соединение.'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Повторить задание"
      subtitle={task.title}
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
            <Button block loading={submitting} onClick={() => void handleSubmit()}>
              <IconRefresh className="h-4 w-4" />
              Повторить
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-3.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone={TASK_TYPE_TONE[task.task_type]}>{TASK_TYPE_LABEL[task.task_type]}</Badge>
          <Badge tone="slate">группа #{task.group_id}</Badge>
          <Badge tone="indigo">{formatNumber(task.base_xp_computed)} XP</Badge>
        </div>

        <Field label="Получатели" error={recipientError}>
          <RecipientsField
            mode={mode}
            onModeChange={setMode}
            members={members}
            loading={membersLoading}
            selectedIDs={selectedIDs}
            onToggle={(studentID) =>
              setSelectedIDs((previous) =>
                previous.includes(studentID)
                  ? previous.filter((id) => id !== studentID)
                  : [...previous, studentID],
              )
            }
          />
        </Field>

        <Field label="Новый дедлайн" error={deadlineError}>
          <DeadlineInput
            value={deadline}
            onChange={setDeadline}
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
              onClick={() => setDeadline(defaultDeadlineLocal(preset.days))}
            >
              {preset.label}
            </Button>
          ))}
        </div>

        <p className="text-[11px] text-ink3">
          Создаётся новая копия задания с тем же текстом и типом. Старые карточки
          и их статусы не меняются.
        </p>
      </div>
    </Modal>
  );
}
