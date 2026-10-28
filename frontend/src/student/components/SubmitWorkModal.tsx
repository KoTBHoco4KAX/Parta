import { useState } from 'react';
import { ApiError, moveSubmission } from '../../core/api';
import { Button } from '../../components/Button';
import { Modal } from '../../components/Modal';

interface SubmitWorkModalProps {
  submissionId: number;
  taskTitle: string;
  initialUrl?: string;
  initialHash?: string;
  onClose: () => void;
  onSubmitted: () => void;
}

async function sha256(file: File): Promise<string> {
  try {
    const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
    const hex = Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');

    return `sha256:${hex}`;
  } catch {
    return `sha256:${file.name}:${file.size}`;
  }
}

// SubmitWorkModal — отправка артефакта: IN_PROGRESS → REVIEW через PATCH status.
export default function SubmitWorkModal({
  submissionId,
  taskTitle,
  initialUrl = '',
  initialHash = '',
  onClose,
  onSubmitted,
}: SubmitWorkModalProps) {
  const [artifactUrl, setArtifactUrl] = useState(initialUrl);
  const [artifactHash, setArtifactHash] = useState(initialHash);
  const [fileName, setFileName] = useState('');
  const [hashing, setHashing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File | undefined) {
    if (!file) {
      return;
    }

    setFileName(file.name);
    setArtifactUrl(`upload://${encodeURIComponent(file.name)}`);
    setHashing(true);

    try {
      setArtifactHash(await sha256(file));
    } finally {
      setHashing(false);
    }
  }

  async function handleSubmit() {
    if (artifactUrl.trim() === '' || artifactHash.trim() === '') {
      setError('Укажите ссылку на артефакт и его хеш.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      await moveSubmission(submissionId, 'SUBMIT', {
        url: artifactUrl.trim(),
        hash: artifactHash.trim(),
      });
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
      title="Сдать работу"
      subtitle={taskTitle}
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
        <div>
          <label className="mb-1.5 block text-xs font-medium text-slate-300">
            Файл работы
          </label>
          <input
            type="file"
            onChange={(event) => void handleFile(event.target.files?.[0])}
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-300 file:mr-3 file:rounded-md file:border-0 file:bg-slate-800 file:px-2 file:py-1 file:text-xs file:text-slate-200"
          />
          {fileName ? (
            <p className="mt-1 text-[11px] text-slate-500">
              {fileName}
              {hashing ? ' · считаем SHA-256…' : ''}
            </p>
          ) : null}
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-slate-300" htmlFor="artifact-url">
            Ссылка на артефакт
          </label>
          <input
            id="artifact-url"
            value={artifactUrl}
            onChange={(event) => setArtifactUrl(event.target.value)}
            placeholder="https://… или upload://файл"
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:border-emerald-500 focus:outline-none"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-slate-300" htmlFor="artifact-hash">
            SHA-256
          </label>
          <input
            id="artifact-hash"
            value={artifactHash}
            onChange={(event) => setArtifactHash(event.target.value)}
            placeholder="sha256:…"
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-xs text-slate-100 placeholder:text-slate-600 focus:border-emerald-500 focus:outline-none"
          />
        </div>

        {error ? (
          <p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
            {error}
          </p>
        ) : null}
      </div>
    </Modal>
  );
}
