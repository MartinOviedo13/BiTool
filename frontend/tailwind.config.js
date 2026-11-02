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
        // Stitch "Maritime Industrial Intelligence" Design Tokens
        stitch: {
          surface: '#f8f9ff',
          'surface-dim': '#cbdbf5',
          'surface-bright': '#f8f9ff',
          'surface-lowest': '#ffffff',
          'surface-low': '#eff4ff',
          'surface-mid': '#e5eeff',
          'surface-high': '#dce9ff',
          'surface-highest': '#d3e4fe',
          primary: '#0f172a',
          'primary-container': '#131b2e',
          'on-primary': '#ffffff',
          'on-primary-container': '#7c839b',
          secondary: '#006398',
          'secondary-container': '#5bb8fe',
          'secondary-fixed': '#cce5ff',
          'on-secondary': '#ffffff',
          'on-secondary-container': '#00476e',
          tertiary: '#009668',
          'tertiary-container': '#002113',
          'tertiary-fixed': '#6ffbbe',
          'tertiary-fixed-dim': '#4edea3',
          'on-tertiary-container': '#009668',
          outline: '#76777d',
          'outline-variant': '#c6c6cd',
          'on-surface': '#0b1c30',
          'on-surface-variant': '#45464d',
        },
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
        // Neutral Dark/Light surfaces + Official Triton Landing Accent Palette + Stitch Mappings
        triton: {
          navy: '#141820',        // Neutral dark graphite card surface
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
      },
      fontFamily: {
        sans: ['Inter', 'Plus Jakarta Sans', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
      }
    },
  },
  plugins: [],
}
