import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  ApiError,
  demoLogin as demoLoginRequest,
  loginWithMax,
  registerMax as registerMaxRequest,
} from './api';
import { readMaxLaunchParams } from './max';
import { AUTH_STORAGE_KEY } from './session';
import { PartaSocket } from './ws';
import type {
  ConnectionStatus,
  DemoAccount,
  DevLoginResponse,
  Role,
  User,
  WsEvent,
} from './types';

const STORAGE_KEY = AUTH_STORAGE_KEY;
const EVENT_LIMIT = 100;

interface StoredAuth {
  token: string;
  user: User;
}

export interface MaxOnboarding {
  params: Record<string, string>;
  maxUserId: string;
  displayName: string;
}

interface AuthContextValue {
  token: string | null;
  user: User | null;
  role: Role | null;
  busy: boolean;
  error: string | null;
  connection: ConnectionStatus;
  events: WsEvent[];
  maxPresent: boolean;
  maxChecking: boolean;
  maxOnboarding: MaxOnboarding | null;
  demoLogin: (account: DemoAccount, code?: string) => Promise<void>;
  registerMax: (role: Role, code?: string) => Promise<void>;
  logout: () => void;
  subscribe: (listener: (event: WsEvent) => void) => () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function loadStoredAuth(): StoredAuth | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<StoredAuth>;
    if (typeof parsed.token !== 'string' || !parsed.user) {
      return null;
    }

    return { token: parsed.token, user: parsed.user as User };
  } catch {
    return null;
  }
}

function saveAuth(response: DevLoginResponse): StoredAuth {
  const next = { token: response.token, user: response.user };

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));

  return next;
}

// AuthProvider хранит токен/пользователя, владеет единственным сокетом сессии
// и обновляет профиль по событиям XP/стрика.
export function AuthProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<StoredAuth | null>(loadStoredAuth);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connection, setConnection] = useState<ConnectionStatus>('offline');
  const [events, setEvents] = useState<WsEvent[]>([]);
  const [maxPresent] = useState(() => readMaxLaunchParams() !== null);
  const [maxChecking, setMaxChecking] = useState(
    () => readMaxLaunchParams() !== null && loadStoredAuth() === null,
  );
  const [maxOnboarding, setMaxOnboarding] = useState<MaxOnboarding | null>(null);
  const socketRef = useRef<PartaSocket | null>(null);
  const listenersRef = useRef(new Set<(event: WsEvent) => void>());
  const maxLoginAttempted = useRef(false);

  const subscribe = useCallback((listener: (event: WsEvent) => void) => {
    listenersRef.current.add(listener);

    return () => {
      listenersRef.current.delete(listener);
    };
  }, []);

  useEffect(() => {
    if (auth || !maxPresent || maxLoginAttempted.current) {
      if (auth) {
        setMaxChecking(false);
      }

      return;
    }

    const params = readMaxLaunchParams();

    if (!params) {
      setMaxChecking(false);

      return;
    }

    maxLoginAttempted.current = true;
    setMaxChecking(true);
    setError(null);

    console.log('[MAX Auth] launch params', params);
    console.log('[MAX Auth] POST /api/auth/max');

    // Не отменяем запрос в cleanup: в React StrictMode эффект запускается
    // дважды, и старый cancelled=true оставлял экран в вечном спиннере.
    loginWithMax(params)
      .then((response) => {
        console.log('[MAX Auth] response', response);

        if ('needs_onboarding' in response) {
          console.log('[MAX Auth] needs onboarding', response.max_user_id);
          setMaxChecking(false);
          setMaxOnboarding({
            params,
            maxUserId: response.max_user_id,
            displayName: response.display_name,
          });

          return;
        }

        console.log('[MAX Auth] session received');
        setMaxChecking(false);
        setAuth(saveAuth(response));
      })
      .catch((err: unknown) => {
        console.error('[MAX Auth] request failed', err);
        setMaxChecking(false);
        setError(err instanceof ApiError ? err.message : 'Не удалось войти через MAX');
      })
      .finally(() => {
        setMaxChecking(false);
      });
  }, [auth, maxPresent]);

  const registerMax = useCallback(
    async (role: Role, code = '') => {
      if (!maxOnboarding) {
        return;
      }

      setBusy(true);
      setError(null);

      try {
        const response = await registerMaxRequest(maxOnboarding.params, role, code);

        setAuth(saveAuth(response));
        setMaxOnboarding(null);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Не удалось создать аккаунт');
        throw err;
      } finally {
        setBusy(false);
      }
    },
    [maxOnboarding],
  );

  const demoLogin = useCallback(async (account: DemoAccount, code = '') => {
    setBusy(true);
    setError(null);

    try {
      const response = await demoLoginRequest(account, code);

      setAuth(saveAuth(response));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось войти в демо-режим');
      throw err;
    } finally {
      setBusy(false);
    }
  }, []);

  const logout = useCallback(() => {
    window.localStorage.removeItem(STORAGE_KEY);
    maxLoginAttempted.current = true;
    setAuth(null);
    setMaxOnboarding(null);
    setEvents([]);
    setConnection('offline');
  }, []);

  const token = auth?.token ?? null;

  useEffect(() => {
    if (!token) {
      setConnection('offline');
      return;
    }

    const socket = new PartaSocket({
      token,
      onStatus: (status) => {
        console.log('[WS] auth status', status);
        setConnection(status);
      },
      onEvent: (event) => {
        setEvents((previous) => [event, ...previous].slice(0, EVENT_LIMIT));
        applyUserEvent(event, setAuth);

        for (const listener of listenersRef.current) {
          try {
            listener(event);
          } catch (cause) {
            console.error('ws: event listener failed', cause);
          }
        }
      },
    });

    socketRef.current = socket;
    // Не открываем сокет синхронно из effect: в React StrictMode первый
    // effect успевает создать соединение, а cleanup сразу его закрывает.
    // Даём StrictMode отменить пробный запуск и открываем один сокет.
    const connectTimer = window.setTimeout(() => {
      socket.connect();
    }, 0);

    return () => {
      window.clearTimeout(connectTimer);
      socket.close();
      socketRef.current = null;
    };
  }, [token]);

  const value = useMemo<AuthContextValue>(
    () => ({
      token,
      user: auth?.user ?? null,
      role: auth?.user.role ?? null,
      busy,
      error,
      connection,
      events,
      maxPresent,
      maxChecking,
      maxOnboarding,
      demoLogin,
      registerMax,
      logout,
      subscribe,
    }),
    [
      auth,
      busy,
      connection,
      demoLogin,
      error,
      events,
      maxChecking,
      maxOnboarding,
      maxPresent,
      registerMax,
      subscribe,
      token,
    ],
  );

  return createElement(AuthContext.Provider, { value }, children);
}

function applyUserEvent(
  event: WsEvent,
  setAuth: (update: (previous: StoredAuth | null) => StoredAuth | null) => void,
): void {
  if (event.event_type === 'streak.updated') {
    const payload = event.payload as {
      user_id?: number;
      on_time_streak?: number;
      streak_freezes?: number;
    };

    setAuth((previous) => {
      if (!previous || previous.user.id !== payload.user_id) {
        return previous;
      }

      return {
        ...previous,
        user: {
          ...previous.user,
          on_time_streak: payload.on_time_streak ?? previous.user.on_time_streak,
          streak_freezes: payload.streak_freezes ?? previous.user.streak_freezes,
        },
      };
    });

    return;
  }

  if (event.event_type === 'xp.ledger.posted') {
    const payload = event.payload as { user_id?: number; balance_after?: number };

    setAuth((previous) => {
      if (
        !previous ||
        previous.user.id !== payload.user_id ||
        typeof payload.balance_after !== 'number'
      ) {
        return previous;
      }

      return {
        ...previous,
        user: { ...previous.user, xp_balance: payload.balance_after },
      };
    });
  }
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }

  return context;
}
