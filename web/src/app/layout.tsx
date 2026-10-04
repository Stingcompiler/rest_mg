import type { Metadata, Viewport } from 'next';
import { Cairo, El_Messiri, IBM_Plex_Sans, IBM_Plex_Mono } from 'next/font/google';

import { DEFAULT_LOCALE, direction, t } from '@/i18n';

import { Providers } from './providers';
import './globals.css';

/**
 * Fonts are self-hosted by next/font — downloaded at build time and served from
 * our own origin, never from the Google CDN at runtime. A CDN font request would
 * break the offline cashier the first time a tablet loads without internet.
 *
 * Each family exposes a CSS variable that `design-tokens.css` consumes, so the
 * token stays the single reference and the concrete font is wired in one place.
 */
const cairo = Cairo({
  subsets: ['arabic', 'latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-cairo',
  display: 'swap',
});

// The display face for titles: the restaurant's name, section and page titles
// (batch 13). The till never draws it, so it is not preloaded.
const elMessiri = El_Messiri({
  subsets: ['arabic', 'latin'],
  weight: ['500', '600', '700'],
  variable: '--font-el-messiri',
  display: 'swap',
  preload: false,
});

const plexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-plex-sans',
  display: 'swap',
  // The English interface only. It loads when English is chosen.
  preload: false,
});

const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  // 700 for the totals, which are set bold: without it the browser fakes the
  // weight from the 600 face, and Western numerals come out smeared.
  weight: ['400', '500', '600', '700'],
  variable: '--font-plex-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: t('common.appName'),
  manifest: '/manifest.webmanifest',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F6F1E8' },
    { media: '(prefers-color-scheme: dark)', color: '#12100D' },
  ],
};

/**
 * Runs before the first paint, reading the same localStorage keys the
 * preference module uses. It resolves theme (light/dark/system → concrete) and
 * locale, and stamps data-theme, lang and dir on <html> — so neither the colour
 * scheme nor the text direction ever flashes to the wrong value on load.
 */
const BOOTSTRAP = `
(function () {
  var el = document.documentElement;
  try {
    var theme = localStorage.getItem('sp-theme');
    var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    var resolved = (theme === 'light' || theme === 'dark') ? theme : (prefersDark ? 'dark' : 'light');
    el.setAttribute('data-theme', resolved);

    var locale = localStorage.getItem('sp-locale');
    if (locale !== 'ar' && locale !== 'en') locale = 'ar';
    el.setAttribute('lang', locale);
    el.setAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
  } catch (e) {
    el.setAttribute('data-theme', 'light');
  }
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = DEFAULT_LOCALE;
  const fontVariables = `${cairo.variable} ${elMessiri.variable} ${plexSans.variable} ${plexMono.variable}`;

  return (
    <html
      lang={locale}
      dir={direction(locale)}
      className={fontVariables}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: BOOTSTRAP }} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
