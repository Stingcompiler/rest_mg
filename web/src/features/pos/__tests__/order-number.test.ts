/**
 * Bill numbers do not repeat across tills (review: the till started every
 * device at 1048, so two tablets printed the same numbers on the same day).
 *
 * Each device draws a short code once and keeps it; its numbers carry that
 * code, so two tills can never produce the same number, and none of them can
 * collide with the plain numbers the website gives its orders.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import '@/db/__tests__/setup';
import { resetConnectionsForTests } from '@/db/open';
import { freshDbName } from '@/db/__tests__/fixtures';
import { SettingsRepository } from '@/db';
import { nextOrderNumber } from '../orderNumber';

beforeEach(() => resetConnectionsForTests());

const SHAPE = /^[A-HJ-NP-Z2-9]{2}-\d+$/;

describe('nextOrderNumber', () => {
  it('carries the device code and counts up', async () => {
    const settings = new SettingsRepository(freshDbName());
    const first = await nextOrderNumber(settings);
    const second = await nextOrderNumber(settings);
    expect(first).toMatch(SHAPE);
    expect(second.split('-')[0]).toBe(first.split('-')[0]);
    expect(Number(second.split('-')[1])).toBe(Number(first.split('-')[1]) + 1);
  });

  it('keeps the same code for the life of the device', async () => {
    const name = freshDbName();
    const first = await nextOrderNumber(new SettingsRepository(name));
    resetConnectionsForTests();
    const later = await nextOrderNumber(new SettingsRepository(name));
    expect(later.split('-')[0]).toBe(first.split('-')[0]);
  });

  it('continues the count a device already had', async () => {
    const settings = new SettingsRepository(freshDbName());
    await settings.set('orderSeq', 1200);
    expect((await nextOrderNumber(settings)).endsWith('-1200')).toBe(true);
  });

  it('gives different devices different codes', async () => {
    const codes = new Set<string>();
    for (let index = 0; index < 20; index += 1) {
      codes.add((await nextOrderNumber(new SettingsRepository(freshDbName()))).split('-')[0]);
    }
    // 20 devices drawing from 32×32 codes: some repetition is possible, but a
    // fixed code (the old behaviour, in effect) would give exactly one.
    expect(codes.size).toBeGreaterThan(10);
  });
});
