/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,jsx}',
    './components/**/*.{js,jsx}',
    './hooks/**/*.{js,jsx}',
  ],
  theme: {
    extend: {
      colors: {
        navy: {
          50: '#f2f6fb',
          100: '#e3ecf6',
          200: '#c3d7ec',
          300: '#94b8de',
          400: '#5d92cb',
          500: '#3570b2',
          600: '#245894',
          700: '#1c4574',
          800: '#15375d',
          900: '#0f2743',
          950: '#08192e',
        },
        gold: {
          50: '#fdf9ed',
          100: '#faf0d0',
          200: '#f4dfa3',
          300: '#ecc86c',
          400: '#e5ac3f',
          500: '#d48f22',
          600: '#b57118',
          700: '#945318',
          800: '#78411a',
          900: '#633617',
          950: '#3d1d0b',
        },
        ink: {
          DEFAULT: '#0b1524',
          soft: '#475569',
          muted: '#7c8ba1',
        },
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        serif: ['var(--font-serif)', 'ui-serif', 'Georgia', 'serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(15, 39, 67, 0.06), 0 1px 3px rgba(15, 39, 67, 0.10)',
        panel: '0 10px 30px -12px rgba(15, 39, 67, 0.25)',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 160ms ease-out both',
      },
    },
  },
  plugins: [],
};