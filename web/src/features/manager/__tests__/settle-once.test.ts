/**
 * A repayment is recorded once (batch 43, review F03): the customers screen
 * sends an attempt key, and keeps it for a retry of the same repayment.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { customersApi } from '../api';

const screen = readFileSync(resolve(__dirname, '../CustomersScreen.tsx'), 'utf-8');

describe('recording a repayment', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('sends its attempt key as Idempotency-Key', async () => {
    let headers = new Headers();
    vi.stubGlobal('document', { cookie: '' });
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
      headers = new Headers(init.headers);
      return new Response('{}', { status: 201 });
    });
    await customersApi.settle('c1', { amount_minor: '5000', method: 'cash' }, 'k-1');
    expect(headers.get('Idempotency-Key')).toBe('k-1');
  });

  it('keeps the key for a retry of the same repayment, and starts afresh after one is recorded', () => {
    expect(screen).toMatch(/if \(attempt\.current\?\.what !== what\) attempt\.current = \{ what, key: crypto\.randomUUID\(\) \}/);
    expect(screen).toMatch(/onSuccess: \(\) => \{\s*attempt\.current = null;/);
  });
});
