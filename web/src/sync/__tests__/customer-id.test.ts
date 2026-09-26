/**
 * A credit sale must not be stranded for want of a customer.
 *
 * Credit is money owed, so the server rightly refuses a credit payment with no
 * customer on it. The till filled that gap with the literal string `'walk-in'`,
 * which is not a UUID — so every bill containing a credit payment was refused
 * for ever, and the money owed never reached the books.
 */
import { describe, expect, it } from 'vitest';

import { serverCustomerId } from '../serialize';
import { WALK_IN_CUSTOMER_ID } from '@/domain';

describe('serverCustomerId', () => {
  it('passes a real customer through untouched', () => {
    const id = 'a6003bcd-f6d8-5a72-a230-5361c72cb8b2';
    expect(serverCustomerId(id, 'credit')).toBe(id);
    expect(serverCustomerId(id, 'cash')).toBe(id);
  });

  it('books an unnamed credit sale to the walk-in customer', () => {
    // The stuck case: the debt is still recorded, and against something the
    // server will accept, rather than the bill never arriving at all.
    expect(serverCustomerId('walk-in', 'credit')).toBe(WALK_IN_CUSTOMER_ID);
    expect(serverCustomerId(null, 'credit')).toBe(WALK_IN_CUSTOMER_ID);
    expect(serverCustomerId(undefined, 'credit')).toBe(WALK_IN_CUSTOMER_ID);
  });

  it('leaves other methods with no customer, which is what they meant', () => {
    expect(serverCustomerId('walk-in', 'cash')).toBeNull();
    expect(serverCustomerId(null, 'bank')).toBeNull();
    expect(serverCustomerId('', 'wallet')).toBeNull();
  });

  it('uses a real UUID for the sentinel, so the server accepts it', () => {
    expect(WALK_IN_CUSTOMER_ID).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });
});
