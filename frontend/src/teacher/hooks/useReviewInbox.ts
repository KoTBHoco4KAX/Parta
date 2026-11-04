import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../../core/auth';
import { fetchReviewInbox } from '../api';
import type { ReviewInboxItem } from '../types';

// События, после которых очередь проверки меняется: новая сдача, движение
// карточки, вердикт по другой работе или новое задание.
const REVIEW_EVENTS = new Set([
  'review.inbox.created',
  'submission.card.moved',
  'submission.verdict.issued',
  'task.created',
]);

// Страховочный опрос: если WS-кадр потерялся или клиент только переподключился.
const POLL_INTERVAL_MS = 15_000;

export interface ReviewInboxState {
  items: ReviewInboxItem[];
  loading: boolean;
  error: string | null;
  reload: () => void;
}

/**
 * useReviewInbox — данные очереди проверки без кнопки «Обновить».
 *
 * Очередь перечитывается сама: при открытии экрана, по WS-событиям о новых
 * сдачах, при возврате на вкладку и страховочным опросом раз в 15 секунд.
 */
export function useReviewInbox(): ReviewInboxState {
  const { subscribe } = useAuth();
  const [items, setItems] = useState<ReviewInboxItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const pending = useRef(false);

  const load = useCallback(async () => {
    if (inFlight.current) {
      pending.current = true;
      return;
    }

    inFlight.current = true;
    setError(null);

    try {
      setItems(await fetchReviewInbox());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось загрузить очередь.');
    } finally {
      setLoading(false);
      inFlight.current = false;

      if (pending.current) {
        pending.current = false;
        void load();
      }
    }
  }, []);

  const reload = useCallback(() => {
    void load();
  }, [load]);

  // Первичная загрузка.
  useEffect(() => {
    void load();
  }, [load]);

  // Реалтайм: новая сдача приходит в комнату teacher:{id} и сразу обновляет
  // очередь. Ждать нажатия «Обновить» не нужно.
  useEffect(
    () =>
      subscribe((event) => {
        if (REVIEW_EVENTS.has(event.event_type)) {
          void load();
        }
      }),
    [load, subscribe],
  );

  // Фолбэк на случай пропущенного события, обрыва WS или возврата на вкладку.
  useEffect(() => {
    const refreshIfVisible = () => {
      if (document.visibilityState === 'visible') {
        void load();
      }
    };

    const interval = window.setInterval(refreshIfVisible, POLL_INTERVAL_MS);
    const onFocus = () => void load();

    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', refreshIfVisible);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', refreshIfVisible);
    };
  }, [load]);

  return { items, loading, error, reload };
}
