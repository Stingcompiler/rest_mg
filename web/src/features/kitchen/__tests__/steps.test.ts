/**
 * A ticket can go back a step.
 *
 * The board only moved forward. A tap on "served" by mistake took the ticket
 * off the board for good, and a double tap on "start" marked it ready.
 * Found in the user-experience review (batch 11).
 */
import { describe, expect, it } from 'vitest';

import { nextKitchenStatus, previousKitchenStatus } from '../steps';

describe('kitchen steps', () => {
  it('go forward queued → preparing → ready → served', () => {
    expect(nextKitchenStatus('queued')).toBe('preparing');
    expect(nextKitchenStatus('preparing')).toBe('ready');
    expect(nextKitchenStatus('ready')).toBe('served');
    expect(nextKitchenStatus('served')).toBeNull();
  });

  it('go back one step, except from the start', () => {
    expect(previousKitchenStatus('served')).toBe('ready');
    expect(previousKitchenStatus('ready')).toBe('preparing');
    expect(previousKitchenStatus('preparing')).toBe('queued');
    expect(previousKitchenStatus('queued')).toBeNull();
  });
});
