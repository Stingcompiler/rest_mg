/**
 * The customer's browser knows which restaurant this is (batch 14).
 *
 * The tab and a shared link said "نقاط البيع" (point of sale), the app's own
 * name. The form also gave the browser nothing to fill in, so every order
 * meant typing the same name, phone and address again.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const landing = readFileSync(resolve(__dirname, '../LandingClient.tsx'), 'utf-8');
const flow = readFileSync(resolve(__dirname, '../OrderFlow.tsx'), 'utf-8');

describe('the public page', () => {
  it("titles the tab with the restaurant's name", () => {
    expect(landing).toMatch(/document\.title\s*=/);
  });

  it('lets the browser fill in the delivery details', () => {
    for (const token of ['name', 'tel', 'street-address', 'address-level2']) {
      expect(flow).toMatch(new RegExp(`autoComplete="${token}"`));
    }
  });

  it('marks the field that is wrong', () => {
    expect(flow).toMatch(/aria-invalid=/);
  });
});
