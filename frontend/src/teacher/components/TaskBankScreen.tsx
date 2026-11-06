import { useCallback, useEffect, useMemo, useState } from 'react';
import type { TaskTemplate, TaskType } from '../../core/types';
import {
  createTaskTemplate,
  deleteTaskTemplate,
  fetchTaskTemplates,
  fetchTeacherAssignments,
  teacherErrorMessage,
  type TeacherAssignment,
} from '../api';
import type { ToastData } from '../types';
import { TASK_TYPE_HINT, TASK_TYPE_LABEL, TASK_TYPE_TONE } from '../lib/labels';
import {
  Badge,
  Button,
  Callout,
  Card,
  EmptyState,
  ErrorState,
  Field,
  Modal,
  ScreenHeader,
  SelectInput,
  SkeletonList,
  TextArea,
} from './ui';
import { IconAlert, IconBook, IconPlus, IconTrash, IconUsers } from './icons';

const TASK_TYPES: TaskType[] = ['TEST', 'NOTES', 'ESSAY', 'LAB_CODE', 'TEAM_PROJECT'];
const DEFAULT_REQUIREMENTS = 8;
const DEFAULT_HOURS = 4;
const DEFAULT_BONUS_HOURS = 48;

interface DisciplineOption {
  id: number;
  code: string;
  title: string;
}

/**
 * TaskBankScreen — личная база заготовок преподавателя.
 *
 * Здесь только создание и удаление шаблонов. Выдача из базы живёт в форме
 * «Выдать задание»: там переключатель «Новое / Из базы».
 */
export function TaskBankScreen({
  notify,
}: {
  notify: (toast: Omit<ToastData, 'id'>) => void;
}) {
  const [templates, setTemplates] = useState<TaskTemplate[]>([]);
  const [assignments, setAssignments] = useState<TeacherAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [creating, setCreating] = useState(false);
  const [deletingID, setDeletingID] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [nextTemplates, nextAssignments] = await Promise.all([
        fetchTaskTemplates(),
        fetchTeacherAssignments(),
      ]);

      setTemplates(nextTemplates);
      setAssignments(nextAssignments);
    } catch (cause) {
      setError(
        teacherErrorMessage(cause, 'Не удалось загрузить базу заданий. Проверьте соединение.'),
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, reloadKey]);

  const disciplines = useMemo<DisciplineOption[]>(() => {
    const unique = new Map<number, DisciplineOption>();

    for (const assignment of assignments) {
      if (!unique.has(assignment.disciplineId)) {
        unique.set(assignment.disciplineId, {
          id: assignment.disciplineId,
          code: assignment.disciplineCode,
          title: assignment.disciplineTitle,
        });
      }
    }

    return [...unique.values()];
  }, [assignments]);

  async function remove(template: TaskTemplate) {
    if (deletingID !== null) {
      return;
    }

    setDeletingID(template.id);

    try {
      await deleteTaskTemplate(template.id);
      notify({ tone: 'success', title: 'Заготовка удалена', description: template.title });
      setReloadKey((value) => value + 1);
    } catch (cause) {
      notify({
        tone: 'error',
        title: 'Не удалось удалить заготовку',
        description: teacherErrorMessage(cause, 'Проверьте соединение и повторите.'),
      });
    } finally {
      setDeletingID(null);
    }
  }

  return (
    <div>
      <ScreenHeader
        eyebrow="База"
        title="База заданий"
        description="Заготовки, которые можно выдать в любой свой поток без повторного заполнения."
        action={
          <Button
            size="sm"
            onClick={() => setCreating(true)}
            disabled={disciplines.length === 0}
          >
            <IconPlus className="h-4 w-4" />
            Создать задание
          </Button>
        }
      />

      {loading ? <SkeletonList rows={3} /> : null}

      {!loading && error ? (
        <ErrorState message={error} onRetry={() => setReloadKey((value) => value + 1)} />
      ) : null}

      {!loading && !error ? (
        <div className="space-y-3">
          {disciplines.length === 0 ? (
            <Callout tone="amber" icon={<IconAlert className="h-4 w-4" />} title="Нет дисциплин">
              Чтобы создать заготовку, нужна хотя бы одна дисциплина в назначениях.
              Назначения выдаёт администратор.
            </Callout>
          ) : null}

          {templates.length === 0 ? (
            <EmptyState
              icon={<IconBook className="h-5 w-5" />}
              title="База пока пуста"
              description="Создайте первое задание или отметьте «Сохранить в базу» при выдаче."
              action={
                <Button
                  onClick={() => setCreating(true)}
                  disabled={disciplines.length === 0}
                >
                  <IconPlus className="h-4 w-4" />
                  Создать задание
                </Button>
              }
            />
          ) : (
            <ul className="space-y-2">
              {templates.map((template) => (
                <li key={template.id}>
                  <TemplateRow
                    template={template}
                    deleting={deletingID === template.id}
                    onDelete={() => void remove(template)}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {creating ? (
        <CreateTemplateModal
          disciplines={disciplines}
          notify={notify}
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            setReloadKey((value) => value + 1);
          }}
        />
      ) : null}
    </div>
  );
}

function TemplateRow({
  template,
  deleting,
  onDelete,
}: {
  template: TaskTemplate;
  deleting: boolean;
  onDelete: () => void;
}) {
  return (
    <Card className="space-y-2.5">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-ink">
            {template.title}
          </h3>
          <div className="mt-1 flex flex-wrap items-center gap-1">
            <Badge tone={TASK_TYPE_TONE[template.task_type]}>
              {TASK_TYPE_LABEL[template.task_type]}
            </Badge>
            <Badge tone="indigo">{template.discipline_title}</Badge>
            {template.team_size > 1 ? (
              <Badge tone="violet">
                <IconUsers className="h-3 w-3" />
                {template.team_size}
              </Badge>
            ) : null}
          </div>
          {template.description_md.trim() !== '' ? (
            <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-ink3">
              {template.description_md}
            </p>
          ) : null}
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="shrink-0 text-bad hover:bg-badSoft"
          disabled={deleting}
          onClick={onDelete}
        >
          <IconTrash className="h-3.5 w-3.5" />
          Удалить
        </Button>
      </div>
    </Card>
  );
}

function CreateTemplateModal({
  disciplines,
  notify,
  onClose,
  onCreated,
}: {
  disciplines: DisciplineOption[];
  notify: (toast: Omit<ToastData, 'id'>) => void;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [disciplineID, setDisciplineID] = useState(String(disciplines[0]?.id ?? ''));
  const [taskType, setTaskType] = useState<TaskType>('LAB_CODE');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [speedrun, setSpeedrun] = useState(String(DEFAULT_BONUS_HOURS));
  const [teamSize, setTeamSize] = useState(2);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const titleError = submitted && title.trim().length < 3 ? 'Опишите задание' : null;

  async function submit() {
    setSubmitted(true);
    setError(null);

    if (title.trim().length < 3 || disciplineID === '') {
      return;
    }

    setSubmitting(true);

    try {
      await createTaskTemplate({
        discipline_id: Number(disciplineID),
        title: title.trim(),
        description_md: description.trim(),
        task_type: taskType,
        // Сложность не спрашиваем у преподавателя: базовые значения нужны
        // только формуле XP, а не содержанию задания.
        requirements_count: DEFAULT_REQUIREMENTS,
        expected_hours: DEFAULT_HOURS,
        speedrun_window_hours: Math.max(1, Math.round(Number(speedrun) || DEFAULT_BONUS_HOURS)),
        team_size: taskType === 'TEAM_PROJECT' ? teamSize : 1,
      });

      notify({ tone: 'success', title: 'Заготовка создана', description: title.trim() });
      onCreated();
    } catch (cause) {
      setError(teacherErrorMessage(cause, 'Не удалось создать заготовку.'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Новое задание в базу"
      subtitle="Заготовка не выдаётся сразу — её можно выбрать при выдаче."
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
            <Button block loading={submitting} onClick={() => void submit()}>
              <IconBook className="h-4 w-4" />
              Сохранить в базу
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-3.5">
        <Field label="Дисциплина" htmlFor="template-discipline">
          <SelectInput
            id="template-discipline"
            value={disciplineID}
            onChange={(event) => setDisciplineID(event.target.value)}
          >
            {disciplines.map((discipline) => (
              <option key={discipline.id} value={discipline.id}>
                {discipline.code} · {discipline.title}
              </option>
            ))}
          </SelectInput>
        </Field>

        <Field label="Тип задания">
          <div className="grid grid-cols-5 gap-1.5" role="group" aria-label="Тип задания">
            {TASK_TYPES.map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={taskType === value}
                onClick={() => setTaskType(value)}
                className={`rounded-lg border px-1 py-2 text-[11px] font-medium transition ${
                  taskType === value
                    ? 'border-brand bg-brandSoft text-brandStrong'
                    : 'border-line2 bg-card text-ink2'
                }`}
              >
                {TASK_TYPE_LABEL[value]}
              </button>
            ))}
          </div>
          <p className="mt-1 text-[10px] text-ink3">{TASK_TYPE_HINT[taskType]}</p>
        </Field>

        <Field label="Текст задания" htmlFor="template-title" error={titleError}>
          <TextArea
            id="template-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            invalid={Boolean(titleError)}
            placeholder="Что нужно сделать"
          />
        </Field>

        <Field
          label="Подробности (необязательно)"
          htmlFor="template-description"
          hint="Требования, критерии, ссылки на методички."
        >
          <TextArea
            id="template-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder={'1. ...\n2. ...'}
          />
        </Field>

        <Field label="Бонусное окно" htmlFor="template-speedrun">
          <SelectInput
            id="template-speedrun"
            value={speedrun}
            onChange={(event) => setSpeedrun(event.target.value)}
          >
            <option value="24">24 часа</option>
            <option value="48">48 часов</option>
            <option value="72">72 часа</option>
          </SelectInput>
        </Field>

        {taskType === 'TEAM_PROJECT' ? (
          <Field label="Размер команды">
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
      </div>
    </Modal>
  );
}
