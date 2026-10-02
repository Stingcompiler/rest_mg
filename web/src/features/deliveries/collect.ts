/**
 * Collecting a website order at the till (implementation plan, decision D2).
 *
 * A website order is born on the server, so there is no bill for it on any
 * till. To take the money, the deliveries screen hands the till a copy — the
 * same id, number, lines and prices the customer was given — and the cashier
 * collects it through the ordinary payment screen, inside the shift. When the
 * bill closes, the till pushes it like any other; the server keeps what the
 * customer ordered and takes from the till only the money, the cashier and the
 * shift (api/apps/sync/services.py).
 *
 * The copy is written without queueing it for sync: the server already has the
 * order, and should hear back only once it is paid.
 */
import { orderToRecord } from '@/db/mappers';
import type { OrderRecord } from '@/db';
import { Order } from '@/domain';
import type { DeliveryOrder } from './api';

/** Delivery steps after the floor has confirmed the order. */
const CONFIRMED_STEPS = new Set(['confirmed', 'preparing', 'out_for_delivery', 'delivered']);

/** Whether this order can be taken to the till to collect its payment. */
export function canCollect(order: DeliveryOrder): boolean {
  return (
    order.status === 'sent' &&
    CONFIRMED_STEPS.has(order.delivery_status) &&
    BigInt(order.amount_due_minor ?? order.total_minor) > 0n
  );
}

export function collectableRecord(
  order: DeliveryOrder,
  till: { shiftRef: string | null; cashierId: string | null; cashierName: string },
): OrderRecord {
  const bill = Order.create({
    id: order.id,
    number: order.number,
    type: 'delivery',
    cashierId: till.cashierId,
    cashierName: till.cashierName,
    shiftRef: till.shiftRef,
    openedAt: order.opened_at ?? order.created_at,
  });
  for (const line of order.lines) {
    bill.addLine({
      id: line.id,
      itemId: line.item_id ?? null,
      nameAr: line.name_ar,
      nameEn: line.name_en ?? '',
      unitPriceMinor: BigInt(line.unit_price_minor),
      qty: line.qty,
    });
  }
  // Already with the kitchen: the bill is "sent", ready to take payment.
  bill.send();
  const record = orderToRecord(bill);
  return { ...record, sentAt: order.sent_at ?? record.sentAt };
}
