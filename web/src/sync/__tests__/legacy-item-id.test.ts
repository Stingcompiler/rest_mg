/**
 * A bill must never be stranded by an unusable menu reference.
 *
 * An early build seeded the device menu with readable ids (`it-shawarma-beef`).
 * The server stores a menu-item reference as a UUID and rejected every line
 * carrying one — so a device with that menu could not sync a single bill, for
 * ever, while the screen only ever said "not synced yet".
 */
import { describe, expect, it } from 'vitest';

import { serverItemId } from '../serialize';

describe('serverItemId', () => {
  it('passes a real UUID through untouched', () => {
    const id = 'a6003bcd-f6d8-5a72-a230-5361c72cb8b2';
    expect(serverItemId(id)).toBe(id);
  });

  it('drops a legacy readable id rather than stranding the bill', () => {
    // The line still carries its own name and price, which is what the money
    // record is made of; only an unusable link is lost.
    expect(serverItemId('it-shawarma-beef')).toBeNull();
    expect(serverItemId('cat-grills')).toBeNull();
  });

  it('treats missing references as absent, not as an error', () => {
    expect(serverItemId(null)).toBeNull();
    expect(serverItemId(undefined)).toBeNull();
    expect(serverItemId('')).toBeNull();
  });

  it('refuses a string that merely looks uuid-ish', () => {
    expect(serverItemId('a6003bcd-f6d8-5a72-a230')).toBeNull();
    expect(serverItemId('not-a-uuid-at-all-really-no')).toBeNull();
  });

  it('accepts either case, as UUIDs are case-insensitive', () => {
    const upper = 'A6003BCD-F6D8-5A72-A230-5361C72CB8B2';
    expect(serverItemId(upper)).toBe(upper);
  });
});
