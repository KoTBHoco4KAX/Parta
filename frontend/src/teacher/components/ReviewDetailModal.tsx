import { useState } from 'react';
import type { Task } from '../../core/types';
import { ApiError } from '../../core/api';
import { issueVerdict } from '../api';
import type { ReviewInboxItem, ToastData } from '../types';
import { estimateFinalXP, submissionWindow } from '../lib/economy';
import {
  formatDateTime,
  formatWaiting,
  waitingTone,
} from '../lib/format';
import { TASK_TYPE_LABEL, slotRoleTitle } from '../lib/labels';
import { AttachmentsPanel } from './AttachmentsPanel';
import {
  Badge,
  Button,
  Callout,
  Field,
  Modal,
  TextArea,
  cn,
} from './ui';
import { IconAlert, IconCheck, IconClock, IconFile, IconSparkles } from './icons';

/**
 * ReviewDetailModal — карточка сдачи и вердикт преподавателя.
 *
 * Показывает само задание, файлы ученика, историю возвратов и ожидаемый XP,
 * чтобы решение «зачесть / на доработку» принималось в одном окне.
 */
export function ReviewDetailModal({
  item,
  task,
  notify,
  onClose,
  onDecided,
}: {
  item: ReviewInboxItem;
  task: Task | null;
  notify: (toast: Omit<ToastData, 'id'>) => void;
  onClose: () => void;
  onDecided: () => void;
}) {
  const [mode, setMode] = useState<'idle' | 'reject'>('idle');
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState<'ACCEPT' | 'REJECT' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const window = submissionWindow(item.submittedAt, item.deadlineAt, item.speedrunWindowHours);
  const expectedXP = estimateFinalXP(
    item.baseXP,
    item.submittedAt,
    item.deadlineAt,
    item.speedrunWindowHours,
  );

  async function decide(verdict: 'ACCEPT' | 'REJECT') {
    if (verdict === 'REJECT' && comment.trim() === '') {
      setError('Комментарий обязателен: ученик должен понять, что исправить.');

      return;
    }

    setBusy(verdict);
    setError(null);

    try {
      const result = await issueVerdict({
        submissionId: item.id,
        verdict,
        comment: comment.trim(),
      });

      notify(
        verdict === 'ACCEPT'
          ? {
              tone: 'success',
              title: 'Работа зачтена',
              description:
                result.xpAwarded > 0
                  ? `${item.studentName}: +${result.xpAwarded} XP`
                  : item.studentName,
            }
          : {
              tone: 'info',
              title: 'Возвращено на доработку',
              description: item.studentName,
            },
      );

      onDecided();
    } catch (cause) {
      setError(
        cause instanceof ApiError
          ? cause.message
          : 'Не удалось применить вердикт. Проверьте соединение.',
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={item.studentName}
      subtitle={item.taskTitle}
      size="lg"
      footer={
        <div className="flex w-full flex-col gap-2">
          {error ? (
            <p role="alert" className="text-[11px] text-bad">
              {error}
            </p>
          ) : null}

          {mode === 'reject' ? (
            <>
              <Field
                label="Что вернуть на доработку"
                htmlFor="reject-comment"
                hint="Комментарий увидит ученик в истории карточки."
              >
                <TextArea
                  id="reject-comment"
                  value={comment}
                  onChange={(event) => setComment(event.target.value)}
                  placeholder="Например: нет нормализации до 3НФ, добавьте миграции и повторите сдачу."
                  invalid={comment.trim() === '' && error !== null}
                />
              </Field>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  block
                  onClick={() => {
                    setMode('idle');
                    setError(null);
                  }}
                  disabled={busy !== null}
                >
                  Отмена
                </Button>
                <Button
                  variant="reject"
                  block
                  loading={busy === 'REJECT'}
                  onClick={() => void decide('REJECT')}
                >
                  Вернуть
                </Button>
              </div>
            </>
          ) : (
            <div className="flex gap-2">
              <Button
                variant="reject"
                block
                onClick={() => setMode('reject')}
                disabled={busy !== null}
              >
                На доработку
              </Button>
              <Button
                variant="accept"
                block
                loading={busy === 'ACCEPT'}
                onClick={() => void decide('ACCEPT')}
              >
                <IconCheck className="h-4 w-4" />
                Зачесть
              </Button>
            </div>
          )}
        </div>
      }
    >
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone={item.onTime ? 'emerald' : 'rose'}>
            {item.onTime ? 'в срок' : 'после дедлайна'}
          </Badge>
          <Badge tone={window === 'speedrun' ? 'emerald' : window === 'late' ? 'rose' : 'sky'}>
            {window === 'speedrun' ? 'бонус ×1.5' : window === 'late' ? '×0.5' : '×1.0'}
          </Badge>
          {item.attempt > 1 ? <Badge tone="amber">попытка {item.attempt}</Badge> : null}
          {item.teamSlotRole ? (
            <Badge tone="violet">{slotRoleTitle(item.teamSlotRole)}</Badge>
          ) : null}
        </div>

        <div className="grid grid-cols-2 gap-3 rounded-xl border border-line bg-muted p-3">
          <KeyValue label="Группа" value={item.groupCode} />
          <KeyValue label="Тип" value={TASK_TYPE_LABEL[item.taskType]} />
          <KeyValue label="Сдано" value={formatDateTime(item.submittedAt)} />
          <KeyValue label="Дедлайн" value={formatDateTime(item.deadlineAt)} />
          <KeyValue
            label="Ожидает"
            value={formatWaiting(item.waitingSeconds)}
            tone={waitingTone(item.waitingSeconds) === 'danger' ? 'rose' : 'slate'}
          />
          <KeyValue label="К начислению" value={`${expectedXP} XP`} />
        </div>

        {window === 'speedrun' ? (
          <Callout tone="emerald" icon={<IconSparkles className="h-4 w-4" />} title="Сдано в бонусное окно">
            Множитель ×1.5: ученик получит <span className="font-semibold">{expectedXP} XP</span>{' '}
            вместо {item.baseXP} базовых.
          </Callout>
        ) : window === 'late' ? (
          <Callout tone="rose" icon={<IconAlert className="h-4 w-4" />} title="Сдача после дедлайна">
            Множитель ×0.5: к начислению {expectedXP} XP из {item.baseXP} базовых.
          </Callout>
        ) : (
          <Callout tone="sky" icon={<IconClock className="h-4 w-4" />} title="Сдано в срок">
            Множитель ×1.0, к начислению {expectedXP} XP.
          </Callout>
        )}

        <section className="rounded-xl border border-line bg-card p-3">
          <h4 className="text-xs font-semibold text-ink2">Задание</h4>
          {task?.topic ? (
            <p className="mt-1 whitespace-pre-line text-[12px] leading-relaxed text-ink">
              {task.topic}
            </p>
          ) : (
            <p className="mt-1 text-[12px] leading-relaxed text-ink">{item.taskTitle}</p>
          )}
          {task?.description_md ? (
            <p className="mt-2 whitespace-pre-line text-[11px] leading-relaxed text-ink3">
              {task.description_md}
            </p>
          ) : null}

          {task && task.attachments && task.attachments.length > 0 ? (
            <ul className="mt-2 space-y-1">
              {task.attachments.map((file) => (
                <li key={file.url}>
                  <a
                    href={file.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-[11px] text-brand hover:underline"
                  >
                    <IconFile className="h-3.5 w-3.5" />
                    {file.name}
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
        </section>

        <AttachmentsPanel submissionId={item.id} notify={notify} />

        <section>
          <h4 className="mb-2 text-xs font-semibold text-ink2">История доработок</h4>
          {item.revisions.length === 0 ? (
            <p className="rounded-lg border border-dashed border-line2 px-3 py-2.5 text-[11px] text-ink3">
              Возвратов не было — это первая сдача.
            </p>
          ) : (
            <ol className="space-y-2">
              {item.revisions
                .slice()
                .reverse()
                .map((revision, index) => (
                  <li
                    key={`${revision.at}-${index}`}
                    className="rounded-lg border border-line bg-muted px-3 py-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <Badge tone="rose">возврат</Badge>
                      <span className="text-[10px] text-ink3">{formatDateTime(revision.at)}</span>
                    </div>
                    <p className="mt-1 whitespace-pre-line text-[11px] leading-relaxed text-ink2">
                      {revision.comment}
                    </p>
                  </li>
                ))}
            </ol>
          )}
        </section>
      </div>
    </Modal>
  );
}

function KeyValue({
  label,
  value,
  tone = 'slate',
}: {
  label: string;
  value: string | number;
  tone?: 'slate' | 'rose';
}) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-ink4">{label}</p>
      <p
        className={cn(
          'mt-0.5 text-[12px] font-medium',
          tone === 'rose' ? 'text-bad' : 'text-ink2',
        )}
      >
        {value}
      </p>
    </div>
  );
}
