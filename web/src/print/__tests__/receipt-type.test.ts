/**
 * Receipt type is legible on a thermal roll.
 *
 * A thermal head prints dots, not greys: `#333` comes out dithered and faint,
 * and 11px Arabic on a 203dpi head loses its dots. Both the in-app print sheet
 * and the standalone page used them. Found in the font review (batch 10).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(__dirname, '../html.ts'), 'utf-8');

describe('receipt styles', () => {
  it('print nothing smaller than 13px', () => {
    const sizes = [...source.matchAll(/font-size:\s*(\d+)px/g)].map((match) => Number(match[1]));
    expect(sizes.length).toBeGreaterThan(4);
    expect(sizes.filter((size) => size < 13)).toEqual([]);
  });

  it('print in black only', () => {
    const colours = [...source.matchAll(/(?<![\w-])color:\s*(#[0-9a-fA-F]{3,6})/g)].map((match) => match[1]!.toLowerCase());
    expect(colours.length).toBeGreaterThan(0);
    expect(colours.filter((colour) => colour !== '#000' && colour !== '#000000')).toEqual([]);
  });
});
