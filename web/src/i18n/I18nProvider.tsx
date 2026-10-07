'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { direction, type Direction, type Locale, type Numerals } from './config';
import { plural, translate, type MessageKey, type TranslateParams } from './catalog';
import { formatInteger, formatMoney } from './format';
import {
  defaultNumeralsFor,
  readLocale,
  readStoredNumerals,
  writeLocale,
  writeNumerals,
} from './preferences';

interface I18nContextValue {
  locale: Locale;
  numerals: Numerals;
  dir: Direction;
  t(key: MessageKey, params?: TranslateParams): string;
  /**
   * A counted message in the form the count takes in this language: "قبل
   * دقيقتين", "قبل ٥ دقائق", "قبل ١١ دقيقة". `{count}` is filled in with the
   * reader's numerals.
   */
  plural(key: MessageKey, count: number, params?: TranslateParams): string;
  /** Money in minor units → display string, honouring the numeral setting. */
  money(minor: bigint): string;
  /** An integer count → display string (e.g. item counts, order numbers). */
  int(value: number | bigint): string;
  setLocale(locale: Locale): void;
  setNumerals(numerals: Numerals): void;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  // Initialised from localStorage on the first client render, matching what the
  // pre-paint bootstrap already applied to <html>.
  const [locale, setLocaleState] = useState<Locale>(() => readLocale());
  // A choice once made stands; until then the digits follow the language
  // (batch 32).
  const [numeralsChoice, setNumeralsChoice] = useState<Numerals | null>(() => readStoredNumerals());
  const numerals = numeralsChoice ?? defaultNumeralsFor(locale);

  // Keep <html lang/dir> tied to the locale React actually rendered with.
  //
  // This is not belt-and-braces over the pre-paint bootstrap, it is the thing
  // that makes the setting stick. The export is built with the default locale
  // baked into <html lang="ar" dir="rtl">; the bootstrap corrects it before
  // paint, but hydration then reconciles those attributes back to the built-in
  // values. The visible result was a half-switched screen — English text laid
  // out right-to-left — on every fresh page load after choosing English.
  useEffect(() => {
    document.documentElement.setAttribute('lang', locale);
    document.documentElement.setAttribute('dir', direction(locale));
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    writeLocale(next);
    // The effect above applies lang/dir; switching needs no reload and loses no
    // order — the order lives in IndexedDB, only text and direction change.
  }, []);

  const setNumerals = useCallback((next: Numerals) => {
    setNumeralsChoice(next);
    writeNumerals(next);
  }, []);

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      numerals,
      dir: direction(locale),
      t: (key, params) => translate(locale, key, params),
      plural: (key, count, params) =>
        plural(locale, key, count, { count: formatInteger(count, numerals), ...params }),
      money: (minor) => formatMoney(minor, numerals),
      int: (n) => formatInteger(n, numerals),
      setLocale,
      setNumerals,
    }),
    [locale, numerals, setLocale, setNumerals],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);
  if (!context) throw new Error('useI18n must be used within an I18nProvider.');
  return context;
}
