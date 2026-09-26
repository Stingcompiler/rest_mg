/**
 * The one place money crosses between storage and arithmetic.
 *
 * Stored and transported as a string of minor units; reasoned about as `bigint`.
 * `Number` never touches a money value — past 2^53 it silently rounds, and
 * severe inflation reaches that in minor units.
 */
import type { MoneyString } from './records';

export function toMinor(value: MoneyString): bigint {
  return BigInt(value);
}

export function fromMinor(value: bigint): MoneyString {
  return value.toString();
}
