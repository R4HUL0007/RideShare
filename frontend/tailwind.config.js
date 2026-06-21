/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // Primary blue - trust, reliability, professionalism
        primary: {
          50: '#eef6ff',
          100: '#d9eaff',
          200: '#bcdcff',
          300: '#8eccff',
          400: '#56acff',
          500: '#2f8afa',
          600: '#1a6cef',
          700: '#1655d9',
          800: '#1947b0',
          900: '#1b3e8a',
          950: '#14275a',
        },
        // Secondary teal - calm, balance, clarity
        secondary: {
          50: '#edfcf9',
          100: '#d2f7f1',
          200: '#a9ede5',
          300: '#75dcd4',
          400: '#41c2bd',
          500: '#25a6a3',
          600: '#1e8589',
          700: '#1d6b70',
          800: '#1d565c',
          900: '#1c494e',
          950: '#0a2c32',
        },
        // Accent green - safety, success, go
        accent: {
          50: '#f0fdf4',
          100: '#dcfce7',
          200: '#bbf7d0',
          300: '#86efac',
          400: '#4ade80',
          500: '#22c55e',
          600: '#16a34a',
          700: '#15803d',
          800: '#166534',
          900: '#14532d',
          950: '#052e16',
        },
        // Warning - caution, attention
        warning: {
          50: '#fffbea',
          100: '#fff3c4',
          200: '#fce588',
          300: '#fadb5f',
          400: '#f7c948',
          500: '#f0b429',
          600: '#de911d',
          700: '#b66a1a',
          800: '#945518',
          900: '#774619',
          950: '#422006',
        },
        // Danger - error, stop
        danger: {
          50: '#fef2f2',
          100: '#fee2e2',
          200: '#fecaca',
          300: '#fca5a5',
          400: '#f87171',
          500: '#ef4444',
          600: '#dc2626',
          700: '#b91c1c',
          800: '#991b1b',
          900: '#7f1d1d',
          950: '#450a0a',
        },
      },
      boxShadow: {
        'card': '0 2px 10px rgba(0, 0, 0, 0.04), 0 1px 4px rgba(0, 0, 0, 0.08)',
        'card-hover': '0 10px 20px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
        'nav': '0 4px 12px rgba(0, 0, 0, 0.1)',
      },
      borderRadius: {
        'card': '0.75rem',
        'button': '0.5rem',
      },
      fontFamily: {
        'sans': ['Inter', 'system-ui', 'sans-serif'],
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      }
    },
  },
  plugins: [],
}

