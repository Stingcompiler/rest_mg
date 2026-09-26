/**
 * Arrival detection.
 *
 * Every mistake here is one of two kinds, and both are bad in a kitchen: an
 * order that arrives in silence, or a board that chimes at food it already
 * announced. The second is worse — people stop trusting the sound, and then the
 * first one happens too.
 */
import { describe, expect, it } from 'vitest';

import { SEEN_LIMIT, detectArrivals, parseSeen } from '@/lib/arrivals';

describe('detectArrivals', () => {
  it('says nothing on the very first look', () => {
    // Opening the board must not chime once per ticket already on it.
    const result = detectArrivals(['a', 'b', 'c'], null);
    expect(result.arrived).toEqual([]);
    expect(result.firstLook).toBe(true);
    expect(result.seen).toEqual(['a', 'b', 'c']);
  });

  it('treats an empty history as different from no history', () => {
    // History exists and was empty, so everything present now is genuinely new.
    const result = detectArrivals(['a'], []);
    expect(result.arrived).toEqual(['a']);
    expect(result.firstLook).toBe(false);
  });

  it('announces everything waiting after a sign-in clears the memory', () => {
    // Signing in writes an *empty* history rather than deleting the key. The
    // distinction is the whole mechanism: a deleted key is "first look" and
    // stays silent, which is right when a board first opens and exactly wrong
    // for a cashier who has just arrived and needs to be told what is waiting.
    const afterSignIn = detectArrivals(['ord-1', 'ord-2'], []);
    expect(afterSignIn.arrived).toEqual(['ord-1', 'ord-2']);
    expect(afterSignIn.firstLook).toBe(false);

    // And once told, not told again on the next poll.
    expect(detectArrivals(['ord-1', 'ord-2'], afterSignIn.seen).arrived).toEqual([]);
  });

  it('reports only what was not there before', () => {
    const result = detectArrivals(['c', 'b', 'a'], ['a', 'b']);
    expect(result.arrived).toEqual(['c']);
  });

  it('reports nothing when the list has not changed', () => {
    // This is the common case: a poll every fifteen seconds, all day.
    const result = detectArrivals(['a', 'b'], ['a', 'b']);
    expect(result.arrived).toEqual([]);
  });

  it('does not re-announce after a row is acknowledged and stays put', () => {
    let seen: string[] | null = null;
    ({ seen } = detectArrivals(['a'], seen));
    const second = detectArrivals(['b', 'a'], seen);
    expect(second.arrived).toEqual(['b']);
    const third = detectArrivals(['b', 'a'], second.seen);
    expect(third.arrived).toEqual([]);
  });

  it('keeps list order, so the newest is named first', () => {
    const result = detectArrivals(['x', 'y', 'z'], ['y']);
    expect(result.arrived).toEqual(['x', 'z']);
  });

  it('remembers rows that have left the list', () => {
    // The delivery queue is paged. Turning to page 2 and back must not make
    // page 1 arrive all over again.
    const first = detectArrivals(['p1a', 'p1b'], []);
    const onPageTwo = detectArrivals(['p2a', 'p2b'], first.seen);
    expect(onPageTwo.arrived).toEqual(['p2a', 'p2b']);
    const backToPageOne = detectArrivals(['p1a', 'p1b'], onPageTwo.seen);
    expect(backToPageOne.arrived).toEqual([]);
  });

  it('caps what it remembers so a till left running does not grow forever', () => {
    const many = Array.from({ length: SEEN_LIMIT + 50 }, (_, i) => `id-${i}`);
    const result = detectArrivals(many, []);
    expect(result.seen).toHaveLength(SEEN_LIMIT);
    // The ids kept are the current ones, which are the ones that matter.
    expect(result.seen[0]).toBe('id-0');
  });

  it('keeps what is on screen when the cap forces a choice', () => {
    const old = Array.from({ length: SEEN_LIMIT }, (_, i) => `old-${i}`);
    const result = detectArrivals(['fresh'], old);
    expect(result.seen).toHaveLength(SEEN_LIMIT);
    expect(result.seen).toContain('fresh');
  });

  it('never lists the same id twice in what it remembers', () => {
    const result = detectArrivals(['a', 'b'], ['b', 'c']);
    expect(result.seen).toEqual(['a', 'b', 'c']);
  });

  it('handles an empty screen without losing its memory', () => {
    const result = detectArrivals([], ['a', 'b']);
    expect(result.arrived).toEqual([]);
    expect(result.seen).toEqual(['a', 'b']);
  });
});

describe('parseSeen', () => {
  it('reads back what was written', () => {
    expect(parseSeen(JSON.stringify(['a', 'b']))).toEqual(['a', 'b']);
  });

  it('treats nothing stored as no history', () => {
    expect(parseSeen(null)).toBeNull();
    expect(parseSeen('')).toBeNull();
  });

  it('treats rubbish as no history rather than throwing', () => {
    // Whatever an extension or a half-finished write leaves behind, a kitchen
    // board mid-service must not crash on it.
    expect(parseSeen('{not json')).toBeNull();
    expect(parseSeen('"a string"')).toBeNull();
    expect(parseSeen('42')).toBeNull();
  });

  it('drops non-string entries instead of trusting them', () => {
    expect(parseSeen('["a", 5, null, "b"]')).toEqual(['a', 'b']);
  });
});
