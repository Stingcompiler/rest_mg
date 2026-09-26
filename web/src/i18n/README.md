# `src/i18n` and `src/theme` — localization and theming

Built before any real screen, because retrofitting either is brutal. Three
display preferences — **locale**, **numerals**, and **theme** — each independent
of the others, each read before first paint, each switchable without a reload.

## Why not next-intl

next-intl is built around locale-in-the-URL routing. Here locale is a *device
setting*, not a route: the cashier switches language mid-order, offline, and the
order must not reload or move to a `/en/` path. A shared catalogue plus a context
provider fits that; URL-locale routing fights it. So the i18n layer is a small,
typed, dependency-free module.

## The pieces

| File | Role |
|---|---|
| `config.ts` | Locales, numerals, direction, time zone, storage keys, money-fraction decision. |
| `messages/{ar,en}.json` | The catalogues. Kept key-identical by a compile-time check in `catalog.ts`. |
| `catalog.ts` | `translate(locale, key, params)` with `{name}` interpolation. `MessageKey` types every key. |
| `format.ts` | Numerals, money, time, date. |
| `preferences.ts` | The synchronous localStorage gate for the three prefs. |
| `I18nProvider.tsx` | Client context: `t`, `money`, `int`, `locale`, `numerals`, and setters. |
| `../theme/theme.ts` | Pure theme resolution (`system` → concrete), testable without a DOM. |
| `../theme/ThemeProvider.tsx` | Client context: preference, resolved mode, `setTheme`; follows the OS while on `system`. |

## The rules these encode

- **Locale and numerals are independent.** An Arabic cashier can pick Western
  digits. Numerals are not implied by language.
- **Amounts and counts** follow the numeral setting: Arabic-Indic digits with the
  U+066C separator (٬), or Western digits with a comma. Negatives use the true
  minus U+2212, as the mockups do (−١٢٬٥٠٠).
- **Clocks and dates are always Western and always LTR** — 14:32, 2026-08-06 —
  formatted in `Africa/Khartoum`, never localised, never mirrored.
- **Money shows no currency symbol and no decimals.** The stored integer is the
  amount; SDG has no practically-used subunit. `MONEY_FRACTION_DIGITS` is the one
  knob if that ever changes.

## No flash, no reload

The root layout runs a tiny script **before first paint** that reads the same
localStorage keys and stamps `data-theme`, `lang` and `dir` on `<html>`. The
providers then hydrate from those same values, so React agrees with what the
screen already shows. Switching a preference updates state, writes localStorage,
and (for locale) flips `lang`/`dir` in place — no reload, and the open order is
untouched because it lives in IndexedDB.

## Fonts

Loaded through `next/font/google`, which **self-hosts** Cairo, IBM Plex Sans and
IBM Plex Mono from our own origin. A runtime Google-CDN request would break the
offline cashier on its first internet-less load. The families are exposed as CSS
variables that `design-tokens.css` consumes.

## Verified

`npm test` covers the formatting glyphs, the interpolation, the timezone
roll-over, and theme resolution. Live in the browser, against the real
self-hosted fonts:

- the pre-paint bootstrap set `data-theme`/`lang`/`dir` with no flash;
- switching numerals re-rendered `٤٧٬٥٠٠` → `47,500` with no reload;
- switching locale flipped `dir` to `ltr` live and persisted the choice;
- **Cairo's Arabic-Indic digits are tabular** — `١٢٬٥٠٠` and `٤٧٬٥٠٠` render at
  exactly the same width, so right-aligned money columns line up by place value.
  This settles review question B5: no font swap is needed.
