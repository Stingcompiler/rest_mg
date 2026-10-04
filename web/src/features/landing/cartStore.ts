/**
 * The customer's cart, kept across a reload (batch 14).
 *
 * It was held in memory only, so a reload or a stray back gesture emptied it.
 * Only ids and quantities are stored: on the way back the cart is rebuilt from
 * the menu as it is now, so a changed price is the new price and a dish that
 * has gone or sold out is dropped.
 */
import { readJson, removeKey, writeJson, type KeyValueStorage } from './browserStorage';

export interface StoredItem {
  id: string;
  name_ar: string;
  price_minor: string;
  image_url: string | null;
  is_available: boolean;
}

export interface StoredLine<T extends StoredItem = StoredItem> {
  item: T;
  qty: number;
}

const key = (slug: string) => `sp-cart:${slug}`;

export function saveCart(storage: KeyValueStorage, slug: string, lines: StoredLine[]): void {
  if (lines.length === 0) {
    removeKey(storage, key(slug));
    return;
  }
  writeJson(storage, key(slug), lines.map((line) => ({ id: line.item.id, qty: line.qty })));
}

export function loadCart<T extends StoredItem>(storage: KeyValueStorage, slug: string, menu: T[]): StoredLine<T>[] {
  const saved = readJson<{ id?: unknown; qty?: unknown }[]>(storage, key(slug));
  if (!Array.isArray(saved)) return [];
  const byId = new Map(menu.map((item) => [item.id, item]));
  return saved.flatMap((row) => {
    const item = typeof row?.id === 'string' ? byId.get(row.id) : undefined;
    const qty = typeof row?.qty === 'number' ? Math.floor(row.qty) : 0;
    return item && item.is_available && qty > 0 ? [{ item, qty: Math.min(qty, 99) }] : [];
  });
}
