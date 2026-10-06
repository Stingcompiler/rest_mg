/**
 * Only the faces every page draws with are preloaded.
 *
 * next/font preloads each family by default, and a preload is a download the
 * browser starts before anything else, used or not. Every page was fetching
 * twelve font files (about 187KB) to draw with Cairo and IBM Plex Mono alone:
 * Tajawal sits behind Cairo in case a glyph is missing, and Plex Sans is the
 * English interface. On a customer's phone on mobile data that is the slowest
 * part of opening the restaurant's page. Found in the design review (batch 9).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const layout = readFileSync(resolve(__dirname, '../layout.tsx'), 'utf-8');

function options(family: string): string {
  const match = new RegExp(`=\\s*${family}\\(\\{([\\s\\S]*?)\\}\\);`).exec(layout);
  expect(match, `${family}(...) in layout.tsx`).not.toBeNull();
  return match![1]!;
}

describe('font preloading', () => {
  it.each(['IBM_Plex_Sans_Arabic', 'IBM_Plex_Mono'])('preloads %s, which every page draws with', (family) => {
    expect(options(family)).not.toMatch(/preload:\s*false/);
  });

  it('does not preload IBM Plex Sans, which only English needs', () => {
    expect(options('IBM_Plex_Sans')).toMatch(/preload:\s*false/);
  });

  it('does not load Tajawal at all', () => {
    // Cairo covers every Arabic character the app prints, so the fallback was
    // never drawn: configuration with no effect (batch 10).
    expect(layout).not.toMatch(/Tajawal/);
  });

  it('loads the display face for titles without preloading it', () => {
    // Readex Pro sets the restaurant's name and the section titles (batch 18,
    // in place of El Messiri from batch 13). The till never draws it, so it
    // must not cost the till a download.
    expect(options('Readex_Pro')).toMatch(/preload:\s*false/);
    expect(options('Readex_Pro')).toMatch(/variable:\s*'--font-readex-pro'/);
  });

  it('loads every numeral weight the screens ask for', () => {
    // Totals are set bold. Without a 700 face the browser smears the 600 one.
    expect(options('IBM_Plex_Mono')).toMatch(/'700'/);
  });
});

describe('the Arabic interface face (batch 27)', () => {
  it('is IBM Plex Sans Arabic, the same family as the numerals and the English', () => {
    // Cairo set the same names about 11% wider at the same visual size, and
    // the till's two-column phone grid ran out of room for them.
    expect(options('IBM_Plex_Sans_Arabic')).toMatch(/variable:\s*'--font-plex-arabic'/);
    expect(options('IBM_Plex_Sans_Arabic')).toMatch(/subsets:\s*\['arabic'/);
    // A comment may still name it; nothing loads it.
    expect(layout).not.toMatch(/\bCairo\(|import \{[^}]*\bCairo\b/);
  });

  it.each(['IBM_Plex_Mono', 'IBM_Plex_Sans'])('gives %s no Arial stand-in that would draw Arabic', (family) => {
    // next/font adds a fallback face built on the device's Arial. Arial has
    // Arabic glyphs, so it drew every Arabic-Indic price — enlarged 135% to
    // match the mono's metrics — before the stack reached the Arabic face:
    // ٢٥٬٠٠٠ took 79px instead of 45 (found in batch 27).
    expect(options(family)).toMatch(/adjustFontFallback:\s*false/);
  });
});
