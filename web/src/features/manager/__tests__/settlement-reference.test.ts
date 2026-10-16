/**
 * The repayment form asks for the reference of a transfer or a wallet payment
 * (batch 60, review F08): shown only for those methods, required there, sent
 * trimmed, and part of what makes a retry "the same repayment".
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import ar from '@/i18n/messages/ar.json';
import en from '@/i18n/messages/en.json';

const screen = readFileSync(resolve(__dirname, '../CustomersScreen.tsx'), 'utf-8');

describe('the repayment form', () => {
  it('asks for the reference only for a transfer or a wallet', () => {
    expect(screen).toMatch(/const needsReference = method === 'bank' \|\| method === 'wallet'/);
    expect(screen).toMatch(/\{needsReference \? \(\s*<label[^>]*>\s*\{i18n\.t\('pos\.payment\.referenceTitle'\)\}/);
  });

  it('refuses to send one without it, in the words the till already uses', () => {
    expect(screen).toMatch(/if \(needsReference && !reference\.trim\(\)\) \{\s*setError\(i18n\.t\('error\.payment_reference_required'\)\);/);
  });

  it('sends it trimmed, and a changed reference is a new attempt', () => {
    expect(screen).toMatch(/body: \{ amount_minor: digits, method, \.\.\.\(needsReference \? \{ reference: reference\.trim\(\) \} : \{\}\) \}/);
    expect(screen).toMatch(/const what = `\$\{customer\.id\}\|\$\{digits\}\|\$\{method\}\|\$\{needsReference \? reference\.trim\(\) : ''\}`/);
  });

  it('forgets the reference once the repayment is recorded', () => {
    expect(screen).toMatch(/setAmount\(''\);\s*setReference\(''\);/);
  });

  it('has its words in both languages', () => {
    for (const key of ['pos.payment.referenceTitle', 'pos.payment.referencePlaceholder', 'error.payment_reference_required']) {
      expect(ar).toHaveProperty([key]);
      expect(en).toHaveProperty([key]);
    }
  });
});
