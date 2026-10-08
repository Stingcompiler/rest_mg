/**
 * The restaurant page without template cards (batch 35).
 *
 * The owner's word: the cards looked like stock AI templates. They did, in
 * the pattern every generated page repeats: dishes as identical boxes (fill,
 * border, shadow, rounded) in an even grid; facts as an icon in a circle over
 * a title and a line; a "featured" chip with a sparkles icon; and a dark
 * rounded box with a stock line ("اطلب وجبتك الآن واستمتع بها أينما كنت").
 *
 * A restaurant prints its menu instead: a dish is a line — its name, a dotted
 * leader, its price — with the description under it and a hairline between
 * dishes; facts are labelled columns between rules; the call to order is a
 * band across the page, saying what it actually offers.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import ar from '../../../i18n/messages/ar.json';
import en from '../../../i18n/messages/en.json';

const landing = readFileSync(resolve(__dirname, '../LandingClient.tsx'), 'utf-8');

function fn(name: string): string {
  const body = new RegExp(`function ${name}\\b[\\s\\S]*?\\n\\}`).exec(landing)?.[0];
  expect(body, `function ${name}`).toBeDefined();
  return body!;
}

const BOX = /\b(?:sm:)?(?:shadow-card|shadow-raised)\b|\bsm:border\b(?!-)|\bsm:bg-bg\b|\bsm:rounded-lg\b/;

describe('a dish on the menu', () => {
  const card = fn('ItemCard');
  const article = /<article className="([^"]*)"/.exec(card)?.[1] ?? '';

  it('is a line of a printed menu at every size, not a box', () => {
    expect(article).not.toMatch(BOX);
    expect(article).not.toMatch(/sm:flex-col/);
    expect(article).toMatch(/\bborder-b border-line\b/);
  });

  it('joins its name to its price with a dotted leader', () => {
    expect(card).toMatch(/<span aria-hidden="true" className="[^"]*\bborder-dotted\b[^"]*" \/>\s*<Price\b/);
  });

  it('keeps a photo, when there is one, small beside the words', () => {
    expect(card).toMatch(/<DishPhoto item=\{item\} className="[^"]*\bsize-row-image\b/);
    expect(card).not.toMatch(/sm:h-card-image/);
  });

  it('lists in two columns at most, read down like a menu', () => {
    const menu = fn('MenuSection');
    expect(menu).toMatch(/grid grid-cols-1 sm:grid-cols-2 sm:gap-x-40/);
    expect(menu).not.toMatch(/xl:grid-cols-3/);
  });
});

describe("the restaurant's picks", () => {
  const card = fn('FeaturedCard');

  it('drop the sparkles chip and the box', () => {
    expect(card).not.toMatch(/Sparkles/);
    expect(landing).not.toMatch(/\bSparkles\b/);
    const article = /<article className="([^"]*)"/.exec(card)?.[1] ?? '';
    expect(article).not.toMatch(BOX);
    expect(article).not.toMatch(/\bborder border-line\b|\bbg-surface\b/);
  });

  it('let the photo carry the card, the words under it', () => {
    expect(card).toMatch(/<DishPhoto item=\{item\} className="[^"]*\brounded-lg\b/);
  });
});

describe('the facts band', () => {
  it('labels each fact in gold instead of an icon in a circle', () => {
    const fact = fn('Fact');
    expect(fact).not.toMatch(/rounded-full/);
    expect(fact).not.toMatch(/icon/);
    expect(fact).toMatch(/<h3 className="[^"]*\btext-gold\b/);
  });

  it('sets the facts as columns between rules', () => {
    expect(fn('InfoBand')).toMatch(/lg:divide-x lg:divide-line/);
  });
});

describe('the call to order', () => {
  const section = /<section id="order"[\s\S]*?<\/section>/.exec(landing)?.[0] ?? '';

  it('is a band across the page, not a rounded box inside it', () => {
    expect(section).toMatch(/<section id="order" className="[^"]*\bbg-ink\b/);
    expect(section).not.toMatch(/rounded-lg p-24/);
  });

  it('says what it offers, not a stock line', () => {
    expect(ar['landing.orderCtaTitle']).not.toMatch(/أينما كنت|استمتع/);
    expect(en['landing.orderCtaTitle']).not.toMatch(/wherever|enjoy/i);
  });
});
