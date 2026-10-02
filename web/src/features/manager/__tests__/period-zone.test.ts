/**
 * Day boundaries are Khartoum's, whatever zone the browser is in.
 *
 * The review called periodRange at the same instant under TZ=UTC and
 * TZ=Africa/Khartoum and got boundaries two hours apart: the date was taken in
 * Khartoum, but midnight was then built in the browser's own zone. A manager
 * abroad, or a CI machine in UTC, saw a different "today" from the till.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { periodRange } from '../period';

const NOW = new Date('2026-10-02T12:00:00Z'); // 14:00 in Khartoum (UTC+2)
const original = process.env.TZ;

for (const zone of ['UTC', 'Asia/Tokyo', 'America/New_York', 'Africa/Khartoum']) {
  describe(`with the browser in ${zone}`, () => {
    beforeAll(() => {
      process.env.TZ = zone;
    });
    afterAll(() => {
      process.env.TZ = original;
    });

    it('today runs from midnight to midnight in Khartoum', () => {
      expect(periodRange('today', NOW)).toEqual({
        from: '2026-10-01T22:00:00.000Z',
        to: '2026-10-02T22:00:00.000Z',
      });
    });

    it('the week starts six Khartoum days before today', () => {
      expect(periodRange('week', NOW).from).toBe('2026-09-25T22:00:00.000Z');
    });

    it('just after midnight in Khartoum is already the new day', () => {
      const justAfter = new Date('2026-10-02T22:05:00Z'); // 00:05 on 3 October in Khartoum
      expect(periodRange('today', justAfter).from).toBe('2026-10-02T22:00:00.000Z');
    });
  });
}
