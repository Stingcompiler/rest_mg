'use client';

/**
 * DenominationRow — one line of the shift-close cash count.
 *
 * A note face value, a stepper for the count, and the running line sum. The
 * screen passes the stepper so the counting UI is consistent with the cart's.
 */
import { Numeric } from '../primitives/indicators';

export interface DenominationRowProps {
  /** The note's face value, or a label like "معدن" for coins. */
  note: string;
  stepper: React.ReactNode;
  sum: string;
}

export function DenominationRow({ note, stepper, sum }: DenominationRowProps) {
  return (
    <div className="flex items-center gap-12 rounded-md border border-line bg-surface p-14">
      <Numeric className="text-num-md font-semibold text-text">{note}</Numeric>
      {stepper}
      <Numeric className="flex-1 text-end text-num-md font-semibold text-text-muted">{sum}</Numeric>
    </div>
  );
}
