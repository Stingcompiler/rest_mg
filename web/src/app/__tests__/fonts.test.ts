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

  it.each(['Tajawal', 'IBM_Plex_Sans'])('does not preload %s, which only a fallback or English needs', (family) => {
    expect(options(family)).toMatch(/preload:\s*false/);
  });
});
