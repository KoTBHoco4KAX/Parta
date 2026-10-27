import type {
  ApiErrorBody,
  CarryOverResponse,
  ClaimPeerReviewResponse,
  CompletePeerReviewResponse,
  CreatePeerReviewRequest,
  CreatePeerReviewResponse,
  CreateSubmissionResponse,
  CreateTaskRequest,
  CreateTaskResponse,
  CreateWagerRequest,
  CreateWagerResponse,
  DevLoginResponse,
  PurchaseFreezesResponse,
  StatusResponse,
  User,
  VerdictResponse,
} from './types';

// Vite проксирует /api на backend (см. vite.config.ts), поэтому базовый путь
// относительный: в проде тот же origin, в dev — прокси.
const API_PREFIX = '/api';

// ApiError — единый тип ошибки REST API: HTTP-статус + машинный code.
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  token?: string | null;
  body?: unknown;
  signal?: AbortSignal;
}

// request выполняет fetch, добавляет Bearer и разбирает {error, code}.
export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };

  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }

  const response = await fetch(`${API_PREFIX}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: options.signal,
  });

  const raw = await response.text();
  let payload: unknown = null;

  if (raw.trim() !== '') {
    try {
      payload = JSON.parse(raw);
    } catch {
      throw new ApiError(response.status, 'invalid_json', 'Сервер вернул не JSON');
    }
  }

  if (!response.ok) {
    const body = (payload ?? {}) as Partial<ApiErrorBody>;
    throw new ApiError(
      response.status,
      body.code ?? 'unknown',
      body.error ?? `Запрос завершился с кодом ${response.status}`,
    );
  }

  return payload as T;
}

// devLogin — единственный способ входа до появления внешней авторизации.
export function devLogin(email: string): Promise<DevLoginResponse> {
  return request<DevLoginResponse>('/auth/dev-login', {
    method: 'POST',
    body: { email },
  });
}

function auth(token: string | null) {
  return { token };
}

export const api = {
  devLogin,

  // getMe: read-эндпоинта /api/users/me пока нет (Фаза 7); профиль приходит
  // из dev-login и обновляется WS-событиями. Оставляем тип для будущего экрана.
  createTask(token: string | null, body: CreateTaskRequest): Promise<CreateTaskResponse> {
    return request('/tasks', { ...auth(token), method: 'POST', body });
  },

  createSubmission(
    token: string | null,
    taskId: number,
    teamSlotId?: number,
  ): Promise<CreateSubmissionResponse> {
    return request('/submissions', {
      ...auth(token),
      method: 'POST',
      body: { task_id: taskId, team_slot_id: teamSlotId },
    });
  },

  moveStatus(
    token: string | null,
    submissionId: number,
    event: 'START' | 'SUBMIT' | 'REOPEN',
    artifact?: { url: string; hash: string },
  ): Promise<StatusResponse> {
    return request(`/submissions/${submissionId}/status`, {
      ...auth(token),
      method: 'PATCH',
      body: {
        event,
        artifact_url: artifact?.url,
        artifact_hash: artifact?.hash,
      },
    });
  },

  verdict(
    token: string | null,
    submissionId: number,
    verdict: 'ACCEPT' | 'REJECT',
    comment?: string,
  ): Promise<VerdictResponse> {
    return request(`/submissions/${submissionId}/verdict`, {
      ...auth(token),
      method: 'POST',
      body: { verdict, comment },
    });
  },

  purchaseFreezes(token: string | null, quantity: number): Promise<PurchaseFreezesResponse> {
    return request('/users/me/streak-freezes/purchase', {
      ...auth(token),
      method: 'POST',
      body: { quantity },
    });
  },

  createWager(token: string | null, body: CreateWagerRequest): Promise<CreateWagerResponse> {
    return request('/wagers', { ...auth(token), method: 'POST', body });
  },

  createPeerReview(
    token: string | null,
    body: CreatePeerReviewRequest,
  ): Promise<CreatePeerReviewResponse> {
    return request('/peer-reviews', { ...auth(token), method: 'POST', body });
  },

  claimPeerReview(token: string | null, id: number): Promise<ClaimPeerReviewResponse> {
    return request(`/peer-reviews/${id}/claim`, { ...auth(token), method: 'POST' });
  },

  completePeerReview(
    token: string | null,
    id: number,
    body: { checklist_results: { code: string; passed: boolean }[]; summary: string },
  ): Promise<CompletePeerReviewResponse> {
    return request(`/peer-reviews/${id}/complete`, {
      ...auth(token),
      method: 'POST',
      body,
    });
  },

  carryOverSlot(token: string | null, slotId: number): Promise<CarryOverResponse> {
    return request(`/team-slots/${slotId}/carry-over`, {
      ...auth(token),
      method: 'POST',
    });
  },
} as const;

// userFromToken не нужен: профиль всегда приходит из dev-login.
export type { User };
