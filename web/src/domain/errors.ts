/**
 * The vocabulary of rule violations.
 *
 * Every business rule that can be broken throws a `DomainError` with a stable
 * `code`. The UI maps codes to messages through i18n; nothing catches on the
 * message text. A rule violation is never a silent no-op — the entity refuses
 * and says why.
 */
export type DomainErrorCode =
  | 'order_immutable'
  | 'amount_due'
  | 'invalid_discount'
  | 'discount_exceeds_subtotal'
  | 'line_not_found'
  | 'line_sent_must_void'
  | 'invalid_qty'
  | 'empty_order'
  | 'payment_invalid'
  | 'payment_reference_required'
  | 'payment_customer_required'
  | 'shift_open_orders'
  | 'shift_variance_needs_reason'
  | 'shift_already_closed'
  | 'cart_not_found'
  | 'nothing_to_split'
  | 'line_note_after_send'
  | 'line_note_too_long';

export class DomainError extends Error {
  constructor(
    readonly code: DomainErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'DomainError';
  }
}

export function assert(condition: unknown, code: DomainErrorCode, message: string): asserts condition {
  if (!condition) throw new DomainError(code, message);
}
