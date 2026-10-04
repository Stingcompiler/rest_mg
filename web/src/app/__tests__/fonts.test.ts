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
  it.each(['Cairo', 'IBM_Plex_Mono'])('preloads %s, which every page draws with', (family) => {
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
    // El Messiri sets the restaurant's name and the section titles (batch 13).
    // The till never draws it, so it must not cost the till a download.
    expect(options('El_Messiri')).toMatch(/preload:\s*false/);
    expect(options('El_Messiri')).toMatch(/variable:\s*'--font-el-messiri'/);
  });

  it('loads every numeral weight the screens ask for', () => {
    // Totals are set bold. Without a 700 face the browser smears the 600 one.
    expect(options('IBM_Plex_Mono')).toMatch(/'700'/);
  });
});
