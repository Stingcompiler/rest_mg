/**
 * The restaurant's profile comes down with the menu and is kept on the device,
 * so receipts can name the restaurant with the line down.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import '@/db/__tests__/setup';
import { resetConnectionsForTests } from '@/db/open';
import { freshDbName } from '@/db/__tests__/fixtures';
import { SettingsRepository } from '@/db';
import { pullMenu } from '../pull';
import { RESTAURANT_IDENTITY_KEY, type RestaurantIdentity } from '../identity';
import { FakeServer } from './fake-server';

beforeEach(() => resetConnectionsForTests());

describe('pulling the restaurant profile', () => {
  it('keeps the name, phone and address on the device', async () => {
    const name = freshDbName();
    const server = new FakeServer();
    server.profile = { name_ar: 'مطعم النيلين', name_en: 'Nilein', phone: '0912345678', address_ar: 'أم درمان' };

    await pullMenu(server, 'tok', name);

    expect(await new SettingsRepository(name).get<RestaurantIdentity>(RESTAURANT_IDENTITY_KEY)).toEqual({
      nameAr: 'مطعم النيلين',
      nameEn: 'Nilein',
      phone: '0912345678',
      addressAr: 'أم درمان',
    });
  });

  it('leaves what it had when the pull carries no profile', async () => {
    const name = freshDbName();
    const server = new FakeServer();
    server.profile = { name_ar: 'مطعم النيلين', name_en: '', phone: '', address_ar: '' };
    await pullMenu(server, 'tok', name);
    server.profile = null;
    await pullMenu(server, 'tok', name);
    expect((await new SettingsRepository(name).get<RestaurantIdentity>(RESTAURANT_IDENTITY_KEY))?.nameAr).toBe(
      'مطعم النيلين',
    );
  });
});
