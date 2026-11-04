import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiFetch, ApiError } from '../../core/api';
import { Button } from '../../components/Button';

// AnswersPage — взаимопроверка «Ответы».
//
// Ученик отправляет черновик в пул, двое других учеников пишут отзывы, автор
// ставит лайк/жалобу. XP проверяющим выплачивается только после того, как
// преподаватель примет работу.

interface AnswerTask {
  submission_id: number;
  task_id: number;
  task_title: string;
  task_type: string;
  deadline_at: string;
  base_xp: number;
  escrow_percent: number;
  escrow_pool_xp: number;
  base_percent: number;
  time_bonus: number;
  spam_bonus: number;
  draft_status: string;
}

interface AnswerComment {
  id: number;
  text: string;
  reaction: 'NONE' | 'LIKE' | 'REPORT';
  payout_percent: number;
  created_at: string;
}

interface AnswerDraft {
  id: number;
  submission_id: number;
  task_id: number;
  task_title: string;
  task_type: string;
  text: string;
  attachment_name: string;
  attachment_url: string;
  escrow_percent: number;
  escrow_pool_xp: number;
  status: 'OPEN' | 'COLLECTED' | 'SETTLED' | 'CLOSED';
  created_at: string;
  comments_count: number;
  comments: AnswerComment[];
}

interface AnswerReview {
  id: number;
  draft_id: number;
  task_title: string;
  text: string;
  reaction: 'NONE' | 'LIKE' | 'REPORT';
  payout_percent: number;
  draft_status: string;
  created_at: string;
}

interface Overview {
  tasks: AnswerTask[];
  drafts: AnswerDraft[];
  reviews: AnswerReview[];
}

interface QueueDraft {
  id: number;
  task_title: string;
  task_type: string;
  text: string;
  attachment_name: string;
  attachment_url: string;
  escrow_percent: number;
  escrow_pool_xp: number;
  comments_count: number;
}

const STATUS_LABEL: Record<AnswerDraft['status'], string> = {
  OPEN: 'ждёт проверяющих',
  COLLECTED: 'собрано 2 отзыва',
  SETTLED: 'выплачено',
  CLOSED: 'закрыто',
};

const STATUS_TONE: Record<AnswerDraft['status'], string> = {
  OPEN: 'bg-sky-50 text-sky-700',
  COLLECTED: 'bg-amber-50 text-amber-700',
  SETTLED: 'bg-emerald-50 text-emerald-700',
  CLOSED: 'bg-slate-100 text-slate-500',
};

const EMPTY_OVERVIEW: Overview = { tasks: [], drafts: [], reviews: [] };

export default function AnswersPage() {
  const [overview, setOverview] = useState<Overview>(EMPTY_OVERVIEW);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setOverview(await apiFetch<Overview>('/answers'));
      setError(null);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Не удалось загрузить «Ответы».');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const freeTasks = useMemo(
    () => overview.tasks.filter((task) => task.draft_status === ''),
    [overview.tasks],
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-ink">Ответы</h1>
        <p className="mt-1 text-sm leading-relaxed text-ink3">
          Отправьте черновик на взаимопроверку, получите два отзыва и решите, был ли
          он полезен. Награда проверяющим выплачивается после приёмки работы учителем.
        </p>
      </div>

      {error ? (
        <p role="alert" className="rounded-xl border border-badLine bg-badSoft px-3 py-2 text-xs text-bad">
          {error}
        </p>
      ) : null}

      {loading ? (
        <div className="h-32 animate-pulse rounded-2xl bg-card" />
      ) : (
        <>
          <UploadDraftSection tasks={freeTasks} onUploaded={load} />
          <ReviewQueueSection onReviewed={load} />
          <MyDraftsSection drafts={overview.drafts} onChanged={load} />
          <MyReviewsSection reviews={overview.reviews} />
        </>
      )}
    </div>
  );
}

/** UploadDraftSection — выбор активного задания и загрузка черновика. */
function UploadDraftSection({ tasks, onUploaded }: { tasks: AnswerTask[]; onUploaded: () => void }) {
  const [submissionId, setSubmissionId] = useState('');
  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = tasks.find((task) => String(task.submission_id) === submissionId) ?? null;

  const hasContent = text.trim() !== '' || file !== null;

  async function upload() {
    if (!selected || !hasContent) {
      setError('Выберите задание и добавьте текст или файл.');

      return;
    }

    setBusy(true);
    setError(null);

    const form = new FormData();
    form.append('submission_id', String(selected.submission_id));

    if (text.trim() !== '') {
      form.append('text', text.trim());
    }

    if (file) {
      form.append('file', file, file.name);
    }

    try {
      await apiFetch<AnswerDraft>('/answers/drafts', { method: 'POST', body: form });
      setSubmissionId('');
      setText('');
      setFile(null);
      onUploaded();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Не удалось загрузить черновик.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-line bg-card p-4">
      <h2 className="text-sm font-semibold text-ink">Отправить черновик</h2>

      {tasks.length === 0 ? (
        <p className="mt-2 text-xs leading-relaxed text-ink3">
          Нет активных заданий. Возьмите задание в работу на канбане — оно появится здесь.
        </p>
      ) : (
        <>
          <label className="mt-3 block text-[11px] font-medium text-ink2" htmlFor="answer-task">
            Задание
          </label>
          <select
            id="answer-task"
            value={submissionId}
            onChange={(event) => setSubmissionId(event.target.value)}
            className="mt-1 w-full rounded-lg border border-line2 bg-card px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brandLine"
          >
            <option value="">Выберите задание</option>
            {tasks.map((task) => (
              <option key={task.submission_id} value={task.submission_id}>
                {task.task_title}
              </option>
            ))}
          </select>

          {selected ? (
            <div className="mt-3 rounded-xl border border-brandLine bg-brandSoft p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-medium text-brandStrong">Пул взаимопроверки</p>
                <p className="text-sm font-bold tabular-nums text-brandStrong">
                  {selected.escrow_pool_xp} XP
                </p>
              </div>
              <div className="mt-1 flex flex-wrap gap-1 text-[10px] text-brandStrong/80">
                <span>база {selected.base_percent}%</span>
                <span>+ срок {selected.time_bonus}%</span>
                <span>+ активность {selected.spam_bonus}%</span>
                <span>= {selected.escrow_percent}% от {selected.base_xp} XP</span>
              </div>
              <p className="mt-1 text-[10px] leading-relaxed text-brandStrong/70">
                Пул не списывается сейчас — он удерживается из XP за задание только при приёмке
                работы учителем.
              </p>
            </div>
          ) : null}

          <label className="mt-3 block text-[11px] font-medium text-ink2" htmlFor="answer-text">
            Текст черновика
          </label>
          <textarea
            id="answer-text"
            rows={4}
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Что уже сделано, что вызывает вопросы"
            className="mt-1 w-full rounded-lg border border-line2 bg-card px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brandLine"
          />

          <label className="mt-3 block text-[11px] font-medium text-ink2" htmlFor="answer-file">
            Файл (необязательно)
          </label>
          <input
            id="answer-file"
            type="file"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            className="mt-1 w-full rounded-lg border border-line2 bg-card px-3 py-2 text-xs text-ink2 file:mr-3 file:rounded-md file:border-0 file:bg-sunken file:px-2 file:py-1 file:text-xs"
          />

          {error ? (
            <p role="alert" className="mt-2 text-[11px] text-bad">
              {error}
            </p>
          ) : null}

          <Button
            className="mt-3 w-full"
            loading={busy}
            disabled={!hasContent || !selected}
            onClick={() => void upload()}
          >
            Загрузить на проверку
          </Button>
        </>
      )}
    </section>
  );
}

/** ReviewQueueSection — взять случайную чужую работу и написать отзыв. */
function ReviewQueueSection({ onReviewed }: { onReviewed: () => void }) {
  const [draft, setDraft] = useState<QueueDraft | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [empty, setEmpty] = useState(false);

  async function take() {
    setLoading(true);
    setError(null);
    setEmpty(false);

    try {
      const response = await apiFetch<{ draft: QueueDraft | null }>('/answers/queue/next');
      setDraft(response.draft);
      setText('');

      if (!response.draft) {
        setEmpty(true);
      }
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Не удалось получить работу.');
    } finally {
      setLoading(false);
    }
  }

  async function send() {
    if (!draft || text.trim() === '') {
      setError('Напишите комментарий.');

      return;
    }

    setBusy(true);
    setError(null);

    try {
      await apiFetch(`/answers/drafts/${draft.id}/comments`, {
        method: 'POST',
        body: { text: text.trim() },
      });
      setDraft(null);
      setText('');
      onReviewed();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Не удалось отправить отзыв.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-line bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-ink">Проверить чужую работу</h2>
        <Button size="sm" variant="secondary" loading={loading} onClick={() => void take()}>
          Взять на проверку
        </Button>
      </div>

      {empty ? (
        <p className="mt-2 text-xs text-ink3">Свободных работ нет. Загляните позже.</p>
      ) : null}

      {draft ? (
        <div className="mt-3 space-y-3">
          <div className="rounded-xl border border-line bg-muted p-3">
            <p className="text-sm font-semibold text-ink">{draft.task_title}</p>
            <p className="mt-1 text-[10px] uppercase tracking-wide text-ink4">
              пул {draft.escrow_pool_xp} XP · {draft.escrow_percent}%
            </p>
            {draft.text ? (
              <p className="mt-2 whitespace-pre-line text-[12px] leading-relaxed text-ink2">
                {draft.text}
              </p>
            ) : null}
            {draft.attachment_url ? (
              <a
                href={draft.attachment_url}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-flex text-[11px] text-brand hover:underline"
              >
                {draft.attachment_name || 'Файл работы'}
              </a>
            ) : null}
          </div>

          <textarea
            rows={4}
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Что улучшить, где ошибка, что стоит переписать"
            className="w-full rounded-lg border border-line2 bg-card px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brandLine"
          />

          {error ? (
            <p role="alert" className="text-[11px] text-bad">
              {error}
            </p>
          ) : null}

          <Button className="w-full" loading={busy} disabled={text.trim() === ''} onClick={() => void send()}>
            Отправить
          </Button>
        </div>
      ) : null}
    </section>
  );
}

/** MyDraftsSection — черновики автора и реакции на полученные отзывы. */
function MyDraftsSection({ drafts, onChanged }: { drafts: AnswerDraft[]; onChanged: () => void }) {
  const [busyId, setBusyId] = useState<number | null>(null);

  async function react(commentId: number, reaction: 'LIKE' | 'REPORT' | 'NONE') {
    setBusyId(commentId);

    try {
      await apiFetch(`/answers/comments/${commentId}/reaction`, {
        method: 'POST',
        body: { reaction },
      });
      onChanged();
    } finally {
      setBusyId(null);
    }
  }

  if (drafts.length === 0) {
    return null;
  }

  return (
    <section>
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink3">Мои черновики</h2>
      <ul className="space-y-2">
        {drafts.map((draft) => (
          <li key={draft.id} className="rounded-2xl border border-line bg-card p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-ink">{draft.task_title}</p>
                <p className="mt-0.5 text-[11px] text-ink3">
                  {draft.escrow_pool_xp} XP · {draft.escrow_percent}% от базы
                </p>
              </div>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] ${STATUS_TONE[draft.status]}`}>
                {STATUS_LABEL[draft.status]}
              </span>
            </div>

            {draft.text ? (
              <p className="mt-2 line-clamp-3 whitespace-pre-line text-[11px] leading-relaxed text-ink3">
                {draft.text}
              </p>
            ) : null}

            {draft.attachment_url ? (
              <a
                href={draft.attachment_url}
                target="_blank"
                rel="noreferrer"
                className="mt-1 inline-flex text-[11px] text-brand hover:underline"
              >
                {draft.attachment_name || 'Файл черновика'}
              </a>
            ) : null}

            {draft.comments.length > 0 ? (
              <div className="mt-3 space-y-2">
                {draft.comments.map((comment, index) => (
                  <div key={comment.id} className="rounded-xl border border-line bg-muted p-3">
                    <p className="text-[10px] uppercase tracking-wide text-ink4">
                      Отзыв {index + 1}
                    </p>
                    <p className="mt-1 whitespace-pre-line text-[12px] leading-relaxed text-ink2">
                      {comment.text}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {draft.status === 'COLLECTED' ? (
                        <>
                          <Button
                            size="sm"
                            variant={comment.reaction === 'LIKE' ? 'primary' : 'outline'}
                            loading={busyId === comment.id}
                            onClick={() =>
                              void react(comment.id, comment.reaction === 'LIKE' ? 'NONE' : 'LIKE')
                            }
                          >
                            Полезно
                          </Button>
                          <Button
                            size="sm"
                            variant={comment.reaction === 'REPORT' ? 'danger' : 'outline'}
                            loading={busyId === comment.id}
                            onClick={() =>
                              void react(comment.id, comment.reaction === 'REPORT' ? 'NONE' : 'REPORT')
                            }
                          >
                            Жалоба
                          </Button>
                        </>
                      ) : null}
                      {draft.status === 'SETTLED' ? (
                        <span className="self-center text-[10px] text-ink3">
                          доля: {comment.payout_percent}%
                        </span>
                      ) : null}
                      {draft.status === 'CLOSED' ? (
                        <span className="self-center text-[10px] text-ink3">
                          работа отклонена — выплат нет
                        </span>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-[11px] text-ink3">
                {draft.status === 'OPEN'
                  ? `Отзывов пока ${draft.comments_count}/2.`
                  : 'Отзывы появятся после второго проверяющего.'}
              </p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** MyReviewsSection — отзывы, которые ученик оставил другим. */
function MyReviewsSection({ reviews }: { reviews: AnswerReview[] }) {
  if (reviews.length === 0) {
    return null;
  }

  return (
    <section>
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink3">Мои проверки</h2>
      <ul className="space-y-2">
        {reviews.map((review) => (
          <li key={review.id} className="rounded-2xl border border-line bg-card p-3">
            <div className="flex items-start justify-between gap-2">
              <p className="min-w-0 truncate text-sm font-medium text-ink">{review.task_title}</p>
              <span className="shrink-0 text-[10px] text-ink3">
                {review.payout_percent > 0 ? `${review.payout_percent}% пула` : 'ожидает вердикта'}
              </span>
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-ink3">{review.text}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
