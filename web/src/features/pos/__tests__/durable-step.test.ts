/**
 * A step that must follow a saved bill does not run when the save failed
 * (review: `persistOrder` swallowed errors).
 *
 * Sending to the kitchen saved the order and then printed the ticket and
 * synced it — but a failed save was only logged, so the ticket could print for
 * an order the device had not recorded. `afterSave` runs the follow-up only
 * once the write is safe, and reports a failure instead of hiding it.
 */
import { describe, expect, it, vi } from 'vitest';

import { afterSave } from '../durableStep';

describe('afterSave', () => {
  it('runs the follow-up once the save has landed', async () => {
    const then = vi.fn();
    const failed = vi.fn();
    await expect(afterSave(() => Promise.resolve(), then, failed)).resolves.toBe(true);
    expect(then).toHaveBeenCalledOnce();
    expect(failed).not.toHaveBeenCalled();
  });

  it('skips the follow-up and reports when the save fails', async () => {
    const then = vi.fn();
    const failed = vi.fn();
    const error = new Error('QuotaExceededError');
    await expect(afterSave(() => Promise.reject(error), then, failed)).resolves.toBe(false);
    expect(then).not.toHaveBeenCalled();
    expect(failed).toHaveBeenCalledWith(error);
  });
});
