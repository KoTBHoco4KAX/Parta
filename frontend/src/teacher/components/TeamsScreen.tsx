import { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError } from '../../core/api';
import type { Submission, Task } from '../../core/types';
import { fetchAllSubmissions, fetchTeacherTasks, issueVerdict } from '../api';
import type { ToastData } from '../types';
import { speedrunEndsAt, submissionWindow } from '../lib/economy';
import {
  formatDateTime,
  formatDeadline,
  formatWaiting,
  pluralize,
} from '../lib/format';
import {
  SLOT_ROLE_ORDER,
  STATUS_LABEL,
  STATUS_TONE,
  TASK_TYPE_LABEL,
  slotRoleTitle,
} from '../lib/labels';
import {
  Avatar,
  Badge,
  Button,
  Callout,
  Card,
  Chip,
  DeadlineMeter,
  EmptyState,
  ErrorState,
  Field,
  Modal,
  ScreenHeader,
  Section,
  SkeletonList,
  StatTile,
  TextArea,
  cn,
} from './ui';
import {
  IconAlert,
  IconCheck,
  IconClock,
  IconRefresh,
  IconUsers,
} from './icons';

/** ExpectedSlot — слот, который backend создал вместе с командным заданием. */
interface ExpectedSlot {
  code: string;
  title: string;
  submission: Submission | null;
}

/**
 * TeamsScreen — аудит командных проектов по фактическим действиям.
 *
 * Backend создаёт по слоту на каждого участника (tasks.teamRoles). Экран
 * сопоставляет слоты со сдачами: кто закрыл часть, когда, в срок ли, сколько
 * слотов взял на себя. История перехватов в API не отдаётся, поэтому выводы
 * строятся только на подтверждённых сдачах и явно помечены.
 */
export function TeamsScreen({
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
  const [tasks, setTasks] = useState<Task[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [selectedId, setSelectedId] = useState<number | null>(initialTaskId);
  const [verdictTarget, setVerdictTarget] = useState<Submission | null>(null);

  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    setError(null);

    Promise.all([fetchTeacherTasks(), fetchAllSubmissions()])
      .then(([nextTasks, nextSubmissions]) => {
        if (cancelled) {
          return;
        }

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
            : 'Не удалось загрузить командные проекты. Проверьте соединение.',
        );
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [reloadKey, reloadSignal]);

  const groupCodes = useMemo(() => {
    const map = new Map<number, string>();

    for (const submission of submissions) {
      if (!map.has(submission.group_id)) {
        map.set(submission.group_id, submission.group_code);
      }
    }

    return map;
  }, [submissions]);

  const teamTasks = useMemo(() => {
    const now = Date.now();
    const items = tasks.filter((task) => task.task_type === 'TEAM_PROJECT');

    const active = items
      .filter((task) => new Date(task.deadline_at).getTime() >= now)
      .sort((a, b) => new Date(a.deadline_at).getTime() - new Date(b.deadline_at).getTime());

    const past = items
      .filter((task) => new Date(task.deadline_at).getTime() < now)
      .sort((a, b) => new Date(b.deadline_at).getTime() - new Date(a.deadline_at).getTime());

    return [...active, ...past];
  }, [tasks]);

  const selectedTask = useMemo(() => {
    if (selectedId !== null) {
      const found = teamTasks.find((task) => task.id === selectedId);
      if (found) {
        return found;
      }
    }

    return teamTasks[0] ?? null;
  }, [teamTasks, selectedId]);

  const taskSubmissions = useMemo(
    () => (selectedTask ? submissions.filter((item) => item.task_id === selectedTask.id) : []),
    [submissions, selectedTask],
  );

  const slots = useMemo<ExpectedSlot[]>(() => {
    if (!selectedTask) {
      return [];
    }

    const byRole = new Map<string, Submission>();
    for (const submission of taskSubmissions) {
      if (submission.team_slot_role) {
        byRole.set(submission.team_slot_role, submission);
      }
    }

    return Array.from({ length: Math.max(1, selectedTask.team_size) }, (_, index) => {
      const base = SLOT_ROLE_ORDER[index % SLOT_ROLE_ORDER.length];
      const code =
        index < SLOT_ROLE_ORDER.length
          ? base
          : `${base}_${Math.floor(index / SLOT_ROLE_ORDER.length) + 1}`;

      return {
        code,
        title: slotRoleTitle(code),
        submission: byRole.get(code) ?? null,
      };
    });
  }, [selectedTask, taskSubmissions]);

  const audit = useMemo(() => {
    const byStudent = new Map<
      number,
      { name: string; slots: number; late: number; done: number; review: number; pending: number }
    >();
    const withoutSlot = new Set<number>();

    for (const submission of taskSubmissions) {
      if (!submission.team_slot_role) {
        // Карточка задания есть, но слот не взят: вклад не зафиксирован.
        withoutSlot.add(submission.student_id);
        continue;
      }

      const entry =
        byStudent.get(submission.student_id) ?? {
          name: submission.student_name,
          slots: 0,
          late: 0,
          done: 0,
          review: 0,
          pending: 0,
        };

      entry.slots += 1;

      if (submission.submitted_at === null) {
        entry.pending += 1;
      } else if (
        submissionWindow(
          submission.submitted_at,
          submission.deadline_at,
          submission.speedrun_window_hours,
        ) === 'late'
      ) {
        entry.late += 1;
      }

      if (submission.status === 'DONE') {
        entry.done += 1;
      }

      if (submission.status === 'REVIEW') {
        entry.review += 1;
      }

      byStudent.set(submission.student_id, entry);
    }

    const students = [...byStudent.values()].sort(
      (a, b) => b.slots - a.slots || b.late - a.late,
    );
    const freeSlots = slots.filter((slot) => slot.submission === null).length;
    const lateSlots = slots.filter(
      (slot) =>
        slot.submission !== null &&
        slot.submission.submitted_at !== null &&
        submissionWindow(
          slot.submission.submitted_at,
          slot.submission.deadline_at,
          slot.submission.speedrun_window_hours,
        ) === 'late',
    ).length;
    const pendingSlots = slots.filter(
      (slot) => slot.submission !== null && slot.submission.submitted_at === null,
    ).length;
    const multiSlot = students.filter((student) => student.slots >= 2);

    return { students, freeSlots, lateSlots, pendingSlots, multiSlot, withoutSlot: withoutSlot.size };
  }, [taskSubmissions, slots]);

  const pending = taskSubmissions.filter((submission) => submission.status === 'REVIEW').length;

  const refresh = useCallback(() => setReloadKey((key) => key + 1), []);

  return (
    <div>
      <ScreenHeader
        eyebrow="Команды"
        title="Аудит проектов"
        description="Кто закрыл свою часть, в срок ли и не тянул ли один за двоих."
        action={
          <Button variant="ghost" size="sm" onClick={refresh} aria-label="Обновить аудит">
            <IconRefresh className={cn('h-4 w-4', loading && 'animate-spin')} />
          </Button>
        }
      />

      {loading ? <SkeletonList rows={3} /> : null}

      {!loading && error ? <ErrorState message={error} onRetry={refresh} /> : null}

      {!loading && !error && teamTasks.length === 0 ? (
        <EmptyState
          icon={<IconUsers className="h-5 w-5" />}
          title="Командных проектов нет"
          description="Создайте задание типа «Командный проект» — backend разложит его на слоты ответственности."
        />
      ) : null}

      {!loading && !error && teamTasks.length > 0 ? (
        <div className="space-y-4">
          {teamTasks.length > 1 ? (
            <div className="flex flex-wrap gap-1.5">
              {teamTasks.map((task) => (
                <Chip
                  key={task.id}
                  active={selectedTask?.id === task.id}
                  onClick={() => setSelectedId(task.id)}
                >
                  {compactTaskTitle(task.title)}
                </Chip>
              ))}
            </div>
          ) : null}

          {selectedTask ? (
            <>
              <Card className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h2 className="line-clamp-2 text-sm font-semibold text-ink">
                      {selectedTask.title}
                    </h2>
                    <div className="mt-1 flex flex-wrap items-center gap-1">
                      <Badge tone="amber">{TASK_TYPE_LABEL.TEAM_PROJECT}</Badge>
                      <Badge tone="violet">{selectedTask.team_size} слота</Badge>
                      <Badge tone="slate">
                        {groupCodes.get(selectedTask.group_id) ?? `группа #${selectedTask.group_id}`}
                      </Badge>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-[10px] uppercase tracking-wide text-ink3">Base XP</p>
                    <p className="text-sm font-semibold tabular-nums text-brandStrong">
                      {selectedTask.base_xp_computed}
                    </p>
                  </div>
                </div>

                <DeadlineMeter
                  createdAt={selectedTask.created_at}
                  deadlineAt={selectedTask.deadline_at}
                  bonusEndsAt={speedrunEndsAt(
                    selectedTask.deadline_at,
                    selectedTask.speedrun_window_hours,
                  ).toISOString()}
                  now={Date.now()}
                  compact
                />
              </Card>

              <div className="grid grid-cols-2 gap-2">
                <StatTile
                  label="Слотов занято"
                  value={`${slots.length - audit.freeSlots}/${slots.length}`}
                  hint="по фактическим сдачам"
                  tone="emerald"
                  icon={<IconUsers className="h-3.5 w-3.5" />}
                />
                <StatTile
                  label="На проверке"
                  value={pending}
                  hint="ждут вердикта"
                  tone={pending > 0 ? 'amber' : 'slate'}
                  icon={<IconClock className="h-3.5 w-3.5" />}
                />
                <StatTile
                  label="Свободных слотов"
                  value={audit.freeSlots}
                  hint="никто не взял"
                  tone={audit.freeSlots > 0 ? 'rose' : 'slate'}
                  icon={<IconAlert className="h-3.5 w-3.5" />}
                />
                <StatTile
                  label="Просрочено"
                  value={audit.lateSlots}
                  hint="сдано после дедлайна"
                  tone={audit.lateSlots > 0 ? 'rose' : 'slate'}
                  icon={<IconClock className="h-3.5 w-3.5" />}
                />
              </div>

              {audit.multiSlot.length > 0 ? (
                <Callout tone="violet" icon={<IconAlert className="h-4 w-4" />} title="Работа за напарника">
                  {audit.multiSlot
                    .map((student) => `${student.name} — ${student.slots} слота`)
                    .join(', ')}
                  . Похоже, часть команды не включилась: проверьте вклад каждого.
                </Callout>
              ) : null}

              <Section title="Слоты ответственности" subtitle="Кто что сдал и когда">
                <div className="space-y-2">
                  {slots.map((slot) => (
                    <SlotCard
                      key={slot.code}
                      slot={slot}
                      onVerdict={(submission) => setVerdictTarget(submission)}
                    />
                  ))}
                </div>
              </Section>

              <Section title="Вклад участников" subtitle="Сводка по фактическим действиям">
                {audit.students.length === 0 ? (
                  <Card className="p-3">
                    <p className="text-[11px] leading-relaxed text-ink3">
                      Никто ещё не взял слот — команда только получила задание.
                    </p>
                  </Card>
                ) : (
                  <div className="space-y-1.5">
                    {audit.students.map((student) => (
                      <Card key={student.name} className="flex items-center gap-2.5 p-3">
                        <Avatar name={student.name} tone={student.slots >= 2 ? 'violet' : 'slate'} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[12px] font-medium text-ink">
                            {student.name}
                          </p>
                          <p className="text-[10px] text-ink3">
                            {student.slots}{' '}
                            {pluralize(student.slots, ['слот', 'слота', 'слотов'])} · зачтено{' '}
                            {student.done}
                            {student.review > 0 ? ` · на проверке ${student.review}` : ''}
                            {student.late > 0 ? ` · просрочено ${student.late}` : ''}
                            {student.pending > 0 ? ` · в работе ${student.pending}` : ''}
                          </p>
                        </div>
                        {student.slots >= 2 ? (
                          <Badge tone="violet">за двоих</Badge>
                        ) : student.late > 0 ? (
                          <Badge tone="rose">просрочка</Badge>
                        ) : student.done > 0 ? (
                          <Badge tone="emerald">в срок</Badge>
                        ) : (
                          <Badge tone="sky">в работе</Badge>
                        )}
                      </Card>
                    ))}
                  </div>
                )}
              </Section>

              {audit.withoutSlot > 0 ? (
                <Callout
                  tone="amber"
                  icon={<IconAlert className="h-4 w-4" />}
                  title="Участники без слота"
                >
                  {audit.withoutSlot}{' '}
                  {pluralize(audit.withoutSlot, ['ученик получил', 'ученика получили', 'учеников получили'])}{' '}
                  карточку задания, но не заняли слот ответственности — их вклад не
                  зафиксирован. Слоты распределяются на стороне ученика.
                </Callout>
              ) : null}

              <Callout tone="slate" icon={<IconClock className="h-4 w-4" />} title="Границы данных">
                Аудит построен по подтверждённым сдачам: время, окно бонуса, номер
                попытки. История перехватов слотов в API не отдаётся, поэтому
                «за двоих» — это вывод по числу закрытых слотов, а не запись журнала.
              </Callout>
            </>
          ) : null}
        </div>
      ) : null}

      {verdictTarget ? (
        <SlotVerdictModal
          submission={verdictTarget}
          notify={notify}
          onClose={() => setVerdictTarget(null)}
          onDecided={() => {
            setVerdictTarget(null);
            onReviewed?.();
            refresh();
          }}
        />
      ) : null}
    </div>
  );
}

/** SlotCard — строка слота: роль, исполнитель, срок и действие. */
function SlotCard({
  slot,
  onVerdict,
}: {
  slot: ExpectedSlot;
  onVerdict: (submission: Submission) => void;
}) {
  const submission = slot.submission;

  if (!submission) {
    return (
      <Card className="flex items-center gap-2.5 border-dashed p-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sunken text-ink3">
          <IconUsers className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12px] font-medium text-ink2">{slot.title}</p>
          <p className="text-[10px] text-ink3">Слот свободен — никто не взял</p>
        </div>
        <Badge tone="slate">свободен</Badge>
      </Card>
    );
  }

  const window = submissionWindow(
    submission.submitted_at,
    submission.deadline_at,
    submission.speedrun_window_hours,
  );

  const lateSeconds =
    submission.submitted_at !== null
      ? Math.max(
          0,
          Math.round(
            (new Date(submission.submitted_at).getTime() -
              new Date(submission.deadline_at).getTime()) /
              1000,
          ),
        )
      : 0;

  return (
    <Card className="space-y-2 p-3">
      <div className="flex items-start gap-2.5">
        <Avatar name={submission.student_name} tone={window === 'late' ? 'rose' : 'emerald'} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12px] font-medium text-ink">{slot.title}</p>
          <p className="truncate text-[10px] text-ink3">
            {submission.student_name} · {submission.group_code}
          </p>
        </div>
        <Badge tone={STATUS_TONE[submission.status]}>{STATUS_LABEL[submission.status]}</Badge>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-ink3">
        <span>{submission.submitted_at ? `сдано ${formatDateTime(submission.submitted_at)}` : 'без сдачи'}</span>
        <span className={cn('tabular-nums', window === 'late' ? 'text-bad' : 'text-brandStrong')}>
          {window === 'late'
            ? `просрочено на ${formatWaiting(lateSeconds)}`
            : window === 'speedrun'
              ? 'бонус ×1.5'
              : 'в срок'}
        </span>
        {submission.attempt > 1 ? <span>попытка {submission.attempt}</span> : null}
      </div>

      {submission.status === 'REVIEW' ? (
        <Button size="sm" variant="outline" block onClick={() => onVerdict(submission)}>
          <IconCheck className="h-3.5 w-3.5" />
          Проверить слот
        </Button>
      ) : null}
    </Card>
  );
}

/** SlotVerdictModal — вердикт по слоту команды без перехода в инбокс. */
function SlotVerdictModal({
  submission,
  notify,
  onClose,
  onDecided,
}: {
  submission: Submission;
  notify: (toast: Omit<ToastData, 'id'>) => void;
  onClose: () => void;
  onDecided: () => void;
}) {
  const [mode, setMode] = useState<'idle' | 'reject'>('idle');
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function decide(verdict: 'ACCEPT' | 'REJECT') {
    if (verdict === 'REJECT' && comment.trim() === '') {
      setError('Комментарий обязателен для возврата на доработку.');

      return;
    }

    setBusy(true);
    setError(null);

    try {
      const result = await issueVerdict({
        submissionId: submission.id,
        verdict,
        comment: comment.trim(),
      });

      notify({
        tone: verdict === 'ACCEPT' ? 'success' : 'info',
        title: verdict === 'ACCEPT' ? 'Слот зачтён' : 'Слот возвращён на доработку',
        description:
          verdict === 'ACCEPT' && result.xpAwarded > 0
            ? `${submission.student_name}: +${result.xpAwarded} XP`
            : `${submission.student_name} · ${slotRoleTitle(submission.team_slot_role)}`,
      });
      onDecided();
    } catch (cause) {
      setError(
        cause instanceof ApiError
          ? cause.message
          : 'Не удалось применить вердикт. Проверьте соединение.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={slotRoleTitle(submission.team_slot_role)}
      subtitle={`${submission.student_name} · ${submission.task_title}`}
      size="md"
      footer={
        <div className="flex w-full flex-col gap-2">
          {error ? (
            <p role="alert" className="text-[11px] text-bad">
              {error}
            </p>
          ) : null}

          {mode === 'reject' ? (
            <>
              <Field label="Комментарий для ученика" htmlFor="slot-reject">
                <TextArea
                  id="slot-reject"
                  value={comment}
                  onChange={(event) => setComment(event.target.value)}
                  placeholder="Опишите, что доработать в этой части проекта."
                />
              </Field>
              <div className="flex gap-2">
                <Button variant="ghost" block onClick={() => setMode('idle')} disabled={busy}>
                  Отмена
                </Button>
                <Button variant="reject" block loading={busy} onClick={() => void decide('REJECT')}>
                  Вернуть
                </Button>
              </div>
            </>
          ) : (
            <div className="flex gap-2">
              <Button variant="reject" block onClick={() => setMode('reject')} disabled={busy}>
                На доработку
              </Button>
              <Button variant="accept" block loading={busy} onClick={() => void decide('ACCEPT')}>
                Зачесть слот
              </Button>
            </div>
          )}
        </div>
      }
    >
      <div className="space-y-2 text-[11px] leading-relaxed text-ink3">
        <p>
          Сдано: {submission.submitted_at ? formatDateTime(submission.submitted_at) : '—'} · дедлайн{' '}
          {formatDateTime(submission.deadline_at)}
        </p>
        <p>Попытка {submission.attempt} · Base XP {submission.base_xp_computed}</p>
        {submission.revision_log.length > 0 ? (
          <p>Возвратов ранее: {submission.revision_log.length}</p>
        ) : null}
        <p className="text-ink3">
          Зачёт слота начисляет XP за часть проекта и не закрывает работу остальных
          слотов.
        </p>
      </div>
    </Modal>
  );
}

/** compactTaskTitle — компактный заголовок для чипа выбора задания. */
function compactTaskTitle(title: string): string {
  const stripped = title.replace(/^командный проект\s*[:—-]\s*/i, '');
  const source = stripped.length >= 4 ? stripped : title;

  return source.length > 24 ? `${source.slice(0, 24)}…` : source;
}
