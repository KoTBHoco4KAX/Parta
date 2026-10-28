import type { CreatedTask, TaskType } from '../types';
import { TASK_TYPE_LABEL } from '../lib/xp';
import { formatDateTime, pluralSlots } from '../lib/format';
import { Badge, EmptyState, Skeleton, type BadgeTone } from './ui';
import { IconLayers, IconPlus } from './icons';

const TYPE_TONE: Record<TaskType, BadgeTone> = {
  TEST: 'sky',
  ESSAY: 'violet',
  LAB_CODE: 'indigo',
  TEAM_PROJECT: 'amber',
};

function TaskRow({ task }: { task: CreatedTask }) {
  return (
    <li className="py-3 first:pt-0 last:pb-0">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone={TYPE_TONE[task.taskType]}>
            {TASK_TYPE_LABEL[task.taskType]}
          </Badge>
          <Badge tone="slate">
            {task.groupCode} · {task.disciplineCode}
          </Badge>
        </div>
        <Badge tone="emerald">{task.status}</Badge>
      </div>

      <p className="mt-1.5 text-sm font-medium leading-snug text-slate-900">
        {task.title}
      </p>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
        <span className="font-semibold text-slate-800">
          {task.baseXP} XP
          {task.taskType === 'TEAM_PROJECT' ? (
            <span className="font-normal text-slate-400"> / слот</span>
          ) : null}
        </span>
        {task.slotsCount > 0 ? (
          <span className="inline-flex items-center gap-1">
            <IconLayers className="h-3 w-3" />
            {task.slotsCount} {pluralSlots(task.slotsCount)}
          </span>
        ) : (
          <span>индивидуальная</span>
        )}
        <span>дедлайн {formatDateTime(task.deadlineAt)}</span>
      </div>
    </li>
  );
}

/**
 * Список созданных задач. В backend read-эндпоинтов ещё нет (PROJECT_MANIFEST §6.5),
 * поэтому список живёт в моке и пополняется после `POST /api/tasks`.
 */
export function CreatedTasks({
  tasks,
  loading,
}: {
  tasks: CreatedTask[];
  loading: boolean;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Созданные задачи</h2>
          <p className="mt-0.5 text-[11px] text-slate-500">
            Новые — сверху. Нажмите «Опубликовать», чтобы добавить ещё одну.
          </p>
        </div>
        <Badge tone="slate">{tasks.length}</Badge>
      </div>

      {loading ? (
        <div className="mt-3 space-y-3">
          {[0, 1].map((index) => (
            <div key={index} className="space-y-1.5">
              <Skeleton className="h-3 w-40" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          ))}
        </div>
      ) : tasks.length === 0 ? (
        <div className="mt-3">
          <EmptyState
            icon={<IconPlus className="h-5 w-5" />}
            title="Задач пока нет"
            description="Создайте первую задачу в форме выше — она сразу станет PUBLISHED."
          />
        </div>
      ) : (
        <ul className="mt-3 divide-y divide-slate-100">
          {tasks.map((task) => (
            <TaskRow key={task.taskId} task={task} />
          ))}
        </ul>
      )}
    </section>
  );
}
