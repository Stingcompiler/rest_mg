/**
 * One counted denomination row on the shift-close screen.
 *
 * Counting cash by note (٥٠٠٠ · ٢٠٠٠ · ١٠٠٠ · ٥٠٠ · معدن) is why the counted
 * total is a sum of rows, not a single typed number. A note row is a face value
 * times a count; coins are entered as a lump sum with no face value.
 */
import { newId } from './ids';
import type { Money } from './money';

export interface CashCountSnapshot {
  id: string;
  denominationMinor: Money | null;
  label: string;
  count: number;
  lineTotalMinor: Money;
}

export class CashCount {
  private constructor(private state: CashCountSnapshot) {}

  /** A note row: count × face value. */
  static forDenomination(denominationMinor: Money, count: number, label = ''): CashCount {
    return new CashCount({
      id: newId(),
      denominationMinor,
      label,
      count,
      lineTotalMinor: denominationMinor * BigInt(count),
    });
  }

  /**
   * A lump sum with no face value — coins.
   *
   * `label` is a stable key, not display text: the UI renders it through the
   * catalogue so it follows the language toggle. It used to default to an
   * Arabic word, which then appeared verbatim on an English screen.
   */
  static lump(amountMinor: Money, label = 'coins'): CashCount {
    return new CashCount({
      id: newId(),
      denominationMinor: null,
      label,
      count: 0,
      lineTotalMinor: amountMinor,
    });
  }

  static fromSnapshot(snapshot: CashCountSnapshot): CashCount {
    return new CashCount({ ...snapshot });
  }

  lineTotal(): Money {
    return this.state.lineTotalMinor;
  }

  toSnapshot(): CashCountSnapshot {
    return { ...this.state };
  }
}
