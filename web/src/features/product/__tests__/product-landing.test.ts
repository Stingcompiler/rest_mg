/**
 * Orderak's own page, for restaurants (batch 67; Design Reference LANDING.md).
 *
 * Type software, goal contact. Held to the measured rules the reference gives
 * a landing page, and to one rule of ours: nothing is claimed that the product
 * does not do, and nothing is invented. No logos, counts, testimonials or
 * prices appear, because there is no evidence for them yet; what appears is
 * what the product was seen to do, in screenshots of the product itself.
 *
 * The restaurant's own page at «/» is a different page and stays as it is.
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { PRODUCT_CONTACT, PRODUCT_CONTENT } from '../content';

const SRC = resolve(__dirname, '../../..');
const WEB = resolve(SRC, '..');
const read = (path: string) => readFileSync(resolve(SRC, path), 'utf-8');

const words = (text: string) => text.trim().split(/\s+/).filter(Boolean);
const sentences = (text: string) => text.split(/[.؟?!]+/).map((s) => s.trim()).filter(Boolean);

const LOCALES = ['ar', 'en'] as const;

describe.each(LOCALES)('the page’s words (%s)', (locale) => {
  const c = PRODUCT_CONTENT[locale];

  it('says what it does and for whom in a headline of ten words at most, and a subhead of twenty', () => {
    expect(words(c.hero.headline).length).toBeLessThanOrEqual(10);
    expect(words(c.hero.subhead).length).toBeLessThanOrEqual(20);
  });

  it('has four or five sections, each a task and a screenshot, with a short title', () => {
    expect(c.features.length).toBeGreaterThanOrEqual(4);
    expect(c.features.length).toBeLessThanOrEqual(5);
    for (const f of c.features) {
      expect(words(f.title).length, f.title).toBeLessThanOrEqual(6);
      expect(f.alt.length, `${f.id} alt`).toBeGreaterThan(10);
    }
  });

  it('reads easily: sentences short, none long', () => {
    const prose = [
      c.hero.subhead,
      ...c.features.map((f) => f.body),
      ...c.steps.map((s) => s.body),
      c.pricing.body,
      ...c.faq.map((q) => q.a),
      c.closing.body,
    ].join(' ');
    const lengths = sentences(prose).map((s) => words(s).length);
    const average = lengths.reduce((a, b) => a + b, 0) / lengths.length;
    expect(average).toBeLessThanOrEqual(14);
    expect(Math.max(...lengths)).toBeLessThanOrEqual(20);
  });

  it('has three steps, four to eight real questions, and one action word repeated', () => {
    expect(c.steps).toHaveLength(3);
    expect(c.faq.length).toBeGreaterThanOrEqual(4);
    expect(c.faq.length).toBeLessThanOrEqual(8);
    expect(c.cta.length).toBeGreaterThan(0);
    expect(c.cta.split(/\s+/).length).toBeLessThanOrEqual(3);
  });

  it('claims nothing it cannot back: no pressure words, no figures, no placeholders', () => {
    const everything = JSON.stringify(c);
    for (const banned of locale === 'ar'
      ? ['الأكثر شيوعًا', 'محدود', 'ينتهي قريبًا', 'أكثر من', 'عملاؤنا', '[دليل']
      : ['most popular', 'limited', 'ends soon', 'more than', 'our customers', '[evidence']) {
      expect(everything.toLowerCase(), banned).not.toContain(banned.toLowerCase());
    }
    expect(everything).not.toMatch(/\d+\s?%|\d{2,}\+/);
  });

  it('shows no price: it depends on the restaurant, and the page says so', () => {
    expect(c.pricing.title.length).toBeGreaterThan(0);
    expect(JSON.stringify(c)).not.toMatch(/\$|USD|SDG\s?\d|\d\s?(ج\.س|جنيه)/);
  });
});

describe('both languages carry the same page', () => {
  it('has the same sections, steps and questions', () => {
    const [ar, en] = [PRODUCT_CONTENT.ar, PRODUCT_CONTENT.en];
    expect(en.features.map((f) => f.id)).toEqual(ar.features.map((f) => f.id));
    expect(en.steps).toHaveLength(ar.steps.length);
    expect(en.faq).toHaveLength(ar.faq.length);
    expect(en.facts).toHaveLength(ar.facts.length);
  });
});

describe('the one action', () => {
  it('leads somewhere real, off a secure address', () => {
    expect(PRODUCT_CONTACT.href).toMatch(/^https:\/\//);
  });

  it('is repeated at the top, after the sections and at the close, and opens in the page’s own tab only if it is on the same site', () => {
    const page = read('features/product/ProductLanding.tsx');
    expect((page.match(/<Cta\b/g) ?? []).length).toBeGreaterThanOrEqual(3);
    expect(page).toMatch(/rel="noopener noreferrer"/);
  });

  it('is kept in view on a phone: the header sticks with the button in it', () => {
    const page = read('features/product/ProductLanding.tsx');
    expect(page).toMatch(/<header[^>]*\bsticky top-0\b/);
  });
});

describe('the page', () => {
  const page = read('features/product/ProductLanding.tsx');

  it('has one h1, the headline', () => {
    expect((page.match(/<h1\b/g) ?? []).length).toBe(1);
  });

  it('takes its direction and language from the reader’s choice, and lets them change it', () => {
    expect(page).toMatch(/useI18n\(\)/);
    expect(page).toMatch(/dir=\{i18n\.dir\}/);
    expect(page).toMatch(/setLocale\(/);
  });

  it('asks the questions in a list a keyboard can open', () => {
    expect(page).toMatch(/<details\b/);
    expect(page).toMatch(/<summary\b/);
  });

  it('keeps its motion to what can be turned off', () => {
    expect(page).not.toMatch(/\banimate-(?!none)/);
    expect(page).not.toMatch(/(?<!motion-safe:)\bhover:scale/);
  });

  it('says its screenshots are the product with sample data', () => {
    expect(page).toMatch(/shotsNote/);
  });

  it('credits Sting Systems, with a link', () => {
    expect(page).toMatch(/href="https:\/\/stingdev\.pro"/);
  });

  it('points to the restaurant page as an example, and leaves it where it is', () => {
    expect(page).toMatch(/href="\/"/);
    expect(read('app/page.tsx')).toMatch(/<LandingClient \/>/);
  });
});

describe('the pictures', () => {
  const page = read('features/product/ProductLanding.tsx');
  const files = ['till', 'kitchen', 'deliveries', 'dashboard', 'customers'];

  it('are the product, kept small: the first under 250KB, the rest under 180KB', () => {
    for (const name of files) {
      const path = resolve(WEB, `public/orderak/${name}.webp`);
      expect(existsSync(path), name).toBe(true);
      const kb = statSync(path).size / 1024;
      expect(kb, name).toBeLessThan(name === 'till' ? 250 : 180);
    }
  });

  it('have their size written down, so the page does not jump as they arrive', () => {
    for (const img of page.match(/<img\b[\s\S]*?\/>/g) ?? []) {
      expect(img).toMatch(/\bwidth=\{/);
      expect(img).toMatch(/\bheight=\{/);
      expect(img).toMatch(/\balt=\{/);
    }
  });

  it('load first only the one at the top; the rest wait to be scrolled to', () => {
    expect(page).toMatch(/fetchPriority="high"/);
    expect(page).toMatch(/loading=\{.*lazy.*\}|loading="lazy"/);
  });

  it('every feature’s picture exists', () => {
    for (const f of PRODUCT_CONTENT.ar.features) {
      expect(existsSync(resolve(WEB, `public${f.image}`)), f.image).toBe(true);
    }
  });
});

describe('the route', () => {
  it('is a page of its own with a title and a description, public and indexable', () => {
    const route = read('app/orderak/page.tsx');
    expect(route).toMatch(/export const metadata/);
    expect(route).toMatch(/title:/);
    expect(route).toMatch(/description:/);
    expect(route).not.toMatch(/noindex|robots:\s*\{\s*index:\s*false/);
    expect(route).toMatch(/<ProductLanding \/>/);
  });
});
