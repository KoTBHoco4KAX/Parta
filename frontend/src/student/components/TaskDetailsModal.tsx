import { useState } from 'react';
import { ApiError, submitWorkFile } from '../../core/api';
import type { Submission, Task } from '../../core/types';
import { Button } from '../../components/Button';
import { FileDropzone } from '../../components/FileDropzone';
import { Modal } from '../../components/Modal';

interface TaskDetailsModalProps {
  task: Task;
  submission: Submission;
  onClose: () => void;
  onSubmitted: () => void;
}

// 20 МиБ — тот же лимит, который проверяет backend.
const MAX_FILE_BYTES = 20 * 1024 * 1024;

const STATUS_LABEL: Record<Submission['status'], string> = {
  TODO: 'К выполнению',
  IN_PROGRESS: 'В работе',
  REVIEW: 'На проверке',
  DONE: 'Готово',
  REJECTED: 'На доработке',
};

// TaskDetailsModal — полный текст задания и сдача файла без URL и SHA.
// Карточка в TODO уже переведена в IN_PROGRESS кликом по ней на доске.
export default function TaskDetailsModal({
  task,
  submission,
  onClose,
  onSubmitted,
}: TaskDetailsModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = submission.status === 'IN_PROGRESS';

  function handleFile(next: File | undefined) {
    if (!next) {
      return;
    }

    if (next.size > MAX_FILE_BYTES) {
      setFile(null);
      setError('Файл больше 20 МБ. Выберите файл поменьше.');
      return;
    }

    setError(null);
    setFile(next);
  }

  async function handleSubmit() {
    if (!file) {
      setError('Прикрепите файл работы.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      await submitWorkFile(submission.id, file);
      onSubmitted();
    } catch (cause) {
      setError(
        cause instanceof ApiError ? cause.message : 'Не удалось отправить работу.',
      );
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={task.title}
      subtitle={`${task.task_type} · до ${new Date(task.deadline_at).toLocaleDateString()}`}
      footer={
        canSubmit ? (
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose} disabled={submitting}>
              Отмена
            </Button>
            <Button onClick={() => void handleSubmit()} loading={submitting} disabled={!file}>
              Отправить на проверку
            </Button>
          </div>
        ) : (
          <div className="flex justify-end">
            <Button variant="secondary" onClick={onClose}>
              Закрыть
            </Button>
          </div>
        )
      }
    >
      <div className="space-y-4">
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-ink3">Задание</h3>
          <div className="mt-2 max-h-56 overflow-y-auto whitespace-pre-wrap rounded-xl border border-line bg-muted p-3 text-sm leading-6 text-ink2">
            {task.description_md.trim() || 'Описание задания пока не заполнено.'}
          </div>
        </section>

        <dl className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-xl bg-muted px-3 py-2">
            <dt className="text-ink3">Статус</dt>
            <dd className="mt-0.5 font-medium text-ink">{STATUS_LABEL[submission.status]}</dd>
          </div>
          <div className="rounded-xl bg-muted px-3 py-2">
            <dt className="text-ink3">За это дадут</dt>
            <dd className="mt-0.5 font-medium text-brand">{task.base_xp_computed} XP</dd>
          </div>
        </dl>

        {canSubmit ? (
          <div>
            <label className="mb-1.5 block text-xs font-medium text-ink2" htmlFor="work-file">
              Файл работы
            </label>
            <FileDropzone
              files={file ? [file] : []}
              onFiles={(next) => handleFile(next[0])}
              disabled={submitting}
              hint="Один файл до 20 МБ"
            />
            <p className="mt-1.5 text-[11px] text-ink3">
              {file
                ? `${file.name} · ${(file.size / 1024 / 1024).toFixed(1)} МБ`
                : 'Можно прикрепить один файл до 20 МБ.'}
            </p>
          </div>
        ) : null}

        {submission.status === 'TODO' ? (
          <p className="rounded-xl border border-brandLine bg-brandSoft px-3 py-2 text-xs text-brand">
            Задание берётся в работу…
          </p>
        ) : null}

        {submission.status === 'REVIEW' ? (
          <p className="rounded-xl border border-warnLine bg-warnSoft px-3 py-2 text-xs text-warn">
            Работа уже отправлена преподавателю и ждёт проверки.
          </p>
        ) : null}

        {submission.status === 'DONE' ? (
          <p className="rounded-xl border border-okLine bg-okSoft px-3 py-2 text-xs text-ok">
            Работа принята.
          </p>
        ) : null}

        {submission.status === 'REJECTED' ? (
          <p className="rounded-xl border border-badLine bg-badSoft px-3 py-2 text-xs text-bad">
            Работа отклонена. Закройте окно и откройте карточку ещё раз, чтобы вернуть её в работу.
          </p>
        ) : null}

        {error ? (
          <p role="alert" className="rounded-xl border border-badLine bg-badSoft px-3 py-2 text-xs text-bad">
            {error}
          </p>
        ) : null}
      </div>
    </Modal>
  );
}
