import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

// Тема приложения: тёмная по умолчанию и светлая по переключателю.
// Значение хранится в localStorage и проставляется в data-theme на <html>,
// откуда его читают CSS-переменные палитры.

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'parta.theme';

function readStoredTheme(): Theme {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);

    if (raw === 'light' || raw === 'dark') {
      return raw;
    }
  } catch {
    // Приватный режим или запрещённый storage — работаем с тёмной темой.
  }

  return 'dark';
}

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(readStoredTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.classList.toggle('dark', theme === 'dark');

    try {
      window.localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // Запоминать тему не обязательно: интерфейс работает и без storage.
    }
  }, [theme]);

  const setTheme = useCallback((next: Theme) => setThemeState(next), []);
  const toggle = useCallback(
    () => setThemeState((previous) => (previous === 'light' ? 'dark' : 'light')),
    [],
  );

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, setTheme, toggle }),
    [theme, setTheme, toggle],
  );

  return createElement(ThemeContext.Provider, { value }, children);
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);

  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }

  return context;
}
