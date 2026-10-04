'use client';

/**
 * Cart components: CartTabs, QtyStepper, CartLine, CartActionBar, TotalsBlock.
 *
 * The qty stepper's − and + caps use logical rounding (`rounded-s`/`rounded-e`)
 * so the rounded corners land on the correct side in both directions. Money is
 * pre-formatted and rendered through `Numeric`.
 */
import { cn } from '@/lib/cn';
import { Numeric } from '../primitives/indicators';
import { digitsOnly } from '@/lib/digits';

export interface CartTab {
  id: string;
  label: string;
  total: string;
}

export interface CartTabsProps {
  tabs: CartTab[];
  activeId: string;
  onSelect(id: string): void;
  onAdd?(): void;
  addLabel: string;
}

export function CartTabs({ tabs, activeId, onSelect, onAdd, addLabel }: CartTabsProps) {
  return (
    <div className="flex gap-6">
      {tabs.map((tab) => {
        const active = tab.id === activeId;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onSelect(tab.id)}
            aria-selected={active}
            className={cn(
              'inline-flex min-h-control-stepper items-center gap-8 rounded-t-md px-14 text-ar-md outline-none',
              active ? 'bg-surface-2 text-text' : 'text-text-muted',
            )}
          >
            <span>{tab.label}</span>
            <Numeric className="text-num-xs opacity-75">{tab.total}</Numeric>
          </button>
        );
      })}
      <button
        type="button"
        onClick={onAdd}
        aria-label={addLabel}
        className="inline-flex size-control-stepper items-center justify-center rounded-t-md text-la-2xl text-text-muted outline-none"
      >
        +
      </button>
    </div>
  );
}

export interface QtyStepperProps {
  qty: string;
  onDecrement?(): void;
  onIncrement?(): void;
  decrementLabel: string;
  incrementLabel: string;
  /** Make the count typeable; called with the typed number. */
  onSet?(qty: number): void;
  /** The typed field's accessible name, e.g. "عدد ورقات ١٬٠٠٠". */
  valueLabel?: string;
}

export function QtyStepper({
  qty,
  onDecrement,
  onIncrement,
  decrementLabel,
  incrementLabel,
  onSet,
  valueLabel,
}: QtyStepperProps) {
  return (
    <div className="flex flex-none items-center gap-2">
      <button
        type="button"
        aria-label={decrementLabel}
        onClick={onDecrement}
        className="inline-flex size-stepper items-center justify-center rounded-s-md bg-surface-3 text-la-xl font-semibold text-text outline-none"
      >
        −
      </button>
      {onSet ? (
        // Typed, for counting: 60 notes used to be 60 taps on "+".
        <input
          inputMode="numeric"
          dir="ltr"
          aria-label={valueLabel}
          value={qty}
          onFocus={(event) => event.target.select()}
          onChange={(event) => onSet(Number(digitsOnly(event.target.value).slice(0, 5) || '0'))}
          className="numeric h-stepper w-stepper-value bg-surface text-center text-num-base font-semibold text-text outline-none"
        />
      ) : (
        <span className="inline-flex h-stepper min-w-stepper items-center justify-center bg-surface text-num-base font-semibold text-text">
          <Numeric>{qty}</Numeric>
        </span>
      )}
      <button
        type="button"
        aria-label={incrementLabel}
        onClick={onIncrement}
        className="inline-flex size-stepper items-center justify-center rounded-e-md bg-surface-3 text-la-xl font-semibold text-text outline-none"
      >
        +
      </button>
    </div>
  );
}

export interface CartLineProps {
  name: string;
  modifiers?: string;
  total: string;
  stepper: React.ReactNode;
}

export function CartLine({ name, modifiers, total, stepper }: CartLineProps) {
  return (
    <div className="flex items-center gap-12 rounded-md bg-surface-2 p-12">
      {stepper}
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <span className="text-ar-md font-medium text-text">{name}</span>
        {modifiers ? <span className="text-ar-sm text-text-muted">{modifiers}</span> : null}
      </div>
      <Numeric className="flex-none text-num-md font-semibold text-text">{total}</Numeric>
    </div>
  );
}

export function CartActionBar({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-4 gap-8">{children}</div>;
}

export interface CartActionProps {
  label: string;
  onClick?(): void;
  /** Unavailable, and visibly so. See the note below on why that matters. */
  disabled?: boolean;
  /** Why it is unavailable, for the tooltip and for screen readers. */
  hint?: string;
}

/**
 * One of the small actions above the totals.
 *
 * Two things this had to grow. It had **no pressed or hover state** — on a
 * touch screen that means a cashier cannot tell a tap that registered from one
 * that missed, and taps it again. And it had no `disabled` at all, so a button
 * wired to nothing looked exactly like a working one: pressing it did nothing,
 * with no way to know whether the order or the button was at fault.
 */
export function CartAction({ label, onClick, disabled, hint }: CartActionProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={hint}
      aria-label={hint ? `${label} — ${hint}` : undefined}
      className={cn(
        'inline-flex min-h-control-md items-center justify-center rounded-md border text-ar-base font-medium outline-none transition-colors',
        disabled
          ? 'cursor-not-allowed border-line bg-surface text-text-disabled'
          : 'border-line bg-surface-2 text-text hover:bg-surface-3 active:bg-surface-3',
      )}
    >
      {label}
    </button>
  );
}

export interface TotalsRow {
  label: string;
  value: string;
  tone?: 'muted' | 'success';
}

export interface TotalsBlockProps {
  rows: TotalsRow[];
  totalLabel: string;
  totalValue: string;
}

export function TotalsBlock({ rows, totalLabel, totalValue }: TotalsBlockProps) {
  return (
    <div className="flex flex-col gap-10">
      {rows.map((row) => (
        <div key={row.label} className="flex items-baseline justify-between text-ar-md">
          <span className="text-text-muted">{row.label}</span>
          <Numeric
            className={cn('font-medium', row.tone === 'success' ? 'text-success' : 'text-text')}
          >
            {row.value}
          </Numeric>
        </div>
      ))}
      <div className="flex items-baseline justify-between">
        <span className="text-ar-lg font-semibold text-text">{totalLabel}</span>
        <Numeric className="text-num-4xl font-semibold text-text">{totalValue}</Numeric>
      </div>
    </div>
  );
}
