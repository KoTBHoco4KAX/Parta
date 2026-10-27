import { useState } from 'react';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { ApiError, api } from '../core/api';
import { useAuth } from '../core/auth';
import type { SubmissionStatus } from '../core/types';

const COLUMNS: { status: SubmissionStatus; title: string; hint: string }[] = [
  { status: 'TODO', title: 'TODO', hint: 'Задача взята в очередь' },
  { status: 'IN_PROGRESS', title: 'В работе', hint: 'START' },
  { status: 'REVIEW', title: 'На проверке', hint: 'SUBMIT' },
  { status: 'DONE', title: 'Готово', hint: 'ACCEPT' },
  { status: 'REJECTED', title: 'На доработке', hint: 'REJECT → REOPEN' },
];

const EVENTS = [
  { value: 'START', label: 'START — взять в работу' },
  { value: 'SUBMIT', label: 'SUBMIT — отправить на проверку' },
  { value: 'REOPEN', label: 'REOPEN — вернуть в работу' },
] as const;

// BoardPage — каркас канбана: колонки FSM и действия над карточкой по id.
// Список заданий/карточек появится с read-эндпоинтами Фазы 7.
export function BoardPage() {
  const { token } = useAuth();
  const [createOpen, setCreateOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [taskId, setTaskId] = useState('');
  const [slotId, setSlotId] = useState('');
  const [submissionId, setSubmissionId] = useState('');
  const [event, setEvent] = useState<(typeof EVENTS)[number]['value']>('START');
  const [artifactUrl, setArtifactUrl] = useState('');
  const [artifactHash, setArtifactHash] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (action: () => Promise<string>) => {
    setBusy(true);
    setError(null);
    setMessage(null);

    try {
      setMessage(await action());
    } catch (err) {
      setError(err instanceof ApiError ? `${err.message} (${err.code})` : 'Запрос не выполнен');
    } finally {
      setBusy(false);
    }
  };

  const createCard = () =>
    run(async () => {
      const response = await api.createSubmission(
        token,
        Number(taskId),
        slotId.trim() === '' ? undefined : Number(slotId),
      );
      setCreateOpen(false);
      return `Карточка #${response.submission_id} в статусе ${response.status}`;
    });

  const moveCard = () =>
    run(async () => {
      const artifact =
        event === 'SUBMIT' ? { url: artifactUrl.trim(), hash: artifactHash.trim() } : undefined;
      const response = await api.moveStatus(token, Number(submissionId), event, artifact);
      setMoveOpen(false);
      return `Карточка #${response.submission_id}: ${response.status}`;
    });

  return (
    <div className="space-y-4">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-50">Канбан</h1>
          <p className="text-sm text-slate-400">Конвейер практических заданий</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={() => setCreateOpen(true)}>
            + Карточка
          </Button>
          <Button size="sm" onClick={() => setMoveOpen(true)}>
            Двинуть
          </Button>
        </div>
      </header>

      {message ? (
        <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">
          {message}
        </p>
      ) : null}

      {error ? (
        <p className="rounded-lg border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-200">{error}</p>
      ) : null}

      <div className="flex gap-3 overflow-x-auto pb-2">
        {COLUMNS.map((column) => (
          <section
            key={column.status}
            className="flex min-h-[18rem] w-40 shrink-0 flex-col rounded-xl border border-slate-800 bg-slate-900/60 p-3"
          >
            <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-400">{column.title}</h2>
            <p className="mt-1 text-[11px] text-slate-600">{column.hint}</p>
            <div className="mt-3 flex flex-1 items-center justify-center rounded-lg border border-dashed border-slate-800 text-center text-[11px] text-slate-600">
              Нет данных API чтения
            </div>
          </section>
        ))}
      </div>

      <Modal
        open={createOpen}
        title="Новая карточка"
        onClose={() => setCreateOpen(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              Отмена
            </Button>
            <Button loading={busy} onClick={() => void createCard()} disabled={!taskId}>
              Создать
            </Button>
          </>
        }
      >
        <Field label="ID задания" value={taskId} onChange={setTaskId} type="number" />
        <Field
          label="ID командного слота (необязательно)"
          value={slotId}
          onChange={setSlotId}
          type="number"
        />
        <p className="text-xs text-slate-500">
          Задание должно быть PUBLISHED и назначено вашей группе; для слота нужен статус CLAIMED.
        </p>
      </Modal>

      <Modal
        open={moveOpen}
        title="Двинуть карточку"
        onClose={() => setMoveOpen(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setMoveOpen(false)}>
              Отмена
            </Button>
            <Button
              loading={busy}
              onClick={() => void moveCard()}
              disabled={!submissionId || (event === 'SUBMIT' && (!artifactUrl || !artifactHash))}
            >
              Применить
            </Button>
          </>
        }
      >
        <Field label="ID карточки" value={submissionId} onChange={setSubmissionId} type="number" />
        <label className="block space-y-1">
          <span className="text-xs uppercase tracking-wide text-slate-500">Событие</span>
          <select
            value={event}
            onChange={(changeEvent) => setEvent(changeEvent.target.value as typeof event)}
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
          >
            {EVENTS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>

        {event === 'SUBMIT' ? (
          <>
            <Field label="Ссылка на артефакт" value={artifactUrl} onChange={setArtifactUrl} />
            <Field label="SHA-256 артефакта" value={artifactHash} onChange={setArtifactHash} />
          </>
        ) : null}
      </Modal>
    </div>
  );
}

interface FieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: 'text' | 'number';
}

function Field({ label, value, onChange, type = 'text' }: FieldProps) {
  return (
    <label className="block space-y-1">
      <span className="text-xs uppercase tracking-wide text-slate-500">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600"
      />
    </label>
  );
}
