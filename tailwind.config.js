/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Space Grotesk"', 'Inter', 'system-ui', '-apple-system', 'sans-serif'],
        display: ['"Space Grotesk"', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      colors: {
        background: {
          DEFAULT: '#000000',
          elevated: '#0c0c0c',
        },
        surface: {
          DEFAULT: 'rgba(255, 255, 255, 0.03)',
          hover: 'rgba(255, 255, 255, 0.06)',
          active: 'rgba(255, 255, 255, 0.09)',
        },
        border: {
          DEFAULT: 'rgba(255, 255, 255, 0.1)',
          hover: 'rgba(204, 255, 0, 0.4)',
        },
        text: {
          primary: '#ebebeb',
          secondary: '#a3a3a3',
          muted: '#737373',
        },
        muted: '#737373',
        brand: {
          lime: '#ccff00',
          emerald: '#10b981',
          dark: '#000000',
        },
        accent: {
          50: '#f5ffd6', 100: '#ecffad', 200: '#e3ff85', 300: '#d9ff5c',
          400: '#d2ff2e', 500: '#ccff00', 600: '#a3cc00', 700: '#7a9900',
          800: '#526600', 900: '#293300',
        },
        success: {
          400: '#34d399',
          500: '#10b981',
          600: '#059669',
        },
        warning: {
          400: '#fbbf24',
          500: '#f59e0b',
          600: '#d97706',
        },
        error: {
          400: '#F08A8A',
          500: '#E86B6B',
          600: '#C94F5A',
        },
      },
      animation: {
        'blob-float': 'blob-float 6s ease-in-out infinite',
        'blob-float-delayed': 'blob-float 8s ease-in-out infinite 1.2s',
        'pulse-ring': 'pulse-ring 2.5s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'orbit': 'orbit 3s linear infinite',
        'wave-bar': 'wave-bar 0.8s ease-in-out infinite',
        'fade-in': 'fade-in 0.3s ease-out',
        'slide-up': 'slide-up 0.3s ease-out',
        'shimmer': 'shimmer 2s linear infinite',
      },
      keyframes: {
        'blob-float': {
          '0%, 100%': { transform: 'translate(0, 0) scale(1)' },
          '33%': { transform: 'translate(8px, -10px) scale(1.04)' },
          '66%': { transform: 'translate(-6px, 5px) scale(0.98)' },
        },
        'pulse-ring': {
          '0%': { transform: 'scale(0.95)', opacity: '0.7' },
          '70%': { transform: 'scale(1.3)', opacity: '0' },
          '100%': { transform: 'scale(0.95)', opacity: '0' },
        },
        'orbit': {
          '0%': { transform: 'rotate(0deg) translateX(48px) rotate(0deg)' },
          '100%': { transform: 'rotate(360deg) translateX(48px) rotate(-360deg)' },
        },
        'wave-bar': {
          '0%, 100%': { transform: 'scaleY(0.3)' },
          '50%': { transform: 'scaleY(1)' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'slide-up': {
          '0%': { opacity: '0', transform: 'translateY(16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'shimmer': {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
    },
  },
  plugins: [],
};
