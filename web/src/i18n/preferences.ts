/**
 * The synchronous preference store.
 *
 * Theme, locale and numerals must be readable *before first paint* so the shell
 * never flashes the wrong direction or colour. That rules out IndexedDB, which
 * is async, and points at localStorage. This module is the typed gate over it;
 * the pre-paint bootstrap script in the root layout reads the same keys by hand
 * because it has to run before any module loads.
 */
import {
  DEFAULT_LOCALE,
  DEFAULT_NUMERALS,
  STORAGE_KEYS,
  isLocale,
  isNumerals,
  type Locale,
  type Numerals,
} from './config';

export type ThemePreference = 'light' | 'dark' | 'system';
export const DEFAULT_THEME: ThemePreference = 'system';

function read(key: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Private-mode or quota failure: the in-memory setting still applies for the
    // session; it simply will not persist. Never throw over a preference.
  }
}

export function readLocale(): Locale {
  const stored = read(STORAGE_KEYS.locale);
  return isLocale(stored) ? stored : DEFAULT_LOCALE;
}

export function writeLocale(locale: Locale): void {
  write(STORAGE_KEYS.locale, locale);
}

/**
 * The digits a language reads in until someone chooses (batch 32): Arabic-
 * Indic in Arabic, Western in English. The setting used to default to
 * Arabic-Indic whatever the language, so English read «٢ delivery orders».
 */
export function defaultNumeralsFor(locale: Locale): Numerals {
  return locale === 'en' ? 'western' : DEFAULT_NUMERALS;
}

/** The numerals someone chose, or null if they never did. */
export function readStoredNumerals(): Numerals | null {
  const stored = read(STORAGE_KEYS.numerals);
  return isNumerals(stored) ? stored : null;
}

export function readNumerals(locale: Locale = readLocale()): Numerals {
  return readStoredNumerals() ?? defaultNumeralsFor(locale);
}

export function writeNumerals(numerals: Numerals): void {
  write(STORAGE_KEYS.numerals, numerals);
}

export function readTheme(): ThemePreference {
  const stored = read(STORAGE_KEYS.theme);
  return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : DEFAULT_THEME;
}

export function writeTheme(theme: ThemePreference): void {
  write(STORAGE_KEYS.theme, theme);
}
