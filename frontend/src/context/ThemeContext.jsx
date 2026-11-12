import { createContext, useContext, useEffect, useMemo, useState } from 'react';

// Light / dark / system theme. The choice is saved per browser; "system"
// follows the OS and updates live when the OS switches. index.html applies
// the saved theme before the app loads so there is no flash.
export const THEME_KEY = 'taskhub_theme';
export const THEMES = ['system', 'light', 'dark'];

function readMode() {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return THEMES.includes(v) ? v : 'system';
  } catch {
    return 'system';
  }
}

const systemDark = () =>
  typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-color-scheme: dark)').matches);

export function resolveTheme(mode, osDark) {
  if (mode === 'light' || mode === 'dark') return mode;
  return osDark ? 'dark' : 'light';
}

const ThemeContext = createContext({ mode: 'system', theme: 'light', setMode: () => {} });

export function ThemeProvider({ children }) {
  const [mode, setModeState] = useState(readMode);
  const [osDark, setOsDark] = useState(systemDark);

  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!mq) return undefined;
    const onChange = () => setOsDark(mq.matches);
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, []);

  const theme = resolveTheme(mode, osDark);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme;
    root.style.colorScheme = theme;
    root.style.background = '';
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0a0a09' : '#f3efe6');
  }, [theme]);

  const value = useMemo(
    () => ({
      mode,
      theme,
      setMode: (m) => {
        if (!THEMES.includes(m)) return;
        try {
          localStorage.setItem(THEME_KEY, m);
        } catch {
          /* private mode */
        }
        setModeState(m);
      },
    }),
    [mode, theme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);
