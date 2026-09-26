# `src/components` — the design system

Every reusable piece the screens are built from, built once, before any screen.
The mockups' 31 catalogued components plus the four states they never drew —
empty, loading, error, and confirmation.

## The rules, enforced by lint

- **No literal colour or size.** Only token classes; the exact component
  dimensions from `DESIGN-SYSTEM.md §5` are named tokens (`w-toggle-w`,
  `size-stepper`, `w-cancel-btn`, …), so nothing reaches for an arbitrary
  `[Npx]`. Guarded by `no-literal-design-values`.
- **Logical direction only** (`ms`/`me`/`ps`/`pe`/`border-s`/`rounded-s`/
  `text-start`). Arabic and English mirror with no second layout. Guarded by
  `no-physical-direction`.
- **No hardcoded text.** User-facing strings arrive as props, already
  translated; money and counts arrive pre-formatted and render through
  `Numeric` for the tabular treatment. Guarded by `no-raw-strings`.
- **Every interactive control is a real focusable element clearing 44px.** The
  design draws a few tap targets at 40; this is where that floor is applied.

## What's here

| File | Components |
|---|---|
| `primitives/controls.tsx` | Button, IconButton, TextField, Toggle, SegmentedControl |
| `primitives/indicators.tsx` | Numeric, StatusChip, ConnectionDot, Badge, CountBadge, ProgressBar, Divider |
| `layout/layout.tsx` | AppHeader, NavRail, NavRailItem, RailStatus |
| `menu/menu.tsx` | SearchField, CategoryTab, FavouriteChip, MenuItemCard, MenuManagementRow |
| `cart/cart.tsx` | CartTabs, QtyStepper, CartLine, CartActionBar, CartAction, TotalsBlock |
| `payment/payment.tsx` | PaymentMethodCard, QuickCashButton, Keypad, AmountRow, CalloutPanel |
| `shift/shift.tsx` | DenominationRow |
| `report/report.tsx` | KpiCard, BarChart, StackedShareBar |
| `orders/orders.tsx` | OrderCard |
| `media/media.tsx` | ImageSlot |
| `feedback/feedback.tsx` | EmptyState, Skeleton, LoadingList, ErrorState, ConfirmDialog |

Icons come from `lucide-react`, sized with numeric props (not classes) so they
stay off the design-token path.

## Money and text

Components are presentational. A screen formats money via `useI18n().money(...)`
and passes the string down; the component renders it through `Numeric`. This
keeps the library free of provider coupling and trivially previewable — the
gallery feeds literal strings.

## Verified

`/gallery` renders the whole library in all four theme × direction quadrants at
once. Confirmed live in the browser:

- nested `[data-theme]` resolves tokens per container — a dark quadrant's header
  computes to `#1E2124`, a light quadrant's to `#FFFFFF`;
- the touch floor holds — segmented tabs measure 44px, buttons 48px, in every
  quadrant;
- logical mirroring works — the nav rail's border sits on the right in RTL and
  the left in LTR from the same `border-s` class;
- no console errors, all self-hosted fonts load.

```bash
npm run dev   # then open /gallery
```
