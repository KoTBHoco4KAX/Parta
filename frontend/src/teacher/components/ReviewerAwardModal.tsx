import { useState } from 'react';
import { ApiError } from '../../core/api';
import { awardPeerReview, type AwardPeerReviewResult } from '../api';
import type { PeerReview } from '../types';
import { Badge, Button, Modal, cn } from './ui';
import { IconAlert, IconSparkles } from './icons';

const QUICK_AMOUNTS = [10, 20, 50] as const;
const MAX_AWARD = 1_000;

const inputClass =
  'w-full rounded-lg border border-line2 bg-page px-3 py-2 text-sm text-ink placeholder:text-ink4 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brandLine';

/**
 * ReviewerAwardModal — бонус XP ученику-рецензенту за качественную проверку.
 *
 * Начисление доступно только после COMPLETED: преподаватель не завершает ревью
 * за ученика, но может поощрить качество. Сумма ограничена разумным потолком,
 * комментарий необязателен и уходит в аудит начисления.
 */
export function ReviewerAwardModal({
  review,
  onClose,
  onAwarded,
}: {
  review: PeerReview;
  onClose: () => void;
  onAwarded: (result: AwardPeerReviewResult) => void;
}) {
  const [amount, setAmount] = useState(
    String(review.rewardAmount > 0 ? review.rewardAmount : 20),
  );
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsedAmount = Number(amount);
  const amountValid =
    Number.isFinite(parsedAmount) &&
    Number.isInteger(parsedAmount) &&
    parsedAmount > 0 &&
    parsedAmount <= MAX_AWARD;

  const reviewerLabel =
    review.reviewerName?.trim() ||
    (review.reviewerId !== null ? `Ученик #${review.reviewerId}` : 'Рецензент');

  async function handleSubmit() {
    if (!amountValid || review.reviewerId === null) {
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const result = await awardPeerReview(review.id, {
        reviewerId: review.reviewerId,
        amount: parsedAmount,
        comment,
      });

      onAwarded(result);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 404) {
        setError(
          'Сервер пока не поддерживает начисление XP за P2P-проверку (/api/peer-reviews/{id}/award).',
        );
      } else {
        setError(
          cause instanceof ApiError
            ? cause.message
            : 'Не удалось начислить XP. Проверьте соединение.',
        );
      }
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open
      size="md"
      onClose={onClose}
      title="Бонус рецензенту"
      subtitle={`P2P-ревью #${review.id} · ${review.taskTitle}`}
      footer={
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[11px] leading-relaxed text-ink3 sm:max-w-[52%]">
            {amountValid
              ? `${reviewerLabel} получит +${parsedAmount} XP. Запись попадёт в XP-журнал.`
              : `Сумма должна быть целым числом от 1 до ${MAX_AWARD}.`}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={onClose}
              disabled={submitting}
              className="flex-1 sm:flex-none"
            >
              Отмена
            </Button>
            <Button
              variant="accept"
              onClick={() => void handleSubmit()}
              disabled={!amountValid}
              loading={submitting}
              className="flex-1 sm:flex-none"
            >
              <IconSparkles className="h-4 w-4" />
              Начислить
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <section className="flex items-center gap-3 rounded-xl border border-brandLine bg-brandSoft p-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brandSoft text-brandStrong">
            <IconSparkles className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-ink">
              {reviewerLabel}
            </p>
            <p className="mt-0.5 text-[11px] text-ink3">
              {review.groupCode} · чек-лист {review.checklistResults.length}/
              {review.checklist.length} · базовая награда {review.rewardAmount} XP
            </p>
          </div>
          <Badge tone="emerald" className="ml-auto shrink-0">
            COMPLETED
          </Badge>
        </section>

        <div>
          <div className="flex items-baseline justify-between gap-2">
            <label
              htmlFor="award-amount"
              className="text-xs font-medium text-ink2"
            >
              Сколько XP начислить
              <span className="ml-0.5 text-bad" aria-hidden="true">
                *
              </span>
            </label>
            <span className="text-[10px] text-ink3">1–{MAX_AWARD}</span>
          </div>
          <input
            id="award-amount"
            type="number"
            min={1}
            max={MAX_AWARD}
            step={1}
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            className={cn('mt-1.5', inputClass, !amountValid && 'border-bad')}
          />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {QUICK_AMOUNTS.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setAmount(String(value))}
                aria-pressed={parsedAmount === value}
                className={cn(
                  'rounded-lg px-2.5 py-1 text-[11px] font-medium transition',
                  parsedAmount === value
                    ? 'bg-brandSoft text-brandStrong'
                    : 'bg-sunken text-ink2 hover:bg-line2',
                )}
              >
                +{value} XP
              </button>
            ))}
            {review.rewardAmount > 0 ? (
              <button
                type="button"
                onClick={() => setAmount(String(review.rewardAmount))}
                aria-pressed={parsedAmount === review.rewardAmount}
                className={cn(
                  'rounded-lg px-2.5 py-1 text-[11px] font-medium transition',
                  parsedAmount === review.rewardAmount
                    ? 'bg-brandSoft text-brandStrong'
                    : 'bg-sunken text-ink2 hover:bg-line2',
                )}
              >
                как в сессии · {review.rewardAmount}
              </button>
            ) : null}
          </div>
        </div>

        <div>
          <div className="flex items-baseline justify-between gap-2">
            <label
              htmlFor="award-comment"
              className="text-xs font-medium text-ink2"
            >
              Комментарий
            </label>
            <span className="text-[10px] tabular-nums text-ink3">
              {comment.length}/300
            </span>
          </div>
          <textarea
            id="award-comment"
            rows={3}
            maxLength={300}
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            placeholder="Например: подробный разбор ошибок и корректный чек-лист."
            className={cn('mt-1.5 resize-none', inputClass)}
          />
          <p className="mt-1 text-[11px] text-ink3">
            Необязательно: комментарий помогает разобрать спорные начисления.
          </p>
        </div>

        {error ? (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-xl border border-badLine bg-badSoft p-3 text-xs text-bad"
          >
            <IconAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
