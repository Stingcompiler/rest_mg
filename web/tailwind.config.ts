import type { Config } from 'tailwindcss';

/**
 * Sudan POS — Tailwind theme extension.
 *
 * Every value here resolves to a custom property declared in
 * `src/styles/design-tokens.css`. Nothing in this file is a literal colour,
 * size or spacing value, and no component may introduce one.
 *
 * Note on opacity modifiers: colours are plain hex vars, so `bg-accent/50`
 * will not work. The design uses no translucent fills, so this is deliberate.
 * If translucency is ever needed, move that token to channel triplets and
 * `rgb(var(--x) / <alpha-value>)`.
 */
const config: Config = {
  darkMode: ['class', '[data-theme="dark"]'],
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: 'var(--color-bg)',
          rail: 'var(--color-bg-rail)',
          sunken: 'var(--color-bg-sunken)',
        },
        surface: {
          DEFAULT: 'var(--color-surface)',
          2: 'var(--color-surface-2)',
          3: 'var(--color-surface-3)',
          quiet: 'var(--color-surface-quiet)',
        },
        line: {
          DEFAULT: 'var(--color-border)',
          strong: 'var(--color-border-strong)',
        },
        text: {
          DEFAULT: 'var(--color-text)',
          muted: 'var(--color-text-muted)',
          disabled: 'var(--color-text-disabled)',
          'on-accent': 'var(--color-text-on-accent)',
        },
        accent: {
          DEFAULT: 'var(--color-accent)',
          hover: 'var(--color-accent-hover)',
          pressed: 'var(--color-accent-pressed)',
          soft: 'var(--color-accent-soft)',
          tint: 'var(--color-accent-tint)',
          'tint-border': 'var(--color-accent-tint-border)',
        },
        success: {
          DEFAULT: 'var(--color-success)',
          tint: 'var(--color-success-tint)',
        },
        warning: {
          DEFAULT: 'var(--color-warning)',
          tint: 'var(--color-warning-tint)',
        },
        danger: {
          DEFAULT: 'var(--color-danger)',
          tint: 'var(--color-danger-tint)',
          text: 'var(--color-danger-text)',
        },
        credit: {
          DEFAULT: 'var(--color-credit)',
          text: 'var(--color-credit-text)',
          tint: 'var(--color-credit-tint)',
        },
        chart: {
          1: 'var(--color-chart-1)',
          2: 'var(--color-chart-2)',
          3: 'var(--color-chart-3)',
          4: 'var(--color-chart-4)',
        },
        'toggle-knob': 'var(--toggle-knob)',
      },

      fontFamily: {
        ar: 'var(--font-arabic)',
        la: 'var(--font-latin)',
        num: 'var(--font-numeric)',
      },

      fontSize: {
        'ar-xs': ['var(--text-ar-xs)', { lineHeight: 'var(--leading-snug)' }],
        'ar-sm': ['var(--text-ar-sm)', { lineHeight: 'var(--leading-ui)' }],
        'ar-base': ['var(--text-ar-base)', { lineHeight: 'var(--leading-normal)' }],
        'ar-md': ['var(--text-ar-md)', { lineHeight: 'var(--leading-ui)' }],
        'ar-lg': ['var(--text-ar-lg)', { lineHeight: 'var(--leading-ui)' }],
        'ar-xl': ['var(--text-ar-xl)', { lineHeight: 'var(--leading-ui)' }],
        'ar-2xl': ['var(--text-ar-2xl)', { lineHeight: 'var(--leading-normal)' }],
        'ar-3xl': ['var(--text-ar-3xl)', { lineHeight: 'var(--leading-normal)' }],
        'ar-4xl': ['var(--text-ar-4xl)', { lineHeight: 'var(--leading-normal)' }],

        'la-xs': ['var(--text-la-xs)', { lineHeight: 'var(--leading-normal)' }],
        'la-sm': ['var(--text-la-sm)', { lineHeight: 'var(--leading-normal)' }],
        'la-base': ['var(--text-la-base)', { lineHeight: 'var(--leading-normal)' }],
        'la-md': ['var(--text-la-md)', { lineHeight: 'var(--leading-ui)' }],
        'la-lg': ['var(--text-la-lg)', { lineHeight: 'var(--leading-snug)' }],
        'la-xl': ['var(--text-la-xl)', { lineHeight: 'var(--leading-snug)' }],
        'la-2xl': ['var(--text-la-2xl)', { lineHeight: 'var(--leading-snug)' }],
        'la-3xl': ['var(--text-la-3xl)', { lineHeight: 'var(--leading-snug)' }],
        'la-4xl': ['var(--text-la-4xl)', { lineHeight: 'var(--leading-snug)' }],

        'num-xs': ['var(--text-num-xs)', { lineHeight: 'var(--leading-none)' }],
        'num-sm': ['var(--text-num-sm)', { lineHeight: 'var(--leading-none)' }],
        'num-base': ['var(--text-num-base)', { lineHeight: 'var(--leading-none)' }],
        'num-md': ['var(--text-num-md)', { lineHeight: 'var(--leading-none)' }],
        'num-lg': ['var(--text-num-lg)', { lineHeight: 'var(--leading-none)' }],
        'num-xl': ['var(--text-num-xl)', { lineHeight: 'var(--leading-none)' }],
        'num-2xl': ['var(--text-num-2xl)', { lineHeight: 'var(--leading-none)' }],
        'num-3xl': ['var(--text-num-3xl)', { lineHeight: 'var(--leading-none)' }],
        'num-4xl': ['var(--text-num-4xl)', { lineHeight: 'var(--leading-none)' }],
        'num-5xl': ['var(--text-num-5xl)', { lineHeight: 'var(--leading-none)' }],
        'num-6xl': ['var(--text-num-6xl)', { lineHeight: 'var(--leading-none)' }],
      },

      fontWeight: {
        regular: 'var(--weight-regular)',
        medium: 'var(--weight-medium)',
        semibold: 'var(--weight-semibold)',
        bold: 'var(--weight-bold)',
      },

      lineHeight: {
        none: 'var(--leading-none)',
        snug: 'var(--leading-snug)',
        ui: 'var(--leading-ui)',
        normal: 'var(--leading-normal)',
        relaxed: 'var(--leading-relaxed)',
        loose: 'var(--leading-loose)',
      },

      spacing: {
        2: 'var(--space-2)',
        4: 'var(--space-4)',
        6: 'var(--space-6)',
        8: 'var(--space-8)',
        10: 'var(--space-10)',
        12: 'var(--space-12)',
        14: 'var(--space-14)',
        16: 'var(--space-16)',
        18: 'var(--space-18)',
        20: 'var(--space-20)',
        24: 'var(--space-24)',
        32: 'var(--space-32)',
        56: 'var(--space-56)',

        'control-sm': 'var(--control-sm)',
        'control-stepper': 'var(--control-stepper)',
        'control-md': 'var(--control-md)',
        'control-lg': 'var(--control-lg)',
        'control-xl': 'var(--control-xl)',
        'control-2xl': 'var(--control-2xl)',

        header: 'var(--header-height)',
        rail: 'var(--rail-width)',
        'mobile-nav': 'var(--mobile-nav-height)',
        cart: 'var(--cart-width)',
        'manager-sidebar': 'var(--manager-sidebar-width)',
        'payment-panel': 'var(--payment-panel-width)',
        'denomination-panel': 'var(--denomination-panel-width)',
        'item-card': 'var(--item-card-height)',

        'icon-sm': 'var(--icon-sm)',
        'icon-md': 'var(--icon-md)',
        'icon-lg': 'var(--icon-lg)',
        'icon-xl': 'var(--icon-xl)',
        dot: 'var(--status-dot)',

        'toggle-w': 'var(--dim-toggle-w)',
        'toggle-h': 'var(--dim-toggle-h)',
        knob: 'var(--dim-knob)',
        badge: 'var(--dim-badge)',
        stepper: 'var(--dim-stepper)',
        'stepper-value': 'var(--dim-stepper-value)',
        'rail-item-w': 'var(--dim-rail-item-w)',
        'rail-item-h': 'var(--dim-rail-item-h)',
        'cancel-btn': 'var(--dim-cancel-btn)',
        'menu-sidebar': 'var(--dim-menu-sidebar)',
        'price-field': 'var(--dim-price-field)',
        'thumb-w': 'var(--dim-thumb-w)',
        'thumb-h': 'var(--dim-thumb-h)',
        'hero-h': 'var(--dim-hero-h)',
      },

      borderRadius: {
        xs: 'var(--radius-xs)',
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
        xl: 'var(--radius-xl)',
        pill: 'var(--radius-pill)',
      },

      borderWidth: {
        DEFAULT: 'var(--border-width)',
        strong: 'var(--border-width-strong)',
      },

      boxShadow: {
        card: 'var(--shadow-card)',
        focus: 'var(--focus-ring)',
      },
    },
  },
  plugins: [],
};

export default config;
