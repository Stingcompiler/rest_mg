/**
 * "Unavailable" on the till reaches the website.
 *
 * Marking a dish sold out on the till wrote it to the device only, and was
 * never queued. The website kept selling it (batch 12). It now queues an
 * availability change for the server, like a price change.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import './setup';
import { resetConnectionsForTests } from '../open';
import { aCategory, anItem, freshDbName } from './fixtures';
import { MenuRepository, allOutboxEntries, openDatabase } from '@/db';
import { recordToServerPayload } from '@/sync/serialize';

beforeEach(() => resetConnectionsForTests());

const ITEM_ID = '7a1d2c3e-4b5f-4a6b-8c7d-9e0f1a2b3c4d';

async function aMenu(name: string) {
  const menu = new MenuRepository(name);
  await menu.applyPull([aCategory({ id: 'c1' })], [anItem({ id: ITEM_ID, categoryId: 'c1', isAvailable: true })]);
  return menu;
}

describe('availability on the till', () => {
  it('is queued for the server', async () => {
    const name = freshDbName();
    const menu = await aMenu(name);
    await menu.setAvailability(ITEM_ID, false);

    const entries = (await allOutboxEntries(await openDatabase(name))).filter((e) => e.type === 'availability');
    expect(entries).toHaveLength(1);
    const payload = recordToServerPayload('availability', entries[0]!.payload);
    expect(payload).toMatchObject({ item_id: ITEM_ID, is_available: false });
    expect(typeof payload.changed_at).toBe('string');
    expect((await menu.getItem(ITEM_ID))?.isAvailable).toBe(false);
  });
});
