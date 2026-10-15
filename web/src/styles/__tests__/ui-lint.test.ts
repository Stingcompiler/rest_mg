/**
 * The template-pattern lint (batch 53, docs/ui-profile.md): it fails on the
 * patterns the review forbids, accepts a documented exception, and the project
 * itself is clean, so a new offender fails CI instead of a later review.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const SCRIPT = resolve(__dirname, '../../../scripts/lint-ui.mjs');
const root = mkdtempSync(join(tmpdir(), 'lint-ui-'));
mkdirSync(join(root, 'web/src'), { recursive: true });
mkdirSync(join(root, 'web/scripts'), { recursive: true });
// The script reads ../src relative to itself: give it a copy beside a scratch src.
writeFileSync(join(root, 'web/scripts/lint-ui.mjs'), require('node:fs').readFileSync(SCRIPT, 'utf-8'));

function run(source: string) {
  writeFileSync(join(root, 'web/src/Card.tsx'), source);
  return spawnSync('node', [join(root, 'web/scripts/lint-ui.mjs')], { encoding: 'utf-8' });
}

afterAll(() => rmSync(root, { recursive: true, force: true }));

describe('lint:ui', () => {
  it.each([
    ['a coloured strip', `<div className="rounded-lg border border-line border-s-4 border-danger">x</div>`, 'colour strip'],
    ['the project’s strong-width strip', `<div className="border-t-strong border-gold-soft">x</div>`, 'colour strip'],
    ['an icon in a tinted circle', `<span className="flex size-40 rounded-full bg-success-tint"><Icon /></span>`, 'icon in a tinted circle'],
    ['a gradient', `<button className="bg-gradient-to-r from-accent to-gold">x</button>`, 'gradient'],
    ['a pulsing still element', `<div className="animate-pulse">x</div>`, 'continuous motion'],
    ['an icon on a heading', `<h3><Star size={16} />Title</h3>`, 'icon on a heading'],
  ])('fails on %s', (_name, source, rule) => {
    const result = run(source);
    expect(result.status).toBe(1);
    expect(result.stdout).toContain(`[${rule}]`);
    expect(result.stdout).toContain('Card.tsx:1');
  });

  it('accepts a documented exception on the line or the line above', () => {
    expect(run(`{/* ui-allow: the active edge of the rail */}\n<div className="border-s-strong border-gold-soft">x</div>`).status).toBe(0);
    expect(run(`<div className="animate-pulse"> {/* ui-allow: loading */}</div>`).status).toBe(0);
  });

  it('is silent and passes for a clean file', () => {
    const result = run(`<div className="rounded-lg border border-line bg-surface p-16">x</div>`);
    expect(result.status).toBe(0);
    expect(result.stdout).toBe('');
  });
});

describe('the project', () => {
  it('has no template pattern left outside a documented exception', () => {
    const result = spawnSync('node', [SCRIPT], { encoding: 'utf-8' });
    expect(result.stdout).toBe('');
    expect(result.status).toBe(0);
  });
});
