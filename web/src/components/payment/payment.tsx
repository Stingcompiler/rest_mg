'use client';

/**
 * Payment components: PaymentMethodCard, QuickCashButton, Keypad, AmountRow,
 * CalloutPanel.
 *
 * The credit method carries its own token family everywhere it appears, so
 * "آجل — ذمم" reads as not-revenue on sight. The keypad renders whatever glyphs
 * the screen passes, so it follows the numeral setting without knowing about it.
 */
import { cn } from '@/lib/cn';
import { Numeric } from '../primitives/indicators';

type MethodTone = 'neutral' | 'accent' | 'credit';

const METHOD_TONES: Record<MethodTone, string> = {
  neutral: 'bg-surface-2 border-line text-text',
  accent: 'bg-accent border-accent text-text-on-accent',
  credit: 'bg-credit-tint border-credit text-credit-text',
};

export interface PaymentMethodCardProps {
  label: string;
  hint?: string;
  icon?: React.ReactNode;
  tone?: MethodTone;
  /** A settled bill has nothing left to take: the method is shown, not offered. */
  disabled?: boolean;
  onClick?(): void;
}

export function PaymentMethodCard({
  label,
  hint,
  icon,
  tone = 'neutral',
  disabled,
  onClick,
}: PaymentMethodCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex min-h-control-2xl items-center gap-14 rounded-lg border px-18 text-start outline-none',
        METHOD_TONES[tone],
        disabled && 'cursor-not-allowed opacity-40',
      )}
    >
      {icon ? <span>{icon}</span> : null}
      <div className="flex flex-col gap-2">
        <span className="text-ar-lg font-semibold">{label}</span>
        {hint ? <span className="text-ar-sm opacity-85">{hint}</span> : null}
      </div>
    </button>
  );
}

export function QuickCashButton({ label, onClick }: { label: string; onClick?(): void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex min-h-control-xl flex-1 items-center justify-center rounded-md border border-line bg-surface-2 text-num-md font-semibold text-text outline-none"
    >
      <Numeric>{label}</Numeric>
    </button>
  );
}

export interface KeypadKey {
  label: string;
  value: string;
  /** For a key whose face is a symbol, such as ⌫ (batch 15). */
  ariaLabel?: string;
}

export interface KeypadProps {
  keys: KeypadKey[];
  onPress(value: string): void;
}

export function Keypad({ keys, onPress }: KeypadProps) {
  return (
    <div className="grid flex-1 auto-rows-fr grid-cols-3 gap-10">
      {keys.map((key) => (
        <button
          key={key.value}
          type="button"
          onClick={() => onPress(key.value)}
          aria-label={key.ariaLabel}
          // A till key must answer the finger: without a pressed state the pad
          // looked inert, and a cashier could not tell a registered tap from a
          // missed one.
          className="inline-flex min-h-control-2xl items-center justify-center rounded-lg border border-line bg-surface-2 text-num-3xl font-medium text-text shadow-card outline-none transition-transform duration-75 hover:border-strong active:scale-95 active:border-accent active:bg-accent-tint active:text-accent"
        >
          <Numeric>{key.label}</Numeric>
        </button>
      ))}
    </div>
  );
}

export interface AmountRowProps {
  label: string;
  note?: string;
  amount: string;
  tone?: 'neutral' | 'credit' | 'success';
}

const AMOUNT_TONES = {
  neutral: 'bg-surface border-line text-text',
  credit: 'bg-credit-tint border-credit text-credit-text',
  success: 'bg-success-tint border-success text-success',
} as const;

export function AmountRow({ label, note, amount, tone = 'neutral' }: AmountRowProps) {
  return (
    <div className={cn('flex items-center justify-between rounded-md border p-14', AMOUNT_TONES[tone])}>
      <div className="flex flex-col gap-2">
        <span className="text-ar-md font-medium">{label}</span>
        {note ? <span className="text-ar-sm text-text-muted">{note}</span> : null}
      </div>
      <Numeric className="text-num-lg font-semibold">{amount}</Numeric>
    </div>
  );
}

export interface CalloutPanelProps {
  title: string;
  amount?: string;
  detail?: string;
  icon?: React.ReactNode;
  tone?: 'danger' | 'neutral';
  children?: React.ReactNode;
}

/** The critical alert block — the cash-variance callout, and its shape reused. */
export function CalloutPanel({ title, amount, detail, icon, tone = 'danger', children }: CalloutPanelProps) {
  const danger = tone === 'danger';
  return (
    <div
      className={cn(
        'flex flex-col gap-8 rounded-lg p-20',
        danger ? 'border-strong border-danger bg-danger-tint' : 'border border-line bg-surface',
      )}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-12">
          {icon ? <span className={danger ? 'text-danger' : 'text-text'}>{icon}</span> : null}
          <span className={cn('text-ar-lg font-bold', danger ? 'text-danger' : 'text-text')}>{title}</span>
        </div>
        {amount ? (
          <Numeric className={cn('text-num-6xl font-bold', danger ? 'text-danger' : 'text-text')}>
            {amount}
          </Numeric>
        ) : null}
      </div>
      {detail ? (
        <p className={cn('text-ar-base', danger ? 'text-danger-text' : 'text-text-muted')}>{detail}</p>
      ) : null}
      {children}
    </div>
  );
}
