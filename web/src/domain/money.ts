/**
 * Money is `bigint`, minor units, everywhere in the domain.
 *
 * `number` never touches a money value: past 2^53 it rounds silently, and
 * severe inflation reaches that. These helpers keep the arithmetic in bigint so
 * no accidental coercion slips in.
 */
export type Money = bigint;

export const ZERO: Money = 0n;

export function sumMoney(values: readonly Money[]): Money {
  return values.reduce((total, value) => total + value, ZERO);
}

export function maxMoney(a: Money, b: Money): Money {
  return a > b ? a : b;
}

export function absMoney(value: Money): Money {
  return value < ZERO ? -value : value;
}
