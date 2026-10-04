/**
 * Message lookup with `{name}` interpolation.
 *
 * The two catalogues are kept key-identical by a compile-time check below: if
 * English ever drifts from Arabic, `tsc` fails rather than shipping a silent
 * fallback to the wrong language. `MessageKey` is the union of every key, so a
 * typo in `t('pos.titel')` is a type error, not a string that renders itself.
 */
import ar from './messages/ar.json';
import en from './messages/en.json';
import { DEFAULT_LOCALE, type Locale } from './config';

export type MessageKey = keyof typeof ar;

// Both catalogues must carry exactly the same keys. These assignments fail to
// compile the moment one side gains or loses a key.
const _arCoversEn: Record<keyof typeof en, string> = ar;
const _enCoversAr: Record<keyof typeof ar, string> = en;
void _arCoversEn;
void _enCoversAr;

const CATALOGUES: Record<Locale, Record<string, string>> = { ar, en };

export type TranslateParams = Record<string, string | number>;

export function translate(locale: Locale, key: MessageKey, params?: TranslateParams): string {
  const template =
    CATALOGUES[locale]?.[key] ?? CATALOGUES[DEFAULT_LOCALE][key] ?? (key as string);
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in params ? String(params[name]) : whole,
  );
}

/** Does the catalogue have this key? For codes that arrive at runtime. */
export function hasMessage(key: string): key is MessageKey {
  return Object.prototype.hasOwnProperty.call(ar, key);
}

const PLURAL_RULES: Partial<Record<Locale, Intl.PluralRules>> = {};

/**
 * A counted message in the right form for the count (batch 15).
 *
 * Arabic has six plural categories (zero, one, two, few, many, other) and a
 * counted noun changes with each, where one form used to serve every count
 * ("قبل ٥ دقيقة"). A key with plural forms has `key.zero` … `key.other` in both
 * catalogues; a key without them is used as it is.
 */
export function plural(locale: Locale, key: MessageKey, count: number, params?: TranslateParams): string {
  const rules = (PLURAL_RULES[locale] ??= new Intl.PluralRules(locale));
  const form = `${key}.${rules.select(count)}`;
  const chosen = hasMessage(form) ? form : hasMessage(`${key}.other`) ? (`${key}.other` as MessageKey) : key;
  return translate(locale, chosen, { count, ...params });
}
