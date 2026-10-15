/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f0f9ff',
          100: '#e0f2fe',
          200: '#bae6fd',
          300: '#7dd3fc',
          400: '#38bdf8',
          500: '#0284c7',
          600: '#0369a1',
          700: '#1d4ed8',
          800: '#1e3a8a',
          900: '#0f223d',
          950: '#071326',
        },
        ocean: {
          950: '#071326',
          900: '#0b1a33',
          850: '#0d1d36',
          800: '#132747',
          700: '#1e3659',
          600: '#284775',
        }
      }
    },
  },
  plugins: [],
}
