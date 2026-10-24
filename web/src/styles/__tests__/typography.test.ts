/**
 * The type scale fits the screen it is read on and the language it is set in.
 *
 * From the font review (batch 10):
 * - The smallest Arabic step was 13px, used for the rail labels and badges.
 *   Cairo's dots and joins blur at that size on the low-density tablets a
 *   restaurant buys.
 * - Every size was fixed. That is right for a phone and a tablet at arm's
 *   length, and wrong for the kitchen screen: tickets were 17px on a wall
 *   display read from two or three metres away.
 * - The English interface was set in the Arabic scale. The Latin scale, one
 *   step smaller by design, was used in five places.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = resolve(__dirname, '../..');
const tokens = readFileSync(resolve(SRC, 'styles/design-tokens.css'), 'utf-8');

const STEPS = ['xs', 'sm', 'base', 'md', 'lg', 'xl', '2xl', '3xl', '4xl'];

/** The body of the first rule whose selector list matches `selector`. */
function rule(selector: RegExp): string {
  const match = new RegExp(`${selector.source}\\s*\\{([^{}]*)\\}`).exec(tokens);
  expect(match, `a rule for ${selector.source}`).not.toBeNull();
  return match![1]!;
}

function px(body: string, name: string): number {
  const value = new RegExp(`--${name}:\\s*(\\d+)px`).exec(body)?.[1];
  expect(value, `--${name} in px`).toBeDefined();
  return Number(value);
}

describe('the Arabic scale', () => {
  const arabic = () => rule(/:root,\s*\[lang='ar'\]/);

  it('starts at 14px', () => {
    expect(px(arabic(), 'text-ar-xs')).toBeGreaterThanOrEqual(14);
  });

  it('is restored inside an Arabic block on an English page', () => {
    // The public page is always Arabic (lang="ar" on its <main>), whatever
    // language the visitor last chose for the till.
    for (const step of STEPS) expect(arabic()).toMatch(new RegExp(`--text-ar-${step}:`));
  });
});

describe('the English interface', () => {
  it('sets every step from the Latin scale', () => {
    const english = rule(/\[lang='en'\]/);
    for (const step of STEPS) {
      expect(english).toMatch(new RegExp(`--text-ar-${step}:\\s*var\\(--text-la-${step}\\)`));
    }
  });
});

describe('Arabic text in an English interface', () => {
  it('is drawn in the Arabic face, not the system font', () => {
    // Menu names stay Arabic when the till is switched to English. Plex Sans
    // has no Arabic glyphs, so without the Arabic face in the Latin stack
    // those names fell through to whatever the device had (found verifying
    // batch 10). The face is IBM Plex Sans Arabic since batch 27.
    // Since batch 70 the language sets --font-ui itself: Plex Sans leads in an
    // English block, with the Arabic face behind it.
    const latin = rule(/:root\[lang='en'\]/).match(/--font-ui:([^;]*);/)?.[1] ?? '';
    expect(latin).toMatch(/var\(--font-plex-sans\)/);
    expect(latin).toMatch(/var\(--font-plex-arabic\)/);
  });

  it('switches back to the Arabic face inside a lang="ar" block', () => {
    // The public page is Arabic, and it inherited Plex Sans from <body> on a
    // device last switched to English.
    const globals = readFileSync(resolve(SRC, 'app/globals.css'), 'utf-8');
    // The face is a variable set per language (batch 70): an Arabic block names
    // the Arabic face again, and every [lang] element draws with it.
    expect(rule(/:root,\s*\[lang='ar'\]/)).toMatch(/--font-ui:\s*var\(--font-plex-arabic\)/);
    expect(globals).toMatch(/\[lang\]\s*\{[^}]*font-family:\s*var\(--font-ui\)/);
  });
});

describe('the kitchen screen', () => {
  it('marks its root so the scale can follow it', () => {
    const screen = readFileSync(resolve(SRC, 'features/kitchen/KitchenScreen.tsx'), 'utf-8');
    expect(screen).toMatch(/data-screen="kitchen"/);
  });

  it('reads from across the room on a wide display', () => {
    const block = /@media\s*\(min-width:\s*(\d+)px\)\s*\{\s*\[data-screen='kitchen'\]\s*\{([^{}]*)\}/.exec(tokens);
    expect(block, 'a wide-screen kitchen rule').not.toBeNull();
    expect(Number(block![1])).toBeLessThanOrEqual(1280);
    const body = block![2]!;
    expect(px(body, 'text-ar-base')).toBeGreaterThanOrEqual(24);
    expect(px(body, 'text-ar-lg')).toBeGreaterThanOrEqual(28);
    expect(px(body, 'text-num-base')).toBeGreaterThanOrEqual(24);
    // Bigger text needs a wider ticket, or every line wraps.
    expect(px(body, 'ticket-min-width')).toBeGreaterThan(300);
  });
});
