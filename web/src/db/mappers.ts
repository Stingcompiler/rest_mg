/**
 * The client-side money boundary.
 *
 * Domain entities reason in `bigint`; IndexedDB records store money as strings
 * of minor units (structured-clone-safe, precision-safe, and the same shape the
 * server speaks). This is the one place the two representations meet — the
 * client mirror of the server's `MoneyField`.
 *
 * It lives in `src/db`, not `src/domain`: the domain may never import a record
 * type (that would break its purity), so the bridge belongs on this side. Record
 * → snapshot hydrates an entity; entity → record persists one. Derived fields a
 * record denormalises (subtotal, total, itemCount, line totals) are read from
 * the entity, never recomputed here, so the arithmetic has a single home.
 */
import { fromMinor, toMinor } from './money';
import type {
  CashCountRecord,
  MenuItemRecord,
  OrderLineRecord,
  OrderRecord,
  PaymentRecord,
  ShiftRecord,
} from './records';
import {
  CashCount,
  MenuItem,
  Order,
  Shift,
  type CashCountSnapshot,
  type MenuItemSnapshot,
  type OrderLineSnapshot,
  type OrderSnapshot,
  type PaymentSnapshot,
  type ShiftSnapshot,
} from '@/domain';

const now = () => new Date().toISOString();

// --- menu items -------------------------------------------------------------

export function menuItemRecordToSnapshot(record: MenuItemRecord): MenuItemSnapshot {
  return {
    id: record.id,
    categoryId: record.categoryId,
    nameAr: record.nameAr,
    nameEn: record.nameEn,
    descriptionAr: record.descriptionAr,
    descriptionEn: record.descriptionEn,
    priceMinor: toMinor(record.priceMinor),
    isAvailable: record.isAvailable,
    isActive: record.isActive,
  };
}

export function hydrateMenuItem(record: MenuItemRecord): MenuItem {
  return MenuItem.fromSnapshot(menuItemRecordToSnapshot(record));
}

// --- order lines and payments ----------------------------------------------

function lineToRecord(line: OrderLineSnapshot): OrderLineRecord {
  // The stored line total is the raw price × qty, matching the server's
  // per-line check; whether it counts toward the subtotal (void or not) is the
  // order's concern, not the line's.
  const lineTotal = line.unitPriceMinor * BigInt(line.qty);
  return {
    id: line.id,
    itemId: line.itemId,
    nameAr: line.nameAr,
    nameEn: line.nameEn,
    unitPriceMinor: fromMinor(line.unitPriceMinor),
    qty: line.qty,
    modifiersText: line.modifiersText,
    lineTotalMinor: fromMinor(lineTotal),
    isVoid: line.isVoid,
    voidReason: line.voidReason,
  };
}

function lineRecordToSnapshot(record: OrderLineRecord): OrderLineSnapshot {
  return {
    id: record.id,
    itemId: record.itemId,
    nameAr: record.nameAr,
    nameEn: record.nameEn,
    unitPriceMinor: toMinor(record.unitPriceMinor),
    qty: record.qty,
    modifiersText: record.modifiersText,
    isVoid: record.isVoid,
    voidReason: record.voidReason,
  };
}

function paymentToRecord(payment: PaymentSnapshot): PaymentRecord {
  return {
    id: payment.id,
    method: payment.method,
    amountMinor: fromMinor(payment.amountMinor),
    tenderedMinor: payment.tenderedMinor === null ? null : fromMinor(payment.tenderedMinor),
    changeMinor: fromMinor(payment.changeMinor),
    reference: payment.reference,
    customerId: payment.customerId,
    takenAt: payment.takenAt,
  };
}

function paymentRecordToSnapshot(record: PaymentRecord): PaymentSnapshot {
  return {
    id: record.id,
    method: record.method,
    amountMinor: toMinor(record.amountMinor),
    tenderedMinor: record.tenderedMinor === null ? null : toMinor(record.tenderedMinor),
    changeMinor: toMinor(record.changeMinor),
    reference: record.reference,
    customerId: record.customerId,
    takenAt: record.takenAt,
  };
}

// --- orders -----------------------------------------------------------------

export function orderToRecord(order: Order, existing?: OrderRecord): OrderRecord {
  const snapshot = order.toSnapshot();
  return {
    id: snapshot.id,
    number: snapshot.number,
    type: snapshot.type,
    status: snapshot.status,
    tableId: snapshot.tableId,
    customerId: snapshot.customerId,
    subtotalMinor: fromMinor(order.subtotal()),
    discountMinor: fromMinor(snapshot.discountMinor),
    totalMinor: fromMinor(order.total()),
    itemCount: order.itemCount(),
    openedAt: snapshot.openedAt,
    sentAt: snapshot.sentAt,
    closedAt: snapshot.closedAt,
    cashierId: snapshot.cashierId,
    cashierName: snapshot.cashierName,
    shiftRef: snapshot.shiftRef,
    voidReason: snapshot.voidReason,
    correctsId: snapshot.correctsId,
    createdAt: existing?.createdAt ?? snapshot.openedAt,
    updatedAt: now(),
    // Any change unsyncs the record until the next successful push.
    syncedAt: null,
    lines: snapshot.lines.map(lineToRecord),
    payments: snapshot.payments.map(paymentToRecord),
  };
}

export function orderRecordToSnapshot(record: OrderRecord): OrderSnapshot {
  return {
    id: record.id,
    number: record.number,
    type: record.type,
    status: record.status,
    tableId: record.tableId,
    customerId: record.customerId,
    discountMinor: toMinor(record.discountMinor),
    openedAt: record.openedAt,
    sentAt: record.sentAt,
    closedAt: record.closedAt,
    cashierId: record.cashierId,
    cashierName: record.cashierName,
    shiftRef: record.shiftRef,
    voidReason: record.voidReason,
    correctsId: record.correctsId,
    lines: record.lines.map(lineRecordToSnapshot),
    payments: record.payments.map(paymentRecordToSnapshot),
  };
}

export function hydrateOrder(record: OrderRecord): Order {
  return Order.fromSnapshot(orderRecordToSnapshot(record));
}

// --- cash counts and shifts -------------------------------------------------

function cashCountToRecord(count: CashCountSnapshot): CashCountRecord {
  return {
    id: count.id,
    denominationMinor: count.denominationMinor === null ? null : fromMinor(count.denominationMinor),
    label: count.label,
    count: count.count,
    lineTotalMinor: fromMinor(count.lineTotalMinor),
  };
}

function cashCountRecordToSnapshot(record: CashCountRecord): CashCountSnapshot {
  return {
    id: record.id,
    denominationMinor: record.denominationMinor === null ? null : toMinor(record.denominationMinor),
    label: record.label,
    count: record.count,
    lineTotalMinor: toMinor(record.lineTotalMinor),
  };
}

export function shiftToRecord(shift: Shift, existing?: ShiftRecord): ShiftRecord {
  const snapshot = shift.toSnapshot();
  return {
    id: snapshot.id,
    name: snapshot.name,
    status: snapshot.status,
    cashierId: snapshot.cashierId,
    cashierName: snapshot.cashierName,
    openedAt: snapshot.openedAt,
    closedAt: snapshot.closedAt,
    openingFloatMinor: fromMinor(snapshot.openingFloatMinor),
    expectedCashMinor: fromMinor(shift.expectedCash()),
    countedCashMinor: fromMinor(shift.countedCash()),
    varianceMinor: fromMinor(shift.variance()),
    varianceReason: snapshot.varianceReason,
    createdAt: existing?.createdAt ?? snapshot.openedAt,
    updatedAt: now(),
    syncedAt: null,
    counts: snapshot.counts.map(cashCountToRecord),
  };
}

export function shiftRecordToSnapshot(record: ShiftRecord): ShiftSnapshot {
  return {
    id: record.id,
    name: record.name,
    status: record.status,
    cashierId: record.cashierId,
    cashierName: record.cashierName,
    openedAt: record.openedAt,
    closedAt: record.closedAt,
    openingFloatMinor: toMinor(record.openingFloatMinor),
    varianceReason: record.varianceReason,
    counts: record.counts.map(cashCountRecordToSnapshot),
  };
}

export { CashCount };
