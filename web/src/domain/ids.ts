/**
 * Client-generated identity. The tablet names a record before the server has
 * ever seen it, so ids are minted here, on the device, offline.
 */
export function newId(): string {
  return crypto.randomUUID();
}

/**
 * The customer a credit sale is booked against when nobody was named.
 *
 * Credit (آجل) is money owed, so the server rightly refuses a credit payment
 * with no customer on it — an unattributable debt is one you cannot collect.
 * There is no customer module yet, and the till was filling the gap with the
 * literal string `'walk-in'`, which is not a UUID: every bill containing a
 * credit payment was rejected on sync, permanently and silently.
 *
 * A fixed, well-known id keeps the record syncable *and* honest — the debt is
 * recorded as owed by "the counter", not attributed to someone it isn't. When a
 * real customer module arrives, these rows are exactly the ones to reassign,
 * and this constant is how they are found.
 */
export const WALK_IN_CUSTOMER_ID = '00000000-0000-4000-8000-000000000001';
