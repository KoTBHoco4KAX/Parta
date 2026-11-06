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

// Тема приложения: светлая/тёмная + скин «Идея Фикс».
// Значения хранятся в localStorage и проставляются классами на <html>,
// откуда их читают CSS-переменные палитры.

export type Theme = 'light' | 'dark';
export type Skin = 'default' | 'ideya-fix';

const STORAGE_KEY = 'parta.theme';
const SKIN_KEY = 'parta.skin';

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

function readStoredSkin(): Skin {
  try {
    return window.localStorage.getItem(SKIN_KEY) === 'ideya-fix' ? 'ideya-fix' : 'default';
  } catch {
    return 'default';
  }
}

interface ThemeContextValue {
  theme: Theme;
  skin: Skin;
  setTheme: (theme: Theme) => void;
  setSkin: (skin: Skin) => void;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(readStoredTheme);
  const [skin, setSkinState] = useState<Skin>(readStoredSkin);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.classList.toggle('dark', theme === 'dark');
    document.documentElement.classList.toggle('theme-ideya-fix', skin === 'ideya-fix');

    try {
      window.localStorage.setItem(STORAGE_KEY, theme);
      window.localStorage.setItem(SKIN_KEY, skin);
    } catch {
      // Запоминать тему не обязательно: интерфейс работает и без storage.
    }
  }, [theme, skin]);

  const setTheme = useCallback((next: Theme) => setThemeState(next), []);
  const setSkin = useCallback((next: Skin) => setSkinState(next), []);
  const toggle = useCallback(
    () => setThemeState((previous) => (previous === 'light' ? 'dark' : 'light')),
    [],
  );

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, skin, setTheme, setSkin, toggle }),
    [theme, skin, setTheme, setSkin, toggle],
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
