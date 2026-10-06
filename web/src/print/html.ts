/**
 * Rendering a print document to paper through the browser.
 *
 * The ESC/POS renderer talks to a thermal printer over a TCP socket, which only
 * exists inside the Android shell. Everywhere else — a laptop, a tablet in a
 * plain browser, the phone a customer's order is being read on — there was no
 * way to produce paper at all: the fake transport accepted the bytes and dropped
 * them.
 *
 * This renders the *same* `PrintDocument` the thermal path renders, so a receipt
 * printed from a browser says exactly what one printed from the till says. It
 * opens a window sized like an 80mm roll and asks the browser to print it, which
 * reaches whatever printer the device already has.
 */
import type { PrintDocument, PrintBlock } from './document';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function blockToHtml(block: PrintBlock): string {
  switch (block.kind) {
    case 'text': {
      const classes = [
        'line',
        block.align === 'center' ? 'center' : block.align === 'right' ? 'right' : '',
        block.bold ? 'bold' : '',
        block.size && block.size > 1 ? 'big' : '',
      ]
        .filter(Boolean)
        .join(' ');
      return `<div class="${classes}">${escapeHtml(block.text)}</div>`;
    }
    case 'row':
      // The row is justified by flexbox rather than by padding to a character
      // count: a proportional font has no character grid to pad against.
      return `<div class="row${block.bold ? ' bold' : ''}"><span>${escapeHtml(
        block.primary,
      )}</span><span class="amount">${escapeHtml(block.secondary)}</span></div>`;
    case 'divider':
      return '<div class="divider"></div>';
    case 'feed':
      return '<div class="feed"></div>'.repeat(Math.max(1, block.lines));
    case 'cut':
      return '';
  }
}

const PRINT_ROOT_ID = 'sp-print-root';
const PRINT_STYLE_ID = 'sp-print-style';

/**
 * The stylesheet that turns one element of the running app into a paper roll.
 *
 * Two details are doing the real work here.
 *
 * `@page { margin: 0 }` is what removes the browser's own header — the page URL
 * and document title it prints in the margins. There is no other way to be rid
 * of it from code; with a margin set, every receipt comes out with
 * "127.0.0.1:8000/pos/shift-close" across the top.
 *
 * `var(--font-arabic)` is IBM Plex Sans Arabic, self-hosted by next/font. It
 * resolves because this prints from *inside* the app's own document. The old
 * path opened a blank popup and named the fonts in a CSS stack the popup had
 * never loaded, so every receipt silently fell back to the system font.
 */
const PRINT_CSS = `
#${PRINT_ROOT_ID} { display: none; }
@media print {
  @page { size: 80mm auto; margin: 0; }
  html, body {
    margin: 0 !important;
    padding: 0 !important;
    background: #fff !important;
  }
  body > *:not(#${PRINT_ROOT_ID}) { display: none !important; }
  #${PRINT_ROOT_ID} {
    display: block !important;
    width: 72mm;
    margin: 0 auto;
    padding: 4mm 0 8mm;
    font-family: var(--font-arabic), 'IBM Plex Sans Arabic', system-ui, sans-serif;
    /* 14px, and black throughout: a thermal head prints dots, not greys, and
       small Arabic loses its dots at 203dpi. */
    font-size: 14px;
    line-height: 1.6;
    /* Always ink on paper, whatever theme the screen is in. */
    color: #000;
    background: #fff;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  #${PRINT_ROOT_ID} .line { white-space: pre-wrap; word-break: break-word; }
  #${PRINT_ROOT_ID} .center { text-align: center; }
  #${PRINT_ROOT_ID} .right { text-align: right; }
  #${PRINT_ROOT_ID} .muted { color: #000; font-size: 13px; }
  #${PRINT_ROOT_ID} .bold { font-weight: 700; }
  #${PRINT_ROOT_ID} .big { font-size: 20px; font-weight: 700; line-height: 1.3; }
  #${PRINT_ROOT_ID} .row {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    align-items: baseline;
  }
  #${PRINT_ROOT_ID} .row.bold { font-size: 16px; }
  #${PRINT_ROOT_ID} .row .amount {
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }
  #${PRINT_ROOT_ID} .divider { border-top: 1px dashed #000; margin: 6px 0; }
  #${PRINT_ROOT_ID} .feed { height: 8px; }
}
`;

/** The document as a standalone HTML page, styled for an 80mm roll. */
export function renderDocumentToHtml(doc: PrintDocument, title = 'receipt'): string {
  const body = doc.blocks.map(blockToHtml).join('\n');
  return `<!doctype html>
<html lang="${doc.dir === 'rtl' ? 'ar' : 'en'}" dir="${doc.dir}">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>
  /* margin: 0 keeps the browser from printing the page URL in the margin. */
  @page { size: 80mm auto; margin: 0; }
  /* Standalone, so the app's next/font faces are not available: name the
     families and let the device use them if they are installed. Inside the app
     printDocumentInBrowser is used instead, and gets the real Arabic face. */
  body {
    font-family: 'IBM Plex Sans Arabic', 'Segoe UI', system-ui, sans-serif;
    font-size: 14px; line-height: 1.6; color: #000; background: #fff;
    width: 72mm; margin: 0 auto; padding: 4mm 0 8mm;
  }
  .line { white-space: pre-wrap; word-break: break-word; }
  .center { text-align: center; }
  .right { text-align: right; }
  .bold { font-weight: 700; }
  .big { font-size: 20px; font-weight: 700; line-height: 1.3; }
  .row { display: flex; justify-content: space-between; gap: 10px; align-items: baseline; }
  .row.bold { font-size: 16px; }
  .muted { color: #000; font-size: 13px; }
  .row .amount { white-space: nowrap; font-variant-numeric: tabular-nums; }
  .divider { border-top: 1px dashed #000; margin: 6px 0; }
  .feed { height: 6px; }
  @media print { body { width: auto; } }
</style>
</head>
<body>
${body}
</body>
</html>`;
}

/**
 * Print the document from the running page.
 *
 * It used to open a blank popup and write a whole HTML page into it. That cost
 * three things at once: popup blockers refused it, the popup had none of the
 * app's fonts so Arabic fell back to whatever the system had, and the browser
 * stamped the page URL across the top of every receipt.
 *
 * Printing from this document instead fixes all three. The receipt is appended
 * as one hidden element, a print stylesheet hides everything else on the page,
 * and the browser prints what is left.
 *
 * Returns false only where there is no document at all (the static export's
 * build-time render), so the caller can still say something useful.
 */
export function printDocumentInBrowser(doc: PrintDocument, _title = 'receipt'): boolean {
  if (typeof document === 'undefined' || typeof window === 'undefined') return false;

  // A second press while the dialog is open must not stack two receipts.
  document.getElementById(PRINT_ROOT_ID)?.remove();
  document.getElementById(PRINT_STYLE_ID)?.remove();

  const style = document.createElement('style');
  style.id = PRINT_STYLE_ID;
  style.textContent = PRINT_CSS;
  document.head.appendChild(style);

  const root = document.createElement('div');
  root.id = PRINT_ROOT_ID;
  root.dir = doc.dir;
  root.innerHTML = doc.blocks.map(blockToHtml).join('');
  document.body.appendChild(root);

  let done = false;
  const cleanup = () => {
    if (done) return;
    done = true;
    root.remove();
    style.remove();
    window.removeEventListener('afterprint', cleanup);
  };
  window.addEventListener('afterprint', cleanup);

  window.print();

  // `afterprint` is reliable in Chrome and Firefox but not everywhere, and a
  // leftover hidden element would silently join the *next* receipt. The timer
  // is the backstop, long enough that a slow print dialog is never cut short.
  window.setTimeout(cleanup, 120_000);
  return true;
}
