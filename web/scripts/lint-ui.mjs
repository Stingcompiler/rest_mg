/**
 * Template-pattern lint (docs/ui-profile.md, rule 3 of the review guide).
 *
 * Finds the known applications of the patterns the review forbids when their
 * point is to mark a state or add a "look" without function, prints where,
 * and exits 1 if any are found; silent and 0 when there are none. An
 * exception is written on the same line or the line above:
 *
 *   {/* ui-allow: reason *​/}   or   // ui-allow: reason
 *
 * It catches listed patterns only and can be walked around: it judges
 * nothing about elegance and does not replace looking at the screens.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = resolve(fileURLToPath(import.meta.url), '../../src');

// Each rule: a name and a regex tested against a line's text. The project's
// `border-strong` is a 2px border WIDTH, so `border-t-strong` is a coloured
// strip in the same sense as `border-t-4`.
const TINT = '(?:accent|success|danger|warning|credit|gold|gold-soft|ink)-tint';
const RULES = [
  {
    name: 'colour strip',
    why: 'a thin coloured bar on a card’s edge (border, gradient or pseudo-element) that repeats its state',
    test: /(?<![\w-])(?:[a-z-]+:)*border-(?:[tblrse])-(?:strong|2|4|8)(?![\w-])|(?<![\w-])border-\[(?:2|3|4|5|6)px\]/,
  },
  {
    name: 'icon in a tinted circle',
    why: 'an icon in a round or square pad filled with its state’s tint, adding no meaning',
    test: new RegExp(`rounded-full[^"'\`]*\\bbg-${TINT}\\b|\\bbg-${TINT}\\b[^"'\`]*rounded-full`),
  },
  {
    name: 'gradient',
    why: 'a gradient on buttons or headings that is not part of the product identity',
    test: /(?<![\w-])bg-gradient-to-|(?<![\w-])bg-linear-to-|text-transparent bg-clip-text/,
  },
  {
    name: 'continuous motion',
    why: 'pulse, bounce, glow or drift on a still element that represents no running process',
    test: /(?<![\w-])animate-(?:pulse|bounce|ping|ember|bob|marquee|kenburns)(?![\w-])/,
  },
  {
    name: 'icon on a heading',
    why: 'an icon stuck beside every section or card title',
    test: /<h[1-6][^>]*>\s*<[A-Z]\w+ size=\{/,
  },
];

function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === '__tests__' ? [] : files(path);
    return /\.(tsx|jsx|css)$/.test(name) ? [path] : [];
  });
}

const hits = [];
for (const path of files(SRC)) {
  const lines = readFileSync(path, 'utf-8').split('\n');
  lines.forEach((line, index) => {
    if (/ui-allow:/.test(line) || /ui-allow:/.test(lines[index - 1] ?? '')) return;
    for (const rule of RULES) {
      if (rule.test.test(line)) hits.push(`${relative(resolve(SRC, '..'), path)}:${index + 1}  [${rule.name}]  ${line.trim().slice(0, 110)}`);
    }
  });
}

if (hits.length) {
  console.log(hits.join('\n'));
  console.log(`\n${hits.length} template pattern(s). Rebuild the layout, or document an exception with «ui-allow: reason».`);
  process.exit(1);
}
