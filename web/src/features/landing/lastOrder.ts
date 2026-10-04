/**
 * The order the customer placed from this page, kept so they can see how it
 * stands after closing the confirmation (batch 14). Forgotten after twelve
 * hours: by then it has been delivered or cancelled, and the page should not
 * keep talking about yesterday's dinner.
 */
import { readJson, removeKey, writeJson, type KeyValueStorage } from './browserStorage';

export interface PlacedOrder {
  id: string;
  number: string;
  placedAt: number;
}

const KEEP_MS = 12 * 3_600_000;
const key = (slug: string) => `sp-last-order:${slug}`;

export function rememberOrder(storage: KeyValueStorage, slug: string, order: PlacedOrder): void {
  writeJson(storage, key(slug), order);
}

export function recallOrder(storage: KeyValueStorage, slug: string, now: number = Date.now()): PlacedOrder | null {
  const order = readJson<PlacedOrder>(storage, key(slug));
  if (!order || typeof order.id !== 'string' || typeof order.number !== 'string' || typeof order.placedAt !== 'number') {
    return null;
  }
  return now - order.placedAt > KEEP_MS ? null : order;
}

export function forgetOrder(storage: KeyValueStorage, slug: string): void {
  removeKey(storage, key(slug));
}
