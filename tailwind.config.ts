import type { Config } from 'tailwindcss';
import animate from 'tailwindcss-animate';

export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        accent: {
          DEFAULT: '#FFB800',
          foreground: '#000000',
        },
        danger: {
          DEFAULT: '#E63946',
          foreground: '#FFFFFF',
        },
        success: {
          DEFAULT: '#2D6A4F',
          foreground: '#FFFFFF',
        },
        muted: {
          DEFAULT: '#F4F4F4',
          foreground: '#6B7280',
        },
      },
      fontFamily: {
        display: ['"Archivo Black"', 'system-ui', 'sans-serif'],
        sans: ['"Space Grotesk"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      borderRadius: { DEFAULT: '0' },
      boxShadow: {
        brutal: '4px 4px 0 #000',
        'brutal-sm': '2px 2px 0 #000',
        'brutal-lg': '6px 6px 0 #000',
        'brutal-inset': 'inset 2px 2px 0 #000',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
    },
  },
  plugins: [animate],
} satisfies Config;
