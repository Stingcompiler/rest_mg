/**
 * The stored shapes — exactly what lives in IndexedDB.
 *
 * Two rules hold across every record here:
 *
 *   - **Money is a string of minor units.** IndexedDB values go through the
 *     structured-clone algorithm, which supports BigInt, but a string is the
 *     representation the API already speaks on the wire and the one that cannot
 *     lose precision anywhere — storage, JSON, or an older engine. Repositories
 *     parse it to `bigint` at the boundary; nothing downstream sees the string.
 *
 *   - **Timestamps are ISO-8601 UTC strings.** They sort lexicographically, so a
 *     bare string index gives correct chronological range queries, and a device
 *     whose clock is wrong still produces a monotonic-looking, comparable value.
 *
 * These are persistence rows, not domain entities. Phase 5 wraps the values a
 * repository returns in classes that carry the business rules; the row shape
 * does not change when it does.
 */

/** Minor units, as a decimal string. Parse with `toMinor`, never `Number()`. */
export type MoneyString = string;

/** ISO-8601 UTC, e.g. "2026-08-07T14:32:00.000Z". */
export type IsoTimestamp = string;

export type OrderStatus = 'open' | 'parked' | 'sent' | 'closed' | 'void';
export type OrderType = 'dine_in' | 'takeaway' | 'delivery';
export type PaymentMethod = 'cash' | 'bank' | 'wallet' | 'credit';
export type ShiftStatus = 'open' | 'closed';
export type SyncableType = 'order' | 'shift' | 'price_change';

export interface OrderLineRecord {
  id: string;
  itemId: string | null;
  nameAr: string;
  nameEn: string;
  /** Snapshotted at the moment of sale; a later price change never rewrites it. */
  unitPriceMinor: MoneyString;
  qty: number;
  modifiersText: string;
  lineTotalMinor: MoneyString;
  isVoid: boolean;
  voidReason: string;
}

export interface PaymentRecord {
  id: string;
  method: PaymentMethod;
  amountMinor: MoneyString;
  tenderedMinor: MoneyString | null;
  changeMinor: MoneyString;
  reference: string;
  customerId: string | null;
  takenAt: IsoTimestamp;
}

export interface OrderRecord {
  id: string;
  number: string;
  type: OrderType;
  status: OrderStatus;
  tableId: string | null;
  customerId: string | null;
  subtotalMinor: MoneyString;
  discountMinor: MoneyString;
  totalMinor: MoneyString;
  /** Denormalised for the open-orders list — added by migration v2, backfilled. */
  itemCount: number;
  openedAt: IsoTimestamp;
  sentAt: IsoTimestamp | null;
  closedAt: IsoTimestamp | null;
  cashierId: string | null;
  cashierName: string;
  /** The shift this order claims. The FK is resolved server-side; the device
   *  only ever holds the id, because a shift closes after its orders. */
  shiftRef: string | null;
  voidReason: string;
  correctsId: string | null;
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
  /** Set once the server has acknowledged this record; null until then. */
  syncedAt: IsoTimestamp | null;
  lines: OrderLineRecord[];
  payments: PaymentRecord[];
}

export interface CategoryRecord {
  id: string;
  nameAr: string;
  nameEn: string;
  sort: number;
  isActive: boolean;
  updatedAt: IsoTimestamp;
  syncedAt: IsoTimestamp | null;
}

export interface MenuItemRecord {
  id: string;
  categoryId: string;
  nameAr: string;
  nameEn: string;
  descriptionAr: string;
  descriptionEn: string;
  priceMinor: MoneyString;
  isAvailable: boolean;
  isActive: boolean;
  sort: number;
  updatedAt: IsoTimestamp;
  syncedAt: IsoTimestamp | null;
}

export interface PriceChangeRecord {
  id: string;
  itemId: string;
  oldPriceMinor: MoneyString;
  newPriceMinor: MoneyString;
  reason: 'manual' | 'bulk_percent' | 'sync';
  percent: string | null;
  appliedAt: IsoTimestamp;
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
  syncedAt: IsoTimestamp | null;
}

export interface CashCountRecord {
  id: string;
  denominationMinor: MoneyString | null;
  label: string;
  count: number;
  lineTotalMinor: MoneyString;
}

export interface ShiftRecord {
  id: string;
  name: string;
  status: ShiftStatus;
  cashierId: string | null;
  cashierName: string;
  openedAt: IsoTimestamp;
  closedAt: IsoTimestamp | null;
  openingFloatMinor: MoneyString;
  expectedCashMinor: MoneyString;
  countedCashMinor: MoneyString;
  varianceMinor: MoneyString;
  varianceReason: string;
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
  syncedAt: IsoTimestamp | null;
  counts: CashCountRecord[];
}

export interface UserRecord {
  id: string;
  nameAr: string;
  nameEn: string;
  role: 'cashier' | 'manager';
  /** PBKDF2 hash of the PIN. The raw PIN never touches storage or the network. */
  pinHash: string;
  pinSalt: string;
  isActive: boolean;
}

/** A single key/value entry in the `settings` or `syncState` stores. */
export interface KeyValueRecord<T = unknown> {
  key: string;
  value: T;
}

/**
 * One pending upload. The whole record travels up in a sync batch; the server
 * is idempotent by the record's own uuid, so a retry after a dropped connection
 * writes nothing twice.
 */
/** The two physical printers a restaurant runs. */
export type PrintDestination = 'cashier' | 'kitchen';
export type PrintKind = 'kitchen' | 'receipt';

/**
 * One queued print job. The rendered ESC/POS bytes are frozen at enqueue time,
 * so a receipt reflects the order exactly as it was when it printed, and a retry
 * after the printer comes back sends the same bytes. Persisted before the first
 * send attempt; removed once the printer acknowledges.
 */
export interface PrintJobRecord {
  id: string;
  orderId: string;
  destination: PrintDestination;
  kind: PrintKind;
  bytes: Uint8Array;
  createdAt: number;
  attempts: number;
  nextAttemptAt: number;
  lastError: string | null;
}

export interface OutboxRecord {
  /** `${type}:${recordId}` — deterministic, so re-saving an order never queues
   *  it twice. Overwriting the row is how "already pending" is expressed. */
  id: string;
  type: SyncableType;
  recordId: string;
  payload: OrderRecord | ShiftRecord | PriceChangeRecord;
  attempts: number;
  /** Epoch ms. The engine drains rows whose time has come, oldest first. */
  nextAttemptAt: number;
  createdAt: number;
  lastError: string | null;
}


/** A customer a credit sale can be booked against, pulled from the server. */
export interface CustomerRecord {
  id: string;
  name: string;
  phone: string;
  isActive: boolean;
  updatedAt: string;
}
