// MAX Bridge / WebApp SDK.
// Платформа подключает window.WebApp скриптом max-web-app.js и может
// дополнительно предоставлять window.MaxBridge. Приложение работает и без них.

export interface MaxBridgeStatus {
  supported: boolean;
  initialized: boolean;
  reason?: string;
}

interface MaxBridgeApi {
  send(method: string, params?: unknown): unknown;
}

interface MaxWebAppUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
}

interface MaxWebAppApi {
  initData?: string;
  initDataUnsafe?: {
    user?: MaxWebAppUser;
    chat?: { id?: number; type?: string };
    start_param?: string;
  };
  platform?: string;
  version?: string;
}

declare global {
  interface Window {
    MaxBridge?: MaxBridgeApi;
    WebApp?: MaxWebAppApi;
  }
}

/** Параметры, с которыми приложение открыто внутри MAX. */
export interface MaxLaunch {
  params: Record<string, string>;
  initData?: string;
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

function getWebApp(): MaxWebAppApi | null {
  if (typeof window === 'undefined') {
    return null;
  }

  return window.WebApp ?? null;
}

/**
 * isMaxNative — приложение открыто внутри клиента MAX.
 *
 * MAX не обязан добавлять query-параметры в чистый URL мини-приложения:
 * внутри WebView достаточно наличия WebApp/MaxBridge или iframe-контекста.
 */
export function isMaxNative(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  let embedded = false;

  try {
    embedded = window.self !== window.top;
  } catch {
    embedded = true;
  }

  return embedded || getBridge() !== null || Boolean(getWebApp()?.initData);
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
  const webApp = getWebApp();
  console.log('[MAX Auth] window.MaxBridge', Boolean(bridge), 'window.WebApp', Boolean(webApp));

  if (!bridge && !webApp) {
    pending = Promise.resolve(fallback('max-bridge-missing'));

    return pending;
  }

  if (!bridge) {
    status = { supported: true, initialized: true, reason: 'webapp-only' };
    pending = Promise.resolve(status);

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

/**
 * readMaxLaunch собирает данные запуска MAX.
 *
 * Приоритет: initData WebApp (подписанные данные пользователя), затем
 * query/hash параметры старого формата. Если приложение открыто в MAX, но
 * параметров ещё нет, возвращается пустой launch — auth.ts не должен в этом
 * случае включать браузерный демо-режим.
 */
export function readMaxLaunch(): MaxLaunch | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const webApp = getWebApp();
  if (webApp?.initData) {
    console.log('[MAX Auth] WebApp initData found');
    console.log('[MAX Auth] WebApp user', webApp.initDataUnsafe?.user ?? null);

    return { params: {}, initData: webApp.initData };
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

  if (hasLaunchParams) {
    console.log('[MAX Auth] URL launch params found', {
      user_id: params.user_id ?? params.max_user_id,
      has_hash: Boolean(params.hash),
    });

    return { params };
  }

  if (isMaxNative()) {
    console.log('[MAX Auth] native MAX context without launch params');

    return { params };
  }

  console.log('[MAX Auth] launch params not found (browser mode)');

  return null;
}

// Совместимый helper для старого кода.
export function readMaxLaunchParams(): Record<string, string> | null {
  return readMaxLaunch()?.params ?? null;
}

function collectParams(source: string, target: Record<string, string>): void {
  if (!source) {
    return;
  }

  new URLSearchParams(source).forEach((value, key) => {
    target[key] = value;
  });
}
