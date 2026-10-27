import { useMemo, useState } from 'react';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { ApiError, api } from '../core/api';
import { useAuth } from '../core/auth';

interface InboxPayload {
  submission_id?: number;
  task_id?: number;
  student_id?: number;
  group_id?: number;
  waiting_seconds?: number;
}

// InboxPage — живые заявки в REVIEW из WS + форма вердикта.
// Список из REST появится вместе с GET /api/reviews/inbox (Фаза 7).
export function InboxPage() {
  const { token, role, events } = useAuth();
  const [open, setOpen] = useState(false);
  const [submissionId, setSubmissionId] = useState('');
  const [verdict, setVerdict] = useState<'ACCEPT' | 'REJECT'>('ACCEPT');
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const inbox = useMemo(
    () => events.filter((event) => event.event_type === 'review.inbox.created'),
    [events],
  );

  if (role !== 'teacher' && role !== 'admin') {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-5 text-sm text-slate-400">
        Инбокс доступен преподавателю и администратору. Смените роль на экране входа.
      </div>
    );
  }

  const submit = async () => {
    setBusy(true);
    setError(null);
    setMessage(null);

    try {
      const response = await api.verdict(token, Number(submissionId), verdict, comment.trim() || undefined);
      setOpen(false);
      setMessage(
        `Карточка #${response.submission_id}: ${response.status}` +
          (response.xp_awarded ? `, +${response.xp_awarded} XP` : ''),
      );
    } catch (err) {
      setError(err instanceof ApiError ? `${err.message} (${err.code})` : 'Вердикт не применён');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-50">Инбокс</h1>
          <p className="text-sm text-slate-400">Работы, ожидающие вердикта</p>
        </div>
        <Button size="sm" onClick={() => setOpen(true)}>
          Вердикт
        </Button>
      </header>

      {message ? (
        <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">
          {message}
        </p>
      ) : null}

      {error ? (
        <p className="rounded-lg border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-200">{error}</p>
      ) : null}

      {inbox.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-800 p-4 text-sm text-slate-500">
          Новых работ нет. Сюда приходят события <code>review.inbox.created</code> в комнату
          <code> teacher:…</code>.
        </p>
      ) : (
        <ul className="space-y-2">
          {inbox.map((event) => {
            const payload = (event.payload ?? {}) as InboxPayload;

            return (
              <li
                key={event.event_id}
                className="rounded-xl border border-slate-800 bg-slate-900 p-4"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-slate-100">
                    Работа #{payload.submission_id ?? '—'}
                  </span>
                  <span className="text-xs text-slate-500">
                    ожидание {payload.waiting_seconds ?? 0} с
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-400">
                  задание {payload.task_id ?? '—'} · студент {payload.student_id ?? '—'} · группа{' '}
                  {payload.group_id ?? '—'}
                </p>
                <Button
                  size="sm"
                  variant="secondary"
                  className="mt-3"
                  onClick={() => {
                    setSubmissionId(String(payload.submission_id ?? ''));
                    setOpen(true);
                  }}
                >
                  Проверить
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      <Modal
        open={open}
        title="Вердикт"
        onClose={() => setOpen(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Отмена
            </Button>
            <Button
              loading={busy}
              variant={verdict === 'REJECT' ? 'danger' : 'primary'}
              onClick={() => void submit()}
              disabled={!submissionId || (verdict === 'REJECT' && comment.trim() === '')}
            >
              Отправить
            </Button>
          </>
        }
      >
        <label className="block space-y-1">
          <span className="text-xs uppercase tracking-wide text-slate-500">ID карточки</span>
          <input
            type="number"
            value={submissionId}
            onChange={(event) => setSubmissionId(event.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
          />
        </label>

        <div className="grid grid-cols-2 gap-2">
          <Button
            size="sm"
            variant={verdict === 'ACCEPT' ? 'primary' : 'secondary'}
            onClick={() => setVerdict('ACCEPT')}
          >
            ACCEPT
          </Button>
          <Button
            size="sm"
            variant={verdict === 'REJECT' ? 'danger' : 'secondary'}
            onClick={() => setVerdict('REJECT')}
          >
            REJECT
          </Button>
        </div>

        <label className="block space-y-1">
          <span className="text-xs uppercase tracking-wide text-slate-500">
            Комментарий {verdict === 'REJECT' ? '(обязателен)' : '(необязателен)'}
          </span>
          <textarea
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            rows={3}
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
          />
        </label>
      </Modal>
    </div>
  );
}
