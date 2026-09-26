/**
 * Number, money, time and date formatting.
 *
 * The rules come straight from the design's "NUMERALS — MONOSPACE, NEVER
 * MIRRORED" note and the two numeral systems the prototype supports:
 *
 *   - **Amounts and counts** follow the numeral setting. Arabic-Indic uses the
 *     digits ٠-٩ and the U+066C thousands separator (٬); Western uses 0-9 and a
 *     comma. Negatives use the true minus sign U+2212, as the mockups do
 *     (−١٢٬٥٠٠).
 *   - **Clocks and dates** are *always* Western digits and always LTR — the
 *     mockups show 14:32 and 2026-08-06 identically in both languages. They are
 *     never mirrored and never localised, so they read the same on every
 *     receipt and every screen.
 *
 * Money is grouped with zero decimals (see MONEY_FRACTION_DIGITS): the stored
 * integer is the amount shown.
 */
import {
  MONEY_FRACTION_DIGITS,
  TIME_ZONE,
  type Numerals,
} from './config';

const ARABIC_INDIC_DIGITS = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
const ARABIC_GROUP_SEPARATOR = '٬'; // ٬
const WESTERN_GROUP_SEPARATOR = ',';
const MINUS = '−'; // − , not the hyphen-minus

function toArabicIndicDigits(western: string): string {
  return western.replace(/[0-9]/g, (digit) => ARABIC_INDIC_DIGITS[Number(digit)]);
}

function groupThousands(digits: string, separator: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, separator);
}

/** Format an integer according to the numeral system. Accepts number or bigint. */
export function formatInteger(value: number | bigint, numerals: Numerals): string {
  const negative = value < 0;
  const magnitude = (negative ? -value : value).toString();
  const separator = numerals === 'western' ? WESTERN_GROUP_SEPARATOR : ARABIC_GROUP_SEPARATOR;
  let grouped = groupThousands(magnitude, separator);
  if (numerals !== 'western') grouped = toArabicIndicDigits(grouped);
  return negative ? MINUS + grouped : grouped;
}

/**
 * Format money held in minor units. No currency symbol — the design shows none,
 * on any screen or receipt.
 */
export function formatMoney(minor: bigint, numerals: Numerals): string {
  if (MONEY_FRACTION_DIGITS === 0) {
    return formatInteger(minor, numerals);
  }
  const divisor = 10n ** BigInt(MONEY_FRACTION_DIGITS);
  const negative = minor < 0n;
  const magnitude = negative ? -minor : minor;
  const whole = magnitude / divisor;
  const fraction = (magnitude % divisor).toString().padStart(MONEY_FRACTION_DIGITS, '0');
  const separator = numerals === 'western' ? WESTERN_GROUP_SEPARATOR : ARABIC_GROUP_SEPARATOR;
  let body = `${groupThousands(whole.toString(), separator)}.${fraction}`;
  if (numerals !== 'western') body = toArabicIndicDigits(body);
  return negative ? MINUS + body : body;
}

// Clocks and dates are formatted once, in Sudan's zone, with Western digits.
const timeFormatter = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: TIME_ZONE,
});

const dateFormatter = new Intl.DateTimeFormat('en-CA', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  timeZone: TIME_ZONE,
});

/** "14:32" — always Western, always LTR. Wrap in a dir="ltr" span at the edge. */
export function formatTime(date: Date): string {
  return timeFormatter.format(date);
}

/** "2026-08-06" — always Western, always LTR. */
export function formatDate(date: Date): string {
  return dateFormatter.format(date);
}
