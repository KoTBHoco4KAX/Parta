import { useEffect, useState } from 'react';
import { ApiError } from '../../core/api';
import { downloadSubmissionAttachment, fetchSubmissionAttachments } from '../api';
import type { SubmissionAttachment, ToastData } from '../types';
import { Badge, Button, Skeleton, cn } from './ui';
import {
  IconAlert,
  IconDownload,
  IconExternal,
  IconFile,
  IconPaperclip,
  IconRefresh,
} from './icons';

/**
 * AttachmentsPanel — файлы сдачи внутри экрана проверки.
 *
 * Контракт MVP: `GET /api/attachments?submission_id=` отдаёт список, а
 * `GET /api/attachments/{id}` — 302 на внешний artifact_url. Backend не хранит
 * и не проксирует файлы, поэтому «превью» открывается в новой вкладке: это
 * честный компромисс без SSRF, а не ограничение интерфейса.
 */
export function AttachmentsPanel({
  submissionId,
  artifactUrl,
  artifactHash,
  notify,
}: {
  submissionId: number;
  artifactUrl: string;
  artifactHash: string;
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
            : 'Не удалось загрузить файлы. Проверьте соединение.',
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

  const hasArtifactLink = artifactUrl.trim() !== '';

  return (
    <section className="rounded-xl border border-line bg-muted p-3">
      <div className="flex items-center gap-2">
        <IconPaperclip className="h-4 w-4 shrink-0 text-brand" />
        <h4 className="text-xs font-semibold text-ink2">Работа студента</h4>
        {!loading && !error ? (
          <Badge tone="slate">{attachments.length}</Badge>
        ) : null}
        <button
          type="button"
          onClick={() => setReloadKey((key) => key + 1)}
          className="ml-auto rounded-lg p-1 text-ink3 transition hover:bg-sunken hover:text-ink2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand"
          aria-label="Обновить список файлов"
        >
          <IconRefresh className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
        </button>
      </div>

      {loading ? (
        <div className="mt-2 space-y-1.5">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-2/3" />
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
              className="flex items-center gap-2 rounded-lg bg-muted px-2.5 py-2"
            >
              <IconFile className="h-4 w-4 shrink-0 text-ink3" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[11px] font-medium text-ink2" title={attachmentName(attachment)}>
                  {attachmentName(attachment)}
                </p>
                <p className="text-[10px] text-ink3">
                  {formatSize(attachment.sizeBytes)} · {attachment.contentType}
                </p>
              </div>
              {attachment.url.trim() !== '' ? (
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Открыть ${attachmentName(attachment)}`}
                  onClick={() =>
                    window.open(attachment.url, '_blank', 'noopener,noreferrer')
                  }
                >
                  <IconExternal className="h-3.5 w-3.5" />
                </Button>
              ) : null}
              <Button
                variant="outline"
                size="sm"
                loading={busyId === attachment.id}
                onClick={() => void handleDownload(attachment)}
                aria-label={`Скачать ${attachmentName(attachment)}`}
              >
                <IconDownload className="h-3.5 w-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}

      {!loading && !error && attachments.length === 0 && !hasArtifactLink ? (
        <p className="mt-2 rounded-lg border border-dashed border-line2 px-2.5 py-2 text-[11px] text-ink3">
          Студент сдал работу без файла: проверьте комментарий и историю доработок.
        </p>
      ) : null}

      {hasArtifactLink ? (
        <a
          href={artifactUrl}
          target="_blank"
          rel="noreferrer noopener"
          className="mt-2 flex items-center gap-2 rounded-lg border border-line px-2.5 py-2 transition hover:border-brandLine hover:bg-brandSoft"
        >
          <IconExternal className="h-3.5 w-3.5 shrink-0 text-ink3" />
          <span className="min-w-0 flex-1 truncate font-mono text-[10px] text-ink3">
            {artifactUrl}
          </span>
          <Badge tone="sky">открыть</Badge>
        </a>
      ) : null}

      {artifactHash.trim() !== '' ? (
        <p className="mt-1.5 truncate font-mono text-[10px] text-ink3" title={artifactHash}>
          sha256: {artifactHash}
        </p>
      ) : null}

      <p className="mt-1.5 text-[10px] leading-relaxed text-ink3">
        Файл открывается в новой вкладке: хранилище вложений живёт на внешнем
        хосте, backend отдаёт редирект.
      </p>
    </section>
  );
}

/** attachmentName выбирает человекочитаемое имя: API отдаёт generic «artifact». */
function attachmentName(attachment: SubmissionAttachment): string {
  const filename = attachment.filename.trim();

  if (filename !== '' && filename !== 'artifact') {
    return filename;
  }

  try {
    const segment = new URL(attachment.url).pathname.split('/').pop();
    if (segment) {
      return decodeURIComponent(segment);
    }
  } catch {
    // Относительный или битый URL — остаётся имя из API.
  }

  return filename !== '' ? filename : `Файл ${attachment.id}`;
}

/** formatSize — размер файла без внешних зависимостей. */
function formatSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return 'размер неизвестен';
  }

  if (bytes < 1024) {
    return `${bytes} Б`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} КБ`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}
