/**
 * The order form says which field is wrong (batch 14).
 *
 * One sentence covered every field ("fill in the name, phone and address"),
 * and nothing moved the customer to the field. Each field now carries its own
 * message, in the order the form shows them, so the first one can take focus.
 */
import { describe, expect, it } from 'vitest';

import { validateOrderForm } from '../orderForm';

describe('validateOrderForm', () => {
  it('names each missing field, in form order', () => {
    expect(validateOrderForm({ name: ' ', phone: '', address: '' })).toEqual([
      { field: 'name', key: 'landing.form.nameRequired' },
      { field: 'phone', key: 'landing.form.phoneRequired' },
      { field: 'address', key: 'landing.form.addressRequired' },
    ]);
  });

  it('refuses a phone the restaurant cannot call', () => {
    expect(validateOrderForm({ name: 'أحمد', phone: '123', address: 'شارع ١٥' })).toEqual([
      { field: 'phone', key: 'landing.form.phoneInvalid' },
    ]);
  });

  it('passes a complete form', () => {
    expect(validateOrderForm({ name: 'أحمد', phone: '0912345678', address: 'شارع ١٥' })).toEqual([]);
  });
});
