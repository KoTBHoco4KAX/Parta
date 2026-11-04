import { useCallback, useEffect, useState, type DragEvent } from 'react';
import { ApiError } from '../../core/api';
import { getBoard, subscribe, takeCard } from '../api';
import type { BoardCard, TaskStatus } from '../types';
import TaskCard from '../components/TaskCard';
import SubmitWorkModal from '../components/SubmitWorkModal';
import { Button } from '../../components/Button';
import { Modal } from '../../components/Modal';

// Колонки канбана — все статусы карточки студента (spec/02_FSM.md).
const COLUMNS: { status: TaskStatus; title: string }[] = [
  { status: 'TODO', title: 'К выполнению' },
  { status: 'IN_PROGRESS', title: 'В работе' },
  { status: 'REVIEW', title: 'На проверке' },
  { status: 'DONE', title: 'Принято' },
  { status: 'REJECTED', title: 'Доработка' },
];

// KanbanPage — доска заданий студента: drag-n-drop между колонками,
// FSM-переходы через мок-слой api, тап по карточке открывает меню действий
// (fallback для тач-экранов, где HTML5 drag-and-drop не работает).
export default function KanbanPage() {
  const [cards, setCards] = useState<BoardCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [draggedId, setDraggedId] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<TaskStatus | null>(null);
  const [selected, setSelected] = useState<BoardCard | null>(null);
  const [submitTarget, setSubmitTarget] = useState<BoardCard | null>(null);

  const load = useCallback(async () => {
    try {
      const snapshot = await getBoard();
      setCards(snapshot.cards);
      setError(null);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Не удалось загрузить доску.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();

    // Вердикт «преподавателя» в моке приходит через секунды — страница
    // перечитывает доску на каждую мутацию хранилища (аналог WS-подписки).
    return subscribe(() => {
      void load();
    });
  }, [load]);

  function findCard(submissionId: number): BoardCard | null {
    return cards.find((card) => card.submission?.id === submissionId) ?? null;
  }

  // handleMove — единственный путь мутации статуса: guard-и FSM + ошибки
  // домена показываются inline (не alert). После мутации доска перечитывается.
  async function handleMove(card: BoardCard, target: TaskStatus) {
    const submission = card.submission;

    if (busy || !submission) {
      return;
    }

    const from = submission.status;

    if (from === target) {
      return;
    }

    if (from === 'DONE') {
      setActionError('Принятая работа зафиксирована преподавателем и не двигается.');
      return;
    }

    if (target === 'TODO' || target === 'DONE') {
      setActionError(
        target === 'DONE'
          ? 'В «Принято» карточку переводит только вердикт преподавателя.'
          : 'Вернуть карточку в «К выполнению» нельзя — это стартовая точка.',
      );
      return;
    }

    setBusy(true);
    setActionError(null);

    try {
      if (target === 'REVIEW') {
        // Сдача требует артефакта: REOPEN для доработки, START для запуска,
        // затем открывается модалка с файлами.
        if (from === 'TODO' || from === 'REJECTED') {
          await takeCard(submission.id, from === 'TODO' ? 'START' : 'REOPEN');
        }

        setSubmitTarget(card);
      } else {
        await takeCard(submission.id, from === 'TODO' ? 'START' : 'REOPEN');
      }

      setSelected(null);
      await load();
    } catch (cause) {
      setActionError(cause instanceof ApiError ? cause.message : 'Не удалось переместить карточку.');
    } finally {
      setBusy(false);
      setDraggedId(null);
      setDragOver(null);
    }
  }

  function handleColumnDrop(target: TaskStatus, event: DragEvent<HTMLElement>) {
    event.preventDefault();
    setDragOver(null);
    const card = draggedId === null ? null : findCard(draggedId);

    if (card) {
      void handleMove(card, target);
    }

    setDraggedId(null);
  }

  if (loading) {
    return (
      <div className="space-y-3">
        {[0, 1, 2].map((row) => (
          <div key={row} className="h-20 animate-pulse rounded-xl bg-slate-900/70" />
        ))}
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-slate-100">Канбан-доска</h1>
          <p className="mt-0.5 text-xs text-slate-400">
            Перетащите карточку между колонками или откройте её для действий.
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => void load()}>
          Обновить
        </Button>
      </div>

      {error ? (
        <p role="alert" className="mb-3 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
          {error}
        </p>
      ) : null}

      {actionError ? (
        <p role="alert" className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
          {actionError}
        </p>
      ) : null}

      {cards.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-800 p-6 text-center text-sm text-slate-500">
          Заданий пока нет — они появятся, когда преподаватель опубликует работу.
        </p>
      ) : (
        <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2">
          {COLUMNS.map((column) => {
            const columnCards = cards.filter(
              (card) => (card.submission?.status ?? 'TODO') === column.status,
            );

            return (
              <section
                key={column.status}
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragOver(column.status);
                }}
                onDragLeave={() => setDragOver((current) => (current === column.status ? null : current))}
                onDrop={(event) => handleColumnDrop(column.status, event)}
                className={[
                  'w-60 shrink-0 snap-start rounded-xl border bg-slate-900/60 p-2 transition',
                  dragOver === column.status
                    ? 'border-emerald-500/60 bg-emerald-500/5'
                    : 'border-slate-800',
                ].join(' ')}
              >
                <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  {column.title} · {columnCards.length}
                </h2>

                <div className="space-y-2">
                  {columnCards.map((card) => (
                    <TaskCard
                      key={card.submission?.id ?? card.task.id}
                      card={card}
                      dragging={draggedId !== null && card.submission?.id === draggedId}
                      draggable={!busy}
                      onDragStart={() => setDraggedId(card.submission?.id ?? null)}
                      onDragEnd={() => setDraggedId(null)}
                      onOpen={() => setSelected(card)}
                    />
                  ))}

                  {columnCards.length === 0 ? (
                    <p className="rounded-lg border border-dashed border-slate-800 px-2 py-4 text-center text-[11px] text-slate-600">
                      пусто
                    </p>
                  ) : null}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {/* Детальная карточка: описание задания и доступные FSM-переходы. */}
      {selected ? (
        <Modal
          open
          onClose={() => setSelected(null)}
          title={selected.task.title}
          subtitle={`${selected.task.taskType} · база ${selected.task.baseXp} XP`}
          footer={
            <div className="flex flex-wrap justify-end gap-2">
              {(selected.submission?.status ?? 'TODO') === 'TODO' ? (
                <Button disabled={busy} onClick={() => void handleMove(selected, 'IN_PROGRESS')}>
                  Взять в работу
                </Button>
              ) : null}
              {(selected.submission?.status ?? 'TODO') === 'REJECTED' ? (
                <Button disabled={busy} onClick={() => void handleMove(selected, 'IN_PROGRESS')}>
                  Доработать
                </Button>
              ) : null}
              {(selected.submission?.status ?? 'TODO') === 'IN_PROGRESS' ? (
                <Button disabled={busy} onClick={() => void handleMove(selected, 'REVIEW')}>
                  Сдать работу
                </Button>
              ) : null}
            </div>
          }
        >
          <div className="space-y-3">
            <p className="text-sm text-slate-300">{selected.task.description}</p>

            <dl className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg bg-slate-950 px-3 py-2">
                <dt className="text-[10px] uppercase tracking-wide text-slate-500">Дедлайн</dt>
                <dd className="mt-0.5 text-slate-200">
                  {new Date(selected.task.deadlineAt).toLocaleString()}
                </dd>
              </div>
              <div className="rounded-lg bg-slate-950 px-3 py-2">
                <dt className="text-[10px] uppercase tracking-wide text-slate-500">Speedrun</dt>
                <dd className="mt-0.5 text-slate-200">
                  ×1.5 при сдаче за {selected.task.speedrunWindowHours} ч
                </dd>
              </div>
            </dl>

            {(selected.submission?.status ?? 'TODO') === 'REVIEW' ? (
              <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
                Работа ждёт проверки — артефакт заблокирован до вердикта.
              </p>
            ) : null}

            {(selected.submission?.status ?? 'TODO') === 'DONE' ? (
              <p className="rounded-lg bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">
                Принято. XP уже начислены, артефакт доступен только для чтения.
              </p>
            ) : null}

            {selected.submission && selected.submission.revisionLog.length > 0 ? (
              <div className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Комментарии преподавателя
                </h3>
                {selected.submission.revisionLog.map((revision) => (
                  <blockquote
                    key={revision.at}
                    className="rounded-lg border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-xs text-rose-200"
                  >
                    {revision.comment}
                    <span className="mt-1 block text-[10px] text-rose-300/70">
                      {new Date(revision.at).toLocaleString()}
                    </span>
                  </blockquote>
                ))}
              </div>
            ) : null}
          </div>
        </Modal>
      ) : null}

      {/* Модалка сдачи: файлы + SHA-256 + SUBMIT. */}
      {submitTarget && submitTarget.submission ? (
        <SubmitWorkModal
          task={submitTarget.task}
          submission={submitTarget.submission}
          onClose={() => setSubmitTarget(null)}
          onSubmitted={() => {
            setSubmitTarget(null);
            void load();
          }}
        />
      ) : null}
    </div>
  );
}
