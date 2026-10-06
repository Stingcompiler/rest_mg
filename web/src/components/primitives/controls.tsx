'use client';

/**
 * The interactive primitives: Button, IconButton, TextField, Toggle,
 * SegmentedControl.
 *
 * Every one is a real focusable element, so the global `:focus-visible` ring
 * (defined in globals.css against the accent token) shows in both themes. Every
 * tappable control clears the 44px floor the design states — the mockups draw a
 * few at 40, and this is where that is corrected. No literal colour or size
 * appears here: only token classes.
 */
import { forwardRef } from 'react';

import { cn } from '@/lib/cn';

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'credit' | 'accentOutline';
type ButtonSize = 'md' | 'lg' | 'xl';

const BUTTON_BASE =
  'inline-flex items-center justify-center gap-8 rounded-md px-20 font-semibold outline-none transition-colors disabled:cursor-not-allowed';

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-accent text-text-on-accent hover:bg-accent-hover active:bg-accent-pressed disabled:bg-surface-quiet disabled:text-text-disabled',
  secondary:
    'border border-strong text-text hover:bg-surface-2 disabled:text-text-disabled disabled:border-line',
  danger: 'border border-danger text-danger hover:bg-danger-tint disabled:text-text-disabled',
  credit: 'bg-credit-tint border border-credit text-credit-text',
  accentOutline: 'bg-surface-2 border border-accent text-accent hover:bg-accent-tint',
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  md: 'min-h-control-lg text-ar-md', // 48
  lg: 'min-h-control-xl text-ar-lg', // 56
  xl: 'min-h-control-2xl text-ar-lg', // 64
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', className, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(BUTTON_BASE, BUTTON_VARIANTS[variant], BUTTON_SIZES[size], className)}
      {...rest}
    />
  );
});

type IconButtonVariant = 'framed' | 'quiet' | 'solid' | 'accent';

const ICON_BUTTON_VARIANTS: Record<IconButtonVariant, string> = {
  framed: 'size-control-lg border border-line bg-surface-2 text-text hover:bg-surface-3', // 48
  // No frame, the same floor: a back arrow or a row's edit pencil is still a
  // thumb's target, however quiet it looks.
  quiet: 'size-control-stepper text-text-muted hover:bg-surface-2', // 44
  // The public page's "+" on a dish, and the counter it turns into (batch 19).
  // Their own variants, because `cn` joins classes rather than merging them:
  // a caller's bg-accent would race the framed variant's background.
  solid: 'size-control-stepper bg-accent text-text-on-accent hover:bg-accent-hover disabled:opacity-40', // 44
  accent: 'size-control-stepper text-accent hover:bg-accent-tint', // 44
};

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Required: an icon button has no text, so it must name itself for a11y. */
  label: string;
  variant?: IconButtonVariant;
  /** Round, for the public page's "+" and its counter. A prop and not a
   *  className: `rounded-full` from a caller loses to the button's own
   *  `rounded-md`, which comes later in the stylesheet (batch 29). */
  shape?: 'square' | 'circle';
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, variant = 'framed', shape = 'square', className, type = 'button', children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex flex-none items-center justify-center outline-none',
        shape === 'circle' ? 'rounded-full' : 'rounded-md',
        ICON_BUTTON_VARIANTS[variant],
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
});

export interface TextFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, error, className, id, ...rest },
  ref,
) {
  const hasError = Boolean(error);
  return (
    <label className="flex flex-col gap-6">
      {label ? <span className="text-ar-sm text-text-muted">{label}</span> : null}
      <input
        ref={ref}
        id={id}
        aria-invalid={hasError}
        className={cn(
          'min-h-control-xl rounded-md px-16 text-ar-md text-text outline-none placeholder:text-text-muted',
          hasError
            ? 'border-strong border-danger bg-danger-tint text-danger'
            : 'border border-line bg-surface focus:border-strong focus:border-accent',
          'disabled:border-line disabled:bg-surface-2 disabled:text-text-disabled',
          className,
        )}
        {...rest}
      />
      {hasError ? <span className="text-ar-sm text-danger">{error}</span> : null}
    </label>
  );
});

export interface ToggleProps {
  checked: boolean;
  onChange?(next: boolean): void;
  label: string;
  disabled?: boolean;
}

export function Toggle({ checked, onChange, label, disabled }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange?.(!checked)}
      className={cn(
        'inline-flex h-toggle-h w-toggle-w items-center rounded-pill p-4 outline-none transition-colors',
        // Off is the strong line colour (3:1 against the surface, WCAG 1.4.11).
        // It was `bg-border`, which is not a colour here, so the track had none.
        checked ? 'justify-end bg-accent-pressed' : 'justify-start bg-line-strong',
        disabled && 'opacity-60',
      )}
    >
      <span className="size-knob rounded-pill bg-toggle-knob" />
    </button>
  );
}

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  /** Optional trailing count, e.g. category item counts. */
  count?: string;
}

export interface SegmentedControlProps<T extends string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange(value: T): void;
  ariaLabel: string;
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: SegmentedControlProps<T>) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="inline-flex gap-4 rounded-lg border border-line bg-bg p-4"
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            role="tab"
            aria-selected={active}
            type="button"
            onClick={() => onChange(option.value)}
            className={cn(
              'inline-flex min-h-control-stepper items-center gap-8 rounded-sm px-16 text-ar-base outline-none',
              active ? 'bg-accent font-semibold text-text-on-accent' : 'font-medium text-text-muted',
            )}
          >
            <span>{option.label}</span>
            {option.count ? (
              <span className="numeric text-num-xs opacity-70">{option.count}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
