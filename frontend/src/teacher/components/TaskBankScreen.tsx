import { useCallback, useEffect, useMemo, useState } from 'react';
import type { TaskTemplate, TaskType } from '../../core/types';
import {
  createTaskTemplate,
  deleteTaskTemplate,
  fetchTaskTemplates,
  fetchTeacherAssignments,
  updateTaskTemplate,
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
import {
  IconAlert,
  IconBook,
  IconChevronRight,
  IconFile,
  IconPaperclip,
  IconPlus,
  IconTrash,
  IconUsers,
} from './icons';

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
  const [selected, setSelected] = useState<TaskTemplate | null>(null);
  const [editing, setEditing] = useState<TaskTemplate | null>(null);
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
                  <TemplateRow template={template} onOpen={() => setSelected(template)} />
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

      {selected ? (
        <TemplateDetailModal
          template={selected}
          deleting={deletingID === selected.id}
          onClose={() => setSelected(null)}
          onEdit={() => {
            setEditing(selected);
            setSelected(null);
          }}
          onDelete={() => {
            void remove(selected).then(() => setSelected(null));
          }}
        />
      ) : null}

      {editing ? (
        <CreateTemplateModal
          template={editing}
          disciplines={disciplines}
          notify={notify}
          onClose={() => setEditing(null)}
          onCreated={() => {
            setEditing(null);
            setReloadKey((value) => value + 1);
          }}
        />
      ) : null}
    </div>
  );
}

function TemplateRow({
  template,
  onOpen,
}: {
  template: TaskTemplate;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="block w-full rounded-2xl text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand"
    >
      <Card className="space-y-2.5 transition hover:border-line2">
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
            {(template.attachments?.length ?? 0) > 0 ? (
              <div className="mt-1.5">
                <Badge tone="slate">
                  <IconPaperclip className="h-3 w-3" />
                  {template.attachments?.length ?? 0}
                </Badge>
              </div>
            ) : null}
          </div>
          <IconChevronRight className="mt-1 h-4 w-4 shrink-0 text-ink3" />
        </div>
      </Card>
    </button>
  );
}

function TemplateDetailModal({
  template,
  deleting,
  onClose,
  onEdit,
  onDelete,
}: {
  template: TaskTemplate;
  deleting: boolean;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <Modal
      open
      onClose={onClose}
      title={template.title}
      subtitle="Заготовка из базы заданий"
      footer={
        <div className="flex w-full gap-2">
          <Button
            variant="reject"
            block
            disabled={deleting}
            onClick={onDelete}
          >
            <IconTrash className="h-4 w-4" />
            Удалить
          </Button>
          <Button block onClick={onEdit} disabled={deleting}>
            Редактировать
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        <div className="flex flex-wrap gap-1.5">
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

        <section className="rounded-xl border border-line bg-muted p-3">
          <h4 className="text-xs font-semibold text-ink2">Файлы задания</h4>
          {(template.attachments?.length ?? 0) === 0 ? (
            <p className="mt-1 text-[11px] text-ink3">Файлов нет.</p>
          ) : (
            <ul className="mt-1.5 space-y-1">
              {(template.attachments ?? []).map((file) => (
                <li key={file.url}>
                  <a
                    href={file.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex max-w-full items-center gap-1.5 text-[11px] text-brand hover:underline"
                  >
                    <IconFile className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{file.name}</span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </Modal>
  );
}

function CreateTemplateModal({
  template,
  disciplines,
  notify,
  onClose,
  onCreated,
}: {
  template?: TaskTemplate;
  disciplines: DisciplineOption[];
  notify: (toast: Omit<ToastData, 'id'>) => void;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [disciplineID, setDisciplineID] = useState(
    String(template?.discipline_id ?? disciplines[0]?.id ?? ''),
  );
  const [taskType, setTaskType] = useState<TaskType>(template?.task_type ?? 'LAB_CODE');
  const [title, setTitle] = useState(template?.title ?? '');
  const [files, setFiles] = useState<File[]>([]);
  const [teamSize, setTeamSize] = useState(template?.team_size ?? 2);
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

    const input = {
      discipline_id: Number(disciplineID),
      title: title.trim(),
      description_md: '',
      task_type: taskType,
      // Сложность не спрашиваем у преподавателя: базовые значения нужны
      // только формуле XP, а не содержанию задания.
      requirements_count: DEFAULT_REQUIREMENTS,
      expected_hours: DEFAULT_HOURS,
      speedrun_window_hours: DEFAULT_BONUS_HOURS,
      team_size: taskType === 'TEAM_PROJECT' ? teamSize : 1,
    };

    try {
      if (template) {
        await updateTaskTemplate(template.id, input, files);
      } else {
        await createTaskTemplate(input, files);
      }

      notify({
        tone: 'success',
        title: template ? 'Заготовка обновлена' : 'Заготовка создана',
        description: title.trim(),
      });
      onCreated();
    } catch (cause) {
      setError(
        teacherErrorMessage(
          cause,
          template ? 'Не удалось сохранить изменения.' : 'Не удалось создать заготовку.',
        ),
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={template ? 'Редактировать задание' : 'Новое задание в базу'}
      subtitle={
        template
          ? 'Изменения сохранятся в базе заданий.'
          : 'Заготовка не выдаётся сразу — её можно выбрать при выдаче.'
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
            <Button block loading={submitting} onClick={() => void submit()}>
              <IconBook className="h-4 w-4" />
              {template ? 'Сохранить изменения' : 'Сохранить в базу'}
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
          label="Файлы задания"
          htmlFor="template-files"
          hint={
            template && (template.attachments?.length ?? 0) > 0
              ? 'Выбранные файлы заменят текущие.'
              : 'Методички, шаблоны, тесты. До 5 файлов по 20 МБ.'
          }
        >
          {template && (template.attachments?.length ?? 0) > 0 ? (
            <ul className="mb-1.5 space-y-0.5">
              {(template.attachments ?? []).map((file) => (
                <li key={file.url}>
                  <a
                    href={file.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex max-w-full items-center gap-1 text-[10px] text-brand hover:underline"
                  >
                    <IconFile className="h-3 w-3 shrink-0" />
                    <span className="truncate">{file.name}</span>
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
          <input
            id="template-files"
            type="file"
            multiple
            onChange={(event) => setFiles(Array.from(event.target.files ?? []))}
            className="w-full rounded-lg border border-line2 bg-card px-3 py-2 text-xs text-ink2 file:mr-3 file:rounded-md file:border-0 file:bg-sunken file:px-2 file:py-1 file:text-xs file:text-ink2"
          />
          {files.length > 0 ? (
            <p className="mt-1 text-[10px] text-ink3">
              {files.map((file) => file.name).join(', ')}
            </p>
          ) : null}
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
