/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{html,js,svelte,ts}'],
  theme: {
    extend: {
      colors: {
        orange: {
          50: '#fffbf5',
          100: '#fff1e6',
          200: '#ffe4cc',
          300: '#ffd6a3',
          400: '#ffbc80',
          500: '#ff9a50',
          600: '#fb7d26',
          700: '#ea6005',
          800: '#c2410c',
          900: '#9a3412',
          950: '#431407',
        },
        gray: {
          50: '#f9fafb',
          100: '#f3f4f6',
          200: '#e5e7eb',
          300: '#d1d5db',
          400: '#9ca3af',
          500: '#6b7280',
          600: '#4b5563',
          700: '#374151',
          800: '#1f2937',
          900: '#111827',
          950: '#030712',
        }
      }
    },
  },
  plugins: [],
};