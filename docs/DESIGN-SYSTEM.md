# DESIGN-SYSTEM.md

Extracted from the Claude Design handoff bundle. **Nothing here is normalised or invented** — every
value is transcribed from the mockups, and everywhere the mockups disagree with themselves the
disagreement is recorded in [§10 Open questions](#10-open-questions--conflicts) instead of being
silently resolved.

---

## 0. Sources

| File | What it is |
|---|---|
| `project/Sudan POS.dc.html` | **The design.** 1871 lines, 8 sections, ~20 screens. Everything below comes from it. |
| `project/support.js` | Generated Claude Design runtime (`<sc-for>`, `DCLogic`, prop editor). Prototype plumbing — no design information. |
| `project/image-slot.js` | Generated `<image-slot>` placeholder element. Used for landing hero / map / editor photos. No design information. |
| `project/Sudan POS - standalone.html` | Self-contained export of the **v1** sections only (screens 01–06), fonts inlined. |
| `project/Wisam Al-Sham POS - standalone.html` | Self-contained export including the **v2** screens (`v2-01…v2-04`, `v2L-01…v2L-04`). Superset content identical to the `.dc.html`. |
| `project/screenshots/v2.png` | Not opened (README: don't render). |

`PROMPT.md` refers to a `design-reference/` folder; the actual folder in the bundle is `project/`.

### The file contains two different generations of the same app

| | **v1** (sections `1b` dark / `1c` light) | **v2** (sections `2a` dark / `2b` light) |
|---|---|---|
| Screens | 01 Order entry · 02 Payment · 03 Open orders · 04 Menu management · 05 Shift close · 06 Daily report | 01 Order entry · 02 Payment · 03 Open orders · 04 Shift close |
| Frame radius | 12px | 14px |
| Header height | 64px | 68px |
| Cart panel | 392px | 404px |
| Payment side panel | 460px | 470px |
| Item card | 104px tall, radius 10 | 112px tall, radius 12, + in-cart badge |
| Nav | none (screens are standalone) | 92px icon rail |
| Extra features | — | search, favourites row, category counts, multi-cart tabs, cart quick actions, split-payment progress + quick cash, per-order sync state + age bar, denomination cash count |

v2 is clearly the newer pass, but **v2 has no Menu management and no Daily report** — those exist
only in v1. Any complete build has to combine both generations. See [Q1](#q1--which-generation-is-canonical).

Other sections: `1a` design-system panel (tokens, type, states, spacing), `1d` LTR mirroring proof,
`1e` manager web app (separate product, 1440×900), `1f` public landing page (390px mobile).

### How the two themes relate

Light mode is **derived, not hand-drawn**. The prototype's script holds a literal dark→light hex map
(`LIGHT_MAP`, line 1586) and runs every data-driven colour through it; the hand-written light
sections use the same mapping. This means the light palette is exactly the dark palette put through a
lookup — with the collisions that implies ([Q4](#q4--light-mode-has-no-hover-or-pressed-accent)).

---

## 1. Colour

### 1.1 Tokens declared by the design itself

Section `1a` ships its own token table (lines 1839–1864), including contrast ratios. These are the
designer's stated ratios, transcribed as-is — not re-measured.

| Token | Light | ratio | Dark | ratio |
|---|---|---|---|---|
| `bg` | `#F4F2EE` | — | `#16181A` | — |
| `surface` | `#FFFFFF` | — | `#1E2124` | — |
| `surface-2` | `#EAE7E1` | — | `#262A2E` | — |
| `border` | `#D6D1C8` | 1.5:1 | `#3A4046` | 1.7:1 |
| `text` | `#1B1A17` | 16.1:1 | `#EDEFF1` | 14.2:1 |
| `text-muted` | `#5E5A52` | 6.8:1 | `#A3ABB2` | 7.1:1 |
| `accent` | `#0F5C4A` | 7.9:1 | `#3FB89A` | 8.4:1 |
| `success` | `#1B6E3C` | 6.1:1 | `#4CC38A` | 9.0:1 |
| `warning` | `#8A5A00` | 5.2:1 | `#E0A32E` | 9.3:1 |
| `danger` | `#A62A21` | 6.4:1 | `#F0645B` | 6.2:1 |
| `credit` | `#6B3FA0` | 7.6:1 | `#B08CE8` | 7.4:1 |

That table covers 11 tokens. **The screens use 30.** The full inventory follows.

### 1.2 Complete semantic colour map

Proposed token names are mine; the light/dark values are verbatim from the file. "Where" cites the
screens each value actually appears in.

#### Neutrals / surfaces

| Token | Dark | Light | Where |
|---|---|---|---|
| `bg` | `#16181A` | `#F4F2EE` | Screen background, all screens |
| `bg-rail` | `#101214` | `#EAE7E1` | v2 nav rail only |
| `bg-sunken` | `#1A1D20` | `#EFECE6` | Menu-management category sidebar only |
| `surface` | `#1E2124` | `#FFFFFF` | Header bar, cards, cart panel, side panels |
| `surface-2` | `#262A2E` | `#EAE7E1` | Cart lines, keypad keys, chips, quick-cash, cart order header |
| `surface-3` | `#2F343A` | `#E1DDD5` | Stepper +/− buttons, progress-bar tracks |
| `surface-quiet` | `#2A2E31` | `#E4E0D9` | Disabled buttons, "المتبقي / remaining" panel |
| `border` | `#3A4046` | `#D6D1C8` | Default 1px border everywhere |
| `border-strong` | `#4A5157` | `#C4BEB3` | Secondary button outline, dashed "add" affordances |

#### Text

| Token | Dark | Light | Where |
|---|---|---|---|
| `text-primary` | `#EDEFF1` | `#1B1A17` | Body, item names, totals |
| `text-muted` | `#A3ABB2` | `#5E5A52` | Labels, hints, secondary rows, placeholders in real screens |
| `text-disabled` | `#6B7278` | `#A19C93` | Out-of-stock items, disabled button labels |
| `text-on-accent` | `#0d1512` | `#FFFFFF` | Label on filled accent buttons |
| `text-placeholder` (light only) | — | `#8A857C` | Only in the `1a` input-states card — conflicts with real screens ([Q6](#q6--placeholder-colour-contradicts-itself)) |

#### Accent (green) family

| Token | Dark | Light | Where |
|---|---|---|---|
| `accent` | `#3FB89A` | `#0F5C4A` | Primary buttons, active tabs, progress fill, chart bars, badges |
| `accent-hover` | `#59CFB4` | **missing** | `1a` button-states row only |
| `accent-pressed` | `#2E9D84` | **collides → `#0F5C4A`** | Pressed button; also toggle-on; also in-cart card border |
| `accent-soft` | `#7FD8BC` | **collides → `#0F5C4A`** | Favourite-chip price, focus ring, token-table ratios |
| `accent-tint-bg` | `#1F2A28` | `#E4F0EA` | Favourite chips, active rail item |
| `accent-tint-border` | `#2E5C51` | `#8FC0AF` | Favourite chips |
| `chart-2` | **missing** | `#2E8B72` | Manager pay-mix bar, second series |

#### Status families

| Token | Dark | Light | Where |
|---|---|---|---|
| `success` | `#4CC38A` | `#1B6E3C` | Discount amount, collected-revenue row, "synced", fresh-order age, "open now" |
| `success-tint-bg` | `#1B2A24` | `#E9F5EE` | "مُزامن" badge, total-collected row |
| `warning` | `#E0A32E` | `#8A5A00` | Offline chip, unavailable flag, remaining amount, mid-age order |
| `warning-tint-bg` | `#3A2A18` | `#FBF2DF` | Offline chip, "غير مُزامن" badge |
| `danger` | `#F0645B` | `#A62A21` | Cancel outline, cash-variance panel, oldest orders |
| `danger-tint-bg` | `#3A1E1B` | `#FCEEEC` | Cash-variance callout |
| `danger-text-2` | `#F5A29C` | `#8C241C` | Explanatory line inside the variance callout |
| `danger-input-bg` | — | `#FCF0EF` | Error input in `1a` — near-duplicate of `#FCEEEC` ([Q5](#q5--two-light-danger-tints-two-light-disabled-treatments)) |
| `credit` | `#B08CE8` | `#6B3FA0` | آجل/ذمم (credit sales — explicitly *not* revenue) |
| `credit-text` | `#D3BCF5` | `#4A2B70` | Label inside credit-tinted rows |
| `credit-tint-bg` | `#2A2233` | `#F3EDFB` | Credit payment method, credit shift row |
| `input-disabled-bg` | — | `#F0EDE7` | `1a` only; border `#E4E0D9` |

#### Not app colours

`#0d0f10` and `#E8E5DF` are the design-canvas backgrounds behind the screens; `#0a4034` is the
prototype page's `a:hover`. None belong in the app.

### 1.3 Chart palette

Only defined in light (manager dashboard, `1e`): `#0F5C4A` → `#2E8B72` → `#8A5A00` → `#6B3FA0`
(cash / bank transfer / wallet / credit). Revenue bars use `accent` alone. No dark equivalents exist
for `#2E8B72`.

---

## 2. Typography

Three families, loaded from Google Fonts:

- **Cairo** 400/500/600/700 — all Arabic UI text
- **IBM Plex Sans** 400/500/600/700 — all Latin UI text
- **IBM Plex Mono** 400/500/600 — **all numerals, in both languages**, always declared as
  `'IBM Plex Mono','Cairo'`

The `1a` panel states the rule: *"Arabic runs ~2–3px larger than Latin at the same rank, with
line-height 1.5–1.7 to clear ascenders and dots"* and *"NUMERALS — MONOSPACE, NEVER MIRRORED"*.

**In the build (batch 10):**

- **Fonts:** all three families are self-hosted by next/font, not fetched from Google at runtime. Cairo is a variable font, so a single Arabic file serves every weight. Plex Mono now also loads 700, the weight totals are set in. Tajawal was configured as a fallback but never drawn, and has been removed.
- **Language:** components size text with `text-ar-*`, and the language decides what that resolves to.
  - Under `[lang='en']` each step takes the Latin value, one rank smaller as the panel describes.
  - A `lang="ar"` block restores the Arabic values and the Arabic face. The public page is one, and it stays Arabic whatever the till was switched to.
  - Cairo sits behind Plex Sans in the Latin stack, so Arabic menu names in the English interface still get Arabic glyphs.
- **Smallest Arabic step:** 14px (was 13px).
- **Kitchen display:** from 1280px up (`[data-screen='kitchen']`), tickets take a larger scale (24px base) and a 380px floor.
- **Receipts:** 14px body, 13px secondary text, black only. A thermal head prints grey as faint dither.

### 2.1 Documented scale vs. what the screens use

**Arabic — documented in `1a`:** 44/1.5/700 · 34/1.5/600 · 27/1.5/600 · 19/1.7/400 · 16/1.6/400
(5 ranks).

**Arabic — actually used across the screens:** 18 sizes × several line-heights each.

| Size | Weights / line-heights observed | Typical role |
|---|---|---|
| 44 | 700/1.5 | Landing restaurant name (once) |
| 34 | 700/1.5, 600/1.5 | Landing name, section `1a` sample |
| 27 | 600/1.5 | Manager page title (once) |
| 25–26 | 700/1.4, 700/1.5 | "عجز في النقد" variance heading |
| 24 | 600/1.4 (v2), 600/1.5 (v1) | Screen title in header |
| 22 | 600/1.4 (v2), 600/1.5 (v1), 700/1.5 | Totals label, landing section heading |
| 21 | 600/1.4, 600/1.5 | Payment-method label, primary CTA |
| 20 | 600/1.4, 600/1.5, 500/1.4, 600/1.2 | Cart order title, "المعدود", Pay button |
| 19 | 500/1.4 (v2), 500/1.5 (v1), 600/1.5, 400/1.5–1.7 | **Workhorse** — item names, cart lines, list rows, inputs |
| 18 | 500/1.4–1.6, 400/1.5–1.7, 600/1.5 | Category tabs, section labels, secondary buttons |
| 17 | 400/1.5–1.7, 500/1.4–1.6, 600/1.4 | Segmented control, list body, favourites, hints |
| 16 | 400/1.6–1.7, 500/1–1.5, 600/1.4 | Totals rows, chips, editor labels |
| 15 | 400/1.4–1.6, 500/1–1.4 | Notes, sub-labels, badges |
| 14 | 400/1.4, 500/1 | Modifier lines, unavailable flag |
| 13 | 500/1.3 | Rail labels, canvas captions |
| 12 | 500/1.3 | Rail offline label |

**Latin — documented in `1a`:** 40/1.25/700 · 30/1.3/600 · 24/1.35/600 · 16/1.5/400 · 14/1.45/400.
**Latin — actually used** (LTR proof `1d` + English landing): 32/1.25/700, 20/1.3/600–700,
17/1.35/600, 16/1.35–1.5/400–600, 15/1.4–1.6, 14/1.45–1.6, 13/1.45–1.6, plus 22/1/600 and 24/1/400
for the `−` `+` `→` glyphs.

**Numerals (IBM Plex Mono)** — 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 22, 24, 26, 28, 30, 32, 34,
36, 38, 44, 48, 52, at 400/500/600/700, nearly always `line-height:1`.

Display numerals by role: cart total 38 (v2) / 34 (v1) · remaining 44 · variance 48 (v2) / 52 (v1) ·
counted cash 30 · KPI value 36 (cashier) / 34 (manager) · keypad 32 (v2) / 30 (v1).

Neither documented scale matches the screens. See [Q2](#q2--type-scale-documented--type-scale-used).

### 2.2 Numerals

- Default numeral system is **Arabic-Indic** (`٠١٢٣٤٥٦٧٨٩`), with a `numerals` prop switching the
  whole prototype to Western. Thousands separator is `U+066C ٬` in Arabic-Indic, `,` in Western.
- Every numeral is set in `'IBM Plex Mono','Cairo'`. IBM Plex Mono has no Arabic-Indic glyphs, so in
  the default numeral system **the digits actually render in Cairo and are not monospaced** — the
  mono stack only takes effect in Western numerals. Flagged as [Q8](#q8--the-monospace-numeral-rule-does-not-hold-for-arabic-indic-digits).
- `direction:ltr` is applied explicitly to clocks, dates, percentages and phone numbers — but *not*
  to money amounts.
- No currency symbol or unit appears anywhere in any screen.

---

## 3. Spacing

**Documented in `1a`:** *"4px base. 8/12/16 inside components, 24/32 between blocks, 48 between
regions."* The swatch row shows 4·8·12·16·24·32·48.

**Actually used** — gap values, by frequency:

`10px` (89) · `8px` (63) · `12px` (51) · `16px` (33) · `14px` (24) · `2px` (17) · `6px` (17) ·
`32px` (7) · `18px` (6) · `3px` (6) · `24px` (5) · `4px` (3) · `1px` (4) · `5px` (2) · `20px` (2) ·
`28px` (1) · `56px` (1)

Padding values: `0 16px` (43) · `16px` (30) · `0 20px` (23) · `18px` (16) · `0 12px` (16) ·
`0 14px` (15) · `12px 14px` (13) · `0 18px` (13) · `14px` (10) · `20px` (9) · `0 22px` (9) ·
`3px` (7) · `56px` (7) · `14px 16px` (7) · `28px` (5) · `10px 12px` (5) · `22px` (2) · `12px 16px`
(2) · `16px 18px` (2) · `5px 10px` (2) · `7px 10px` (2)

Observations:

- The real base is **2px**, not 4px: 6, 10, 14, 18, 22 are all in heavy use, and `10px` is the single
  most common gap in the file.
- `48px` never appears as a gap or padding on any screen. Section padding on the design canvas is
  `56px`. The "48 between regions" rule is unused.
- Screen-level rhythm is consistent though: **16px** frame padding on every v2 screen body,
  **18px** on the v2 order-entry content column, **14px** panel padding, **12px** card gap in grids.

See [Q3](#q3--spacing-radius-and-size-scales-are-continuous-not-stepped).

**In the build** the scale is in pixels: `p-16` is 16px, and only the numbers in
`tailwind.config.ts` exist (28 and 40 were added in batch 9). Any other number falls back to
Tailwind's rem scale, four times larger, so a test (`styles/__tests__/token-usage.test.ts`)
refuses it. Boxes from 16px up are sized by a named dimension (`size-thumb-sm`,
`h-card-image`), never by a scale number: here `h-16` is 16px, where Tailwind's own reads 64px.

---

## 4. Radius, borders, shadows

### Radius (by frequency)

`9px` (72) · `12px` (67) · `10px` (52) · `8px` (31) · `11px` (20) · `50%` (17) · `14px` (17) ·
`5px` (10) · `3px` (3) · `17px` (3) · `16px` (3) · `7px` (2) · `6px` (2) · `2px` (1)

Split by generation: **v1** uses 9 / 10 / 12; **v2** uses 10 / 11 / 12 / 14. They are two parallel
scales for the same components (v1 button 9 → v2 button 10/11; v1 card 10 → v2 card 12; v1 frame 12 →
v2 frame 14).

Directional radii, always written physically (`9px 0 0 9px`) rather than logically — the qty stepper
`−`/`+` caps and the cart tabs (`10px 10px 0 0`). These must become logical properties in the build.

Pill radii: `50%` (status dots, toggle knob), `17px` (toggle track, h=34), `14px` (in-cart badge,
h=28), `6px`/`3px` (progress-bar tracks, h=12/6).

### Border widths

- `1px solid` — 159 uses. The default everywhere.
- `2px solid` — 10 uses, carrying **two unrelated meanings**: focused/selected control (focused
  input, counted-cash input, the selected `+15%` chip) *and* critical alert (cash-variance callout).
- `1px dashed` — 3 uses: "+ قسم جديد" (add category), "+ إضافة صورة" (add photo). Dashed = "add"
  affordance.

### Shadows

There is **no elevation shadow anywhere in the system**. Only:

| Shadow | Use |
|---|---|
| `inset 0 1px 0 rgba(255,255,255,.03)` | v2 item cards, v2 order cards |
| `inset 0 1px 0 rgba(255,255,255,.04)` | v2 keypad keys |
| `0 0 0 3px #16181A, 0 0 0 6px #7FD8BC` | Focus ring — bg-coloured 3px gap + 3px `accent-soft` ring |

Both inset highlights are copied verbatim into the light screens, where white-on-white makes them
invisible ([Q7](#q7--dark-only-effects-copied-into-light)). The focus ring exists only in dark and
only in the `1a` panel; no light focus ring is defined, and no other state (hover, pressed) is drawn
for any control other than the primary button.

### Depth model

Depth is expressed purely as a neutral ramp plus 1px borders:
`bg` → `surface` → `surface-2` → `surface-3`, each step with `border` between. Reproduce it with
background steps, not shadows.

**In the build (batch 9)** the ramp alone proved too faint in the light theme: a card and the
page differ by 1.1:1 and the border by 1.5:1, and on a tablet in daylight the cards melted into
the page. Three shadow tokens now exist, and no other shadow name is allowed:

| Token | Light | Dark | Use |
|---|---|---|---|
| `shadow-card` | a 1–2px soft lift | the inset highlight above | cards |
| `shadow-raised` | a 4–12px lift | highlight + dark lift | hover, primary call to action |
| `shadow-overlay` | a 16–40px lift | a deeper one | sheets, drawers, popovers |

---

## 5. Sizing and touch targets

`1a` states: **"48px MIN HEIGHT, 44px MIN TARGET"**.

Observed control heights: 40 (14×) · 44 (9×) · 46 (10×) · **48 (46×)** · 52 (15×) · 54 (2×) ·
56 (12×) · 58 (2×) · 60 (6×) · 64 (16×) · 68 (2×) · 74 (2×).

So 48 is the dominant size, but three interactive controls sit **below the stated 44px floor**:

- segmented-control items (order type, order filters) — `min-height:40px`
- header chips (offline, waiting-to-sync) — `height:38–40px`
- the `+` new-cart tab — 44×44 ✔, but the cart tabs themselves are `min-height:44px` ✔

And several sit between 44 and 48: search field 46, v2 category tabs 46, cart quick actions 46,
receipt buttons 46, favourite chips 58, keypad keys 64.

Fixed dimensions worth carrying over: qty stepper `44×44` buttons with a `42px` (v2) / `44px` (v1)
value cell; denomination stepper value cell `52px`; toggle `64×34` with a `28px` knob; rail item
`76×68`; icons `20px` (search), `22px` (back), `24px` (rail, payment methods), `30px` (variance
warning); status dot `9–10px`.

---

## 6. Component inventory

Every element that repeats across ≥2 screens, with the values it is drawn at. Where v1 and v2 differ,
both are given.

| # | Component | Spec |
|---|---|---|
| 1 | **NavRail** (v2) | 92px wide, `bg-rail`, `border-inline-start`, 12px vertical padding, 6px gap. Item 76×68, radius 12, icon 24 + label 13/1.3/500 stacked, 5px gap. Active: bg `accent-tint-bg`, fg `accent`. Inactive: transparent / `text-muted`. Footer: status dot + 12/1.3 label pinned with `margin-top:auto`. |
| 2 | **AppHeader** | Height 68 (v2) / 64 (v1), `surface`, 1px bottom border, `0 20px` padding (`0 18px` on v2 order entry). Left: title 24/1.4/600. Right: status chips + mono clock 18/1. |
| 3 | **StatusChip** | Height 38–40, radius 8–9, `0 12px`, 8px gap. Neutral variant: `surface-2` + `border` + `text-muted`. Warning variant: `warning-tint-bg` + 1px `warning` + `warning` text + 9px dot. |
| 4 | **SearchField** (v2) | Height 46, radius 10, `bg` on `surface`, 1px border, `0 14px`, 20px icon + 10px gap, placeholder 18/1.5/400 `text-muted`. |
| 5 | **SegmentedControl** | Track: radius 11, 3px padding, 3px gap, `bg` + 1px border. Item: min-height 40, radius 8, `0 16px`. Active: `accent` bg, `text-on-accent`, weight 600. Inactive: transparent, `text-muted`, weight 500. Used for order type and order filters. |
| 6 | **CategoryTab** | v2: min-height 46, radius 10, `0 16px`, label 18/1.4/500 + count 14/1 mono at `opacity:.7`. v1: min-height 48, radius 9, `0 18px`, 19/1.5/500, no count. Active = `accent` fill. |
| 7 | **FavouriteChip** (v2) | Flex 1, min-height 58, radius 11, `0 14px`, `accent-tint-bg` + 1px `accent-tint-border`. Name 17/1.4/600 with ellipsis; price 15/1 mono in `accent-soft` (dark) / `accent` (light). Row of 5 under a "الأكثر طلبًا اليوم" rule (1px `surface-2` divider). |
| 8 | **MenuItemCard** | v2: height 112, radius 12, padding 14, `surface`, 1px border, inset highlight. Name 19/1.4/500, sub 14/1.4/400, price 20/1 mono, right-aligned warning flag 14/1. In-cart: border `accent-pressed` + badge (min-width 28, h 28, radius 14, `accent` bg, 16/1 mono) at `top:10px; inset-inline-end:10px`. Out of stock: name+price → `text-disabled`, flag "غير متاح". v1: height 104, radius 10, padding `12px 14px`, no sub-line, no badge. |
| 9 | **CartTabs** (v2) | Tab min-height 44, radius `10px 10px 0 0`, `0 14px`, label 16/1.4/500 + total 14/1 mono `opacity:.75`. Active `surface-2`/`text-primary`, inactive transparent/`text-muted`. Trailing 44×44 `+` tab, 24/1 Plex Sans. |
| 10 | **QtyStepper** | Three cells, 2px gap. `−` and `+`: 44×44, `surface-3`, outer corners radius 9 (v2) / 8 (v1), glyph 22/1/600 Plex Sans. Value cell: 42×44 (v2) / 44×44 (v1) / 52×44 (denominations), `surface`, 18/1/600 mono. |
| 11 | **CartLine** | Radius 11 (v2) / 10 (v1), padding `10px 12px` (v2) / `12px` (v1), `surface-2`, 12px gap. Stepper · name 19/1.4/500 (+ modifier line 14/1.4/400 `text-muted` in v2) · line total 19/1 mono. |
| 12 | **CartActionBar** (v2) | 4-column grid, 8px gap. Button min-height 46, radius 10, `surface-2` + border, 16/1.4/500. (خصم · ملاحظة · تقسيم · تعليق) |
| 13 | **TotalsBlock** | On `surface-2` (v2) / bordered top (v1), 10px gap. Rows: label 16/1.6/400 `text-muted` + value mono 500 `text-primary`; discount value in `success`. Grand total: label 22/1.4/600 + value 38/1 mono (v2) / 34 (v1), `align-items:baseline`. |
| 14 | **Button** | Heights 46 / 48 / 56 / 60 / 64; radius 9 (v1) / 10–12 (v2); horizontal padding 16–22. Variants: **primary** `accent` + `text-on-accent`, weight 600 · **secondary** transparent + 1px `border-strong` · **danger** transparent + 1px `danger`, `danger` text · **credit** `credit-tint-bg` + 1px `credit` + `credit-text` · **accent-outline** `surface-2` + 1px `accent` + `accent` text (receipt "طباعة") · **disabled** `surface-quiet` + `text-disabled`. States drawn only for primary: hover `#59CFB4`, pressed `#2E9D84`, focus double-ring. The dual pay button stacks label 20/1.2/600 over amount 16/1.2 mono. |
| 15 | **PaymentMethodCard** | v2: min-height 74, radius 12, `0 18px`, 24px icon + 14px gap, label 21/1.4/600 + hint 15/1.4/400 at `opacity:.85`. v1: min-height 64, radius 10, label and hint on one row, no icon. Selected = `accent` fill; credit method = credit family. |
| 16 | **QuickCashButton** (v2) | Flex 1, min-height 56, radius 11, `surface-2` + border, 20/1/600 mono. Row of 4 (٥٬٠٠٠ · ١٠٬٠٠٠ · ٢٠٬٠٠٠ · المبلغ كامل). |
| 17 | **Keypad** | 3-column grid, `grid-auto-rows:1fr`, 10px gap. Key min-height 64 (v2) / 60 (v1), radius 12 (v2) / 10 (v1), `surface-2` + border, 32/1 (v2) / 30/1 (v1) mono 500. Keys: ٧٨٩ ٤٥٦ ١٢٣ ٠ ٠٠٠ ⌫. |
| 18 | **ProgressBar** | Payment progress: height 12, radius 6, track `surface-3`, fill `accent`, with 15/1.5 label row beneath. Order age: height 6, radius 3, fill colour = age colour (`success` → `warning` → `danger`). |
| 19 | **AmountRow** (payments recorded / sales by method) | Radius 11 (v2) / 10 (v1), padding `12px 14px` – `16px 18px`. Label 19/1.4/500 + note 14/1.4/400 `text-muted` on the start side, amount 22–26/1 mono on the end side. Tinted variants for credit and for the collected-total row. |
| 20 | **CalloutPanel — danger** | Radius 12, padding 20 (v2) / 22 (v1), `danger-tint-bg` + **2px** `danger`. Title 25–26/1.4–1.5/700 `danger` + 30px warning icon; amount 48/1 (v2) / 52/1 (v1) mono 700 `danger`; explanation 17/1.7/400 `danger-text-2`; embedded reason input (min-height 54–56, radius 9–10, `bg` + 1px `danger`). |
| 21 | **Input** | Min-height 52–56, radius 9–10, `0 16px`, 19/1.5/400. Default: 1px `border`, `text-placeholder`. Focus: **2px** `accent` + 2×24px caret. Error: **2px** `danger` + `danger-input-bg` + `danger` text. Disabled: `input-disabled-bg` + 1px `#E4E0D9` + `text-disabled`. |
| 22 | **Toggle** | 64×34, radius 17, 3px padding, knob 28 circle. On: `accent-pressed` track; off: `border` track. Knob `#EDEFF1` in dark and `#1B1A17` in light ([Q7](#q7--dark-only-effects-copied-into-light)). |
| 23 | **Badge** | Sync state: radius 7, padding `5px 10px`, 15/1.4/500, warning or success tint pair. In-cart count: radius 14, h 28, `accent`. |
| 24 | **KpiCard** | Radius 12, padding 18, `surface` + border, 8px (cashier) / 6px (manager) gap. Label 17/1.6/400 `text-muted` · value 36/1 (cashier) / 34/1 (manager) mono 600, colour per metric · sub 15/1.5/400 `text-muted`. |
| 25 | **BarChart** | Column flex 1, `height:<pct>`, `accent` fill, radius `4px 4px 0 0` (cashier) / `3px 3px 0 0` (manager) / `2px 2px 0 0` (manager mobile). Container `direction:ltr`, `align-items:flex-end`, gap 10/6/4. X labels 13/1 mono `text-muted`. |
| 26 | **StackedShareBar** (manager) | Height 20, radius 10, segments by percentage, legend rows with 12×12 radius-3 swatches. |
| 27 | **OrderCard** (v2) / **OrderRow** (v1) | v2: radius 12, padding 16, 12px gap — id 22/1 mono + sync badge / type + total 24/1 mono / items 17/1.6 clamped to 52px / age bar + label / actions (استئناف flex-1 min-height 48 primary, إلغاء 110px danger outline). v1: single row, fixed widths id 110 · type 120 · items flex ellipsis · age 120 · total 130 end-aligned · actions. |
| 28 | **MenuManagementRow** (v1) | Radius 10, padding `12px 14px`, `surface` + border, 16px gap: name flex · price field 150×48 radius 9 `surface-2` end-aligned mono 20 · state 150 · toggle. |
| 29 | **DenominationRow** (v2) | Radius 11, padding `10px 14px`, `surface` + border: note label 96px mono 19/1/600 · stepper · line sum flex-1 `text-align:end` mono 19 `text-muted`. |
| 30 | **Divider** | 1px line, `border` colour; also `surface-2` for the favourites rule. |
| 31 | **ImageSlot** | `<image-slot>` — landing hero 390×260 (`shape="rect"`), map 170px tall, editor thumbnails 180×120 (`shape="rounded" radius="10"`). "Add image" tile = same box, 1px dashed `border-strong`. |

---

## 7. Screen layouts

All cashier screens are **1280×800**, `direction:rtl`, radius 14 (v2) / 12 (v1), 1px border,
`overflow:hidden`.

### v2-01 Order entry
Row flex: **rail 92 (fixed)** | **content (flex 1)** | **cart 404 (fixed)**.
Content column: header 68 → favourites block (`padding:14px 18px 10px`, label rule + 5 chips, 10px
gap) → category tab strip (`padding:4px 18px 12px`, 8px gap) → item grid
(`padding:0 18px 18px`, `repeat(4,1fr)`, 12px gap, 112px rows, `overflow:hidden`).
Header contents: search (flex 1) · order-type segmented · sync chip · clock.
Cart column: tab strip (`12px 14px 0`) → order header bar (`surface-2`, `12px 16px`) → line list
(flex 1, `12px 14px`, 8px gap) → 4-up action grid (`0 14px 12px`) → totals footer
(`14px 16px 16px`, `surface-2`, 1px top border) ending in a `1fr 1.25fr` button grid.

### v2-02 Payment
Column: header 68 (back button 46×46 radius 10 · title · offline chip · clock) → body
`display:flex; gap:16; padding:16`.
Left (flex 1, 14px gap): payment methods `repeat(2,1fr)` gap 10 → quick-cash row gap 10 → keypad
`repeat(3,1fr)` `grid-auto-rows:1fr` gap 10, taking the remaining height.
Right **470 fixed**: `surface` panel, radius 14, padding 18, 12px gap — bill total → progress bar +
paid/total row → 1px divider → "المدفوعات المسجلة" + payment rows → (`margin-top:auto`) remaining
panel → 3 receipt buttons → close-bill button (disabled state shown).

### v2-03 Open orders
Column: header 68 (title + count · 4-way segmented filter) → `padding:16`,
`grid-template-columns:repeat(3,1fr)`, `grid-auto-rows:min-content`, gap 14, of OrderCards.

### v2-04 Shift close
Column: header 68 (title · cashier + shift window in mono LTR) → body `flex; gap:16; padding:16`.
Left **430 fixed**: label → 5 denomination rows (10px gap) → (`margin-top:auto`) counted-total panel.
Right (flex 1): label → 5 sales-by-method rows → variance callout → (`margin-top:auto`) footer
`1fr 1.3fr` button grid.

### v1-01 Order entry
Header 64 → row flex: content (flex 1) | **cart 392**. Content: category strip (`14px 16px`, gap 8) →
open-category pill row → grid `repeat(4,1fr)` gap 12, 104px rows. Cart: 3-up order-type grid
(padding 14) → order title row → line list → totals footer with `1fr 1.2fr` buttons.

### v1-02 Payment
Header 64 → body `padding:16; gap:16`. Left: 2-up method grid + 3-col keypad. Right **460**:
`surface` panel radius 12 padding 18 — bill total → divider → recorded payments → (`margin-top:auto`)
remaining panel → disabled close button → 15/1.6 helper text centred.

### v1-03 Open orders
Header 64 → `padding:16`, vertical list, 10px gap, of fixed-column OrderRows.

### v1-04 Menu management
Header 64 → row flex: **sidebar 240** (`bg-sunken`, padding 14, 8px gap, category buttons min-height
52 + dashed "+ قسم جديد") | content: bulk-price toolbar (`14px 16px`, `surface`, bottom border:
label · four % chips · apply button pushed with `margin-inline-start:auto`) → rows list
(`14px 16px`, 8px gap).

### v1-05 Shift close
Header 64 → body `flex; gap:16; padding:16`. Left (flex 1): sales-by-method rows. Right **560**:
expected/counted cash panel → variance callout → (`margin-top:auto`) `1fr 1.3fr` footer.

### v1-06 Daily report
Header 64 (title + date · print button 44) → `padding:16`, 14px gap: KPI row `repeat(4,1fr)` gap 12 →
lower row flex gap 14: hourly bar chart (flex 1) | top-items panel **430**.

### 1e Manager web app — 1440×900, light only
Row: **sidebar 236** (`surface`, `border-inline-end`, `20px 14px`, title 20/1.5/700 + nav items
min-height 48 radius 9; active `surface-2` + `accent` text) | main: header 72 (`0 24px`, title
27/1.5/600 + two filter dropdowns min-height 44) → body `padding:24`, 20px gap: KPI row
`repeat(4,1fr)` gap 16 → charts row flex gap 16 — revenue bars **flex 1.5** | right column flex 1
holding pay-mix and top-items cards.
Also: **landing editor** 1000×720 dark (header 68 with publish toggle + save button; body
`repeat(2,1fr)` gap 14 `align-content:start`; field = label 16/1.5/500 + control min-height 52; full-
width rows for images and delivery links) and a **390×720 light mobile summary**.

### 1f Public landing page — 390px wide, read-only
Hero image 260 → content `padding:20`, 18px gap: name 34/1.5/700 + description 19/1.7 + open-status
line with dot → 2-up call/WhatsApp buttons (min-height 52, radius 10) → opening-hours card
(`surface`, radius 12, padding 16) → menu list (rows with bottom border, name 19/1.6/500 + desc
15/1.6 + price mono 19) → price-freshness note on `surface-2` radius 8 → map 170 radius 12 → address
line. Variants: Arabic light, Arabic dark, English light. **No English dark.**

### 1d Mirroring rules (LTR proof)
Mirrored: cart panel side, category strip origin, qty stepper order, back-arrow direction, list
alignment, panel borders.
Not mirrored: numerals, the 14:32 clock, price columns, logo, print/receipt glyphs.
Also stated: *"buttons hold 'Send to kitchen' at 2 lines max, min-height 56px, no truncation.
Language lives in Settings only."*

Implementation consequence: every inline offset in the mockups (`border-inline-start`,
`inset-inline-end`, `margin-inline-start:auto`, `text-align:end`) is already logical and must stay
logical; the only physical values are the stepper/tab corner radii, which need converting.

---

## 8. Content and behaviour facts worth preserving

These are encoded in the mock data and matter for the build:

- **آجل / ذمم (credit) is not revenue.** It has its own purple token family, appears as a payment
  method, as a shift row marked "لا يُحتسب إيرادًا", and as a manager KPI. The shift close shows
  "إجمالي الإيراد المحصّل — بدون الذمم".
- **Offline-first is a visible state**, not an error: offline chip in the header, "يُحفظ محليًا",
  a "بانتظار المزامنة 12" counter, per-order مُزامن / غير مُزامن badges, and "التعديلات تُحفظ محليًا"
  on menu management.
- **Cash variance blocks the close.** The close button is drawn disabled while a variance exists and
  a reason field is present. Same pattern on payment: close-bill disabled until the bill is covered
  or booked as credit.
- **Order age escalates** `success` → `warning` → `danger` with a proportional bar (14 % → 100 %).
- Out-of-stock items stay visible, greyed, flagged "غير متاح".
- Split payments are partial rows summing toward the total with a % progress bar.

---

## 9. What is *not* in the mockups

No empty states, no loading or skeleton states, no error/toast pattern, no modals or confirmation
dialogs, no scroll affordances (every list is drawn exactly full), no pagination, no keyboard focus
styling outside the one dark primary-button sample, no hover/pressed styling for anything except the
primary button, no icon set beyond the 10 inline paths used, no currency unit, no dark manager app,
no English dark landing page, no tablet/phone breakpoints for the cashier app (fixed 1280×800).

---

## 10. Open questions / conflicts

Ranked by how much they block the build. Recommendations are given, but nothing is applied.

### Q1 — Which generation is canonical?
v2 (sections `2a`/`2b`) redesigns order entry, payment, open orders and shift close with different
frame radius, header height, panel widths, card sizes and several new features. v1 (`1b`/`1c`) is the
only source for **menu management** and **daily report**. Building "the mockup" therefore requires
choosing one geometry and back-porting the two v1-only screens into it.
*Recommendation:* treat v2 as canonical, re-draw menu management and daily report to v2 geometry.
**Needs your decision — this changes every screen.**

### Q2 — Type scale documented ≠ type scale used
The `1a` panel documents 5 Arabic ranks (44/34/27/19/16) and 5 Latin ranks (40/30/24/16/14). The
screens use 18 Arabic sizes and ~10 Latin sizes, and the documented ranks 44/34/27 appear almost
nowhere in the app (only on the landing page and the manager header). Line-heights also disagree: the
panel says 1.5–1.7 for Arabic, the v2 screens use 1.4 for most UI text.
*Recommendation:* build the token scale from observed usage, not the panel — e.g. Arabic
13/15/17/19/22/24 for UI, 27/34/44 for display, with lh 1.4 for controls and 1.6–1.7 for prose;
Latin one step smaller at each rank. **Needs your approval before I emit tokens.**

### Q3 — Spacing, radius and size scales are continuous, not stepped
Spacing is effectively a 2px grid (6/10/14/18/22 all common; `10px` is the most-used gap) while the
panel claims a 4px base with an unused 48 step. Radius has 14 distinct values across two generations
(v1: 9/10/12 · v2: 10/11/12/14). Control heights run 40/44/46/48/52/54/56/58/60/64/68/74.
*Recommendation:* space `2 4 6 8 10 12 14 16 18 20 24 32 56`; radius `sm 8 · md 10 · lg 12 · xl 14 ·
pill`; control heights `sm 40 · md 46 · lg 48 · xl 56 · 2xl 64`. **Confirm before I collapse
anything** — per your instruction I have not normalised these.

### Q4 — Light mode has no hover or pressed accent
`LIGHT_MAP` collapses `#3FB89A` (accent), `#2E9D84` (pressed) and `#7FD8BC` (accent-soft) all onto
`#0F5C4A`, and `#59CFB4` (hover) has no light entry at all. So in light mode a primary button looks
identical at rest, hover and pressed, and the focus ring would be invisible.
*Recommendation:* add light `accent-hover #14705A` and `accent-pressed #0B4638` (or supply your own),
and a light focus ring of `bg` + `accent`. **Needs values from you or approval to derive them.**

### Q5 — Two light danger tints, two light disabled treatments
Danger tint is `#FCEEEC` on the variance callout but `#FCF0EF` on the error input. Disabled surfaces
are `#E4E0D9` on buttons but `#F0EDE7` with a `#E4E0D9` border on inputs.
*Recommendation:* keep `#FCEEEC` and `#E4E0D9`; treat `#FCF0EF` / `#F0EDE7` as strays. **Confirm.**

### Q6 — Placeholder colour contradicts itself
The `1a` input card uses `#8A857C` for light placeholder text; every real light screen uses
`#5E5A52` (`text-muted`) — search field, reason field. Dark screens use `#A3ABB2` (`text-muted`).
*Recommendation:* placeholder = `text-muted` in both themes; drop `#8A857C`. **Confirm.**

### Q7 — Dark-only effects copied into light
Three artefacts of the automatic light derivation:
1. `inset 0 1px 0 rgba(255,255,255,.03/.04)` is kept on light cards and keypad keys, where it does
   nothing.
2. The toggle knob is `#EDEFF1` in dark and therefore `#1B1A17` in light — a near-black knob on a
   dark-green track, instead of white.
3. The landing menu divider is `#2F343A` in dark (→ `#E1DDD5`) but hard-coded `#E4E0D9` in light.
Also: `bg-rail` maps to `#EAE7E1`, which is identical to `surface-2` — the light rail has no
separation from a chip sitting on it.
*Recommendation:* drop the inset in light, force a white knob, unify the divider on `border`, and
give light `bg-rail` its own value. **Confirm — these are visual changes to the mockup.**

### Q8 — The monospace numeral rule does not hold for Arabic-Indic digits
Numerals are declared `'IBM Plex Mono','Cairo'`, but IBM Plex Mono has no Arabic-Indic glyphs, so in
the default numeral mode every digit falls back to Cairo and is proportional, not tabular. Prices in
the cart, totals column and denomination sums will not align vertically. The prototype hides this
because all values are hand-authored.
*Recommendation:* pick a font with Arabic-Indic tabular figures, or apply
`font-variant-numeric: tabular-nums` on Cairo and verify, or render Western numerals in financial
columns. **Needs a decision — it affects font loading.**

### Q9 — Touch-target rule is violated by the design itself
"44px min target" vs. 40px segmented-control items and 38–40px header chips.
*Recommendation:* raise all interactive controls to ≥44 (segmented items 40 → 44 grows the track from
46 to 50). **Confirm — it shifts header layout slightly.**

### Q10 — Undefined by the mockups
Item grids and lists are drawn exactly full (12 items, 6 orders, 3–4 cart lines) with
`overflow:hidden`, so scrolling, pagination, and long-content behaviour are unspecified — as are
empty/loading/error states, dialogs, and hover states for everything except the primary button. The
manager app has no dark theme and the landing page has no English dark variant, yet PROMPT.md
requires both themes throughout.
*Recommendation:* I derive these from the existing tokens and show you before use. **Confirm.**

### Q11 — Bundle/spec mismatches
- `PROMPT.md` points at `design-reference/`; the folder is `project/`.
- `PROMPT.md` says "read PROMPT.md first — it is the authoritative spec", but the only PROMPT.md in
  the bundle is the extraction brief itself. If a fuller product spec exists (stack, routes, data
  model, i18n setup), I have not seen it.
- No currency unit appears anywhere — SDG? displayed how, and on which side in each direction?
- The current working directory (`E:\modernportfolio`) is an unrelated Django/Next.js product
  ("stingdev"). **Where should the POS app be created?** This blocks step 3 (CSS custom properties +
  Tailwind theme extension), which needs a target repo.
