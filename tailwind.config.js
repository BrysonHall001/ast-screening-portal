/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx}',
    './components/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // Accent palette. The values live as CSS variables in globals.css,
        // set per data-theme (blue = today's exact hexes; allstar = orange).
        // Using variables here means every existing astblue-* class is
        // theme-aware with no per-component changes.
        astblue: {
          50:  'rgb(var(--astblue-50) / <alpha-value>)',
          100: 'rgb(var(--astblue-100) / <alpha-value>)',
          200: 'rgb(var(--astblue-200) / <alpha-value>)',
          300: 'rgb(var(--astblue-300) / <alpha-value>)',
          400: 'rgb(var(--astblue-400) / <alpha-value>)',
          500: 'rgb(var(--astblue-500) / <alpha-value>)',
          600: 'rgb(var(--astblue-600) / <alpha-value>)',
          700: 'rgb(var(--astblue-700) / <alpha-value>)',
          800: 'rgb(var(--astblue-800) / <alpha-value>)',
          900: 'rgb(var(--astblue-900) / <alpha-value>)',
          950: 'rgb(var(--astblue-950) / <alpha-value>)',
        },
        // Friendly names for the same variables, for new code.
        accent: 'rgb(var(--astblue-600) / <alpha-value>)',
        'accent-hover': 'rgb(var(--astblue-700) / <alpha-value>)',
        'accent-soft': 'rgb(var(--astblue-50) / <alpha-value>)',
        canvas: 'rgb(var(--canvas) / <alpha-value>)',
        // Monday.com-style status colors
        status: {
          pending: '#c4c4c4',
          review:  '#fdab3d',
          changes: '#e2445c',
          approved:'#00c875',
        },
      },
      fontFamily: {
        sans: ['system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 3px rgba(15, 23, 42, 0.06), 0 1px 2px rgba(15, 23, 42, 0.04)',
        cardhover: '0 4px 12px rgba(15, 23, 42, 0.08), 0 2px 4px rgba(15, 23, 42, 0.04)',
      },
    },
  },
  plugins: [],
}
