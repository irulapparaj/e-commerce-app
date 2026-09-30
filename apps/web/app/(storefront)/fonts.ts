import {
  Cinzel,
  Cormorant_Garamond,
  Fraunces,
  Manrope,
  Nunito,
  Poppins,
  Prata,
  Raleway,
  Rozha_One,
  Source_Sans_3,
} from 'next/font/google';

/**
 * DESIGN.md §16: Fraunces (optical sizing) for display, Manrope 400/500/600 for body and UI.
 * next/font only exposes the `opsz` axis on the variable build, so Fraunces loads as a variable
 * font and the 400/500 weights are picked in CSS (`font-weight`), not as separate static files.
 */
export const displayFont = Fraunces({
  subsets: ['latin'],
  weight: 'variable',
  axes: ['opsz'],
  display: 'swap',
  variable: '--font-fraunces',
});

export const bodyFont = Manrope({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  display: 'swap',
  variable: '--font-manrope',
});

/*
 * Skin typefaces (styles/skins.css). `preload: false` keeps them out of the critical path: next/font
 * still self-hosts them and emits the @font-face rules, but a browser only fetches the files the
 * active skin's `--font-display` / `--font-body` actually reference.
 */
const prata = Prata({
  subsets: ['latin'],
  weight: '400',
  display: 'swap',
  variable: '--font-prata',
  preload: false,
});

const nunito = Nunito({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-nunito',
  preload: false,
});

const cormorant = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  style: ['normal', 'italic'],
  display: 'swap',
  variable: '--font-cormorant',
  preload: false,
});

const sourceSans = Source_Sans_3({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-source-sans',
  preload: false,
});

const rozha = Rozha_One({
  subsets: ['latin', 'devanagari'],
  weight: '400',
  display: 'swap',
  variable: '--font-rozha',
  preload: false,
});

const poppins = Poppins({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  display: 'swap',
  variable: '--font-poppins',
  preload: false,
});

const cinzel = Cinzel({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-cinzel',
  preload: false,
});

const raleway = Raleway({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-raleway',
  preload: false,
});

export const fontClassName = [
  displayFont,
  bodyFont,
  prata,
  nunito,
  cormorant,
  sourceSans,
  rozha,
  poppins,
  cinzel,
  raleway,
]
  .map((font) => font.variable)
  .join(' ');
