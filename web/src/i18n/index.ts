/**
 * i18n public surface.
 *
 * Server components (metadata, SSR shells) use the pure `translate` with an
 * explicit locale. Client components use `useI18n()`, which binds the current
 * locale and numeral setting and re-renders on change.
 */
export {
  LOCALES,
  DEFAULT_LOCALE,
  DEFAULT_NUMERALS,
  TIME_ZONE,
  direction,
  isLocale,
  isNumerals,
  STORAGE_KEYS,
  type Locale,
  type Numerals,
  type Direction,
} from './config';

export { translate, type MessageKey, type TranslateParams } from './catalog';
export { formatInteger, formatMoney, formatTime, formatDate } from './format';
export { I18nProvider, useI18n } from './I18nProvider';

import { translate, type MessageKey, type TranslateParams } from './catalog';
import { DEFAULT_LOCALE, type Locale } from './config';

/** Server/default-locale convenience for places without a provider (metadata). */
export function t(key: MessageKey, locale: Locale = DEFAULT_LOCALE, params?: TranslateParams): string {
  return translate(locale, key, params);
}
