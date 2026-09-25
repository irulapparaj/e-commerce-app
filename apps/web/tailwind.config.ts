import preset from '@pe/config/tailwind';
import type { Config } from 'tailwindcss';

const config: Config = {
  presets: [preset],
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
};

export default config;
