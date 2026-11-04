import { useEffect, useState } from 'react';
import { ApiError } from '../../core/api';
import { downloadSubmissionAttachment, fetchSubmissionAttachments } from '../api';
import type { SubmissionAttachment, ToastData } from '../types';
import { Button, Skeleton } from './ui';
import { IconAlert, IconDownload, IconFile, IconPaperclip } from './icons';

/**
 * AttachmentsPanel — файл, который ученик приложил к сдаче.
 *
 * Показываем только имя файла и кнопку скачивания: преподавателю не нужны
 * технические детали хранилища (пути, хеши, content-type). Список грузится
 * один раз — после отправки работы файл уже не меняется.
 */
export function AttachmentsPanel({
  submissionId,
  notify,
}: {
  submissionId: number;
  notify?: (toast: Omit<ToastData, 'id'>) => void;
}) {
  const [attachments, setAttachments] = useState<SubmissionAttachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    setError(null);

    fetchSubmissionAttachments(submissionId)
      .then((items) => {
        if (cancelled) {
          return;
        }

        setAttachments(items);
        setLoading(false);
      })
      .catch((cause: unknown) => {
        if (cancelled) {
          return;
        }

        setError(
          cause instanceof ApiError
            ? cause.message
            : 'Не удалось загрузить файл. Проверьте соединение.',
        );
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [submissionId, reloadKey]);

  async function handleDownload(attachment: SubmissionAttachment) {
    setBusyId(attachment.id);

    try {
      await downloadSubmissionAttachment(attachment);
      notify?.({ tone: 'success', title: 'Файл скачан', description: attachmentName(attachment) });
    } catch (cause) {
      notify?.({
        tone: 'error',
        title: 'Не удалось скачать файл',
        description:
          cause instanceof ApiError ? cause.message : 'Проверьте соединение и повторите.',
      });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="rounded-xl border border-line bg-muted p-3">
      <div className="flex items-center gap-2">
        <IconPaperclip className="h-4 w-4 shrink-0 text-brand" />
        <h4 className="text-xs font-semibold text-ink2">Файл работы</h4>
      </div>

      {loading ? (
        <div className="mt-2">
          <Skeleton className="h-11 w-full" />
        </div>
      ) : null}

      {!loading && error ? (
        <div
          role="alert"
          className="mt-2 flex items-start gap-2 rounded-lg border border-warnLine bg-warnSoft px-2.5 py-2 text-[11px] leading-relaxed text-warn"
        >
          <IconAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <div className="flex-1">
            <p>{error}</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-1.5"
              onClick={() => setReloadKey((key) => key + 1)}
            >
              Повторить
            </Button>
          </div>
        </div>
      ) : null}

      {!loading && !error && attachments.length > 0 ? (
        <ul className="mt-2 space-y-1.5">
          {attachments.map((attachment) => (
            <li
              key={attachment.id}
              className="flex items-center gap-2 rounded-lg border border-line bg-card px-3 py-2"
            >
              <IconFile className="h-4 w-4 shrink-0 text-ink3" />
              <p
                className="min-w-0 flex-1 truncate text-[12px] font-medium text-ink2"
                title={attachmentName(attachment)}
              >
                {attachmentName(attachment)}
              </p>
              <Button
                variant="outline"
                size="sm"
                loading={busyId === attachment.id}
                onClick={() => void handleDownload(attachment)}
                aria-label={`Скачать ${attachmentName(attachment)}`}
              >
                <IconDownload className="h-3.5 w-3.5" />
                Скачать
              </Button>
            </li>
          ))}
        </ul>
      ) : null}

      {!loading && !error && attachments.length === 0 ? (
        <p className="mt-2 rounded-lg border border-dashed border-line2 px-2.5 py-2 text-[11px] text-ink3">
          Ученик сдал работу без файла.
        </p>
      ) : null}
    </section>
  );
}

/**
 * attachmentName — человекочитаемое имя файла.
 *
 * Backend отдаёт generic «artifact», поэтому имя восстанавливаем из URL:
 * `submission-{id}-{nano}-{original}` → `{original}`.
 */
function attachmentName(attachment: SubmissionAttachment): string {
  const filename = attachment.filename.trim();

  if (filename !== '' && filename !== 'artifact') {
    return filename;
  }

  const clean = attachment.url.split('?')[0].split('#')[0];
  const segment = clean.split('/').filter(Boolean).pop() ?? '';

  if (segment === '') {
    return 'Файл работы';
  }

  let decoded = segment;

  try {
    decoded = decodeURIComponent(segment);
  } catch {
    // Битую кодировку оставляем как есть.
  }

  return decoded.replace(/^submission-\d+-\d+-/, '') || decoded;
}
