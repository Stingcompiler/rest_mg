/**
 * Record ⇄ server payload.
 *
 * IndexedDB records are camelCase; the Django API is snake_case. This is the one
 * place that translation happens, in both directions — push maps a stored record
 * to the shape the push serializers expect, pull maps a server row back to a
 * record. Money is already a string on both sides, so it passes straight
 * through; only the field names change.
 */
import { WALK_IN_CUSTOMER_ID } from '@/domain';
import type {
  AvailabilityChangeRecord,
  CategoryRecord,
  MenuItemRecord,
  OrderLineRecord,
  OrderRecord,
  PaymentRecord,
  PriceChangeRecord,
  ShiftRecord,
  SyncableType,
} from '@/db';

// --- push: record → server payload ------------------------------------------

/**
 * A menu-item reference the server will accept, or nothing.
 *
 * `item_id` is a soft, nullable link: the line already carries its own name and
 * unit price, snapshotted at the moment of sale, and those are what the bill is
 * made of. The server stores the id as a UUID, so a device seeded by an early
 * build — whose menu used readable ids like `it-shawarma-beef` — had every bill
 * it produced rejected outright, for ever, with nothing on screen to say why.
 *
 * Dropping an unusable reference is the right trade: the money record syncs
 * intact and only a link that was never valid server-side is lost.
 */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function serverItemId(itemId: string | null | undefined): string | null {
  if (!itemId) return null;
  return UUID_PATTERN.test(itemId) ? itemId : null;
}

function lineToServer(line: OrderLineRecord) {
  return {
    id: line.id,
    item_id: serverItemId(line.itemId),
    name_ar: line.nameAr,
    name_en: line.nameEn,
    unit_price_minor: line.unitPriceMinor,
    qty: line.qty,
    modifiers_text: line.modifiersText,
    line_total_minor: line.lineTotalMinor,
    is_void: line.isVoid,
    void_reason: line.voidReason,
  };
}

/**
 * A customer reference the server will accept.
 *
 * Credit must name someone — an unattributable debt cannot be collected — and
 * the till used to write the literal string `'walk-in'`, which is not a UUID.
 * Bills carrying a credit payment were therefore refused for ever. Anything that
 * is not a UUID is read as "nobody was named": credit falls back to the walk-in
 * customer so the sale still syncs, and any other method simply carries no
 * customer, which is what it meant anyway.
 */
export function serverCustomerId(customerId: string | null | undefined, method: string): string | null {
  if (customerId && UUID_PATTERN.test(customerId)) return customerId;
  return method === 'credit' ? WALK_IN_CUSTOMER_ID : null;
}

function paymentToServer(payment: PaymentRecord) {
  return {
    id: payment.id,
    method: payment.method,
    amount_minor: payment.amountMinor,
    tendered_minor: payment.tenderedMinor,
    change_minor: payment.changeMinor,
    reference: payment.reference,
    customer_id: serverCustomerId(payment.customerId, payment.method),
    taken_at: payment.takenAt,
  };
}

function orderToServer(order: OrderRecord) {
  return {
    id: order.id,
    number: order.number,
    type: order.type,
    status: order.status,
    table_id: order.tableId,
    customer_id: order.customerId,
    subtotal_minor: order.subtotalMinor,
    discount_minor: order.discountMinor,
    total_minor: order.totalMinor,
    opened_at: order.openedAt,
    sent_at: order.sentAt,
    closed_at: order.closedAt,
    cashier_id: order.cashierId,
    cashier_name: order.cashierName,
    shift_ref: order.shiftRef,
    void_reason: order.voidReason,
    corrects_id: order.correctsId,
    created_at: order.createdAt,
    updated_at: order.updatedAt,
    lines: order.lines.map(lineToServer),
    payments: order.payments.map(paymentToServer),
  };
}

function shiftToServer(shift: ShiftRecord) {
  return {
    id: shift.id,
    name: shift.name,
    status: shift.status,
    cashier_id: shift.cashierId,
    cashier_name: shift.cashierName,
    opened_at: shift.openedAt,
    closed_at: shift.closedAt,
    opening_float_minor: shift.openingFloatMinor,
    expected_cash_minor: shift.expectedCashMinor,
    counted_cash_minor: shift.countedCashMinor,
    variance_minor: shift.varianceMinor,
    variance_reason: shift.varianceReason,
    created_at: shift.createdAt,
    updated_at: shift.updatedAt,
    counts: shift.counts.map((count) => ({
      id: count.id,
      denomination_minor: count.denominationMinor,
      label: count.label,
      count: count.count,
      line_total_minor: count.lineTotalMinor,
    })),
  };
}

function priceChangeToServer(change: PriceChangeRecord) {
  return {
    id: change.id,
    item_id: change.itemId,
    old_price_minor: change.oldPriceMinor,
    new_price_minor: change.newPriceMinor,
    reason: change.reason,
    percent: change.percent,
    applied_at: change.appliedAt,
    created_at: change.createdAt,
    updated_at: change.updatedAt,
  };
}

function availabilityToServer(change: AvailabilityChangeRecord) {
  return {
    id: change.id,
    item_id: change.itemId,
    is_available: change.isAvailable,
    changed_at: change.changedAt,
    created_at: change.createdAt,
    updated_at: change.updatedAt,
  };
}

const SERIALIZERS = {
  order: orderToServer,
  shift: shiftToServer,
  price_change: priceChangeToServer,
  availability: availabilityToServer,
} as const;

export function recordToServerPayload(type: SyncableType, payload: unknown): Record<string, unknown> {
  // The stored payload is exactly the record type keyed by `type`.
  return SERIALIZERS[type](payload as never);
}

// --- pull: server row → record ----------------------------------------------

export interface ServerCategory {
  id: string;
  name_ar: string;
  name_en: string;
  sort: number;
  is_active: boolean;
  updated_at: string;
}

export interface ServerMenuItem {
  id: string;
  category_id: string;
  name_ar: string;
  name_en: string;
  description_ar: string;
  description_en: string;
  price_minor: string;
  is_available: boolean;
  is_active: boolean;
  sort: number;
  updated_at: string;
}

export function serverCategoryToRecord(category: ServerCategory, syncedAt: string): CategoryRecord {
  return {
    id: category.id,
    nameAr: category.name_ar,
    nameEn: category.name_en,
    sort: category.sort,
    isActive: category.is_active,
    updatedAt: category.updated_at,
    syncedAt,
  };
}

export function serverItemToRecord(item: ServerMenuItem, syncedAt: string): MenuItemRecord {
  return {
    id: item.id,
    categoryId: item.category_id,
    nameAr: item.name_ar,
    nameEn: item.name_en,
    descriptionAr: item.description_ar,
    descriptionEn: item.description_en,
    priceMinor: item.price_minor,
    isAvailable: item.is_available,
    isActive: item.is_active,
    sort: item.sort,
    updatedAt: item.updated_at,
    syncedAt,
  };
}

/** A customer as the pull sends it. */
export interface ServerCustomer {
  id: string;
  name: string;
  phone?: string;
  is_active: boolean;
  server_updated_at?: string;
}
