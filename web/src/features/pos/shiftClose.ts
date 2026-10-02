/**
 * Closing the till's shift.
 *
 * The Shift entity holds the bills it closed, not the ones still on the floor,
 * so it cannot tell on its own whether a bill is open (review finding F09). The
 * device's storage can: every open, parked or sent order on this till is in
 * IndexedDB, whichever shift rang it up. Any of them blocks the close — there is
 * one drawer per device, and a bill still open is money not yet in it.
 *
 * Kept apart from React so the rule can be tested against real storage.
 */
import { shiftToRecord } from '@/db/mappers';
import type { OrderRecord, OrderRepository, ShiftRepository } from '@/db';
import { Shift } from '@/domain';

/**
 * Bills that hold something: an item or a payment. An empty bill — opened and
 * never used, or whose last line was taken off — holds no money and does not
 * keep the drawer open.
 */
export function holdsSomething(order: {
  lines: readonly { isVoid: boolean }[];
  payments: readonly unknown[];
}): boolean {
  return order.lines.some((line) => !line.isVoid) || order.payments.length > 0;
}

export async function openOrdersOnDevice(orders: Pick<OrderRepository, 'listOpen'>): Promise<OrderRecord[]> {
  return (await orders.listOpen()).filter(holdsSomething);
}

/**
 * Close `shift` and open the next one, or throw the entity's refusal
 * (`shift_open_orders`, `shift_variance_needs_reason`, `shift_already_closed`)
 * having written nothing.
 */
export async function closeShiftOnDevice(
  shift: Shift,
  next: { cashierId: string | null; cashierName: string },
  deps: { orders: Pick<OrderRepository, 'listOpen'>; shifts: Pick<ShiftRepository, 'save'> },
): Promise<Shift> {
  const open = await openOrdersOnDevice(deps.orders);
  shift.close({ openOrderCount: open.length });
  await deps.shifts.save(shiftToRecord(shift));

  // The till must always have exactly one open shift, or sales would land in a
  // drawer that has already been counted and handed over.
  const nextShift = Shift.open(next);
  await deps.shifts.save(shiftToRecord(nextShift));
  return nextShift;
}
