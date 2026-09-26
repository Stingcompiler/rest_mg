'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { readTheme, writeTheme, type ThemePreference } from '@/i18n/preferences';

import { applyTheme, resolveTheme, type ResolvedTheme } from './theme';

interface ThemeContextValue {
  /** The user's choice: light, dark, or follow-the-system. */
  preference: ThemePreference;
  /** What that resolves to right now. */
  resolved: ResolvedTheme;
  setTheme(preference: ThemePreference): void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const DARK_QUERY = '(prefers-color-scheme: dark)';

function systemPrefersDark(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia(DARK_QUERY).matches;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // The pre-paint script has already stamped data-theme; this state hydrates
  // from the same source so React agrees with what the user already sees.
  const [preference, setPreference] = useState<ThemePreference>(() => readTheme());
  const [systemDark, setSystemDark] = useState<boolean>(() => systemPrefersDark());

  // Follow the OS while the preference is "system".
  useEffect(() => {
    const media = window.matchMedia(DARK_QUERY);
    const onChange = (event: MediaQueryListEvent) => setSystemDark(event.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  const resolved = resolveTheme(preference, systemDark);

  useEffect(() => {
    applyTheme(resolved);
  }, [resolved]);

  const setTheme = useCallback((next: ThemePreference) => {
    setPreference(next);
    writeTheme(next);
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ preference, resolved, setTheme }),
    [preference, resolved, setTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within a ThemeProvider.');
  return context;
}
