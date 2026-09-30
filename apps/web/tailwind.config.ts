import preset from '@pe/config/tailwind';
import type { Config } from 'tailwindcss';

/**
 * Storefront theme on top of the shared preset: every DESIGN.md §16 token is reachable as a utility
 * (`bg-bg`, `text-muted`, `border-hairline`, `font-display`, `text-h1`, `rounded-control`,
 * `shadow-drawer`). Values resolve to the custom properties in styles/tokens.css so both themes
 * switch without a `dark:` variant anywhere in the markup.
 */
const config: Config = {
  presets: [preset],
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      /* The hero panel/scrim and its type; skins recolour these without touching the ground tokens. */
      colors: {
        hero: { DEFAULT: 'var(--hero-bg)', text: 'var(--hero-text)', muted: 'var(--hero-muted)' },
      },
      fontSize: {
        display: [
          'var(--text-display)',
          { lineHeight: '1.05', letterSpacing: 'var(--display-tracking)' },
        ],
        caption: ['var(--text-caption)', { lineHeight: '1.4' }],
      },
      spacing: {
        gutter: 'var(--gutter)',
        header: 'var(--header-height)',
        touch: 'var(--touch-target)',
      },
      minHeight: { touch: 'var(--touch-target)' },
      minWidth: { touch: 'var(--touch-target)' },
      zIndex: {
        header: 'var(--z-header)',
        overlay: 'var(--z-overlay)',
        toast: 'var(--z-toast)',
      },
      letterSpacing: { caps: '0.08em' },
      aspectRatio: { product: '4 / 5', category: 'var(--aspect-category)' },
      backgroundColor: { scrim: 'var(--scrim)' },
      gridTemplateColumns: { layout: 'repeat(var(--grid-columns), minmax(0, 1fr))' },
      /* Opacity/transform only, 150–250 ms; tokens collapse both durations to 0 under reduced motion. */
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'slide-in-right': {
          from: { transform: 'translateX(100%)' },
          to: { transform: 'translateX(0)' },
        },
        'slide-in-left': {
          from: { transform: 'translateX(-100%)' },
          to: { transform: 'translateX(0)' },
        },
        'scale-in': {
          from: { opacity: '0', transform: 'scale(0.98) translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'rise-in': {
          from: { opacity: '0', transform: 'translateY(-4px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-in': 'fade-in var(--duration-normal) var(--ease-out) both',
        'slide-in-right': 'slide-in-right var(--duration-normal) var(--ease-out) both',
        'slide-in-left': 'slide-in-left var(--duration-normal) var(--ease-out) both',
        'scale-in': 'scale-in var(--duration-normal) var(--ease-out) both',
        'rise-in': 'rise-in var(--duration-fast) var(--ease-out) both',
      },
    },
  },
};

export default config;
