import type { Config } from 'tailwindcss';
const v = (n: string) => `rgb(var(--c-${n}) / <alpha-value>)`;
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: { bg: v('bg'), surface: v('surface'), surface2: v('surface2'), line: v('line'), ink: v('ink'), mute: v('mute'), accent: v('accent'), up: v('up'), down: v('down'), warn: v('warn') },
      fontFamily: { sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'] },
    },
  },
} satisfies Config;
