/**
 * A restaurant's page that moves (batch 28, docs/LANDING-MOTION.ar.md).
 *
 * The owner: the page "does not express the restaurant at all". The research
 * behind this batch (Awwwards' food and restaurant winners, Webflow's and
 * Tenzo's reviews of praised restaurant sites) keeps returning to the same
 * few moves: a hero with atmosphere, text that arrives rather than sits,
 * a band of dish names in motion, a header that reads its background, and
 * small answers to every tap. All of it is CSS and one IntersectionObserver
 * — no animation library on a customer's phone on mobile data — and all of
 * it stops under "reduce motion" (batch 18).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import config from '../../../../tailwind.config';

const landing = readFileSync(resolve(__dirname, '../LandingClient.tsx'), 'utf-8');
const flow = readFileSync(resolve(__dirname, '../OrderFlow.tsx'), 'utf-8');
const tokens = readFileSync(resolve(__dirname, '../../../styles/design-tokens.css'), 'utf-8');
const globals = readFileSync(resolve(__dirname, '../../../app/globals.css'), 'utf-8');

function fn(name: string, source = landing): string {
  const body = new RegExp(`function ${name}\\b[\\s\\S]*?\\n\\}`).exec(source)?.[0];
  expect(body, `function ${name}`).toBeDefined();
  return body!;
}

const extend = config.theme?.extend ?? {};
const keyframes = (extend.keyframes ?? {}) as Record<string, unknown>;
const animation = (extend.animation ?? {}) as Record<string, string>;

describe('the motion vocabulary', () => {
  it.each(['rise', 'ember', 'marquee', 'kenburns', 'pop', 'slide-up', 'bob'])('has a %s animation on the motion tokens', (name) => {
    expect(keyframes[name], `keyframes.${name}`).toBeDefined();
    expect(animation[name], `animation.${name}`).toMatch(/var\(--motion-/);
  });

  it('keeps its long durations as tokens', () => {
    for (const token of ['--motion-reveal', '--motion-ambient', '--motion-marquee', '--motion-bob']) {
      expect(tokens, token).toContain(`${token}:`);
    }
  });

  it('draws the ember glow from the palette', () => {
    expect(tokens).toMatch(/--color-ember:/);
    expect(globals).toMatch(/\.ember\s*\{[\s\S]*?var\(--color-ember\)[\s\S]*?var\(--color-ink\)/);
  });
});

describe('the hero', () => {
  it('glows like embers without a photo, and drifts slowly with one', () => {
    expect(landing).toMatch(/<img src=\{heroImage\}[^>]*className="[^"]*\banimate-kenburns\b/);
    expect(landing).toMatch(/<div className="[^"]*\bember\b[^"]*\banimate-ember\b/);
  });

  it("brings the restaurant's name in word by word", () => {
    const words = fn('HeroWords');
    expect(words).toMatch(/\.split\(/);
    expect(words).toMatch(/animate-rise/);
    expect(words).toMatch(/animationDelay/);
    expect(landing).toMatch(/<h1 className="[^"]*"><HeroWords text=\{data\.name_ar\} \/><\/h1>/);
  });

  it('points down to the menu', () => {
    expect(landing).toMatch(/aria-hidden="true"[^>]*className="[^"]*\banimate-bob\b/);
  });
});

describe('the dish band', () => {
  it('runs the dish names past, twice over so the loop has no seam', () => {
    const band = fn('DishMarquee');
    expect(band).toMatch(/aria-hidden="true"/);
    expect(band).toMatch(/animate-marquee/);
    expect(band).toMatch(/\[0, 1\]\.map/);
    expect(band).toMatch(/return null;/);
    expect(landing).toMatch(/<DishMarquee menu=\{data\.menu\} \/>/);
  });
});

describe('arriving on scroll', () => {
  it('reveals a block once it enters the screen, and only once', () => {
    const reveal = fn('Reveal');
    expect(reveal).toMatch(/new IntersectionObserver\(/);
    expect(reveal).toMatch(/disconnect\(\)/);
    expect(reveal).toMatch(/animate-rise/);
  });

  it('shows everything at once where it cannot watch, or for anyone who asked for less motion', () => {
    expect(fn('Reveal')).toMatch(/typeof IntersectionObserver === 'undefined' \|\| prefersReducedMotion\(\)/);
  });

  it('is used for the section titles, the dishes, the facts and the featured shelf', () => {
    expect(fn('SectionHeading')).toMatch(/<Reveal\b/);
    expect(fn('MenuSection')).toMatch(/<Reveal key=\{item\.id\} delay=\{/);
    expect(fn('InfoBand')).toMatch(/<Reveal\b/);
    expect(landing).toMatch(/<Reveal key=\{item\.id\} delay=\{[^}]*\}[^>]*>\s*<FeaturedCard/);
  });
});

describe('the header', () => {
  it('reads the hero under it: ink at the top, ivory once the page scrolls', () => {
    const bar = fn('TopBar');
    expect(bar).toMatch(/window\.scrollY > /);
    expect(bar).toMatch(/scrolled \? '[^']*bg-surface\/90[^']*' : '[^']*bg-ink[^']*'/);
  });
});

describe('answers to a tap', () => {
  it('pops the counter each time it changes', () => {
    expect(fn('AddControl')).toMatch(/key=\{qty\}[^>]*className="[^"]*\banimate-pop\b/);
  });

  it('slides the cart bar in', () => {
    expect(fn('CartBar', flow)).toMatch(/\banimate-slide-up\b/);
  });
});
