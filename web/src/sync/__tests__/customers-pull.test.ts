/**
 * Customers must reach the device, or credit cannot be attributed offline.
 *
 * A credit sale has to name who owes it. The till gives credit with the line
 * down as readily as with it up, so the names cannot live only on the server —
 * they ride the same pull that brings the menu.
 */
import { describe, expect, it, beforeEach } from 'vitest';

import '@/db/__tests__/setup';
import { resetConnectionsForTests } from '@/db/open';
import { freshDbName } from '@/db/__tests__/fixtures';
import { CustomerRepository } from '@/db';
import { pullMenu } from '../pull';
import { FakeServer } from './fake-server';

beforeEach(() => resetConnectionsForTests());

const AHMED = { id: 'c1', name: 'أحمد', phone: '0912345678', is_active: true };
const RETIRED = { id: 'c2', name: 'قديم', phone: '', is_active: false };

describe('customers arrive with the menu pull', () => {
  it('stores them on the device', async () => {
    const name = freshDbName();
    const server = new FakeServer();
    server.customers = [AHMED];

    await pullMenu(server, 'tok', name);

    const stored = await new CustomerRepository(name).list();
    expect(stored.map((customer) => customer.name)).toEqual(['أحمد']);
    expect(stored[0].phone).toBe('0912345678');
  });

  it('keeps a retired customer out of the picker', async () => {
    // Their history still matters, but nobody should be able to take new credit
    // in their name.
    const name = freshDbName();
    const server = new FakeServer();
    server.customers = [AHMED, RETIRED];

    await pullMenu(server, 'tok', name);

    const stored = await new CustomerRepository(name).list();
    expect(stored.map((customer) => customer.name)).toEqual(['أحمد']);
  });

  it('counts customers in what the pull applied', async () => {
    const name = freshDbName();
    const server = new FakeServer();
    server.customers = [AHMED, RETIRED];

    const outcome = await pullMenu(server, 'tok', name);

    expect(outcome.applied).toBe(2);
  });

  it('survives a server that sends no customers at all', async () => {
    // An older server, or simply a restaurant with none yet.
    const name = freshDbName();
    const server = new FakeServer();

    await expect(pullMenu(server, 'tok', name)).resolves.toBeDefined();
    expect(await new CustomerRepository(name).list()).toEqual([]);
  });
});
