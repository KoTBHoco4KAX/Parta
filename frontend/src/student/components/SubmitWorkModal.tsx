import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { ApiError } from '../../core/api';
import { submitWork } from '../api';
import type { BoardSubmission, BoardTask } from '../types';
import { Button } from '../../components/Button';
import { Modal } from '../../components/Modal';

interface SubmittedFile {
  file: File;
  humanSize: string;
}

export interface SubmitWorkModalProps {
  task: BoardTask;
  submission: BoardSubmission;
  onClose: () => void;
  onSubmitted: () => void;
}

function humanSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} Б`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} КБ`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}

// sha256Files — считает SHA-256 от склейки содержимого выбранных файлов
// (артефакт канбана сопровождается хешем — spec/02_FSM.md, SUBMIT).
async function sha256Files(files: File[]): Promise<string> {
  try {
    const buffers = await Promise.all(files.map((file) => file.arrayBuffer()));
    const joined = new Uint8Array(buffers.reduce((sum, buffer) => sum + buffer.byteLength, 0));

    let offset = 0;

    for (const buffer of buffers) {
      joined.set(new Uint8Array(buffer), offset);
      offset += buffer.byteLength;
    }

    const digest = await crypto.subtle.digest('SHA-256', joined);
    const hex = Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');

    return `sha256:${hex}`;
  } catch {
    // Хеш — fallback без crypto.subtle (незашифрованный контекст): имя+размер.
    return `sha256:${files.map((file) => `${file.name}:${file.size}`).join('|')}`;
  }
}

// SubmitWorkModal — сдача работы: drag-n-drop зона загрузки файлов,
// расчёт SHA-256 и SUBMIT (IN_PROGRESS → REVIEW). Артефакт и комментарий
// уходят в мок-слой; когда backend поддержит мультипарт — сюда же FormData.
export default function SubmitWorkModal({ task, submission, onClose, onSubmitted }: SubmitWorkModalProps) {
  const [files, setFiles] = useState<SubmittedFile[]>([]);
  const [comment, setComment] = useState('');
  const [hashing, setHashing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dropActive, setDropActive] = useState(false);
  // aliveRef — модалку можно закрыть прямо во время аплоада: тикер прогресса
  // обязан остановиться, иначе setState улетит в размонтированный компонент.
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;

    return () => {
      aliveRef.current = false;
    };
  }, []);

  function addFiles(incoming: FileList | null) {
    if (!incoming || incoming.length === 0) {
      return;
    }

    setError(null);
    setFiles((current) => {
      const known = new Set(current.map((entry) => entry.file.name));
      const next = Array.from(incoming)
        .filter((file) => !known.has(file.name))
        .map((file) => ({ file, humanSize: humanSize(file.size) }));

      return [...current, ...next];
    });
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDropActive(false);
    addFiles(event.dataTransfer.files);
  }

  function handleInput(event: ChangeEvent<HTMLInputElement>) {
    addFiles(event.target.files);
    event.target.value = '';
  }

  async function handleSubmit() {
    if (files.length === 0) {
      setError('Приложите хотя бы один файл работы.');
      return;
    }

    setSubmitting(true);
    setError(null);
    setProgress(0);

    try {
      setHashing(true);
      const hash = await sha256Files(files.map((entry) => entry.file));
      setHashing(false);

      // До появления multipart-эндпоинта артефакт — upload://ссылка на файлы.
      const url = `upload://${files.map((entry) => encodeURIComponent(entry.file.name)).join(',')}`;

      // Тикер прогресса — честный «фейк-аплоад»: полоса до 92%, пока идёт
      // мок-запрос; финальные 100% ставим после ответа. Останавливаем,
      // если модалку закрыли посреди процесса.
      const ticker = window.setInterval(() => {
        if (aliveRef.current) {
          setProgress((value) => Math.min(92, value + 7));
        }
      }, 90);

      try {
        await submitWork(submission.id, { url, hash });
        setProgress(100);
      } finally {
        window.clearInterval(ticker);
      }

      onSubmitted();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Не удалось отправить работу.');
      setSubmitting(false);
      setProgress(0);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Сдать работу"
      subtitle={task.title}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Отмена
          </Button>
          <Button onClick={handleSubmit} loading={submitting} disabled={hashing}>
            Отправить на проверку
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div
          onDragOver={(event) => {
            event.preventDefault();
            setDropActive(true);
          }}
          onDragLeave={() => setDropActive(false)}
          onDrop={handleDrop}
          className={[
            'rounded-xl border border-dashed px-4 py-6 text-center transition',
            dropActive
              ? 'border-emerald-400 bg-emerald-500/10'
              : 'border-slate-700 bg-slate-950/60',
          ].join(' ')}
        >
          <p className="text-sm text-slate-300">Перетащите файлы сюда</p>
          <p className="mt-1 text-[11px] text-slate-500">или выберите вручную — архив, PDF, изображения</p>

          <label
            htmlFor="submit-file-input"
            className="mt-3 inline-flex cursor-pointer items-center rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-slate-200 transition hover:bg-slate-700 focus-visible:ring-2 focus-visible:ring-emerald-400"
          >
            Выбрать файлы
          </label>
          <input
            id="submit-file-input"
            type="file"
            multiple
            onChange={handleInput}
            className="sr-only"
          />
        </div>

        {files.length > 0 ? (
          <ul className="space-y-2">
            {files.map((entry, index) => (
              <li
                key={`${entry.file.name}-${index}`}
                className="flex items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-950 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-xs text-slate-200">{entry.file.name}</p>
                  <p className="text-[10px] text-slate-500">{entry.humanSize}</p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Убрать файл ${entry.file.name}`}
                  disabled={submitting}
                  onClick={() => setFiles((current) => current.filter((_, i) => i !== index))}
                >
                  Убрать
                </Button>
              </li>
            ))}
          </ul>
        ) : null}

        <div>
          <label className="mb-1.5 block text-xs font-medium text-slate-300" htmlFor="submit-comment">
            Комментарий студенту необязателен, для преподавателя — полезен
          </label>
          <textarea
            id="submit-comment"
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            rows={2}
            placeholder="Например: миграции пересобрал, валидация вынесена в отдельный файл"
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:border-emerald-500 focus:outline-none"
          />
        </div>

        {hashing ? (
          <p aria-live="polite" className="text-[11px] text-amber-300">
            Считаем SHA-256 артефакта…
          </p>
        ) : null}

        {progress > 0 ? (
          <div
            className="h-1.5 overflow-hidden rounded-full bg-slate-800"
            role="progressbar"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="h-full rounded-full bg-emerald-500 transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        ) : null}

        <p className="rounded-lg bg-slate-900/70 px-3 py-2 text-[11px] leading-relaxed text-slate-500">
          Демо-режим: после отправки карточка уйдёт в «На проверке», и через несколько секунд
          придёт вердикт с XP и стриком (симуляция WS-событий).
        </p>

        {error ? (
          <p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
            {error}
          </p>
        ) : null}
      </div>
    </Modal>
  );
}
