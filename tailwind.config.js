/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx}',
    './components/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        bg: '#14161A',
        surface: '#1C1F24',
        surface2: '#23272D',
        line: '#2E333A',
        ink: '#F3F0E8',
        muted: '#9498A0',
        steel: '#6C8CA8',
        steeldim: '#3E5266',
        rust: '#C1503A',
        rustdim: '#5C2E24',
        // lightened rust for text — plain rust is 3.52:1 on surface, which fails
        // WCAG AA (4.5:1) for normal-size text. Tuned to also clear 4.5:1 on the
        // darker rustdim-tinted error boxes (login, health), not just flat surface.
        // Only use rust itself for decorative/non-text UI (bars, left-borders),
        // which just needs 3:1.
        rusttext: '#CF715F',
        amber: '#E8A33D',
        // recovery status green (76-100% recovered) — kept muted/earthy to match
        // the rust/amber/steel palette instead of a saturated "traffic light" green
        moss: '#7A9B57',
        mossdim: '#2E3A26',
      },
      fontFamily: {
        display: ['var(--font-oswald)'],
        body: ['var(--font-inter)'],
        mono: ['var(--font-mono)'],
      },
      letterSpacing: {
        widest2: '0.2em',
      },
    },
  },
  plugins: [],
}
