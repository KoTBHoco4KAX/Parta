import type { ConnectionStatus, WsEvent } from './types';

// Типы событий, на которые подписаны экраны. Константы дублируют
// backend/internal/events/events.go, чтобы в UI не было «магических строк».
export const WS_EVENT_SUBMISSION_CARD_MOVED = 'submission.card.moved';
export const WS_EVENT_SUBMISSION_VERDICT_ISSUED = 'submission.verdict.issued';
export const WS_EVENT_REVIEW_INBOX_CREATED = 'review.inbox.created';

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

// isSubmissionBoardEvent — true для событий, меняющих канбан студента.
export function isSubmissionBoardEvent(event: Pick<WsEvent, 'event_type'>): boolean {
  return (
    event.event_type === WS_EVENT_SUBMISSION_CARD_MOVED ||
    event.event_type === WS_EVENT_SUBMISSION_VERDICT_ISSUED
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

// Максимальный размер журнала дедупликации: клиент не должен расти бесконечно.
const SEEN_LIMIT = 1000;

// Базовая пауза переподключения и её потолок.
const BACKOFF_BASE_MS = 1_000;
const BACKOFF_MAX_MS = 30_000;

export interface PartaSocketOptions {
  token: string;
  onEvent: (event: WsEvent) => void;
  onStatus?: (status: ConnectionStatus) => void;
}

// PartaSocket — один сокет на сессию: переподключение с backoff, дедупликация
// по event_id, повторная подписка после реконнекта.
export class PartaSocket {
  private readonly options: PartaSocketOptions;
  private socket: WebSocket | null = null;
  private closed = false;
  private attempt = 0;
  private reconnectTimer: number | null = null;
  private readonly seen = new Set<string>();
  private readonly rooms = new Set<string>();

  constructor(options: PartaSocketOptions) {
    this.options = options;
  }

  // connect открывает соединение; повторные вызовы идемпотентны.
  connect(): void {
    if (this.closed || this.socket !== null) {
      return;
    }

    this.setStatus('connecting');

    const socket = new WebSocket(wsUrl(this.options.token));
    this.socket = socket;

    socket.onopen = () => {
      this.attempt = 0;
      this.setStatus('online');
      this.resubscribe();
    };

    socket.onmessage = (message) => {
      this.handleMessage(message.data);
    };

    socket.onerror = () => {
      // onclose всегда придёт следом и запустит backoff.
    };

    socket.onclose = () => {
      this.socket = null;

      if (this.closed) {
        this.setStatus('offline');
        return;
      }

      this.setStatus('offline');
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

  // close окончательно закрывает сокет и отменяет переподключение.
  close(): void {
    this.closed = true;

    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
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

    // ready/ack/error — служебные кадры, не события конверта.
    if (typeof candidate.event_id !== 'string') {
      return;
    }

    if (this.seen.has(candidate.event_id)) {
      return;
    }

    this.seen.add(candidate.event_id);

    if (this.seen.size > SEEN_LIMIT) {
      const oldest = this.seen.values().next().value;
      if (typeof oldest === 'string') {
        this.seen.delete(oldest);
      }
    }

    this.options.onEvent(candidate as WsEvent);
  }

  // resubscribe повторяет подписки после переподключения.
  private resubscribe(): void {
    if (this.rooms.size === 0) {
      return;
    }

    this.send({ action: 'subscribe', rooms: [...this.rooms] });
  }

  // scheduleReconnect запускает экспоненциальный backoff с джиттером.
  private scheduleReconnect(): void {
    if (this.closed || this.reconnectTimer !== null) {
      return;
    }

    const delay = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** this.attempt);
    this.attempt += 1;

    const jittered = delay * (0.8 + Math.random() * 0.4);

    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, jittered);
  }

  private send(payload: unknown): void {
    if (this.socket?.readyState !== WebSocket.OPEN) {
      return;
    }

    this.socket.send(JSON.stringify(payload));
  }

  private setStatus(status: ConnectionStatus): void {
    this.options.onStatus?.(status);
  }
}
