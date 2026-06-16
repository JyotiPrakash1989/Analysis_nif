/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        nox: {
          bg: '#0b0f14',
          surface: '#121826',
          line: '#1e293b',
          accent: '#22d3ee',
          up: '#22c55e',
          down: '#ef4444',
          muted: '#94a3b8',
        },
      },
    },
  },
  plugins: [],
};
