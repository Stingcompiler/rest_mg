/** What the customer's status bar says for each step (batches 14 and 16). */
import type { MessageKey } from '@/i18n';

const KEYS: Record<string, MessageKey> = {
  pending: 'landing.status.pending',
  confirmed: 'landing.status.confirmed',
  preparing: 'landing.status.preparing',
  out_for_delivery: 'landing.status.out_for_delivery',
  delivered: 'landing.status.delivered',
  ready_for_pickup: 'landing.status.ready_for_pickup',
  collected: 'landing.status.collected',
  cancelled: 'landing.status.cancelled',
};

export const FINISHED_STATUSES = new Set(['delivered', 'collected', 'cancelled']);

export function customerStatusKey(status: string): MessageKey {
  return KEYS[status] ?? 'landing.status.unknown';
}
