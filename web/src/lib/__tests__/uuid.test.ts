import { afterEach, describe, expect, it, vi } from 'vitest';

import { uuid4 } from '../uuid';

const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

afterEach(() => vi.unstubAllGlobals());

describe('uuid4', () => {
  it('is a version 4 UUID', () => {
    expect(uuid4()).toMatch(V4);
  });

  it('still works where randomUUID is missing (a page over plain HTTP)', () => {
    vi.stubGlobal('crypto', { getRandomValues: crypto.getRandomValues.bind(crypto) });
    const first = uuid4();
    expect(first).toMatch(V4);
    expect(uuid4()).not.toBe(first);
  });
});
