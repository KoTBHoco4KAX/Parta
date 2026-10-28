import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ApiError } from '../../core/api';
import type { Task, TaskType } from '../../core/types';
import { Button } from '../../components/Button';
import {
  createTeacherTask,
  fetchTeacherAssignments,
  fetchTeacherTasks,
  type TeacherAssignment,
} from '../api';
import type { ToastData } from '../types';
import { Badge, EmptyState, Skeleton } from './ui';

const TASK_TYPES: { value: TaskType; label: string }[] = [
  { value: 'TEST', label: 'Тест' },
  { value: 'ESSAY', label: 'Эссе' },
  { value: 'LAB_CODE', label: 'Лабораторная' },
  { value: 'TEAM_PROJECT', label: 'Командный проект' },
];

const inputClass =
  'w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20';

function defaultDeadline(): string {
  const date = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
  const pad = (value: number) => String(value).padStart(2, '0');

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// TasksScreen — создание заданий и список уже опубликованных.
// Создание доступно только преподавателю (backend проверяет роль).
export function TasksScreen({
  notify,
}: {
  notify: (toast: Omit<ToastData, 'id'>) => void;
}) {
  const [assignments, setAssignments] = useState<TeacherAssignment[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [assignmentId, setAssignmentId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [taskType, setTaskType] = useState<TaskType>('LAB_CODE');
  const [requirements, setRequirements] = useState('8');
  const [hours, setHours] = useState('4');
  const [deadline, setDeadline] = useState(defaultDeadline);
  const [speedrun, setSpeedrun] = useState('48');
  const [teamSize, setTeamSize] = useState('2');

  const load = useCallback(async () => {
    setError(null);

    try {
      const [nextAssignments, nextTasks] = await Promise.all([
        fetchTeacherAssignments(),
        fetchTeacherTasks(),
      ]);

      setAssignments(nextAssignments);
      setTasks(nextTasks);
      setAssignmentId((previous) => previous || String(nextAssignments[0]?.id ?? ''));
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Не удалось загрузить задания.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!assignmentId) {
      setError('Выберите назначение: группу и дисциплину.');
      return;
    }

    const parsedRequirements = Number(requirements);
    const parsedHours = Number(hours);
    const parsedSpeedrun = Number(speedrun);
    const parsedTeamSize = taskType === 'TEAM_PROJECT' ? Number(teamSize) : 1;

    if (!title.trim() || parsedRequirements <= 0 || parsedHours <= 0 || parsedSpeedrun <= 0) {
      setError('Заполните название, R, H и speedrun-окно положительными числами.');
      return;
    }

    if (parsedTeamSize < 1 || (taskType === 'TEAM_PROJECT' && parsedTeamSize < 2)) {
      setError('Для командного проекта нужно минимум 2 слота.');
      return;
    }

    const deadlineDate = new Date(deadline);
    if (Number.isNaN(deadlineDate.getTime()) || deadlineDate.getTime() <= Date.now()) {
      setError('Дедлайн должен быть в будущем.');
      return;
    }

    setSubmitting(true);

    try {
      const result = await createTeacherTask({
        assignmentId: Number(assignmentId),
        title: title.trim(),
        descriptionMD: description.trim(),
        taskType,
        requirementsCount: parsedRequirements,
        expectedHours: parsedHours,
        deadlineAt: deadlineDate.toISOString(),
        speedrunWindowHours: parsedSpeedrun,
        teamSize: parsedTeamSize,
      });

      notify({
        tone: 'success',
        title: `Задача #${result.taskId} опубликована`,
        description: `Base XP ${result.baseXP}. Карточки TODO созданы для всей группы.`,
      });

      setTitle('');
      setDescription('');
      await load();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Не удалось создать задачу.');
    } finally {
      setSubmitting(false);
    }
  }

  const assignmentById = new Map(assignments.map((item) => [item.id, item]));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-bold text-slate-100">Новая задача</h1>
        <p className="mt-0.5 text-xs leading-relaxed text-slate-400">
          Задача сразу публикуется в группу. Base XP считает сервер.
        </p>
      </div>

      {error ? (
        <p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
          {error}
        </p>
      ) : null}

      <form onSubmit={handleSubmit} className="space-y-3 rounded-2xl border border-slate-800 bg-slate-900 p-4">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-300">Назначение</span>
          <select
            value={assignmentId}
            onChange={(event) => setAssignmentId(event.target.value)}
            className={inputClass}
          >
            {assignments.length === 0 ? <option value="">Нет назначений</option> : null}
            {assignments.map((assignment) => (
              <option key={assignment.id} value={assignment.id}>
                {assignment.groupCode} · {assignment.disciplineCode}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-300">Название</span>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Лабораторная №3: транзакции"
            className={inputClass}
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-300">Описание</span>
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={3}
            placeholder="Что нужно сделать и как принимается"
            className={`${inputClass} resize-y`}
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-300">Тип задания</span>
          <select
            value={taskType}
            onChange={(event) => {
              const next = event.target.value as TaskType;
              setTaskType(next);
              setTeamSize(next === 'TEAM_PROJECT' ? '2' : '1');
            }}
            className={inputClass}
          >
            {TASK_TYPES.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-300">Требований (R)</span>
            <input
              type="number"
              min={1}
              value={requirements}
              onChange={(event) => setRequirements(event.target.value)}
              className={inputClass}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-300">Часов (H)</span>
            <input
              type="number"
              min={0.5}
              step={0.5}
              value={hours}
              onChange={(event) => setHours(event.target.value)}
              className={inputClass}
            />
          </label>
        </div>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-300">Дедлайн</span>
          <input
            type="datetime-local"
            value={deadline}
            onChange={(event) => setDeadline(event.target.value)}
            className={inputClass}
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-300">Speedrun, ч</span>
            <input
              type="number"
              min={1}
              value={speedrun}
              onChange={(event) => setSpeedrun(event.target.value)}
              className={inputClass}
            />
          </label>
          {taskType === 'TEAM_PROJECT' ? (
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-300">Слотов</span>
              <input
                type="number"
                min={2}
                max={8}
                value={teamSize}
                onChange={(event) => setTeamSize(event.target.value)}
                className={inputClass}
              />
            </label>
          ) : (
            <div className="flex items-end pb-2 text-[11px] text-slate-500">team_size = 1</div>
          )}
        </div>

        <Button type="submit" block loading={submitting} disabled={assignments.length === 0}>
          Опубликовать задачу
        </Button>
      </form>

      <section>
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Мои задачи
          </h2>
          <Badge tone="slate">{tasks.length}</Badge>
        </div>

        {loading ? (
          <div className="space-y-2">
            {[0, 1].map((index) => (
              <div key={index} className="rounded-xl border border-slate-800 bg-slate-900 p-3">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="mt-2 h-3 w-1/2" />
              </div>
            ))}
          </div>
        ) : tasks.length === 0 ? (
          <EmptyState
            title="Задач пока нет"
            description="Создайте первую задачу — она сразу появится у студентов в TODO."
          />
        ) : (
          <ul className="space-y-2">
            {tasks.map((task) => {
              const assignment = assignmentById.get(task.assignment_id);

              return (
                <li key={task.id} className="rounded-xl border border-slate-800 bg-slate-900 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 flex-1 truncate text-sm font-medium text-slate-100">
                      {task.title}
                    </p>
                    <Badge tone="emerald">{task.status}</Badge>
                  </div>
                  <p className="mt-1 text-[11px] text-slate-400">
                    {task.task_type} · {task.base_xp_computed} XP · до{' '}
                    {new Date(task.deadline_at).toLocaleDateString()}
                  </p>
                  {assignment ? (
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      {assignment.groupCode} · {assignment.disciplineCode}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
