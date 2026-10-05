import type { Config } from 'tailwindcss';

/**
 * Orderak — Tailwind theme extension.
 *
 * Every value here resolves to a custom property declared in
 * `src/styles/design-tokens.css`. Nothing in this file is a literal colour,
 * size or spacing value, and no component may introduce one.
 *
 * Note on opacity modifiers: most colours are plain hex vars, so an opacity
 * modifier (`bg-accent/50`) does nothing with them. The three the public page
 * uses translucently — surface, line and accent — also exist as channel
 * triplets (`--color-*-rgb`, kept equal to the hex by a test), and are written
 * as `rgb(var(--x-rgb) / <alpha-value>)` so the modifier works. Do the same for
 * any other token that needs translucency.
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
          DEFAULT: 'rgb(var(--color-surface-rgb) / <alpha-value>)',
          2: 'var(--color-surface-2)',
          3: 'var(--color-surface-3)',
          quiet: 'var(--color-surface-quiet)',
        },
        line: {
          DEFAULT: 'rgb(var(--color-border-rgb) / <alpha-value>)',
          strong: 'var(--color-border-strong)',
        },
        text: {
          DEFAULT: 'var(--color-text)',
          muted: 'var(--color-text-muted)',
          disabled: 'var(--color-text-disabled)',
          'on-accent': 'var(--color-text-on-accent)',
        },
        accent: {
          DEFAULT: 'rgb(var(--color-accent-rgb) / <alpha-value>)',
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
        // The luxury identity (batch 13).
        gold: {
          DEFAULT: 'var(--color-gold)',
          soft: 'var(--color-gold-soft)',
        },
        ink: {
          DEFAULT: 'rgb(var(--color-ink-rgb) / <alpha-value>)',
          2: 'var(--color-ink-2)',
        },
        'on-ink': {
          DEFAULT: 'var(--color-on-ink)',
          muted: 'var(--color-on-ink-muted)',
        },
        'toggle-knob': 'var(--toggle-knob)',
      },

      fontFamily: {
        ar: 'var(--font-arabic)',
        la: 'var(--font-latin)',
        num: 'var(--font-numeric)',
        display: 'var(--font-display)',
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

        'display-xl': ['var(--text-display-xl)', { lineHeight: 'var(--leading-normal)' }],

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
        28: 'var(--space-28)',
        32: 'var(--space-32)',
        40: 'var(--space-40)',
        56: 'var(--space-56)',

        'control-sm': 'var(--control-sm)',
        'control-stepper': 'var(--control-stepper)',
        'control-md': 'var(--control-md)',
        'control-lg': 'var(--control-lg)',
        'control-xl': 'var(--control-xl)',
        'control-2xl': 'var(--control-2xl)',

        header: 'var(--header-height)',
        // The public menu's category titles stop under both sticky bars (batch 19).
        menu: 'calc(var(--header-height) + var(--dim-menu-bar))',
        // From 1024px, where the categories are a column (batch 20).
        'header-gap': 'calc(var(--header-height) + var(--space-24))',
        rail: 'var(--rail-width)',
        'mobile-nav': 'var(--mobile-nav-height)',
        cart: 'var(--cart-width)',
        'cart-compact': 'var(--cart-width-compact)',
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
        'row-image': 'var(--dim-row-image)',
        'dish-photo': 'var(--dim-dish-photo)',
        'price-field': 'var(--dim-price-field)',
        'thumb-w': 'var(--dim-thumb-w)',
        'thumb-h': 'var(--dim-thumb-h)',
        'hero-h': 'var(--dim-hero-h)',
        'thumb-sm': 'var(--dim-thumb-sm)',
        'thumb-md': 'var(--dim-thumb-md)',
        preview: 'var(--dim-preview)',
        logo: 'var(--dim-logo)',
        'card-image': 'var(--dim-card-image)',
        'card-skeleton': 'var(--dim-card-skeleton)',
        popover: 'var(--dim-popover)',
        bar: 'var(--dim-bar)',
        'field-min': 'var(--dim-field-min)',
        // Room under the till menu on a phone, so the last row clears the
        // fixed cart bar above the bottom navigation.
        'mobile-cart-clear': 'calc(var(--control-2xl) + var(--space-16))',
      },

      // Columns from the container's own width, not the viewport's. Each track
      // is at least the card's floor, and never narrower than the container
      // split N ways, which caps the count at N on a wide screen.
      gridTemplateColumns: {
        menu: 'repeat(auto-fill, minmax(max(var(--item-card-min-width), calc((100% - 5 * var(--space-12)) / 6)), 1fr))',
        tickets: 'repeat(auto-fill, minmax(min(100%, max(var(--ticket-min-width), calc((100% - 3 * var(--space-14)) / 4))), 1fr))',
        // The public menu from 1024px: the categories, then the dishes (batch 20).
        'menu-page': 'var(--dim-menu-sidebar) minmax(0, 1fr)',
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

      // Motion is tokens only (batch 18): the bare `transition` takes the fast
      // duration and the house easing.
      transitionDuration: {
        DEFAULT: 'var(--motion-fast)',
        instant: 'var(--motion-instant)',
        fast: 'var(--motion-fast)',
        base: 'var(--motion-base)',
        slow: 'var(--motion-slow)',
      },
      transitionTimingFunction: {
        DEFAULT: 'var(--ease-out)',
        out: 'var(--ease-out)',
      },

      boxShadow: {
        card: 'var(--shadow-card)',
        raised: 'var(--shadow-raised)',
        overlay: 'var(--shadow-overlay)',
        focus: 'var(--focus-ring)',
      },
    },
  },
  plugins: [],
};

export default config;
