import { describe, expect, it } from 'vitest';

import { refusalKey, refusalMessageKey } from '../syncRefusal';

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

/**
 * Batch 12: a refusal the till does not know is no longer shown as raw JSON.
 * It gets a plain sentence, and the detail moves to a fold for whoever supports
 * the till. Refusals added since (another branch's record, a shared dish a
 * branch may not change) are named.
 */
describe('refusalMessageKey', () => {
  it('names the branch refusals', () => {
    expect(refusalMessageKey(JSON.stringify({ code: 'other_branch' }))).toBe('pos.sync.refusal.otherBranch');
    expect(refusalMessageKey(JSON.stringify({ code: 'shared_record' }))).toBe('pos.sync.refusal.sharedRecord');
  });

  it('says something plain for anything else', () => {
    expect(refusalMessageKey(JSON.stringify({ lines: ['bad'] }))).toBe('pos.sync.refusal.unknown');
    expect(refusalMessageKey('not json')).toBe('pos.sync.refusal.unknown');
  });
});
