/**
 * The print queue's promises, each pinned:
 *   - a job is persisted before any send, so a crash mid-order loses nothing;
 *   - a failed send is retried, not dropped, and backs off;
 *   - the queue drains once the printer returns;
 *   - a print failure never propagates — it can never block a close.
 */
import { describe, expect, it, beforeEach } from 'vitest';

import '@/db/__tests__/setup';
import { resetConnectionsForTests } from '@/db/open';
import { freshDbName } from '@/db/__tests__/fixtures';
import { openDatabase, STORES } from '@/db';
import { getAll } from '@/db/idb';
import type { PrintJobRecord } from '@/db';
import { FakePrintService } from '../PrintService';
import { drainPrintQueue, enqueuePrintJob, pendingPrintJobs } from '../queue';

beforeEach(() => resetConnectionsForTests());

const bytes = () => Uint8Array.from([0x1b, 0x40, 0x41]);

async function storedJobs(name: string): Promise<PrintJobRecord[]> {
  const db = await openDatabase(name);
  const tx = db.transaction(STORES.printJobs, 'readonly');
  return getAll<PrintJobRecord>(tx.objectStore(STORES.printJobs));
}

describe('persist before print', () => {
  it('writes the job to disk before any send is attempted', async () => {
    const name = freshDbName();
    // Enqueue, but do not drain — the printer has not been touched yet.
    await enqueuePrintJob({ orderId: 'o1', destination: 'kitchen', kind: 'kitchen', bytes: bytes() }, undefined);
    // The above used the default DB; use a named DB to isolate.
    await enqueuePrintJob({ orderId: 'o1', destination: 'kitchen', kind: 'kitchen', bytes: bytes() }, name);

    const jobs = await storedJobs(name);
    expect(jobs).toHaveLength(1);
    expect(jobs[0].bytes).toBeInstanceOf(Uint8Array);
    expect(jobs[0].attempts).toBe(0);
  });
});

describe('draining', () => {
  it('sends a due job and removes it on success', async () => {
    const name = freshDbName();
    await enqueuePrintJob({ orderId: 'o1', destination: 'cashier', kind: 'receipt', bytes: bytes() }, name);
    const service = new FakePrintService();

    const result = await drainPrintQueue(service, Date.now(), name);

    expect(result).toEqual({ printed: 1, failed: 0 });
    expect(service.sent).toHaveLength(1);
    expect(service.sent[0].destination).toBe('cashier');
    expect(await pendingPrintJobs(name)).toBe(0);
  });

  it('keeps a job and backs it off when the printer is offline, then prints on retry', async () => {
    const name = freshDbName();
    await enqueuePrintJob({ orderId: 'o1', destination: 'kitchen', kind: 'kitchen', bytes: bytes() }, name);
    const service = new FakePrintService();
    service.failing = true;

    // Killing the printer mid-order: the drain fails but never throws, and the
    // job survives.
    const failResult = await drainPrintQueue(service, Date.now(), name);
    expect(failResult).toEqual({ printed: 0, failed: 1 });
    expect(await pendingPrintJobs(name)).toBe(1);

    const afterFail = (await storedJobs(name))[0];
    expect(afterFail.attempts).toBe(1);
    expect(afterFail.lastError).toBe('printer offline');
    // Backed off into the future — a second immediate drain does nothing.
    expect(afterFail.nextAttemptAt).toBeGreaterThan(Date.now());
    const immediate = await drainPrintQueue(service, Date.now(), name);
    expect(immediate).toEqual({ printed: 0, failed: 0 });

    // The printer comes back; a drain past the backoff time prints it.
    service.failing = false;
    const retry = await drainPrintQueue(service, afterFail.nextAttemptAt + 1, name);
    expect(retry).toEqual({ printed: 1, failed: 0 });
    expect(await pendingPrintJobs(name)).toBe(0);
  });

  it('never throws, even when every send fails', async () => {
    const name = freshDbName();
    await enqueuePrintJob({ orderId: 'o1', destination: 'kitchen', kind: 'kitchen', bytes: bytes() }, name);
    await enqueuePrintJob({ orderId: 'o2', destination: 'cashier', kind: 'receipt', bytes: bytes() }, name);
    const service = new FakePrintService();
    service.failing = true;

    // The promise resolves — a print failure can never propagate to block a close.
    await expect(drainPrintQueue(service, Date.now(), name)).resolves.toEqual({ printed: 0, failed: 2 });
    expect(await pendingPrintJobs(name)).toBe(2);
  });
});
