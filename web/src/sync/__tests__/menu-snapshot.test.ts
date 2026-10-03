/**
 * A full menu snapshot replaces what the device held (review finding F07).
 *
 * The first pull (no cursor) brings everything the server knows. Rows the
 * device has that the server does not — the development demo menu, or a menu
 * left from before — are retired, not kept next to the real one. A later delta
 * pull carries only what changed, so it must not retire anything.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import '@/db/__tests__/setup';
import { resetConnectionsForTests } from '@/db/open';
import { aCategory, anItem, freshDbName } from '@/db/__tests__/fixtures';
import { MenuRepository } from '@/db';
import { pullMenu } from '../pull';
import { FakeServer } from './fake-server';

beforeEach(() => resetConnectionsForTests());

const serverCategory = { id: 'c-real', name_ar: 'وجبات', name_en: 'Meals', sort: 0, is_active: true, updated_at: '2026-10-01T00:00:00Z' };
const serverItem = {
  id: 'i-real',
  category_id: 'c-real',
  name_ar: 'عصيدة',
  name_en: 'Aseeda',
  description_ar: '',
  description_en: '',
  price_minor: '9000',
  is_available: true,
  is_active: true,
  sort: 0,
  updated_at: '2026-10-01T00:00:00Z',
};

async function deviceWithLocalMenu(name: string) {
  const menu = new MenuRepository(name);
  const local = aCategory({ id: 'c-local', nameAr: 'مشاوي' });
  await menu.applyPull([local], [anItem({ id: 'i-local', categoryId: local.id })]);
  return menu;
}

describe('the first pull', () => {
  it('retires the categories and items the server does not have', async () => {
    const name = freshDbName();
    const menu = await deviceWithLocalMenu(name);
    const server = new FakeServer();
    server.seedCatalog([serverCategory], [serverItem]);

    const outcome = await pullMenu(server, 'tok', name);

    expect(outcome.fullSnapshot).toBe(true);
    expect((await menu.listCategories()).map((category) => category.id)).toEqual(['c-real']);
    expect(await menu.listItemsByCategory('c-local')).toEqual([]);
    expect((await menu.getItem('i-local'))?.isActive).toBe(false);
    expect((await menu.listItemsByCategory('c-real')).map((item) => item.id)).toEqual(['i-real']);
  });
});

describe('a later pull', () => {
  it('only adds and updates, and retires nothing', async () => {
    const name = freshDbName();
    const server = new FakeServer();
    server.seedCatalog([serverCategory], [serverItem]);
    await pullMenu(server, 'tok', name);

    const menu = new MenuRepository(name);
    const extra = aCategory({ id: 'c-extra' });
    await menu.applyPull([extra], [anItem({ id: 'i-extra', categoryId: extra.id })]);
    server.seedCatalog([], []);
    const outcome = await pullMenu(server, 'tok', name);

    expect(outcome.fullSnapshot).toBe(false);
    expect((await menu.getItem('i-extra'))?.isActive).toBe(true);
    expect((await menu.getItem('i-real'))?.isActive).toBe(true);
  });
});
