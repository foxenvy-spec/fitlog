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
        // reserved for PR / record-breaking highlights — a distinct 4th accent so
        // personal records stand out from the everyday amber/steel/rust/moss usage
        violet: '#9C7CC4',
        violetdim: '#372B49',
      },
      fontFamily: {
        display: ['var(--font-oswald)', 'var(--font-kanit)'],
        body: ['var(--font-inter)', 'var(--font-plex-thai)'],
        mono: ['var(--font-mono)', 'var(--font-plex-thai)'],
      },
      letterSpacing: {
        widest2: '0.2em',
      },
      // ใช้กับ Toast (components/Toast.tsx) — ป็อปขึ้นเร็วๆ (150ms), ค้างให้อ่านทัน (900ms),
      // แล้วจางหายไป (350ms) รวม 1.4s ตรงกับ setTimeout ที่เอา toast ออกจาก state จริงใน Toast.tsx
      // (ต้องแก้ทั้งคู่พร้อมกันถ้าจะเปลี่ยน duration ไม่งั้น toast จะหายไปกลางอนิเมชันหรือค้างจอเปล่า)
      keyframes: {
        toast: {
          '0%': { opacity: '0', transform: 'translateY(-6px) scale(0.94)' },
          '11%': { opacity: '1', transform: 'translateY(0) scale(1)' },
          '75%': { opacity: '1', transform: 'translateY(0) scale(1)' },
          '100%': { opacity: '0', transform: 'translateY(-4px) scale(0.98)' },
        },
      },
      animation: {
        toast: 'toast 1.4s cubic-bezier(0.16, 1, 0.3, 1) forwards',
      },
    },
  },
  plugins: [],
}
