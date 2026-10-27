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
import { ApiError, devLogin } from './api';
import { PartaSocket } from './ws';
import type { ConnectionStatus, Role, User, WsEvent } from './types';

// ROLE_EMAILS — dev-аккаунты сида (PROJECT_MANIFEST.md §4.3).
export const ROLE_EMAILS: Record<Role, string> = {
  admin: 'admin@parta.dev',
  teacher: 'teacher@parta.dev',
  student: 'student1@parta.dev',
};

const STORAGE_KEY = 'parta.auth';
const EVENT_LIMIT = 100;

interface StoredAuth {
  token: string;
  user: User;
}

interface AuthContextValue {
  token: string | null;
  user: User | null;
  role: Role | null;
  busy: boolean;
  error: string | null;
  connection: ConnectionStatus;
  events: WsEvent[];
  login: (role: Role) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// loadStoredAuth читает сессию из localStorage (переживает перезагрузку).
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

// AuthProvider хранит токен/пользователя, владеет единственным сокетом сессии
// и обновляет профиль по событиям XP/стрика.
export function AuthProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<StoredAuth | null>(loadStoredAuth);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connection, setConnection] = useState<ConnectionStatus>('offline');
  const [events, setEvents] = useState<WsEvent[]>([]);
  const socketRef = useRef<PartaSocket | null>(null);

  const login = useCallback(async (role: Role) => {
    setBusy(true);
    setError(null);

    try {
      const response = await devLogin(ROLE_EMAILS[role]);
      const next = { token: response.token, user: response.user };

      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      setAuth(next);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось войти');
      throw err;
    } finally {
      setBusy(false);
    }
  }, []);

  const logout = useCallback(() => {
    window.localStorage.removeItem(STORAGE_KEY);
    setAuth(null);
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
      onStatus: setConnection,
      onEvent: (event) => {
        setEvents((previous) => [event, ...previous].slice(0, EVENT_LIMIT));
        applyUserEvent(event, setAuth);
      },
    });

    socketRef.current = socket;
    socket.connect();

    return () => {
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
      login,
      logout,
    }),
    [auth, busy, connection, error, events, login, logout, token],
  );

  return createElement(AuthContext.Provider, { value }, children);
}

// applyUserEvent точечно патчит профиль по событиям, не перезапрашивая REST.
function applyUserEvent(event: WsEvent, setAuth: (update: (previous: StoredAuth | null) => StoredAuth | null) => void): void {
  if (event.event_type === 'streak.updated') {
    const payload = event.payload as { user_id?: number; on_time_streak?: number; streak_freezes?: number };

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
      if (!previous || previous.user.id !== payload.user_id || typeof payload.balance_after !== 'number') {
        return previous;
      }

      return {
        ...previous,
        user: { ...previous.user, xp_balance: payload.balance_after },
      };
    });
  }
}

// useAuth даёт доступ к сессии; вне провайдера — ошибка разработчика.
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }

  return context;
}
