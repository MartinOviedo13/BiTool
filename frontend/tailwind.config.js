/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f0fdfa',
          100: '#ccfbf1',
          200: '#99f6e4',
          300: '#6fd3c5',
          400: '#48c0b0',
          500: '#108080',
          600: '#007888',
          700: '#005a68',
          800: '#003858',
          900: '#082048',
          950: '#041633',
        },
        ocean: {
          950: '#0b0d12',
          900: '#141820',
          850: '#181c26',
          800: '#1d222d',
          700: '#262c38',
          600: '#343c4c',
        },
        // Neutral Dark/Light surfaces + Official Triton Landing Accent Palette
        triton: {
          navy: '#141820',        // Neutral dark graphite card surface (white in light mode)
          'navy-dark': '#080a0e', // Deep obsidian footer surface
          deep: '#1d222d',        // Neutral secondary charcoal surface
          mid: '#007888',         // Landing petrol blue accent
          teal: '#108080',        // Landing deep industrial teal accent
          'teal-light': '#18a0a0',// Hover teal
          aqua: '#48c0b0',        // Landing main CTA button & highlight accent
          'aqua-hover': '#6fd3c5',// Hover aqua
          'aqua-light': '#d5ecee',// Light aqua tint
          slate: '#2a313d',       // Neutral dark borders
          'slate-dark': '#1b2029',// Subtle dark dividers
          mist: '#f4f6f9',        // Light mode background
          ink: '#082048',         // Landing deep navy ink for high-contrast text on aqua
        }
      }
    },
  },
  plugins: [],
}
