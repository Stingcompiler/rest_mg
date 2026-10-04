/**
 * Pickup on the public page (batch 16): no address needed, and the status the
 * customer sees says "come and collect" rather than "on its way".
 */
import { describe, expect, it } from 'vitest';

import { validateOrderForm } from '../orderForm';
import { customerStatusKey } from '../statusText';

describe('a pickup order', () => {
  it('needs no address', () => {
    expect(validateOrderForm({ name: 'سارة', phone: '0912345678', address: '' }, 'pickup')).toEqual([]);
    expect(validateOrderForm({ name: 'سارة', phone: '0912345678', address: '' }, 'delivery')).toEqual([
      { field: 'address', key: 'landing.form.addressRequired' },
    ]);
  });

  it('tells the customer when to come', () => {
    expect(customerStatusKey('ready_for_pickup')).toBe('landing.status.ready_for_pickup');
    expect(customerStatusKey('collected')).toBe('landing.status.collected');
    expect(customerStatusKey('out_for_delivery')).toBe('landing.status.out_for_delivery');
    expect(customerStatusKey('something_new')).toBe('landing.status.unknown');
  });
});
