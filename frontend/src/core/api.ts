import type {
  ApiErrorBody,
  Assignment,
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
  Group,
  PeerReview,
  PurchaseFreezesResponse,
  Role,
  StatusResponse,
  Submission,
  Task,
  User,
  VerdictResponse,
  Wager,
} from './types';
import { readStoredToken } from './session';

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

  // options.token === undefined означает «взять текущую сессию из localStorage»;
  // явный null оставляет запрос анонимным (dev-login).
  const token = options.token === undefined ? readStoredToken() : options.token;

  if (token) {
    headers.Authorization = `Bearer ${token}`;
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
    token: null,
  });
}

// loginWithPassword — POST /api/auth/login: email + пароль (любой) + роль.
export function loginWithPassword(
  email: string,
  password: string,
  role: Role,
): Promise<DevLoginResponse> {
  return apiFetch<DevLoginResponse>('/auth/login', {
    method: 'POST',
    token: null,
    body: { email, password, role },
  });
}

// fetchUsers / createUser / deleteUser — управление пользователями (admin).
export function fetchUsers(): Promise<User[]> {
  return apiFetch<User[]>('/users');
}

export function createUser(body: {
  external_id: string;
  display_name: string;
  role: Role;
  group_id: number | null;
}): Promise<User> {
  return apiFetch<User>('/users', { method: 'POST', body });
}

export function deleteUser(id: number): Promise<void> {
  return apiFetch<void>(`/users/${id}`, { method: 'DELETE' });
}

// fetchGroups / createGroup / deleteGroup — управление группами (admin).
export function fetchGroups(): Promise<Group[]> {
  return apiFetch<Group[]>('/groups');
}

export function createGroup(body: { code: string; title: string }): Promise<Group> {
  return apiFetch<Group>('/groups', { method: 'POST', body });
}

export function deleteGroup(id: number): Promise<void> {
  return apiFetch<void>(`/groups/${id}`, { method: 'DELETE' });
}

function auth(token: string | null) {
  return { token };
}

/**
 * apiFetch — единая точка интеграции экранов с backend.
 *
 * Токен по умолчанию берётся из localStorage (сессия AuthProvider), поэтому
 * вызывающему коду не нужно протаскивать его через props. Ошибки приходят
 * типом ApiError с `status` и `code`.
 */
export function apiFetch<T>(
  path: string,
  options: Omit<RequestOptions, 'token'> & { token?: string | null } = {},
): Promise<T> {
  return request<T>(path, options);
}

// fetchTasks — GET /api/tasks: backend сам режет выдачу по роли.
export function fetchTasks(): Promise<Task[]> {
  return apiFetch<Task[]>('/tasks');
}

// fetchSubmissions — GET /api/submissions?status=..., карточки с данными задания.
export function fetchSubmissions(status?: string): Promise<Submission[]> {
  const query = status ? `?status=${encodeURIComponent(status)}` : '';

  return apiFetch<Submission[]>(`/submissions${query}`);
}

// fetchWagers — GET /api/wagers: пари текущего студента.
export function fetchWagers(): Promise<Wager[]> {
  return apiFetch<Wager[]>('/wagers');
}

// fetchPeerReviews — GET /api/peer-reviews: sandbox-сессии преподавателя.
export function fetchPeerReviews(): Promise<PeerReview[]> {
  return apiFetch<PeerReview[]>('/peer-reviews');
}

// fetchAssignments — GET /api/assignments: пары «группа + дисциплина».
export function fetchAssignments(): Promise<Assignment[]> {
  return apiFetch<Assignment[]>('/assignments');
}

// createSubmissionCard — POST /api/submissions: идемпотентная карточка TODO.
export function createSubmissionCard(
  taskId: number,
  teamSlotId?: number,
): Promise<CreateSubmissionResponse> {
  return apiFetch<CreateSubmissionResponse>('/submissions', {
    method: 'POST',
    body: { task_id: taskId, team_slot_id: teamSlotId },
  });
}

// moveSubmission — PATCH /api/submissions/{id}/status.
export function moveSubmission(
  submissionId: number,
  event: 'START' | 'SUBMIT' | 'REOPEN',
  artifact?: { url: string; hash: string },
): Promise<StatusResponse> {
  return apiFetch<StatusResponse>(`/submissions/${submissionId}/status`, {
    method: 'PATCH',
    body: {
      event,
      artifact_url: artifact?.url,
      artifact_hash: artifact?.hash,
    },
  });
}

// issueVerdict — POST /api/submissions/{id}/verdict.
export function issueVerdict(
  submissionId: number,
  verdict: 'ACCEPT' | 'REJECT',
  comment?: string,
): Promise<VerdictResponse> {
  return apiFetch<VerdictResponse>(`/submissions/${submissionId}/verdict`, {
    method: 'POST',
    body: { verdict, comment },
  });
}

// buyStreakFreezes — POST /api/users/me/streak-freezes/purchase.
export function buyStreakFreezes(quantity: number): Promise<PurchaseFreezesResponse> {
  return apiFetch<PurchaseFreezesResponse>('/users/me/streak-freezes/purchase', {
    method: 'POST',
    body: { quantity },
  });
}

// placeWager — POST /api/wagers.
export function placeWager(body: CreateWagerRequest): Promise<CreateWagerResponse> {
  return apiFetch<CreateWagerResponse>('/wagers', { method: 'POST', body });
}

// createTaskReal — POST /api/tasks для админки.
export function createTaskReal(body: CreateTaskRequest): Promise<CreateTaskResponse> {
  return apiFetch<CreateTaskResponse>('/tasks', { method: 'POST', body });
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
