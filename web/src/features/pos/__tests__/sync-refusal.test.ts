import { describe, expect, it } from 'vitest';

import { refusalKey } from '../syncRefusal';

describe('refusalKey', () => {
  it('names the business refusals a cashier must understand', () => {
    expect(refusalKey(JSON.stringify({ code: 'already_settled', detail: '…' }))).toBe(
      'pos.sync.refusal.alreadySettled',
    );
    expect(refusalKey(JSON.stringify({ code: 'order_changed' }))).toBe('pos.sync.refusal.orderChanged');
  });

  it('leaves everything else to be shown as it came', () => {
    expect(refusalKey(JSON.stringify({ lines: ['bad'] }))).toBeNull();
    expect(refusalKey(JSON.stringify({ code: 'something_new' }))).toBeNull();
    expect(refusalKey('"rejected"')).toBeNull();
    expect(refusalKey('not json')).toBeNull();
  });
});
