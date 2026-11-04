/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // Семантические цвета поверх CSS-переменных из src/index.css:
      // одна палитра на светлую и тёмную тему (VK UI / Сферум).
      colors: {
        page: 'rgb(var(--c-page) / <alpha-value>)',
        card: 'rgb(var(--c-card) / <alpha-value>)',
        muted: 'rgb(var(--c-muted) / <alpha-value>)',
        sunken: 'rgb(var(--c-sunken) / <alpha-value>)',
        line: 'rgb(var(--c-line) / <alpha-value>)',
        line2: 'rgb(var(--c-line2) / <alpha-value>)',

        ink: 'rgb(var(--c-ink) / <alpha-value>)',
        ink2: 'rgb(var(--c-ink2) / <alpha-value>)',
        ink3: 'rgb(var(--c-ink3) / <alpha-value>)',
        ink4: 'rgb(var(--c-ink4) / <alpha-value>)',

        brand: 'rgb(var(--c-brand) / <alpha-value>)',
        brandStrong: 'rgb(var(--c-brand-strong) / <alpha-value>)',
        brandSoft: 'rgb(var(--c-brand-soft) / <alpha-value>)',
        brandLine: 'rgb(var(--c-brand-line) / <alpha-value>)',

        ok: 'rgb(var(--c-ok) / <alpha-value>)',
        okSoft: 'rgb(var(--c-ok-soft) / <alpha-value>)',
        okLine: 'rgb(var(--c-ok-line) / <alpha-value>)',

        warn: 'rgb(var(--c-warn) / <alpha-value>)',
        warnSoft: 'rgb(var(--c-warn-soft) / <alpha-value>)',
        warnLine: 'rgb(var(--c-warn-line) / <alpha-value>)',

        bad: 'rgb(var(--c-bad) / <alpha-value>)',
        badSoft: 'rgb(var(--c-bad-soft) / <alpha-value>)',
        badLine: 'rgb(var(--c-bad-line) / <alpha-value>)',

        team: 'rgb(var(--c-team) / <alpha-value>)',
        teamSoft: 'rgb(var(--c-team-soft) / <alpha-value>)',
        teamLine: 'rgb(var(--c-team-line) / <alpha-value>)',
      },
    },
  },
  plugins: [],
};
