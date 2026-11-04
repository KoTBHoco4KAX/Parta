import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, fetchSubmissions, fetchTasks } from '../../core/api';
import { useAuth } from '../../core/auth';
import { isSubmissionBoardEvent } from '../../core/ws';
import type { Submission, Task } from '../../core/types';

// Страховочный опрос: доска обновляется и без события, если WS-кадр потерялся
// или клиент только что переподключился.
const POLL_INTERVAL_MS = 10_000;

interface KanbanBoardState {
  tasks: Task[];
  submissions: Submission[];
  loading: boolean;
  error: string | null;
  reload: () => void;
}

// useKanbanBoard — единый хук данных доски: первичная загрузка, реакция на
// WS-события, опрос и обновление при возврате на вкладку.
export function useKanbanBoard(): KanbanBoardState {
  const { subscribe } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
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
      const [nextTasks, nextSubmissions] = await Promise.all([
        fetchTasks(),
        fetchSubmissions(),
      ]);

      setTasks(nextTasks);
      setSubmissions(nextSubmissions);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Не удалось загрузить доску.');
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

  useEffect(() => {
    void load();
  }, [load]);

  // Реалтайм: смена статуса, вердикт и новое задание приходят по WS.
  useEffect(
    () =>
      subscribe((event) => {
        if (isSubmissionBoardEvent(event)) {
          void load();
        }
      }),
    [load, subscribe],
  );

  // Фолбэк на случай пропущенного события или нового задания: опрос, возврат
  // фокуса и открытие вкладки.
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

  return { tasks, submissions, loading, error, reload };
}
