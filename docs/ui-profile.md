# Orderak — UI profile

The project's half of the UI review guide (general rules + this profile + the screenshot script). What is decided here is not re-derived; change it here first. The general rules are in [`ui-cards-review-guide.md`](ui-cards-review-guide.md). The design tokens and components are in [`DESIGN-SYSTEM.md`](DESIGN-SYSTEM.md).

## What the product is

**Orderak (اوردراك)** — one restaurant's point of sale, kitchen, delivery desk, manager dashboard and public ordering page, in one system.

| Who | Does | Density | Used |
|---|---|---|---|
| Cashier | takes orders, takes payment, closes the shift, confirms and hands over website orders | high, glanceable, one hand | all day, a tablet or a phone, **offline at times** |
| Kitchen | works the ticket queue | high, large type | all day, a wall screen or a tablet |
| Manager / owner | reads revenue and what is unsettled, edits the menu, staff, customers' debts | medium to high, comparing figures | a few times a day, desktop first, also phone |
| Customer | reads the menu, orders for delivery or pickup, follows the order | low, scanning, mobile first | once, a phone, on mobile data |

## Platform and display

- **Web only**, one static export served by Django. Touch (till, kitchen, customer) and mouse + keyboard (manager).
- **Widths supported:** 360px (smallest phone) up to 1280px+. The breakpoints that matter are `sm` 640, `lg` 1024. Verified at **360, 768, 1280**.
- **Languages:** Arabic (RTL, the default) and English, switched in settings. Logical properties only (`ms-`, `pe-`, `text-start`); the `no-physical-direction` lint enforces it.
- **Colour modes:** light and dark, plus follow-the-system. Nothing else.
- **Fonts:** IBM Plex Sans Arabic for Arabic text, IBM Plex Sans for Latin, IBM Plex Mono for numerals, Readex Pro (600, display) for headings on the public page and large figures.
- **Numerals: decided.** They follow the language (Arabic-Indic in Arabic, Western in English) until the person chooses, then the choice is kept. Money is always written with its currency («ج.س» / SDG). A zero is never shown alone as «٠»: in Arabic-Indic digits it reads as a dot; show nothing, or «—» with words.

## Library and system

Next.js 15 static export · React 19 · Tailwind 3 on a **token-only scale** (`web/tailwind.config.ts`, `web/src/styles/design-tokens.css`; no literal colours or sizes in components, enforced by lint and tests) · components in `web/src/components/*` (primitives, layout, menu, orders, payment, report, shift, settings, feedback).

**Shared components to build on:** `Button`, `IconButton`, `TextField`, `Toggle`, `SegmentedControl`, `AppHeader`, `NavRail`, `KpiStrip` / `KpiCard` / `LedgerRow` (the manager's figures), `MenuItemCard`, `OrderCard`, `StatusChip`, `CountBadge`, `Skeleton` / `LoadingList`, `EmptyState` / `ErrorState`, `QtyStepper`, `DenominationRow`.

## Product identity

Warm, calm, printed. A restaurant's ledger and menu card, not a SaaS dashboard: ivory paper, ink, emerald for action, gold for detail, hairline rules, dotted leaders. Strong colour is kept for what needs the eye (the takings, an order to confirm, a debt).

## Visual direction (chosen)

Settled by the owner's reviews of the public page (batch 35) and the manager's overview (batch 40), not left open:

- **Look:** flat and quiet, **no card shadow or tint by default**; separation by space, hairlines and rules. Depth only for what floats (sheets, menus).
- **Composition:** **lines, not boxes.** A dish is a menu line (name, dotted leader, price); a figure is a cell of one ledger band; a section is a title over a rule. A box is for a thing the person acts on as a unit (an order or delivery ticket, a sheet).
- **Behaviour:** a ticket shows its state in words and offers its own actions; a line that opens details is one target with a visible focus ring.
- **Motion:** only to show a change of state or a running process; off under `prefers-reduced-motion`.

## Representative screens (for the screenshots)

`landing` (public, a long menu) · `login` · `dashboard` (today, and all periods) · `customers` (long names, large debts) · `staff` · `reports` · `pos` (the till) · `pos-orders` · `pos-shift-close` · `pos-report` · `deliveries` (every state, long address and notes) · `catalog` · `kitchen`. Data: `web/scripts/shots-data.py`.

## Documented exceptions to the forbidden patterns

Marked in code with `ui-allow:` and a reason (`npm run lint:ui` skips them).

- **Active-navigation edge** on the till's rail and the manager's rail (`border-*-strong` on the current item): the guide's functional exception.
- **Count badge** on a navigation icon (red tint, round): it carries the number of waiting deliveries.
- **Skeletons** (`animate-pulse`): a loading process is running.
- **The public page's motion** (slow drift of the cover, embers without a cover, the dish-name marquee, the "more below" cue): the owner's explicit brief, `docs/LANDING-MOTION.ar.md`; off under reduced motion; the marquee pauses on hover.
- **Scrim gradient** over the cover photograph, so the name reads over any picture.
- **A rule over a section's title** on the manager's overview (`border-t-strong`): a divider, not a strip on a box.

## Commands

- **Template-pattern lint:** `npm run lint:ui` (in `web/`; also in CI).
- **A system to photograph:** `web/scripts/shots-env.sh up` (after `npm run build`) starts a throwaway PostgreSQL, the seed, `shots-data.py` and the monolith on :8765; `down` stops them.
- **Screenshots:** `npm run shots -- <label>` → `web/shots/<label>/<screen>--<viewport>--<scheme>--<locale>.png` (needs the monolith on `BASE_URL`, default `http://localhost:8765`, with the review data; set `ONLY=a,b` for a few screens).

## Environment constraints

- The cashier's screens must work **offline**: no screen may wait on the network to paint, and a loading state may not block a sale.
- Tablets and phones of modest power: no full-page blur, no continuous animation on lists.
- 360px is a real width: nothing may overflow it, and the bottom of a screen must clear a phone's browser bar (`h-dvh`).
