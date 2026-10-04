/**
 * Pulling menu and settings deltas down.
 *
 * The first pull, with no cursor, is a full snapshot and replaces the device's
 * menu (see `MenuRepository.replaceWithSnapshot`); later pulls are deltas.
 *
 * The cursor is the server's clock, carried across runs. Deltas are applied to
 * the menu store only — categories and items — and **never to orders**. A price
 * that comes down changes the local menu; an order already taken kept a snapshot
 * of its price when it was rung up, so it is untouched by anything here. That
 * separation is structural: this code has no access to and never opens the
 * orders store.
 */
import { CustomerRepository, MenuRepository, SettingsRepository, SyncStateRepository, openDatabase } from '@/db';
import { RESTAURANT_IDENTITY_KEY, identityFromProfile } from './identity';
import {
  serverCategoryToRecord,
  serverItemToRecord,
  type ServerCustomer,
  type ServerCategory,
  type ServerMenuItem,
} from './serialize';
import type { SyncTransport } from './transport';

export interface PullOutcome {
  applied: number;
  fullSnapshot: boolean;
  /**
   * Ids of customer delivery orders still waiting to be confirmed.
   *
   * Passed upward and never written to IndexedDB: it is a signal about the
   * server's current state, not data the till owns. Storing it would make it
   * outlive the connection that justified it, and a till that has been offline
   * for an hour would keep insisting somebody is waiting.
   */
  pendingDeliveries: string[];
  /** Till orders the kitchen has marked ready, with their numbers. */
  kitchenReady: { id: string; number: string }[];
}

export async function pullMenu(
  transport: SyncTransport,
  token: string,
  dbName?: string,
): Promise<PullOutcome> {
  await openDatabase(dbName);
  const syncState = new SyncStateRepository(dbName);
  const since = (await syncState.getPullCursor()) ?? null;

  const response = await transport.pull(token, since);
  const syncedAt = response.cursor;

  const categories = (response.categories as ServerCategory[]).map((category) =>
    serverCategoryToRecord(category, syncedAt),
  );
  const items = (response.items as ServerMenuItem[]).map((item) => serverItemToRecord(item, syncedAt));

  // The first pull (no cursor) is everything the server has, so it replaces the
  // device's menu; later ones carry only what changed.
  const menu = new MenuRepository(dbName);
  if (response.full_snapshot) await menu.replaceWithSnapshot(categories, items);
  else await menu.applyPull(categories, items);

  // Customers ride the same pull as the menu: a credit sale must name who owes
  // it, and the till gives credit with the line down as readily as with it up.
  const customers = ((response.customers ?? []) as ServerCustomer[]).map((customer) => ({
    id: customer.id,
    name: customer.name,
    phone: customer.phone ?? '',
    isActive: customer.is_active,
    updatedAt: syncedAt,
  }));
  await new CustomerRepository(dbName).applyPull(customers);

  // The restaurant's name and contact details, for the receipt. Present only
  // when the profile changed since the cursor; otherwise the stored one stands.
  const identity = identityFromProfile(response.profile);
  if (identity) await new SettingsRepository(dbName).set(RESTAURANT_IDENTITY_KEY, identity);

  // Advance the cursor only after the deltas are safely applied, so a crash
  // mid-apply re-fetches rather than skipping.
  await syncState.setPullCursor(response.cursor);

  const pendingDeliveries = ((response.pending_deliveries ?? []) as { id?: unknown }[])
    .map((row) => (typeof row?.id === 'string' ? row.id : null))
    .filter((id): id is string => id !== null);

  const kitchenReady = ((response.kitchen_ready ?? []) as { id?: unknown; number?: unknown }[])
    .filter((row) => typeof row?.id === 'string' && typeof row?.number === 'string')
    .map((row) => ({ id: row.id as string, number: row.number as string }));

  return {
    applied: categories.length + items.length + customers.length,
    fullSnapshot: response.full_snapshot,
    pendingDeliveries,
    kitchenReady,
  };
}
