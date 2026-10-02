/**
 * The reference recorded with a bank transfer or wallet payment (review
 * finding F08).
 *
 * It is what the cashier reads off the customer's confirmation — the till used
 * to invent one from the clock, so a recorded transfer could never be matched
 * to a real one. Recording is manual: nothing here checks with a bank. A value
 * too short to identify a transaction is refused; the server stores up to 80
 * characters.
 */
export const MIN_REFERENCE_LENGTH = 4;
export const MAX_REFERENCE_LENGTH = 80;

export function cleanReference(raw: string): string {
  return raw.trim();
}

export function isUsableReference(raw: string): boolean {
  const reference = cleanReference(raw);
  return reference.length >= MIN_REFERENCE_LENGTH && reference.length <= MAX_REFERENCE_LENGTH;
}
