/**
 * The three display preferences and the facts about them.
 *
 * Locale and numerals are **independent** settings, exactly as the design
 * prototype models them: an Arabic cashier can choose Western digits, and the
 * numeral system is not implied by the language. Both, plus theme, are read
 * synchronously before first paint (see the bootstrap script in the root
 * layout), so their durable home is localStorage, not IndexedDB.
 */

export const LOCALES = ['ar', 'en'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'ar';

export type Numerals = 'arabic-indic' | 'western';
export const DEFAULT_NUMERALS: Numerals = 'arabic-indic';

export type Direction = 'rtl' | 'ltr';

/** All times, dates, and financial reports are bucketed in the restaurant's zone. */
export const TIME_ZONE = 'Africa/Khartoum';

/**
 * Money display. The mockups show whole thousands with no currency symbol and
 * no decimal part, and the stored integer *is* the amount shown (12500 →
 * "12,500"). SDG has no practically-used subunit, so the "minor unit" here is
 * one pound. If a subunit is ever reintroduced, raise this to 2 — it is the one
 * knob that changes money rendering everywhere.
 */
export const MONEY_FRACTION_DIGITS = 0;

export function direction(locale: Locale): Direction {
  return locale === 'ar' ? 'rtl' : 'ltr';
}

export function isLocale(value: unknown): value is Locale {
  return value === 'ar' || value === 'en';
}

export function isNumerals(value: unknown): value is Numerals {
  return value === 'arabic-indic' || value === 'western';
}

/** localStorage keys. The pre-paint bootstrap script hardcodes these same strings. */
export const STORAGE_KEYS = {
  theme: 'sp-theme',
  locale: 'sp-locale',
  numerals: 'sp-numerals',
} as const;
