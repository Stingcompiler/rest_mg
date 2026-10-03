/**
 * What a refused record's reason means, for the sync queue screen.
 *
 * The server's reason arrives as JSON. Most refusals are validation details a
 * developer reads; a few are about the business — a website order another till
 * already collected, say — and the cashier must understand those without a
 * developer. Known codes get a sentence; anything else is shown as it came.
 */
export const KNOWN_REFUSALS = {
  already_settled: 'pos.sync.refusal.alreadySettled',
  order_changed: 'pos.sync.refusal.orderChanged',
  not_confirmed: 'pos.sync.refusal.notConfirmed',
  cancel_from_deliveries: 'pos.sync.refusal.cancelFromDeliveries',
} as const;

export type KnownRefusalKey = (typeof KNOWN_REFUSALS)[keyof typeof KNOWN_REFUSALS];

export function refusalKey(lastError: string): KnownRefusalKey | null {
  try {
    const reason: unknown = JSON.parse(lastError);
    const code = (reason as { code?: unknown } | null)?.code;
    return typeof code === 'string' && code in KNOWN_REFUSALS
      ? KNOWN_REFUSALS[code as keyof typeof KNOWN_REFUSALS]
      : null;
  } catch {
    return null;
  }
}
