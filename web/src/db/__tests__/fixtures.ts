/**
 * Builders for storage records. Every field is filled the way the device fills
 * it: string UUIDs, ISO timestamps, money as strings of minor units.
 */
import type {
  CategoryRecord,
  MenuItemRecord,
  OrderRecord,
  PriceChangeRecord,
  ShiftRecord,
} from '../records';

let counter = 0;
const uid = (prefix: string) => `${prefix}-${(counter += 1).toString().padStart(4, '0')}`;
const now = () => new Date().toISOString();

export function anOrder(overrides: Partial<OrderRecord> = {}): OrderRecord {
  const id = overrides.id ?? uid('order');
  return {
    id,
    number: '1048',
    type: 'dine_in',
    status: 'closed',
    tableId: null,
    customerId: null,
    subtotalMinor: '25000',
    discountMinor: '0',
    totalMinor: '25000',
    itemCount: 0,
    openedAt: now(),
    sentAt: null,
    closedAt: now(),
    cashierId: null,
    cashierName: 'سمية',
    shiftRef: null,
    voidReason: '',
    correctsId: null,
    createdAt: now(),
    updatedAt: now(),
    syncedAt: null,
    lines: [
      {
        id: uid('line'),
        itemId: uid('item'),
        nameAr: 'شاورما لحم',
        nameEn: 'Beef shawarma',
        unitPriceMinor: '12500',
        qty: 2,
        modifiersText: 'حار',
        lineTotalMinor: '25000',
        isVoid: false,
        voidReason: '',
      },
    ],
    payments: [
      {
        id: uid('pay'),
        method: 'cash',
        amountMinor: '25000',
        tenderedMinor: '25000',
        changeMinor: '0',
        reference: '',
        customerId: null,
        takenAt: now(),
      },
    ],
    ...overrides,
  };
}

export function aCategory(overrides: Partial<CategoryRecord> = {}): CategoryRecord {
  return {
    id: overrides.id ?? uid('cat'),
    nameAr: 'مشاوي',
    nameEn: 'Grills',
    sort: 0,
    isActive: true,
    updatedAt: now(),
    syncedAt: null,
    ...overrides,
  };
}

export function anItem(overrides: Partial<MenuItemRecord> = {}): MenuItemRecord {
  return {
    id: overrides.id ?? uid('item'),
    categoryId: overrides.categoryId ?? uid('cat'),
    nameAr: 'شاورما لحم',
    nameEn: 'Beef shawarma',
    descriptionAr: '',
    descriptionEn: '',
    priceMinor: '12500',
    isAvailable: true,
    isActive: true,
    sort: 0,
    updatedAt: now(),
    syncedAt: null,
    ...overrides,
  };
}

export function aPriceChange(overrides: Partial<PriceChangeRecord> = {}): PriceChangeRecord {
  return {
    id: overrides.id ?? uid('pc'),
    itemId: overrides.itemId ?? uid('item'),
    oldPriceMinor: '12500',
    newPriceMinor: '15000',
    reason: 'manual',
    percent: null,
    appliedAt: now(),
    createdAt: now(),
    updatedAt: now(),
    syncedAt: null,
    ...overrides,
  };
}

export function aShift(overrides: Partial<ShiftRecord> = {}): ShiftRecord {
  return {
    id: overrides.id ?? uid('shift'),
    name: 'الصباحية',
    status: 'closed',
    cashierId: null,
    cashierName: 'سمية',
    openedAt: now(),
    closedAt: now(),
    openingFloatMinor: '0',
    expectedCashMinor: '25000',
    countedCashMinor: '25000',
    varianceMinor: '0',
    varianceReason: '',
    createdAt: now(),
    updatedAt: now(),
    syncedAt: null,
    counts: [],
    ...overrides,
  };
}

/** A distinct database name per test, so nothing leaks between them. */
export function freshDbName(): string {
  return `sudan-pos-test-${uid('db')}`;
}
