import type { ConnectionStatus, WsEvent } from './types';

// Типы событий, на которые подписаны экраны. Константы дублируют
// backend/internal/events/events.go, чтобы в UI не было «магических строк».
export const WS_EVENT_SUBMISSION_CARD_MOVED = 'submission.card.moved';
export const WS_EVENT_SUBMISSION_VERDICT_ISSUED = 'submission.verdict.issued';
export const WS_EVENT_REVIEW_INBOX_CREATED = 'review.inbox.created';
export const WS_EVENT_TASK_CREATED = 'task.created';

// Payload конверта submission.card.moved (spec/00_ARCHITECTURE.md §V).
export interface SubmissionCardMovedPayload {
  submission_id: number;
  task_id: number;
  student_id: number;
  from: string;
  to: string;
  submitted_at: string | null;
}

// Payload конверта submission.verdict.issued.
export interface SubmissionVerdictIssuedPayload {
  submission_id: number;
  verdict: 'ACCEPT' | 'REJECT';
  xp_awarded: number;
  streak_delta: number;
  reviewed_at: string;
}

// isSubmissionBoardEvent — true для событий, меняющих канбан ученика:
// смена статуса, вердикт и появление нового задания.
export function isSubmissionBoardEvent(event: Pick<WsEvent, 'event_type'>): boolean {
  return (
    event.event_type === WS_EVENT_SUBMISSION_CARD_MOVED ||
    event.event_type === WS_EVENT_SUBMISSION_VERDICT_ISSUED ||
    event.event_type === WS_EVENT_TASK_CREATED
  );
}

// isReviewInboxEvent — true для событий, меняющих инбокс преподавателя.
export function isReviewInboxEvent(event: Pick<WsEvent, 'event_type'>): boolean {
  return (
    event.event_type === WS_EVENT_REVIEW_INBOX_CREATED ||
    event.event_type === WS_EVENT_SUBMISSION_VERDICT_ISSUED
  );
}

// wsUrl собирает адрес сокета из текущего origin: Vite проксирует /ws на backend.
function wsUrl(token: string): string {
  const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${scheme}://${window.location.host}/ws?token=${encodeURIComponent(token)}`;
}

// pollUrl собирает адрес long-poll фолбэка.
function pollUrl(cursor: number, holdSeconds: number): string {
  return `/api/events/poll?after=${cursor}&timeout=${holdSeconds}`;
}

// Максимальный размер журнала дедупликации: клиент не должен расти бесконечно.
const SEEN_LIMIT = 1000;

// Базовая пауза переподключения и её потолок.
const BACKOFF_BASE_MS = 1_000;
const BACKOFF_MAX_MS = 30_000;

// Соединение считается стабильным только после этого времени: если сервер
// сразу закрывает сокет (просроченный токен, deploy), backoff продолжает расти.
const STABLE_CONNECTION_MS = 10_000;

// Прикладной heartbeat: JS не видит control-frame ping/pong браузера.
const HEARTBEAT_INTERVAL_MS = 20_000;
const HEARTBEAT_TIMEOUT_MS = 45_000;

// Код закрытия для «сервер перестал отвечать» — не пересекается с кодами RFC.
const CLOSE_HEARTBEAT_TIMEOUT = 4000;

// Сколько ждём открытия сокета, прежде чем уйти на long-poll. За прокси без
// upgrade handshake не завершается вообще, и onclose может не прийти часами.
const WS_OPEN_TIMEOUT_MS = 10_000;

// Параметры long-poll фолбэка.
const POLL_TIMEOUT_SECONDS = 20;
const POLL_MIN_HOLD_SECONDS = 5;
const POLL_RETRY_BASE_MS = 1_000;
const POLL_RETRY_MAX_MS = 15_000;

export interface PartaSocketOptions {
  token: string;
  onEvent: (event: WsEvent) => void;
  onStatus?: (status: ConnectionStatus) => void;
}

// PartaSocket — один канал событий на сессию. Основной транспорт — WebSocket;
// если handshake не поднимается (reverse-proxy без Upgrade), автоматически
// переключается на long-poll того же хаба.
export class PartaSocket {
  private readonly options: PartaSocketOptions;
  private socket: WebSocket | null = null;
  private closed = false;
  private attempt = 0;
  private reconnectTimer: number | null = null;
  private heartbeatTimer: number | null = null;
  private stableTimer: number | null = null;
  private openTimer: number | null = null;
  private lastPongAt = 0;
  private onlineBound = false;
  private lastStatus: ConnectionStatus | null = null;
  private opened = false;
  private readonly seen = new Set<string>();
  private readonly rooms = new Set<string>();

  // Long-poll состояние.
  private polling = false;
  private pollAbort: AbortController | null = null;
  private cursor = 0;
  private pollAttempt = 0;
  // Сколько держим запрос. Уменьшаем, если прокси рвёт долгие ответы.
  private pollHold = POLL_TIMEOUT_SECONDS;

  constructor(options: PartaSocketOptions) {
    this.options = options;
  }

  // handleOnline возвращает сокет в строй сразу после восстановления сети.
  private handleOnline = (): void => {
    if (this.closed || this.socket !== null || this.polling) {
      return;
    }

    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    this.attempt = 0;
    this.connect();
  };

  // connect открывает соединение; повторные вызовы идемпотентны.
  connect(): void {
    if (this.closed || this.socket !== null || this.polling) {
      return;
    }

    if (!this.onlineBound) {
      window.addEventListener('online', this.handleOnline);
      this.onlineBound = true;
    }

    this.setStatus('connecting');

    const socket = new WebSocket(wsUrl(this.options.token));
    this.socket = socket;

    // Прокси без upgrade держит handshake открытым: без таймаута индикатор
    // навсегда остался бы в «подключении».
    this.openTimer = window.setTimeout(() => {
      this.openTimer = null;

      if (this.socket !== socket || socket.readyState !== WebSocket.CONNECTING) {
        return;
      }

      console.warn('[WS] open timeout, falling back to long-poll');
      this.socket = null;
      this.stopHeartbeat();
      socket.close();
      this.startPolling();
    }, WS_OPEN_TIMEOUT_MS);

    socket.onopen = () => {
      this.clearOpenTimer();

      if (this.socket !== socket) {
        // Сокет уже признан мёртвым (сработал таймаут открытия) — не
        // оставляем сессию без транспорта: long-poll продолжает работать.
        socket.close();

        return;
      }

      this.stopPolling();
      this.opened = true;

      this.setStatus('online');
      console.log('[WS] open');
      this.lastPongAt = Date.now();
      this.startHeartbeat();
      this.resubscribe();

      // Сбрасываем backoff только после устойчивого соединения, иначе
      // «открылся и сразу закрылся» крутился бы в бесконечном ретрае.
      if (this.stableTimer !== null) {
        window.clearTimeout(this.stableTimer);
      }

      this.stableTimer = window.setTimeout(() => {
        this.attempt = 0;
        this.stableTimer = null;
      }, STABLE_CONNECTION_MS);
    };

    socket.onmessage = (message) => {
      this.handleMessage(message.data);
    };

    socket.onerror = () => {
      // onclose всегда придёт следом и запустит реконнект.
    };

    socket.onclose = (event) => {
      this.clearOpenTimer();

      if (this.socket !== socket) {
        return;
      }

      console.warn('[WS] close', event.code, event.reason, event.wasClean);
      this.socket = null;
      this.stopHeartbeat();
      this.clearStableTimer();

      if (this.closed) {
        this.setStatus('offline');
        return;
      }

      this.setStatus('offline');

      // Если сокет ни разу не открылся, почти наверняка мешает прокси без
      // проброса Upgrade. Дальше работаем через long-poll — он проходит
      // через любой HTTP reverse-proxy.
      if (!this.opened) {
        this.startPolling();

        return;
      }

      this.scheduleReconnect();
    };
  }

  // subscribe запоминает комнату и подписывается, если сокет открыт.
  subscribe(rooms: string[]): void {
    for (const room of rooms) {
      this.rooms.add(room);
    }

    if (this.socket?.readyState === WebSocket.OPEN) {
      this.send({ action: 'subscribe', rooms });
    }
  }

  // unsubscribe отписывает от комнат, не закрывая сокет.
  unsubscribe(rooms: string[]): void {
    for (const room of rooms) {
      this.rooms.delete(room);
    }

    if (this.socket?.readyState === WebSocket.OPEN) {
      this.send({ action: 'unsubscribe', rooms });
    }
  }

  // close окончательно закрывает транспорт и отменяет переподключение.
  close(): void {
    this.closed = true;

    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    this.stopHeartbeat();
    this.clearStableTimer();
    this.clearOpenTimer();
    this.stopPolling();

    if (this.onlineBound) {
      window.removeEventListener('online', this.handleOnline);
      this.onlineBound = false;
    }

    this.socket?.close(1000, 'client closed');
    this.socket = null;
    this.setStatus('offline');
  }

  // handleMessage дедуплицирует события и отдаёт их подписчику.
  private handleMessage(raw: unknown): void {
    if (typeof raw !== 'string') {
      return;
    }

    let parsed: unknown;

    try {
      parsed = JSON.parse(raw);
    } catch {
      return;
    }

    if (typeof parsed !== 'object' || parsed === null) {
      return;
    }

    const candidate = parsed as Partial<WsEvent> & { type?: string };

    // pong — ответ на прикладной heartbeat, а не событие конверта.
    if (candidate.type === 'pong') {
      this.lastPongAt = Date.now();

      return;
    }

    // ready — подтверждение соединения. Если onopen потерялся, индикатор
    // всё равно должен стать зелёным, не дожидаясь прикладного события.
    if (candidate.type === 'ready') {
      console.log('[WS] ready');
      this.setStatus('online');

      return;
    }

    // ack/error — служебные кадры, не события конверта.
    if (typeof candidate.event_id !== 'string') {
      return;
    }

    this.dispatchEvent(candidate as WsEvent);
  }

  // dispatchEvent дедуплицирует конверт и отдаёт его подписчику.
  private dispatchEvent(event: WsEvent): void {
    if (this.seen.has(event.event_id)) {
      return;
    }

    this.seen.add(event.event_id);

    if (this.seen.size > SEEN_LIMIT) {
      const oldest = this.seen.values().next().value;
      if (typeof oldest === 'string') {
        this.seen.delete(oldest);
      }
    }

    this.options.onEvent(event);
  }

  // startPolling переключает сессию на long-poll.
  private startPolling(): void {
    if (this.closed || this.polling) {
      return;
    }

    console.warn('[WS] switching to long-poll transport');
    this.polling = true;
    this.pollAttempt = 0;
    this.clearStableTimer();
    this.stopHeartbeat();

    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    void this.pollLoop();
  }

  // stopPolling останавливает long-poll и прерывает текущий запрос.
  private stopPolling(): void {
    this.polling = false;
    this.pollAbort?.abort();
    this.pollAbort = null;
  }

  // pollLoop держит long-poll запросы, пока сессия жива.
  private async pollLoop(): Promise<void> {
    while (!this.closed && this.polling) {
      const controller = new AbortController();
      this.pollAbort = controller;

      let hardTimedOut = false;
      const hardTimer = window.setTimeout(() => {
        hardTimedOut = true;
        controller.abort();
      }, (this.pollHold + 15) * 1000);

      try {
        const response = await fetch(pollUrl(this.cursor, this.pollHold), {
          method: 'GET',
          headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${this.options.token}`,
          },
          cache: 'no-store',
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`poll failed: ${response.status}`);
        }

        const body = (await response.json()) as { cursor?: number; events?: WsEvent[] };

        if (typeof body.cursor === 'number') {
          this.cursor = body.cursor;
        }

        this.pollAttempt = 0;
        // Прокси переживает текущую длину удержания — аккуратно возвращаемся
        // к максимальной, чтобы не гонять запросы чаще нужного.
        this.pollHold = Math.min(POLL_TIMEOUT_SECONDS, this.pollHold + 5);
        this.setStatus('online');

        for (const event of body.events ?? []) {
          if (typeof event?.event_id === 'string') {
            this.dispatchEvent(event);
          }
        }
      } catch (cause) {
        if (this.closed) {
          return;
        }

        if (cause instanceof DOMException && cause.name === 'AbortError' && !hardTimedOut) {
          return;
        }

        console.warn('[poll] transport error', cause);
        this.setStatus('offline');
        // Если запрос не доживает до штатного таймаута, укорачиваем его:
        // так фолбэк переживёт прокси с коротким read timeout.
        this.pollHold = Math.max(POLL_MIN_HOLD_SECONDS, Math.floor(this.pollHold / 2));
        await this.sleepPollRetry();
      } finally {
        window.clearTimeout(hardTimer);
      }
    }
  }

  // sleepPollRetry выдерживает паузу с экспоненциальным backoff.
  private sleepPollRetry(): Promise<void> {
    const exponent = Math.min(this.pollAttempt, 4);
    const delay = Math.min(POLL_RETRY_MAX_MS, POLL_RETRY_BASE_MS * 2 ** exponent);
    this.pollAttempt += 1;

    return new Promise((resolve) => {
      window.setTimeout(resolve, delay);
    });
  }

  // scheduleReconnect запускает экспоненциальный backoff с джиттером.
  private scheduleReconnect(): void {
    if (this.closed || this.polling || this.reconnectTimer !== null) {
      return;
    }

    // Ограничиваем показатель степени: после нескольких попыток пауза и так
    // упирается в BACKOFF_MAX_MS, а 2**attempt не должен переполняться.
    const exponent = Math.min(this.attempt, 5);
    const delay = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** exponent);
    this.attempt += 1;

    const jittered = delay * (0.8 + Math.random() * 0.4);

    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, jittered);
  }

  // resubscribe повторяет подписки после переподключения.
  private resubscribe(): void {
    if (this.rooms.size === 0) {
      return;
    }

    this.send({ action: 'subscribe', rooms: [...this.rooms] });
  }

  // startHeartbeat шлёт прикладной ping и следит, что сервер отвечает pong.
  // Без этого браузер может держать «мёртвый» сокет после смены сети.
  private startHeartbeat(): void {
    this.stopHeartbeat();

    this.heartbeatTimer = window.setInterval(() => {
      const socket = this.socket;
      if (!socket || socket.readyState !== WebSocket.OPEN) {
        return;
      }

      if (Date.now() - this.lastPongAt > HEARTBEAT_TIMEOUT_MS) {
        socket.close(CLOSE_HEARTBEAT_TIMEOUT, 'heartbeat timeout');

        return;
      }

      this.send({ action: 'ping' });
    }, HEARTBEAT_INTERVAL_MS);
  }

  // stopHeartbeat снимает таймер; вызывается при close и перед реконнектом.
  private stopHeartbeat(): void {
    if (this.heartbeatTimer !== null) {
      window.clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  // clearStableTimer отменяет отложенный сброс backoff.
  private clearStableTimer(): void {
    if (this.stableTimer !== null) {
      window.clearTimeout(this.stableTimer);
      this.stableTimer = null;
    }
  }

  // clearOpenTimer отменяет таймаут открытия сокета.
  private clearOpenTimer(): void {
    if (this.openTimer !== null) {
      window.clearTimeout(this.openTimer);
      this.openTimer = null;
    }
  }

  private send(payload: unknown): void {
    if (this.socket?.readyState !== WebSocket.OPEN) {
      return;
    }

    this.socket.send(JSON.stringify(payload));
  }

  private setStatus(status: ConnectionStatus): void {
    if (this.lastStatus === status) {
      return;
    }

    this.lastStatus = status;
    console.log('[WS] status', status);
    this.options.onStatus?.(status);
  }
}
