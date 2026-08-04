import { fontFamily } from 'tailwindcss/defaultTheme';

export default {
  content: ['./src/**/*.{astro,html,js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        teal: '#00D4B8',
        magenta: '#FF2E92',
        violet: '#7B2FF7',
        gold: '#F4C542',
        dusk: '#F7F3F6',
        night: '#0A0A0F',
        'night-card': '#14131C',
        ink: '#171321',
        'ink-soft': '#4A4458',
      },
      fontFamily: {
        display: ['Unbounded', ...fontFamily.sans],
        body: ['Manrope', ...fontFamily.sans],
        mono: ['"IBM Plex Mono"', ...fontFamily.mono],
      },
    },
  },
};
