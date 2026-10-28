import { useEffect, useRef, useState } from 'react';
import type { ReviewInboxItem, Verdict, VerdictResult } from '../types';
import {
  formatDateTime,
  formatDeadline,
} from '../lib/format';
import {
  computeFinalXP,
  computeSpeedrunMultiplier,
  describeMultiplier,
} from '../lib/xp';
import { TASK_TYPE_LABEL } from '../lib/labels';
import { issueVerdict } from '../api';
import { ApiError } from '../../core/api';
import { AttachmentList } from './AttachmentList';
import { Badge, Button, Modal, cn } from './ui';
import {
  IconAlert,
  IconCheck,
  IconLock,
  IconX,
} from './icons';

/**
 * Модалка вердикта: единственное место, где преподаватель двигает карточку
 * REVIEW → DONE/REJECTED. XP и стрик не редактируются руками — показывается
 * только предпросмотр того, что посчитает сервер (spec/03_MATH.md §2).
 */
export function VerdictModal({
  item,
  onClose,
  onIssued,
}: {
  item: ReviewInboxItem;
  onClose: () => void;
  onIssued: (result: VerdictResult, item: ReviewInboxItem) => void;
}) {
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const commentRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (verdict === 'REJECT') {
      commentRef.current?.focus();
      commentRef.current?.scrollIntoView({ block: 'center' });
    }
  }, [verdict]);

  const submittedAt = new Date(item.submittedAt).getTime();
  const deadlineAt = new Date(item.deadlineAt).getTime();
  const onTime = submittedAt <= deadlineAt;
  const multiplier = computeSpeedrunMultiplier(
    item.submittedAt,
    item.deadlineAt,
    item.speedrunWindowHours,
  );
  const previewXP = computeFinalXP(item.baseXP, multiplier);
  const rejectRequiresComment = verdict === 'REJECT';
  const rejectMissingComment = rejectRequiresComment && comment.trim().length === 0;
  const canSubmit = verdict !== null && !rejectMissingComment;

  async function handleSubmit() {
    if (!verdict || !canSubmit) {
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const result = await issueVerdict({
        submissionId: item.id,
        verdict,
        comment: comment.trim(),
      });

      onIssued(result, item);
    } catch (cause) {
      setError(
        cause instanceof ApiError
          ? cause.message
          : 'Не удалось отправить вердикт. Попробуйте ещё раз.',
      );
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open
      size="lg"
      onClose={onClose}
      title={`Вердикт · работа #${item.id}`}
      subtitle={`${item.studentName} · ${item.groupCode}`}
      footer={
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p
            className={cn(
              'text-[11px] leading-relaxed sm:max-w-[52%]',
              rejectMissingComment ? 'text-rose-400' : 'text-slate-400',
            )}
          >
            {verdict === 'ACCEPT'
              ? `DONE — терминальный статус. Студент получит +${previewXP} XP, карточка покинет инбокс.`
              : verdict === 'REJECT'
                ? rejectMissingComment
                  ? 'Введите комментарий: без него отклонение недоступно.'
                  : 'Работа вернётся студенту, комментарий попадёт в revision_log.'
                : 'Выберите вердикт, чтобы продолжить.'}
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
              variant={verdict === 'REJECT' ? 'reject' : 'accept'}
              onClick={handleSubmit}
              disabled={!canSubmit}
              loading={submitting}
              className="flex-1 sm:flex-none"
            >
              {verdict === 'REJECT' ? 'Отклонить работу' : 'Принять работу'}
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-5">
        {/* Работа и артефакт */}
        <section>
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone="indigo">{TASK_TYPE_LABEL[item.taskType]}</Badge>
            {item.teamSlotRole ? (
              <Badge tone="violet">слот {item.teamSlotRole}</Badge>
            ) : null}
            {item.attempt > 1 ? <Badge tone="amber">попытка {item.attempt}</Badge> : null}
            <Badge tone={onTime ? 'emerald' : 'rose'}>
              {onTime ? 'сдано вовремя' : 'сдано после дедлайна'}
            </Badge>
          </div>

          <h3 className="mt-2 text-sm font-semibold leading-snug text-slate-100">
            {item.taskTitle}
          </h3>

          <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 rounded-xl bg-slate-900 p-3 text-[11px]">
            <div>
              <dt className="text-slate-400">Сдано</dt>
              <dd className="mt-0.5 font-medium text-slate-200">
                {formatDateTime(item.submittedAt)}
              </dd>
            </div>
            <div>
              <dt className="text-slate-400">Дедлайн</dt>
              <dd className="mt-0.5 font-medium text-slate-200">
                {formatDateTime(item.deadlineAt)}
              </dd>
            </div>
            <div>
              <dt className="text-slate-400">База</dt>
              <dd className="mt-0.5 font-medium text-slate-200">{item.baseXP} XP</dd>
            </div>
            <div>
              <dt className="text-slate-400">Дедлайн сейчас</dt>
              <dd className="mt-0.5 font-medium text-slate-200">
                {formatDeadline(item.deadlineAt, Date.now())}
              </dd>
            </div>
          </dl>

          <div className="mt-3">
            <AttachmentList
              submissionId={item.id}
              artifactUrl={item.artifactUrl}
              artifactHash={item.artifactHash}
            />
          </div>
        </section>

        {/* Журнал доработок */}
        {item.revisions.length > 0 ? (
          <section>
            <h4 className="text-xs font-semibold text-slate-300">
              Предыдущие доработки
            </h4>
            <ul className="mt-2 space-y-2">
              {item.revisions.map((revision, index) => (
                <li
                  key={`${revision.at}-${index}`}
                  className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2"
                >
                  <div className="flex items-center justify-between gap-2 text-[11px]">
                    <span className="text-rose-200/70">{formatDateTime(revision.at)}</span>
                    <Badge tone="rose">отклонено</Badge>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-rose-100">
                    {revision.comment}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {/* Выбор вердикта */}
        <section>
          <h4 className="text-xs font-semibold text-slate-300">Вердикт</h4>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setVerdict('ACCEPT')}
              aria-pressed={verdict === 'ACCEPT'}
              className={cn(
                'flex items-center gap-3 rounded-2xl border p-3 text-left transition',
                verdict === 'ACCEPT'
                  ? 'border-emerald-500 bg-emerald-500/10 ring-2 ring-emerald-500/20'
                  : 'border-slate-800 bg-slate-900 hover:border-emerald-500/40 hover:bg-emerald-500/10',
              )}
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
                <IconCheck className="h-5 w-5" />
              </span>
              <span>
                <span className="block text-sm font-semibold text-slate-100">Принять</span>
                <span className="block text-[11px] text-slate-400">
                  REVIEW → DONE · XP и стрик
                </span>
              </span>
            </button>

            <button
              type="button"
              onClick={() => setVerdict('REJECT')}
              aria-pressed={verdict === 'REJECT'}
              className={cn(
                'flex items-center gap-3 rounded-2xl border p-3 text-left transition',
                verdict === 'REJECT'
                  ? 'border-rose-500 bg-rose-500/10 ring-2 ring-rose-500/20'
                  : 'border-slate-800 bg-slate-900 hover:border-rose-300 hover:bg-rose-500/10',
              )}
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-rose-500 text-white">
                <IconX className="h-5 w-5" />
              </span>
              <span>
                <span className="block text-sm font-semibold text-slate-100">Отклонить</span>
                <span className="block text-[11px] text-slate-400">
                  REVIEW → REJECTED · комментарий
                </span>
              </span>
            </button>
          </div>

          {verdict === 'ACCEPT' ? (
            <div className="mt-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs font-medium text-emerald-200">Будет начислено</span>
                <span className="text-lg font-bold tabular-nums text-emerald-200">
                  +{previewXP} XP
                </span>
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-emerald-200/70">
                {item.baseXP} XP × {multiplier} ({describeMultiplier(multiplier)}). On-time
                считается по submitted_at, а не по времени проверки.
                {onTime ? ' Стрик увеличится на 1.' : ' Стрик не изменится.'}
              </p>
            </div>
          ) : verdict === 'REJECT' ? (
            <div className="mt-2.5 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-[11px] leading-relaxed text-rose-200">
              XP не начисляется. После REOPEN студент вернёт работу в IN_PROGRESS и увидит
              ваш комментарий в журнале доработок.
            </div>
          ) : (
            <p className="mt-2.5 flex items-center gap-1.5 text-[11px] text-slate-400">
              <IconLock className="h-3.5 w-3.5" />
              XP назначает только сервер: ручной ввод запрещён.
            </p>
          )}
        </section>

        {/* Комментарий */}
        <section>
          <div className="flex items-baseline justify-between gap-2">
            <label
              htmlFor="verdict-comment"
              className="text-xs font-semibold text-slate-300"
            >
              Комментарий
              {rejectRequiresComment ? (
                <span className="ml-1 text-rose-400" aria-hidden="true">
                  *
                </span>
              ) : null}
            </label>
            <span className="text-[10px] tabular-nums text-slate-400">
              {comment.length}/500
            </span>
          </div>
          <textarea
            id="verdict-comment"
            ref={commentRef}
            rows={3}
            maxLength={500}
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            placeholder={
              verdict === 'REJECT'
                ? 'Что именно доработать? Комментарий увидит студент.'
                : 'Необязательно: что понравилось или что учесть дальше.'
            }
            className="mt-1.5 w-full resize-none rounded-xl border border-slate-700 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          />
          <p
            className={cn(
              'mt-1 text-[11px]',
              rejectRequiresComment && comment.trim().length === 0
                ? 'text-rose-400'
                : 'text-slate-400',
            )}
          >
            {rejectRequiresComment
              ? 'Для отклонения комментарий обязателен (spec/02_FSM.md §1).'
              : 'Для принятия комментарий необязателен.'}
          </p>
        </section>

        {error ? (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-200"
          >
            <IconAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
