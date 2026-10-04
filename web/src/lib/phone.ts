/**
 * A Sudanese phone number, in the one form the restaurant dials: 0 and nine
 * digits ("0912345678").
 *
 * Every website order is confirmed by phone before the kitchen sees it
 * (decision D1), so a number nobody can call is an order nobody can confirm.
 * Accepted: spaces and dashes, Arabic-Indic digits, and the country code as
 * +249, 00249 or 249. The server applies the same rule (apps/orders/phone.py).
 */
import { westernDigits } from './digits';

const PATTERN = /^(?:00249|249|0)?([19]\d{8})$/;

export function normalizeSudanPhone(raw: string): string | null {
  const compact = westernDigits(raw).replace(/[\s\-().]/g, '').replace(/^\+/, '');
  if (!/^\d+$/.test(compact)) return null;
  const match = PATTERN.exec(compact);
  return match ? `0${match[1]}` : null;
}
