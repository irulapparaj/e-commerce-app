import type { Config } from 'tailwindcss';

/**
 * Tailwind preset mirroring DESIGN.md §16. Colours resolve to the CSS custom properties defined in
 * apps/web/styles/tokens.css so light and dark themes switch without duplicating the palette here.
 */
const preset: Partial<Config> = {
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)',
        surface: 'var(--surface)',
        hairline: 'var(--hairline)',
        text: 'var(--text)',
        muted: 'var(--muted)',
        subtle: 'var(--subtle)',
        accent: { DEFAULT: 'var(--accent)', contrast: 'var(--accent-contrast)' },
        success: 'var(--success)',
        warning: 'var(--warning)',
        critical: 'var(--critical)',
      },
      fontFamily: {
        display: ['var(--font-display)'],
        body: ['var(--font-body)'],
      },
      fontSize: {
        h1: ['var(--text-h1)', { lineHeight: '1.1' }],
        h2: ['var(--text-h2)', { lineHeight: '1.15' }],
        h3: ['var(--text-h3)', { lineHeight: '1.2' }],
        base: ['var(--text-base)', { lineHeight: '1.6' }],
        small: ['var(--text-small)', { lineHeight: '1.5' }],
      },
      spacing: {
        section: 'var(--space-section)',
      },
      maxWidth: {
        content: 'var(--content-max)',
      },
      borderRadius: {
        control: 'var(--radius-control)',
        image: 'var(--radius-image)',
      },
      boxShadow: {
        drawer: 'var(--shadow-drawer)',
        modal: 'var(--shadow-modal)',
      },
      transitionDuration: {
        fast: 'var(--duration-fast)',
        normal: 'var(--duration-normal)',
      },
      transitionTimingFunction: {
        out: 'var(--ease-out)',
      },
    },
  },
};

export default preset;
