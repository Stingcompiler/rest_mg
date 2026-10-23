/**
 * The choices on a refused record (batch 63): keep it on the device, or
 * discard it, each with what it costs, and the discard asked about first and
 * left to a manager or the owner.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = resolve(__dirname, '../../..');
const read = (path: string) => readFileSync(resolve(SRC, path), 'utf-8');
const screen = read('features/pos/SyncQueueScreen.tsx');

describe('the sync queue screen', () => {
  it('offers keep and discard on a refused record, each with its consequence in words', () => {
    expect(screen).toMatch(/holdOutboxEntry/);
    expect(screen).toMatch(/pos\.sync\.keepLocal/);
    expect(screen).toMatch(/pos\.sync\.keepConsequence/);
    expect(screen).toMatch(/pos\.sync\.discard'/);
    expect(screen).toMatch(/pos\.sync\.discardConsequence\./);
  });

  it('asks before it discards, and says what is lost', () => {
    expect(screen).toMatch(/<ConfirmDialog/);
    expect(screen).toMatch(/discardRefusedOutboxEntry/);
  });

  it('leaves discarding to the owner and managers: a cashier keeps or asks', () => {
    expect(screen).toMatch(/\['owner', 'manager'\]\.includes\(/);
    expect(screen).toMatch(/pos\.sync\.askManager/);
  });

  it('shows a kept record as kept, and counts it', () => {
    expect(screen).toMatch(/isOutboxHeld\(/);
    expect(screen).toMatch(/pos\.sync\.held/);
  });

  it('says every new thing in both languages', () => {
    for (const locale of ['ar', 'en']) {
      const text = read(`i18n/messages/${locale}.json`);
      for (const key of [
        'pos.sync.keepLocal',
        'pos.sync.keepConsequence',
        'pos.sync.discard',
        'pos.sync.discardTitle',
        'pos.sync.discardConfirm',
        'pos.sync.discardConsequence.order',
        'pos.sync.discardConsequence.shift',
        'pos.sync.discardConsequence.other',
        'pos.sync.askManager',
        'pos.sync.held',
        'pos.sync.summaryHeld',
        'pos.sync.keptNote',
      ]) {
        expect(text, `${locale}: ${key}`).toContain(`"${key}"`);
      }
    }
  });
});
