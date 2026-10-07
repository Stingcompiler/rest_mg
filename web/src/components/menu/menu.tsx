'use client';

/**
 * Menu-facing components: SearchField, CategoryTab, FavouriteChip,
 * MenuItemCard, MenuManagementRow.
 *
 * Money arrives as a formatted string (the screen formats it via useI18n); these
 * render it through `Numeric` for the tabular treatment. An out-of-stock item
 * greys down and shows its flag rather than disappearing, exactly as the design
 * keeps it visible.
 */
import { cn } from '@/lib/cn';
import { CountBadge, Numeric } from '../primitives/indicators';
import { Toggle } from '../primitives/controls';

export interface SearchFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  icon?: React.ReactNode;
}

export function SearchField({ icon, className, ...rest }: SearchFieldProps) {
  // A placeholder is not a name: a screen reader reads the field as unnamed.
  // It becomes the accessible name unless the caller gives one (batch 15).
  const named = rest['aria-label'] ?? (typeof rest.placeholder === 'string' ? rest.placeholder : undefined);
  return (
    <div className="flex min-h-control-md flex-1 items-center gap-10 rounded-md border border-line bg-bg px-14">
      {icon ? <span className="text-text-muted">{icon}</span> : null}
      <input
        className={cn(
          'w-full bg-transparent text-ar-base text-text outline-none placeholder:text-text-muted',
          className,
        )}
        {...rest}
        aria-label={named}
      />
    </div>
  );
}

export interface CategoryTabProps {
  label: string;
  count?: string;
  active?: boolean;
  onClick?(): void;
}

export function CategoryTab({ label, count, active, onClick }: CategoryTabProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'inline-flex min-h-control-md items-center gap-8 whitespace-nowrap rounded-md border px-16 text-ar-base outline-none',
        active
          ? 'border-accent bg-accent font-medium text-text-on-accent'
          : 'border-line bg-surface-2 font-medium text-text-muted',
      )}
    >
      <span>{label}</span>
      {count ? <Numeric className="text-num-xs opacity-70">{count}</Numeric> : null}
    </button>
  );
}

export interface FavouriteChipProps {
  name: string;
  price: string;
  onClick?(): void;
}

export function FavouriteChip({ name, price, onClick }: FavouriteChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-control-xl flex-1 flex-col justify-center gap-2 rounded-md border border-accent-tint-border bg-accent-tint px-14 text-start outline-none"
    >
      <span className="truncate text-ar-base font-semibold text-text">{name}</span>
      <Numeric className="text-num-sm text-accent">{price}</Numeric>
    </button>
  );
}

export interface MenuItemCardProps {
  name: string;
  sub?: string;
  price: string;
  /** Quantity already in the active cart; shows the corner badge when set. */
  inCart?: string;
  available?: boolean;
  flag?: string;
  onClick?(): void;
}

export function MenuItemCard({
  name,
  sub,
  price,
  inCart,
  available = true,
  flag,
  onClick,
}: MenuItemCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!available}
      className={cn(
        // A floor, not a fixed height: a long name or description used to push
        // the price out of the card on a tablet (review, 1024×768). The text is
        // clamped so cards in a row stay close in size.
        // A press that shows, on a touch screen (batch 31).
        'relative flex min-h-item-card flex-col justify-between gap-8 rounded-lg border p-14 text-start shadow-card outline-none transition active:scale-[0.98]',
        // A dish already in the order is tinted, not only outlined: the corner
        // badge alone was easy to miss across a full menu (batch 21).
        inCart ? 'border-accent-pressed bg-accent-tint' : 'border-line bg-surface',
        !available && 'cursor-not-allowed',
      )}
    >
      <div className="flex flex-col gap-2">
        <span className={cn('line-clamp-2 text-ar-md font-medium', available ? 'text-text' : 'text-text-disabled')}>
          {name}
        </span>
        {sub ? (
          <span className={cn('line-clamp-1 text-ar-sm', available ? 'text-text-muted' : 'text-text-disabled')}>
            {sub}
          </span>
        ) : null}
      </div>
      <div className="flex items-center justify-between">
        <Numeric className={cn('text-num-md font-semibold', available ? 'text-text' : 'text-text-disabled')}>
          {price}
        </Numeric>
        {flag ? <span className="text-ar-sm text-warning">{flag}</span> : null}
      </div>
      {inCart ? (
        <span className="absolute end-10 top-10">
          <CountBadge count={inCart} />
        </span>
      ) : null}
    </button>
  );
}

export interface MenuManagementRowProps {
  name: string;
  price: string;
  stateLabel: string;
  available: boolean;
  toggleLabel: string;
  onToggle?(next: boolean): void;
}

export function MenuManagementRow({
  name,
  price,
  stateLabel,
  available,
  toggleLabel,
  onToggle,
}: MenuManagementRowProps) {
  return (
    // One line from 640px; on a phone the name takes its own line and the
    // price, state and switch go under it. In one line the switch, which now
    // keeps its size, ran past the card's edge (found verifying batch 31).
    <div className="flex flex-wrap items-center gap-x-16 gap-y-10 rounded-lg border border-line bg-surface p-14">
      <span className={cn('min-w-0 flex-1 basis-full text-ar-md font-medium sm:basis-0', available ? 'text-text' : 'text-text-disabled')}>
        {name}
      </span>
      <div className="flex min-h-control-lg w-price-field items-center justify-end rounded-md border border-line bg-surface-2 px-14">
        <Numeric className={cn('text-num-md font-semibold', available ? 'text-text' : 'text-text-disabled')}>
          {price}
        </Numeric>
      </div>
      <span className={cn('text-ar-sm sm:w-price-field', available ? 'text-text-muted' : 'text-warning')}>
        {stateLabel}
      </span>
      <span className="ms-auto flex sm:ms-0">
        <Toggle checked={available} onChange={onToggle} label={toggleLabel} />
      </span>
    </div>
  );
}
