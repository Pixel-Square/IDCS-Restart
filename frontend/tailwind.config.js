/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}'
  ],
  theme: {
    extend: {
      colors: {
        bg: {
          white: '#ffffff'
        },
        gray: {
          50: '#f9fafb',
          100: '#f3f4f6',
          200: '#e5e7eb',
          300: '#d1d5db',
          400: '#9ca3af',
          500: '#6b7280',
          600: '#4b5563'
        },
        indigo: {
          50: '#eef2ff',
          100: '#e0e7ff',
          600: '#4f46e5'
        },
        emerald: {
          100: '#d1fae5',
          600: '#059669'
        }
      }
    }
  },
  plugins: [],
}
