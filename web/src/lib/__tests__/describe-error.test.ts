/**
 * What a failure says to the person who caused it.
 *
 * Screens showed whatever came back: the server's English message, "Request
 * failed.", or `String(error)`, which reads "TypeError: Failed to fetch" in the
 * middle of an Arabic screen. Others showed nothing at all. One function now
 * turns any failure into a message key, never into the raw text (batch 12).
 */
import { describe, expect, it } from 'vitest';

import { DomainError } from '@/domain';
import { ApiError } from '../http';
import { describeError } from '../describeError';

describe('describeError', () => {
  it('names a known server refusal by its code', () => {
    expect(describeError(new ApiError(409, 'shared_record', 'Shared.'))).toBe('error.shared_record');
    expect(describeError(new ApiError(400, 'reason_required', 'Say why.'))).toBe('error.reason_required');
  });

  it('falls back by status for a refusal it does not know', () => {
    expect(describeError(new ApiError(401, 'whatever', 'x'))).toBe('error.session');
    expect(describeError(new ApiError(403, 'whatever', 'x'))).toBe('error.forbidden');
    expect(describeError(new ApiError(404, 'whatever', 'x'))).toBe('error.notFound');
    expect(describeError(new ApiError(429, 'whatever', 'x'))).toBe('error.tooMany');
    expect(describeError(new ApiError(400, 'something_new', 'x'))).toBe('error.refused');
    expect(describeError(new ApiError(503, 'whatever', 'x'))).toBe('error.server');
  });

  it('calls a dropped line a dropped line', () => {
    expect(describeError(new TypeError('Failed to fetch'))).toBe('error.network');
  });

  it('uses the entity code for a domain refusal', () => {
    expect(describeError(new DomainError('order_has_payments', 'x'))).toBe('error.order_has_payments');
  });

  it('never hands back the raw text', () => {
    for (const error of [new Error('boom'), 'boom', null, undefined, 42]) {
      expect(describeError(error)).toBe('error.unknown');
    }
  });
});
