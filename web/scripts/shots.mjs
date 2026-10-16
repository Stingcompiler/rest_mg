/**
 * Screenshots of the representative screens (docs/ui-profile.md, part C).
 *
 *   node scripts/shots.mjs <label>      # → shots/<label>/<screen>--<viewport>--<scheme>--<locale>.png
 *
 * Expects the monolith on BASE_URL (default http://localhost:8765) holding the
 * review data (`manage.py seed`, then scripts/shots-data.py). Signs in as each
 * role through the real login, sets theme and language the way the app stores
 * them, turns motion off, and captures every screen at every supported width.
 * Times on screen follow the clock: compare layouts, not minutes.
 */
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const BASE = process.env.BASE_URL ?? 'http://localhost:8765';
const LABEL = process.argv[2] ?? 'current';
const PASSWORD = process.env.SHOTS_PASSWORD ?? 'change-me-please';

// docs/ui-profile.md: widths, modes and languages the product supports.
const VIEWPORTS = [
  { name: 'phone-360', width: 360, height: 740 },
  { name: 'tablet-768', width: 768, height: 1024 },
  { name: 'desktop-1280', width: 1280, height: 800 },
];
const SCHEMES = ['light', 'dark'];
const LOCALES = ['ar', 'en'];

const SCREENS = [
  { role: null, name: 'landing', path: '/' },
  { role: null, name: 'login', path: '/login/' },
  { role: 'manager', name: 'dashboard', path: '/manager/' },
  { role: 'manager', name: 'dashboard-all', path: '/manager/', click: /كل الفترات|All time|All/ },
  { role: 'manager', name: 'customers', path: '/manager/customers/' },
  { role: 'manager', name: 'staff', path: '/manager/staff/' },
  { role: 'manager', name: 'reports', path: '/manager/reports/' },
  { role: 'manager', name: 'devices', path: '/manager/devices/' },
  { role: 'manager', name: 'activity', path: '/manager/activity/' },
  { role: 'manager', name: 'profile', path: '/manager/profile/' },
  { role: 'cashier.day', name: 'pos', path: '/pos/' },
  { role: 'cashier.day', name: 'pos-menu', path: '/pos/menu/' },
  { role: 'cashier.day', name: 'pos-sync', path: '/pos/sync/' },
  { role: 'cashier.day', name: 'pos-orders', path: '/pos/orders/' },
  { role: 'cashier.day', name: 'pos-shift-close', path: '/pos/shift-close/' },
  { role: 'cashier.day', name: 'pos-report', path: '/pos/report/' },
  { role: 'cashier.day', name: 'deliveries', path: '/deliveries/' },
  { role: 'cashier.day', name: 'catalog', path: '/catalog/' },
  { role: 'kitchen', name: 'kitchen', path: '/kitchen/' },
];

/** The browser Playwright wants, else the newest Chromium already in its cache. */
async function launch() {
  try {
    return await chromium.launch();
  } catch (error) {
    const cache = process.env.PLAYWRIGHT_BROWSERS_PATH ?? join(homedir(), 'Library/Caches/ms-playwright');
    const found = existsSync(cache)
      ? readdirSync(cache)
          .filter((name) => name.startsWith('chromium-'))
          .sort()
          .reverse()
          .map((name) => join(cache, name, 'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'))
          .find(existsSync)
      : undefined;
    if (!found) throw error;
    return chromium.launch({ executablePath: found });
  }
}

const only = process.env.ONLY?.split(',');
const pick = (all, key, pickBy) => (process.env[key] ? all.filter((item) => process.env[key].split(',').includes(pickBy(item))) : all);
const browser = await launch();

/** Starts the shift (the till asks for the opening cash first) and puts two dishes in the order. */
async function prepareTill(page, screen) {
  const start = page.getByRole('button', { name: /ابدأ|Start/ });
  if (await start.first().isVisible().catch(() => false)) {
    await start.first().click();
    await page.waitForTimeout(500);
  }
  if (screen.name === 'pos') {
    const dishes = page.locator('button:has-text("ج.س"), button:has-text("SDG")');
    for (let i = 0; i < 2; i++) await dishes.nth(i).click().catch(() => {});
    await page.waitForTimeout(400);
  }
}

async function shootAll(viewport, scheme, locale) {
  const contexts = new Map();
  for (const screen of SCREENS) {
    if (only && !only.includes(screen.name)) continue;
    if (!contexts.has(screen.role)) {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        colorScheme: scheme,
        locale,
        reducedMotion: 'reduce',
        serviceWorkers: 'block',
      });
      await context.addInitScript(([theme, lang]) => {
        try {
          localStorage.setItem('sp-theme', theme);
          localStorage.setItem('sp-locale', lang);
        } catch {}
      }, [scheme, locale]);
      if (screen.role) {
        const login = await context.request.post(`${BASE}/api/v1/auth/login/`, { data: { username: screen.role, password: PASSWORD } });
        if (!login.ok()) throw new Error(`sign-in as ${screen.role} failed: ${login.status()}`);
      }
      contexts.set(screen.role, context);
    }
    const page = await contexts.get(screen.role).newPage();
    // A busy server can stall one load: try once more before giving up.
    for (let attempt = 1; ; attempt++) {
      try {
        await page.goto(`${BASE}${screen.path}`, { waitUntil: 'load', timeout: 45_000 });
        break;
      } catch (error) {
        if (attempt === 2) throw error;
      }
    }
    await page.waitForTimeout(1200);
    if (screen.role === 'cashier.day' && screen.path.startsWith('/pos')) await prepareTill(page, screen);
    if (screen.click) await page.getByText(screen.click).first().click().then(() => page.waitForTimeout(900)).catch(() => {});
    // Reveal-on-scroll content stays visible in a full-page capture.
    await page.addStyleTag({ content: '.opacity-0{opacity:1!important;transform:none!important}*{animation:none!important;transition:none!important}' });
    const dir = `shots/${LABEL}`;
    mkdirSync(dir, { recursive: true });
    await page.screenshot({ path: `${dir}/${screen.name}--${viewport.name}--${scheme}--${locale}.png`, fullPage: true });
    await page.close();
  }
  for (const context of contexts.values()) await context.close();
}

// VP=…  SCHEME=…  LOCALE=…  ONLY=…  narrow the matrix; JOBS combinations run at once (default 2).
const jobs = [];
for (const viewport of pick(VIEWPORTS, 'VP', (v) => v.name))
  for (const scheme of pick(SCHEMES, 'SCHEME', (x) => x)) for (const locale of pick(LOCALES, 'LOCALE', (x) => x)) jobs.push([viewport, scheme, locale]);
const queue = [...jobs];
await Promise.all(Array.from({ length: Number(process.env.JOBS ?? 2) }, async () => { for (let job = queue.shift(); job; job = queue.shift()) await shootAll(...job); }));
await browser.close();
console.log(`${jobs.length} combinations in web/shots/${LABEL}/`);
