import { useEffect, useState } from 'react';
import { ApiError } from '../../core/api';
import {
  downloadSubmissionAttachment,
  fetchSubmissionAttachments,
} from '../api';
import type { SubmissionAttachment } from '../types';
import { Badge, Button, Skeleton, cn } from './ui';
import {
  IconAlert,
  IconDownload,
  IconExternal,
  IconFile,
  IconPaperclip,
  IconRefresh,
} from './icons';

// formatSize — человекочитаемый размер файла без внешних зависимостей.
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

/**
 * AttachmentList — вложения сдачи и их скачивание через /api/attachments.
 *
 * Показывает три состояния (loading / error / empty) и всегда оставляет
 * fallback-ссылку на artifact_url: даже если backend ещё не отдаёт вложения,
 * преподаватель не теряет доступ к работе.
 */
export function AttachmentList({
  submissionId,
  artifactUrl,
  artifactHash,
}: {
  submissionId: number;
  artifactUrl: string;
  artifactHash: string;
}) {
  const [attachments, setAttachments] = useState<SubmissionAttachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

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

        if (cause instanceof ApiError && cause.status === 404) {
          setError('Сервер пока не отдаёт список файлов через /api/attachments.');
        } else {
          setError(
            cause instanceof ApiError
              ? cause.message
              : 'Не удалось загрузить вложения. Проверьте соединение.',
          );
        }
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [submissionId, reloadKey]);

  async function handleDownload(attachment: SubmissionAttachment) {
    setDownloadingId(attachment.id);
    setDownloadError(null);

    try {
      await downloadSubmissionAttachment(attachment);
    } catch (cause) {
      setDownloadError(
        cause instanceof ApiError
          ? cause.message
          : 'Не удалось скачать файл. Проверьте соединение.',
      );
    } finally {
      setDownloadingId(null);
    }
  }

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
      <div className="flex items-center gap-2">
        <IconPaperclip className="h-4 w-4 shrink-0 text-emerald-400" />
        <h4 className="text-xs font-semibold text-slate-300">Файлы сдачи</h4>
        {!loading && !error ? (
          <Badge tone="slate" className="ml-0.5">
            {attachments.length}
          </Badge>
        ) : null}
        <button
          type="button"
          onClick={() => setReloadKey((key) => key + 1)}
          className="ml-auto rounded-lg p-1 text-slate-400 transition hover:bg-slate-800 hover:text-slate-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-500"
          aria-label="Обновить список файлов"
        >
          <IconRefresh className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
        </button>
      </div>

      {loading ? (
        <div className="mt-2 space-y-1.5">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-3/4" />
        </div>
      ) : null}

      {!loading && error ? (
        <div
          role="alert"
          className="mt-2 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-2 text-[11px] leading-relaxed text-amber-200"
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

      {!loading && !error && attachments.length === 0 ? (
        <p className="mt-2 rounded-lg border border-dashed border-slate-700 px-2.5 py-2 text-[11px] text-slate-400">
          Студент не прикрепил файлы к этой сдаче.
        </p>
      ) : null}

      {!loading && !error && attachments.length > 0 ? (
        <ul className="mt-2 space-y-1.5">
          {attachments.map((attachment) => (
            <li
              key={attachment.id}
              className="flex items-center gap-2 rounded-lg bg-slate-950/60 px-2.5 py-2"
            >
              <IconFile className="h-4 w-4 shrink-0 text-slate-400" />
              <div className="min-w-0 flex-1">
                <p
                  className="truncate text-[11px] font-medium text-slate-200"
                  title={attachment.filename}
                >
                  {attachment.filename}
                </p>
                <p className="text-[10px] text-slate-500">
                  {formatSize(attachment.sizeBytes)}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void handleDownload(attachment)}
                loading={downloadingId === attachment.id}
                aria-label={`Скачать ${attachment.filename}`}
              >
                <IconDownload className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Скачать</span>
              </Button>
            </li>
          ))}
        </ul>
      ) : null}

      {downloadError ? (
        <p role="alert" className="mt-2 text-[11px] text-rose-300">
          {downloadError}
        </p>
      ) : null}

      {artifactUrl.trim() !== '' ? (
        <a
          href={artifactUrl}
          target="_blank"
          rel="noreferrer noopener"
          className="mt-2 flex items-center gap-2 rounded-lg border border-slate-800 px-2.5 py-2 transition hover:border-emerald-500/40 hover:bg-emerald-500/10"
        >
          <IconExternal className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          <span className="min-w-0 flex-1 truncate font-mono text-[10px] text-slate-400">
            {artifactUrl}
          </span>
        </a>
      ) : null}

      {artifactHash.trim() !== '' ? (
        <p
          className="mt-1.5 truncate font-mono text-[10px] text-slate-500"
          title={artifactHash}
        >
          {artifactHash}
        </p>
      ) : null}
    </section>
  );
}
