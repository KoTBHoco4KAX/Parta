// MAX Bridge SDK: платформа подключает window.MaxBridge скриптом
// https://st.max.ru/js/max-bridge.js. В обычном браузере объекта нет, поэтому
// приложение обязано стартовать без ошибок и без сетевых вызовов.

export interface MaxBridgeStatus {
  supported: boolean;
  initialized: boolean;
  reason?: string;
}

interface MaxBridgeApi {
  send(method: string, params?: unknown): unknown;
}

declare global {
  interface Window {
    MaxBridge?: MaxBridgeApi;
  }
}

const INIT_TIMEOUT_MS = 1_500;

let status: MaxBridgeStatus = {
  supported: false,
  initialized: false,
  reason: 'not-initialized',
};

let pending: Promise<MaxBridgeStatus> | null = null;

function fallback(reason: string): MaxBridgeStatus {
  status = { supported: false, initialized: false, reason };

  return status;
}

function describeError(cause: unknown): string {
  if (cause instanceof Error) {
    return cause.message;
  }

  if (typeof cause === 'string') {
    return cause;
  }

  return 'unknown-error';
}

function getBridge(): MaxBridgeApi | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const bridge = window.MaxBridge;

  return bridge && typeof bridge.send === 'function' ? bridge : null;
}

export function getMaxBridgeStatus(): MaxBridgeStatus {
  return status;
}

// initMaxBridge идемпотентен и никогда не reject-ит.
export function initMaxBridge(): Promise<MaxBridgeStatus> {
  if (pending) {
    return pending;
  }

  const bridge = getBridge();
  console.log('[MAX Auth] window.MaxBridge', Boolean(bridge));

  if (!bridge) {
    pending = Promise.resolve(fallback('max-bridge-missing'));

    return pending;
  }

  console.log('[MAX Auth] bridge send ready/expand');

  const timeout = new Promise<MaxBridgeStatus>((resolve) => {
    window.setTimeout(() => resolve(fallback('init-timeout')), INIT_TIMEOUT_MS);
  });

  const attempt = Promise.allSettled([
    Promise.resolve().then(() => bridge.send('ready')),
    Promise.resolve().then(() => bridge.send('expand')),
  ]).then<MaxBridgeStatus>((results) => {
    const readyOK = results[0]?.status === 'fulfilled';

    status = readyOK
      ? { supported: true, initialized: true }
      : {
          supported: true,
          initialized: false,
          reason: `ready-failed: ${describeError(
            results[0]?.status === 'rejected' ? results[0].reason : 'unknown',
          )}`,
        };

    console.log('[MAX Auth] bridge status', status);

    return status;
  });

  pending = Promise.race([attempt, timeout]);

  return pending;
}

// readMaxLaunchParams собирает параметры запуска MAX из query и hash.
// Возвращает null в обычном браузере, чтобы не запускать MAX-авторизацию.
export function readMaxLaunchParams(): Record<string, string> | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const params: Record<string, string> = {};

  collectParams(window.location.search, params);

  const hash = window.location.hash.replace(/^#/, '');
  const question = hash.indexOf('?');

  if (question >= 0) {
    collectParams(hash.slice(question), params);
  } else if (hash.includes('=') && !hash.startsWith('/')) {
    collectParams(hash, params);
  }

  const hasLaunchParams =
    params.hash !== undefined ||
    params.user_id !== undefined ||
    params.max_user_id !== undefined;

  console.log(
    '[MAX Auth] launch params',
    hasLaunchParams
      ? {
          user_id: params.user_id ?? params.max_user_id,
          has_hash: Boolean(params.hash),
        }
      : 'not found',
  );

  return hasLaunchParams ? params : null;
}

function collectParams(source: string, target: Record<string, string>): void {
  if (!source) {
    return;
  }

  new URLSearchParams(source).forEach((value, key) => {
    target[key] = value;
  });
}
