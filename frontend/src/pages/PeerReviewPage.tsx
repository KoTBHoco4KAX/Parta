import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../core/auth';
import { apiFetch, ApiError } from '../core/api';
import type { PeerReview, Submission } from '../core/types';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';

// PeerReviewPage — взаимопроверка глазами ученика.
//
// Ученик сдаёт работу и просит проверить её другого ученика: тот ставит оценку
// 1–5 звёзд и короткий комментарий (до 100 символов), без файлов. Оценка
// занижает XP автора, а рецензент получает награду после приёмки работы
// учителем.

const COMMENT_LIMIT = 100;

const STATUS_LABEL: Record<PeerReview['status'], string> = {
  CREATED: 'Ждёт рецензента',
  IN_REVIEW: 'Проверяется',
  COMPLETED: 'Проверено',
  EXPIRED: 'Истекло',
};

export default function PeerReviewPage() {
  const { user } = useAuth();
  const [open, setOpen] = useState<PeerReview[]>([]);
  const [mine, setMine] = useState<PeerReview[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [grading, setGrading] = useState<PeerReview | null>(null);

  const load = useCallback(async () => {
    setError(null);

    try {
      const [nextOpen, nextMine, nextSubmissions] = await Promise.all([
        apiFetch<PeerReview[]>('/peer-reviews/open'),
        apiFetch<PeerReview[]>('/peer-reviews'),
        apiFetch<Submission[]>('/submissions'),
      ]);

      setOpen(nextOpen);
      setMine(nextMine);
      setSubmissions(nextSubmissions);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Не удалось загрузить взаимопроверку.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const mySubmissions = useMemo(
    () => submissions.filter((item) => item.status === 'REVIEW' || item.status === 'IN_PROGRESS'),
    [submissions],
  );

  async function requestReview(submissionId: number) {
    setBusy(submissionId);
    setError(null);

    try {
      await apiFetch<{ peer_review_id: number }>('/peer-reviews', {
        method: 'POST',
        body: { submission_id: submissionId },
      });
      await load();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Не удалось запросить проверку.');
    } finally {
      setBusy(null);
    }
  }

  async function claim(reviewId: number) {
    setBusy(reviewId);
    setError(null);

    try {
      await apiFetch(`/peer-reviews/${reviewId}/claim`, { method: 'POST' });
      await load();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Не удалось взять проверку.');
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="h-20 animate-pulse rounded-2xl bg-card" />
        <div className="h-32 animate-pulse rounded-2xl bg-card" />
      </div>
    );
  }

  const activeMine = mine.filter((review) => review.reviewer_id === user?.id);
  const free = open.filter((review) => review.author_id !== user?.id);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-ink">Взаимопроверка</h1>
        <p className="mt-0.5 text-sm text-ink3">
          Оцените работу другого ученика по 5-балльной шкале и оставьте короткий комментарий.
          Файлы не передаются — только оценка и текст.
        </p>
      </div>

      {error ? (
        <p role="alert" className="rounded-xl border border-badLine bg-badSoft px-3 py-2 text-xs text-bad">
          {error}
        </p>
      ) : null}

      <section className="rounded-2xl border border-line bg-card p-4 shadow-[var(--shadow-card)]">
        <h2 className="text-sm font-semibold text-ink">Попросить проверку</h2>
        {mySubmissions.length === 0 ? (
          <p className="mt-2 text-xs text-ink3">
            Пока нет сданных работ. Отправьте работу из канбана — она появится здесь.
          </p>
        ) : (
          <ul className="mt-2 space-y-2">
            {mySubmissions.map((submission) => (
              <li key={submission.id} className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate text-xs text-ink2">{submission.task_title}</span>
                <Button
                  size="sm"
                  variant="secondary"
                  loading={busy === submission.id}
                  onClick={() => void requestReview(submission.id)}
                >
                  Запросить
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink3">
          Доступные работы · {free.length}
        </h2>
        {free.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line px-4 py-6 text-center text-xs text-ink3">
            Свободных работ нет. Когда однокурснику нужна проверка, работа появится здесь.
          </p>
        ) : (
          <ul className="space-y-2">
            {free.map((review) => (
              <li
                key={review.id}
                className="flex items-center justify-between gap-2 rounded-2xl border border-line bg-card p-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">{review.task_title}</p>
                  <p className="text-[11px] text-ink3">
                    {review.group_code} · {review.author_name}
                  </p>
                </div>
                <Button size="sm" loading={busy === review.id} onClick={() => void claim(review.id)}>
                  Взять
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {activeMine.length > 0 ? (
        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink3">
            Ваши проверки · {activeMine.length}
          </h2>
          <ul className="space-y-2">
            {activeMine.map((review) => (
              <li key={review.id} className="rounded-2xl border border-line bg-card p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 truncate text-sm font-medium text-ink">{review.task_title}</p>
                  <span className="shrink-0 rounded-full bg-brandSoft px-2 py-0.5 text-[10px] text-brand">
                    {STATUS_LABEL[review.status]}
                  </span>
                </div>
                {review.status === 'IN_REVIEW' ? (
                  <Button size="sm" className="mt-2" onClick={() => setGrading(review)}>
                    Оценить
                  </Button>
                ) : null}
                {review.status === 'COMPLETED' ? (
                  <p className="mt-1 text-[11px] text-ink3">
                    {review.grade}★ · {review.comment} · награда +{review.reward_xp} XP после приёмки
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {mine.some((review) => review.author_id === user?.id) ? (
        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink3">
            Проверки ваших работ
          </h2>
          <ul className="space-y-2">
            {mine
              .filter((review) => review.author_id === user?.id)
              .map((review) => (
                <li
                  key={review.id}
                  className="rounded-2xl border border-line bg-card p-3 text-xs text-ink2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate">{review.task_title}</span>
                    <span className="shrink-0 text-ink3">{STATUS_LABEL[review.status]}</span>
                  </div>
                  {review.status === 'COMPLETED' && review.grade !== null ? (
                    <p className="mt-1 text-ink3">
                      {review.grade}★ · «{review.comment}» — XP за задание будет снижен по оценке.
                    </p>
                  ) : null}
                </li>
              ))}
          </ul>
        </section>
      ) : null}

      {grading ? (
        <GradeModal
          review={grading}
          onClose={() => setGrading(null)}
          onDone={() => {
            setGrading(null);
            void load();
          }}
        />
      ) : null}
    </div>
  );
}

function GradeModal({
  review,
  onClose,
  onDone,
}: {
  review: PeerReview;
  onClose: () => void;
  onDone: () => void;
}) {
  const [grade, setGrade] = useState(5);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (comment.trim() === '') {
      setError('Напишите короткий комментарий.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      await apiFetch(`/peer-reviews/${review.id}/complete`, {
        method: 'POST',
        body: { grade, comment: comment.trim().slice(0, COMMENT_LIMIT) },
      });
      onDone();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Не удалось сохранить оценку.');
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Оценить работу"
      subtitle={review.task_title}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Отмена
          </Button>
          <Button onClick={() => void submit()} loading={submitting}>
            Отправить
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <p className="mb-1.5 text-xs font-medium text-ink2">Оценка</p>
          <div className="flex items-center gap-1" role="radiogroup" aria-label="Оценка от 1 до 5">
            {[1, 2, 3, 4, 5].map((value) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={grade === value}
                aria-label={`${value} из 5`}
                onClick={() => setGrade(value)}
                className={`text-2xl leading-none transition ${
                  value <= grade ? 'text-warn' : 'text-ink4/40'
                }`}
              >
                {value <= grade ? '★' : '☆'}
              </button>
            ))}
            <span className="ml-2 text-sm font-semibold text-ink2">{grade} / 5</span>
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-ink2" htmlFor="peer-comment">
            Комментарий ({comment.length}/{COMMENT_LIMIT})
          </label>
          <textarea
            id="peer-comment"
            rows={3}
            maxLength={COMMENT_LIMIT}
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            placeholder="Коротко: что понравилось и что стоит исправить"
            className="w-full rounded-lg border border-line2 bg-card px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brandLine"
          />
        </div>

        <p className="rounded-xl bg-muted px-3 py-2 text-[11px] leading-relaxed text-ink3">
          Оценка снижает XP автора работы, а вы получите награду после того, как учитель примет
          работу.
        </p>

        {error ? (
          <p role="alert" className="rounded-xl border border-badLine bg-badSoft px-3 py-2 text-xs text-bad">
            {error}
          </p>
        ) : null}
      </div>
    </Modal>
  );
}
