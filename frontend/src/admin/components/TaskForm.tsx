import { useEffect, useMemo, useState, type FormEvent } from 'react';
import type {
  Assignment,
  CreateTaskRequest,
  CreateTaskResponse,
  FieldErrors,
  TaskType,
  ToastData,
} from '../types';
import {
  TASK_TYPE_DESCRIPTION,
  TASK_TYPE_LABEL,
  TASK_TYPE_WEIGHT,
  computeXPParts,
  defaultDeadlineLocal,
  toDatetimeLocalValue,
} from '../lib/xp';
import { createTask, isMockApiError } from '../mock/api';
import { XpPreview } from './XpPreview';
import {
  Badge,
  Button,
  Field,
  cn,
  inputClass,
  inputErrorClass,
} from './ui';
import { IconAlert, IconCheck, IconLock, IconPlus } from './icons';

interface TaskFormState {
  assignmentId: string;
  title: string;
  descriptionMD: string;
  taskType: TaskType;
  requirementsCount: string;
  expectedHours: string;
  deadlineAt: string;
  speedrunWindowHours: string;
  teamSize: string;
}

function initialState(): TaskFormState {
  return {
    assignmentId: '',
    title: '',
    descriptionMD: '',
    taskType: 'LAB_CODE',
    requirementsCount: '8',
    expectedHours: '4',
    deadlineAt: defaultDeadlineLocal(),
    speedrunWindowHours: '48',
    teamSize: '2',
  };
}

const TASK_TYPES: TaskType[] = ['TEST', 'ESSAY', 'LAB_CODE', 'TEAM_PROJECT'];

/**
 * Форма создания задачи (`POST /api/tasks`, роли teacher/admin).
 *
 * Полей XP здесь нет и не будет: преподаватель меняет только R, H, task_type,
 * deadline_at, speedrun_window_hours, team_size (spec/03_MATH.md §1).
 */
export function TaskForm({
  assignments,
  onCreated,
  notify,
}: {
  assignments: Assignment[];
  onCreated: () => void | Promise<void>;
  notify: (toast: Omit<ToastData, 'id'>) => void;
}) {
  const [state, setState] = useState<TaskFormState>(initialState);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [lastResult, setLastResult] = useState<{
    response: CreateTaskResponse;
    title: string;
  } | null>(null);

  useEffect(() => {
    if (state.assignmentId === '' && assignments.length > 0) {
      setState((previous) => ({
        ...previous,
        assignmentId: String(assignments[0].id),
      }));
    }
  }, [assignments, state.assignmentId]);

  const selectedAssignment = assignments.find(
    (assignment) => String(assignment.id) === state.assignmentId,
  );

  const teamSizeForPreview =
    state.taskType === 'TEAM_PROJECT' ? Number(state.teamSize) : 1;

  const preview = useMemo(() => {
    const requirements = Number(state.requirementsCount);
    const hours = Number(state.expectedHours);
    const deadline = state.deadlineAt ? new Date(state.deadlineAt) : null;

    if (!Number.isFinite(requirements) || requirements <= 0) {
      return null;
    }

    if (!Number.isFinite(hours) || hours <= 0) {
      return null;
    }

    if (!deadline || Number.isNaN(deadline.getTime())) {
      return null;
    }

    if (
      state.taskType === 'TEAM_PROJECT' &&
      (!Number.isFinite(teamSizeForPreview) ||
        teamSizeForPreview < 2 ||
        teamSizeForPreview > 8)
    ) {
      return null;
    }

    return computeXPParts({
      taskType: state.taskType,
      requirementsCount: requirements,
      expectedHours: hours,
      createdAt: new Date(),
      deadlineAt: deadline,
      teamSize: teamSizeForPreview,
    });
  }, [
    state.requirementsCount,
    state.expectedHours,
    state.deadlineAt,
    state.taskType,
    teamSizeForPreview,
  ]);

  function clearError(field: string) {
    setErrors((previous) => {
      if (!(field in previous)) {
        return previous;
      }

      const next = { ...previous };
      delete next[field];
      return next;
    });
  }

  function update<K extends keyof TaskFormState>(key: K, value: TaskFormState[K]) {
    setState((previous) => ({ ...previous, [key]: value }));
    clearError(String(key));
  }

  function selectTaskType(taskType: TaskType) {
    setState((previous) => ({
      ...previous,
      taskType,
      teamSize:
        taskType === 'TEAM_PROJECT'
          ? Number(previous.teamSize) >= 2
            ? previous.teamSize
            : '2'
          : '1',
    }));
    clearError('taskType');
    clearError('teamSize');
  }

  function buildRequest(): { request: CreateTaskRequest | null; errors: FieldErrors } {
    const nextErrors: FieldErrors = {};

    const assignmentId = Number(state.assignmentId);
    if (!state.assignmentId || !Number.isFinite(assignmentId)) {
      nextErrors.assignmentId = 'Выберите группу и дисциплину';
    }

    const title = state.title.trim();
    if (title.length === 0) {
      nextErrors.title = 'Название обязательно';
    }

    const requirementsCount = Number(state.requirementsCount);
    if (!Number.isInteger(requirementsCount) || requirementsCount <= 0) {
      nextErrors.requirementsCount = 'Целое число больше 0';
    }

    const expectedHours = Number(state.expectedHours);
    if (!Number.isFinite(expectedHours) || expectedHours <= 0) {
      nextErrors.expectedHours = 'Число больше 0';
    }

    const deadline = state.deadlineAt ? new Date(state.deadlineAt) : null;
    if (!deadline || Number.isNaN(deadline.getTime())) {
      nextErrors.deadlineAt = 'Укажите дату и время';
    } else if (deadline.getTime() <= Date.now()) {
      nextErrors.deadlineAt = 'Дедлайн должен быть в будущем';
    }

    const speedrunWindowHours = Number(state.speedrunWindowHours);
    if (!Number.isInteger(speedrunWindowHours) || speedrunWindowHours <= 0) {
      nextErrors.speedrunWindowHours = 'Целое число часов больше 0';
    }

    let teamSize = 1;

    if (state.taskType === 'TEAM_PROJECT') {
      teamSize = Number(state.teamSize);
      if (!Number.isInteger(teamSize) || teamSize < 2 || teamSize > 8) {
        nextErrors.teamSize = 'От 2 до 8 слотов';
      }
    }

    if (Object.keys(nextErrors).length > 0 || !deadline) {
      return { request: null, errors: nextErrors };
    }

    return {
      request: {
        assignmentId,
        title,
        descriptionMD: state.descriptionMD.trim(),
        taskType: state.taskType,
        requirementsCount,
        expectedHours,
        deadlineAt: deadline.toISOString(),
        speedrunWindowHours,
        teamSize,
      },
      errors: {},
    };
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const { request, errors: nextErrors } = buildRequest();
    setErrors(nextErrors);

    if (!request) {
      setFormError('Проверьте выделенные поля — задача не создана.');
      return;
    }

    setSubmitting(true);

    try {
      const response = await createTask(request);
      setLastResult({ response, title: request.title });
      notify({
        tone: 'success',
        title: `Задача #${response.taskId} опубликована`,
        description: `Base XP ${response.baseXP} · слотов ${response.slotsCount} · PUBLISHED`,
      });
      setState((previous) => ({
        ...previous,
        title: '',
        descriptionMD: '',
      }));
      await onCreated();
    } catch (cause) {
      setFormError(
        isMockApiError(cause)
          ? cause.message
          : 'Не удалось создать задачу. Попробуйте ещё раз.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  function handleReset() {
    setState(initialState());
    setErrors({});
    setFormError(null);
    setLastResult(null);
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Новая задача</h2>
          <p className="mt-0.5 text-[11px] text-slate-500">
            POST /api/tasks · teacher, admin
          </p>
        </div>
        <Badge tone="indigo">
          <IconLock className="h-3 w-3" />
          XP считает сервер
        </Badge>
      </div>

      <div className="mt-4 grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-4">
          <Field
            id="assignment"
            label="Назначение"
            hint="группа + дисциплина"
            required
            error={errors.assignmentId}
          >
            <select
              id="assignment"
              value={state.assignmentId}
              onChange={(event) => update('assignmentId', event.target.value)}
              className={cn(
                inputClass,
                'appearance-none bg-[length:16px] bg-[right_0.75rem_center] bg-no-repeat pr-9',
                errors.assignmentId && inputErrorClass,
              )}
              style={{
                backgroundImage:
                  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%2364748b' stroke-width='2'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
              }}
            >
              <option value="" disabled>
                Выберите назначение
              </option>
              {assignments.map((assignment) => (
                <option key={assignment.id} value={assignment.id}>
                  {assignment.groupCode} · {assignment.disciplineCode} —{' '}
                  {assignment.disciplineTitle}
                </option>
              ))}
            </select>
            {selectedAssignment ? (
              <p className="mt-1 text-[10px] text-slate-400">
                {selectedAssignment.groupTitle} · преподаватель{' '}
                {selectedAssignment.teacherName}
              </p>
            ) : null}
          </Field>

          <Field id="title" label="Название" required error={errors.title}>
            <input
              id="title"
              type="text"
              value={state.title}
              onChange={(event) => update('title', event.target.value)}
              placeholder="Лабораторная №3: транзакции"
              maxLength={200}
              className={cn(inputClass, errors.title && inputErrorClass)}
            />
          </Field>

          <Field
            id="description"
            label="Описание"
            hint="markdown, необязательно"
          >
            <textarea
              id="description"
              rows={3}
              value={state.descriptionMD}
              onChange={(event) => update('descriptionMD', event.target.value)}
              placeholder="Что нужно сделать, критерии приёмки, ссылки на ГОСТ…"
              maxLength={4000}
              className={cn(inputClass, 'resize-y')}
            />
          </Field>

          <div>
            <p className="text-xs font-medium text-slate-700">
              Тип задания
              <span className="ml-0.5 text-rose-600" aria-hidden="true">
                *
              </span>
            </p>
            <div className="mt-1.5 grid grid-cols-2 gap-1.5">
              {TASK_TYPES.map((taskType) => (
                <button
                  key={taskType}
                  type="button"
                  onClick={() => selectTaskType(taskType)}
                  aria-pressed={state.taskType === taskType}
                  className={cn(
                    'rounded-xl border px-2.5 py-2 text-left transition',
                    state.taskType === taskType
                      ? 'border-indigo-500 bg-indigo-50/70 ring-2 ring-indigo-100'
                      : 'border-slate-200 bg-white hover:border-indigo-300 hover:bg-indigo-50/30',
                  )}
                >
                  <span className="flex items-center justify-between gap-1">
                    <span className="text-xs font-semibold text-slate-900">
                      {TASK_TYPE_LABEL[taskType]}
                    </span>
                    <span className="font-mono text-[10px] text-slate-400">
                      w={TASK_TYPE_WEIGHT[taskType].toFixed(1)}
                    </span>
                  </span>
                  <span className="mt-0.5 block text-[10px] leading-tight text-slate-500">
                    {TASK_TYPE_DESCRIPTION[taskType]}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field
              id="requirements"
              label="Требований (R)"
              required
              error={errors.requirementsCount}
            >
              <input
                id="requirements"
                type="number"
                min={1}
                step={1}
                inputMode="numeric"
                value={state.requirementsCount}
                onChange={(event) => update('requirementsCount', event.target.value)}
                className={cn(
                  inputClass,
                  'tabular-nums',
                  errors.requirementsCount && inputErrorClass,
                )}
              />
            </Field>

            <Field
              id="hours"
              label="Ожидаемых часов (H)"
              required
              error={errors.expectedHours}
            >
              <input
                id="hours"
                type="number"
                min={0.5}
                step={0.5}
                inputMode="decimal"
                value={state.expectedHours}
                onChange={(event) => update('expectedHours', event.target.value)}
                className={cn(
                  inputClass,
                  'tabular-nums',
                  errors.expectedHours && inputErrorClass,
                )}
              />
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              id="deadline"
              label="Дедлайн"
              hint="локальное время"
              required
              error={errors.deadlineAt}
            >
              <input
                id="deadline"
                type="datetime-local"
                value={state.deadlineAt}
                min={toDatetimeLocalValue(new Date())}
                onChange={(event) => update('deadlineAt', event.target.value)}
                className={cn(
                  inputClass,
                  'tabular-nums',
                  errors.deadlineAt && inputErrorClass,
                )}
              />
            </Field>

            <Field
              id="speedrun"
              label="Speedrun-окно, ч"
              hint="×1.5 внутри окна"
              required
              error={errors.speedrunWindowHours}
            >
              <input
                id="speedrun"
                type="number"
                min={1}
                step={1}
                inputMode="numeric"
                value={state.speedrunWindowHours}
                onChange={(event) =>
                  update('speedrunWindowHours', event.target.value)
                }
                className={cn(
                  inputClass,
                  'tabular-nums',
                  errors.speedrunWindowHours && inputErrorClass,
                )}
              />
            </Field>
          </div>

          {state.taskType === 'TEAM_PROJECT' ? (
            <Field
              id="team-size"
              label="Командных слотов (team_size)"
              hint="2–8, каждый слот принимается отдельно"
              required
              error={errors.teamSize}
            >
              <input
                id="team-size"
                type="number"
                min={2}
                max={8}
                step={1}
                inputMode="numeric"
                value={state.teamSize}
                onChange={(event) => update('teamSize', event.target.value)}
                className={cn(
                  inputClass,
                  'tabular-nums',
                  errors.teamSize && inputErrorClass,
                )}
              />
            </Field>
          ) : (
            <p className="rounded-xl bg-slate-50 px-3 py-2 text-[11px] text-slate-500">
              team_size = 1: индивидуальная задача, ролевые слоты не создаются.
            </p>
          )}

          {formError ? (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800"
            >
              <IconAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{formError}</span>
            </div>
          ) : null}

          {lastResult ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-emerald-900">
                <IconCheck className="h-4 w-4" />
                Задача #{lastResult.response.taskId} опубликована
              </p>
              <p className="mt-1 text-[11px] text-emerald-800">
                «{lastResult.title}» · Base XP {lastResult.response.baseXP} · статус{' '}
                {lastResult.response.status} · слотов {lastResult.response.slotsCount}
              </p>
            </div>
          ) : null}

          <div className="flex flex-col gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[10px] text-slate-400">
              После публикации задача получает статус PUBLISHED и становится
              доступна группам.
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={handleReset}
                disabled={submitting}
                className="flex-1 sm:flex-none"
              >
                Сбросить
              </Button>
              <Button
                type="submit"
                loading={submitting}
                className="flex-1 sm:flex-none"
              >
                <IconPlus className="h-4 w-4" />
                Опубликовать
              </Button>
            </div>
          </div>
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <XpPreview
            parts={preview}
            taskType={state.taskType}
            teamSize={teamSizeForPreview}
          />
        </aside>
      </div>
    </form>
  );
}
