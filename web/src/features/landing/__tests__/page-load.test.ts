/**
 * A page that failed to load is not a page that is switched off (batch 14).
 *
 * Any failure, a dropped line included, read "this page is not enabled",
 * with nothing to press. A customer on a weak connection was told the
 * restaurant had no page.
 */
import { describe, expect, it } from 'vitest';

import { pageLoadFailure } from '../pageLoad';

describe('pageLoadFailure', () => {
  it('is "not enabled" only when the server says there is no page', () => {
    expect(pageLoadFailure({ status: 404 })).toBe('not_enabled');
  });

  it('is worth retrying for anything else', () => {
    expect(pageLoadFailure({ status: 500 })).toBe('retry');
    expect(pageLoadFailure({ status: 503 })).toBe('retry');
    expect(pageLoadFailure(new TypeError('Failed to fetch'))).toBe('retry');
  });
});
