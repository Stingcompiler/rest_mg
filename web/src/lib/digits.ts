/**
 * Digits as typed, in either script, reduced to Western digits only.
 *
 * An Arabic keyboard types ٠١٢٣. A filter of `[^\d]` (ASCII only in
 * JavaScript) threw those away, so an amount typed in Arabic digits came out
 * empty.
 */
const ARABIC_INDIC = /[٠-٩]/g;

export function westernDigits(raw: string): string {
  return raw.replace(ARABIC_INDIC, (digit) => String(digit.charCodeAt(0) - 0x0660));
}

export function digitsOnly(raw: string): string {
  return westernDigits(raw).replace(/\D/g, '');
}
