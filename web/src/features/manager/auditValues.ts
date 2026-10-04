/**
 * Before/after values in the activity log, in words.
 *
 * A cancelled delivery read "pending → cancelled" (user-experience review,
 * batch 12). Values the catalogue can name are named; anything else (a
 * display name, a price) is shown as it is.
 */
import type { MessageKey } from '@/i18n';

const VALUE_KEYS: Record<string, Record<string, MessageKey>> = {
  delivery_status: {
    pending: 'deliveries.status.pending',
    confirmed: 'deliveries.status.confirmed',
    preparing: 'deliveries.status.preparing',
    out_for_delivery: 'deliveries.status.outForDelivery',
    delivered: 'deliveries.status.delivered',
    cancelled: 'deliveries.status.cancelled',
  },
  kitchen_status: {
    queued: 'kitchen.queued',
    preparing: 'kitchen.preparing',
    ready: 'kitchen.ready',
    served: 'kitchen.served',
  },
  role: {
    owner: 'role.owner',
    manager: 'role.manager',
    cashier: 'role.cashier',
    kitchen: 'role.kitchen',
  },
};

export function auditValueKey(field: string, value: unknown): MessageKey | null {
  if (typeof value !== 'string') return null;
  return VALUE_KEYS[field]?.[value] ?? null;
}
