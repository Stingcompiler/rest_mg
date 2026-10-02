/**
 * The channel triplets used for opacity modifiers match their hex colours.
 *
 * `--color-surface-rgb` and its siblings exist only so `bg-surface/80` can work;
 * a triplet that drifted from its hex would make the translucent and the solid
 * form of one token two different colours.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(resolve(__dirname, '../design-tokens.css'), 'utf-8');

function blocks(): string[] {
  return css.split('}').filter((block) => block.includes('--color-surface:'));
}

describe('channel tokens', () => {
  it('exist in every theme block that defines the colour', () => {
    expect(blocks().length).toBeGreaterThanOrEqual(3);
  });

  for (const name of ['surface', 'border', 'accent']) {
    it(`--color-${name}-rgb equals --color-${name} everywhere`, () => {
      for (const block of blocks()) {
        const hex = new RegExp(`--color-${name}:\\s*#([0-9a-fA-F]{6})`).exec(block)?.[1];
        const rgb = new RegExp(`--color-${name}-rgb:\\s*(\\d+) (\\d+) (\\d+)`).exec(block);
        expect(hex).toBeDefined();
        expect(rgb).not.toBeNull();
        const channels = [0, 2, 4].map((offset) => parseInt(hex!.slice(offset, offset + 2), 16));
        expect(rgb!.slice(1).map(Number)).toEqual(channels);
      }
    });
  }
});
