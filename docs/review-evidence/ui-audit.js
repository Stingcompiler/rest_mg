/**
 * UI audit, run in a browser against a review server (docs/UX-VISUAL-REVIEW-PLAN.ar.md, stage 2).
 *
 * Loads each screen in a same-origin iframe of a chosen width — so the
 * breakpoints apply — scrolls it a screen at a time, and measures what is
 * actually drawn:
 *   - contrast of every text against the colour under it (from the stack of
 *     elements at that point, so overlays count), against WCAG AA;
 *   - font sizes in use, and the smallest;
 *   - touch targets under 44px (our floor) and under 24px (WCAG 2.5.8);
 *   - corner radii and shadows of card-sized boxes;
 *   - colours that are not one of the palette's tokens;
 *   - horizontal scrolling.
 *
 * The page must be framable by its own origin: the review server sends
 * X-Frame-Options: DENY, so it is run against an audit-only server whose
 * settings allow SAMEORIGIN (kept outside the repository).
 *
 * Usage, in the console of a page on that server:
 *   await import('/ui-audit.js');          // or paste this file
 *   uiAudit.start(PLAN);                   // runs in the background
 *   uiAudit.progress();                    // { done, total, current }
 *   uiAudit.results;                       // one entry per screen × width × theme
 */
(() => {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  // ---------------------------------------------------------------- colours

  function parseColor(value) {
    if (!value) return null;
    let match = /^rgba?\(([^)]+)\)$/.exec(value);
    if (match) {
      const parts = match[1].split(/[\s,/]+/).filter(Boolean).map(Number);
      return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 };
    }
    match = /^color\(srgb\s+([^)]+)\)$/.exec(value);
    if (match) {
      const parts = match[1].split(/[\s/]+/).filter(Boolean).map(Number);
      return { r: parts[0] * 255, g: parts[1] * 255, b: parts[2] * 255, a: parts.length > 3 ? parts[3] : 1 };
    }
    return null;
  }

  const blend = (top, bottom) => ({
    r: top.r * top.a + bottom.r * (1 - top.a),
    g: top.g * top.a + bottom.g * (1 - top.a),
    b: top.b * top.a + bottom.b * (1 - top.a),
    a: 1,
  });

  function luminance({ r, g, b }) {
    const channel = (v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  }

  function ratio(a, b) {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  }

  const hex = ({ r, g, b }) =>
    '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase();

  // The palette's tokens, resolved to colours in the frame's current theme.
  function tokenMap(doc) {
    const root = doc.documentElement;
    const names = new Set();
    for (const sheet of doc.styleSheets) {
      let rules;
      try {
        rules = sheet.cssRules;
      } catch {
        continue;
      }
      for (const rule of rules) {
        const text = rule.cssText || '';
        for (const [, name] of text.matchAll(/(--color-[a-z0-9-]+)\s*:/g)) names.add(name);
      }
    }
    const probe = doc.createElement('span');
    doc.body.appendChild(probe);
    const map = new Map();
    for (const name of names) {
      if (name.endsWith('-rgb')) continue;
      probe.style.color = '';
      probe.style.color = `var(${name})`;
      const c = parseColor(getComputedStyle(probe).color);
      if (c) map.set(hex(c), name);
    }
    probe.remove();
    return map;
  }

  // -------------------------------------------------------------- one screen

  function describe(element) {
    const classes = (element.getAttribute('class') || '').split(/\s+/).filter(Boolean).slice(0, 4).join('.');
    return `${element.tagName.toLowerCase()}${classes ? '.' + classes : ''}`;
  }

  /** The background actually under a point, composited from the element down. */
  function backgroundAt(doc, element, x, y) {
    const stack = doc.elementsFromPoint(x, y);
    let index = stack.indexOf(element);
    if (index === -1) index = stack.findIndex((node) => node.contains(element));
    const layers = [];
    for (let i = Math.max(index, 0); i < stack.length; i += 1) {
      const style = getComputedStyle(stack[i]);
      if (style.backgroundImage && style.backgroundImage !== 'none') {
        // A gradient or a photo: not one colour. Reported apart.
        if (!(stack[i].tagName === 'IMG')) return { complex: true, layer: describe(stack[i]) };
      }
      if (stack[i].tagName === 'IMG' && stack[i].complete) return { complex: true, layer: 'img' };
      const c = parseColor(style.backgroundColor);
      if (c && c.a > 0) {
        layers.push(c);
        if (c.a >= 1) break;
      }
    }
    let base = { r: 255, g: 255, b: 255, a: 1 };
    for (let i = layers.length - 1; i >= 0; i -= 1) base = blend(layers[i], base);
    return { color: base };
  }

  function isVisible(element, rect) {
    if (rect.width <= 1 || rect.height <= 1) return false;
    const style = getComputedStyle(element);
    if (style.visibility !== 'visible' || style.display === 'none') return false;
    let node = element;
    while (node && node.nodeType === 1) {
      if (parseFloat(getComputedStyle(node).opacity) < 0.05) return false;
      node = node.parentElement;
    }
    return true;
  }

  const INTERACTIVE = 'button, a[href], input:not([type=hidden]), select, textarea, [role=button], [role=tab], summary';

  async function measure(frame, { route, width, theme }) {
    const win = frame.contentWindow;
    const doc = frame.contentDocument;
    const out = {
      route,
      width,
      theme,
      overflowX: false,
      texts: 0,
      complexBackgrounds: 0,
      contrastFails: [],
      fonts: {},
      minFont: null,
      smallText: [],
      targetsUnder24: [],
      targetsUnder44: [],
      radii: {},
      shadows: {},
      offPalette: { text: {}, background: {}, border: {} },
    };
    const seenText = new Set();
    const seenTargets = new Set();
    const viewH = win.innerHeight;

    const measureViewport = () => {
      const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (!node.nodeValue.trim()) continue;
        const element = node.parentElement;
        if (!element || seenText.has(element)) continue;
        if (element.closest('script, style, noscript')) continue;
        const range = doc.createRange();
        range.selectNodeContents(node);
        const rect = [...range.getClientRects()].find((r) => r.width > 1 && r.height > 1);
        if (!rect || rect.bottom < 0 || rect.top > viewH || rect.right < 0 || rect.left > win.innerWidth) continue;
        if (!isVisible(element, rect)) continue;
        // Text for screen readers only (sr-only: a 1px box, clipped).
        const box = element.getBoundingClientRect();
        if (box.width <= 1 || box.height <= 1 || getComputedStyle(element).clip === 'rect(0px, 0px, 0px, 0px)') continue;
        seenText.add(element);
        out.texts += 1;
        const style = getComputedStyle(element);
        const size = parseFloat(style.fontSize);
        const weight = parseInt(style.fontWeight, 10);
        const family = style.fontFamily.split(',')[0].replace(/"/g, '').trim();
        const key = `${size}px ${family} ${weight}`;
        out.fonts[key] = (out.fonts[key] || 0) + 1;
        if (out.minFont === null || size < out.minFont) out.minFont = size;
        if (size < 14 && out.smallText.length < 12) out.smallText.push({ text: node.nodeValue.trim().slice(0, 30), size, at: describe(element) });

        const x = Math.min(Math.max(rect.left + rect.width / 2, 1), win.innerWidth - 1);
        const y = Math.min(Math.max(rect.top + rect.height / 2, 1), viewH - 1);
        const bg = backgroundAt(doc, element, x, y);
        if (bg.complex) {
          out.complexBackgrounds += 1;
          continue;
        }
        const fgRaw = parseColor(style.color);
        if (!fgRaw) continue;
        const fg = fgRaw.a < 1 ? blend(fgRaw, bg.color) : fgRaw;
        const value = ratio(fg, bg.color);
        const large = size >= 24 || (size >= 18.66 && weight >= 700);
        const need = large ? 3 : 4.5;
        const disabled = element.closest('[disabled], [aria-disabled=true]');
        if (value < need && !disabled && out.contrastFails.length < 40) {
          out.contrastFails.push({
            text: node.nodeValue.trim().slice(0, 30),
            ratio: Math.round(value * 100) / 100,
            need,
            fg: hex(fg),
            bg: hex(bg.color),
            size,
            at: describe(element),
          });
        }
      }

      for (const element of doc.querySelectorAll(INTERACTIVE)) {
        if (seenTargets.has(element)) continue;
        const rect = element.getBoundingClientRect();
        if (rect.bottom < 0 || rect.top > viewH) continue;
        if (!isVisible(element, rect)) continue;
        seenTargets.add(element);
        const small = Math.min(rect.width, rect.height);
        const inline = element.tagName === 'A' && element.closest('p, li');
        const entry = {
          name: (element.getAttribute('aria-label') || element.innerText || element.getAttribute('placeholder') || '').trim().slice(0, 30),
          size: `${Math.round(rect.width)}x${Math.round(rect.height)}`,
          at: describe(element),
          inline: Boolean(inline),
        };
        if (small < 24) out.targetsUnder24.length < 20 && out.targetsUnder24.push(entry);
        else if (small < 44) out.targetsUnder44.length < 20 && out.targetsUnder44.push(entry);
      }
    };

    // A screen at a time, down the whole page.
    const total = doc.documentElement.scrollHeight;
    for (let top = 0; top < total; top += Math.max(200, viewH - 120)) {
      win.scrollTo(0, top);
      await sleep(260);
      measureViewport();
    }
    win.scrollTo(0, 0);
    await sleep(120);

    out.overflowX = doc.documentElement.scrollWidth > doc.documentElement.clientWidth + 1;

    // Boxes, corners, shadows and colours, over the whole document.
    const tokens = tokenMap(doc);
    const offPalette = (bucket, colour) => {
      const c = parseColor(colour);
      if (!c || c.a === 0) return;
      const key = hex(c) + (c.a < 1 ? `@${Math.round(c.a * 100)}%` : '');
      if (c.a >= 1 && tokens.has(hex(c))) return;
      if (c.a < 1) return; // translucent token mixes are expected (surface/90 and the like)
      out.offPalette[bucket][key] = (out.offPalette[bucket][key] || 0) + 1;
    };
    for (const element of doc.body.querySelectorAll('*')) {
      const rect = element.getBoundingClientRect();
      if (rect.width <= 1 || rect.height <= 1) continue;
      const style = getComputedStyle(element);
      if (style.display === 'none' || style.visibility !== 'visible') continue;
      offPalette('text', style.color);
      offPalette('background', style.backgroundColor);
      if (parseFloat(style.borderTopWidth) > 0) offPalette('border', style.borderTopColor);
      const boxy = rect.width >= 80 && rect.height >= 40;
      const framed = parseFloat(style.borderTopWidth) > 0 || (parseColor(style.backgroundColor)?.a ?? 0) > 0;
      if (boxy && framed) {
        const radius = style.borderTopLeftRadius === style.borderTopRightRadius ? style.borderTopLeftRadius : `${style.borderTopLeftRadius}/${style.borderTopRightRadius}`;
        out.radii[radius] = (out.radii[radius] || 0) + 1;
      }
      if (style.boxShadow && style.boxShadow !== 'none') out.shadows[style.boxShadow] = (out.shadows[style.boxShadow] || 0) + 1;
    }
    return out;
  }

  // ------------------------------------------------------------- the runner

  const state = { results: [], done: 0, total: 0, current: null, errors: [] };

  async function login(username, password) {
    const token = () => (/(?:^|;\s*)csrftoken=([^;]+)/.exec(document.cookie) || [])[1] || '';
    await fetch('/api/v1/auth/logout/', { method: 'POST', credentials: 'include', headers: { 'X-CSRFToken': token() } });
    if (!username) return;
    const response = await fetch('/api/v1/auth/login/', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'X-CSRFToken': token() },
      body: JSON.stringify({ username, password }),
    });
    if (!response.ok) throw new Error(`login ${username}: ${response.status}`);
  }

  async function load(route, width, height, prepare) {
    const frame = document.createElement('iframe');
    frame.style.cssText = `position:fixed;top:0;left:0;width:${width}px;height:${height}px;border:0;z-index:2147483647;background:#fff`;
    document.body.appendChild(frame);
    await new Promise((resolve) => {
      frame.onload = resolve;
      frame.src = route;
    });
    await sleep(1600); // client rendering and the first fetches
    // Measure the end state, not a frame mid-animation.
    const quiet = frame.contentDocument.createElement('style');
    // `opacity-0` is used by the public page's Reveal alone, for a block not
    // yet scrolled into view; the audit measures the state it reveals to (a
    // frame in a hidden pane may never fire the IntersectionObserver).
    quiet.textContent =
      '*,*::before,*::after{animation-duration:0s!important;animation-delay:0s!important;transition:none!important}' +
      '.opacity-0{opacity:1!important}';
    frame.contentDocument.head.appendChild(quiet);
    if (prepare) await prepare(frame);
    await sleep(300);
    return frame;
  }

  async function run(plan) {
    state.results = [];
    state.errors = [];
    state.total = plan.reduce((sum, group) => sum + group.routes.length * group.widths.length * group.themes.length, 0);
    state.done = 0;
    for (const group of plan) {
      await login(group.username, group.password);
      for (const theme of group.themes) {
        localStorage.setItem('sp-theme', theme);
        if (group.locale) localStorage.setItem('sp-locale', group.locale);
        else localStorage.removeItem('sp-locale');
        for (const route of group.routes) {
          for (const width of group.widths) {
            state.current = `${route} @${width} ${theme}`;
            let frame;
            try {
              frame = await load(route, width, width < 768 ? 812 : 900, group.prepare?.[route]);
              state.results.push(await measure(frame, { route, width, theme, locale: group.locale || 'ar' }));
            } catch (error) {
              state.errors.push(`${state.current}: ${error}`);
            } finally {
              frame?.remove();
              state.done += 1;
            }
          }
        }
      }
    }
    state.current = null;
    localStorage.removeItem('sp-locale');
    localStorage.setItem('sp-theme', 'light');
  }

  window.uiAudit = {
    start(plan) {
      state.promise = run(plan);
      return state.total;
    },
    progress: () => ({ done: state.done, total: state.total, current: state.current, errors: state.errors.length }),
    get results() {
      return state.results;
    },
    get errors() {
      return state.errors;
    },
    measure,
    load,
    login,
  };
})();
