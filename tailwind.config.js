/** @type {import('tailwindcss').Config} */
import plugin from 'tailwindcss/plugin';

export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    screens: {
      'xs': '320px',          // móvil pequeño
      'sm': '640px',          // móvil grande vertical / plegables / horizontal
      'md': '768px',          // tablet portrait
      'lg': '1024px',         // tablet landscape / laptop
      'xl': '1280px',         // desktop
      '2xl': '1536px',
    },
    extend: {
      fontFamily: {
        sans: [
          '"IBM Plex Sans"',
          'Inter',
          '-apple-system',
          'BlinkMacSystemFont',
          '"SF Pro Display"',
          'sans-serif',
        ],
        display: [
          '"IBM Plex Sans"',
          'Inter',
          '-apple-system',
          'BlinkMacSystemFont',
          'sans-serif',
        ],
        mono: ['"IBM Plex Mono"', '"JetBrains Mono"', 'monospace'],
      },
      colors: {
        // ── Bear-Inspired Dark Minimalist Tokens ──
        canvas: {
          DEFAULT: '#121417',   // Deep refined graphite/slate
          deep: '#0d0f12',
        },
        surface: {
          1: '#181b20',         // Bear layer 01 (Sidebars, Header, Tables)
          2: '#202329',         // Bear layer 02 (Cards, Dialogs)
          3: '#282c34',         // Bear layer 03 (Elevated, Hover)
          hover: 'rgba(255, 255, 255, 0.045)',
          active: 'rgba(255, 255, 255, 0.08)',
        },
        // SkateCoreo Bear-Inspired Accents & Semantic Domains
        ice: {
          DEFAULT: '#2e7cf6',
          primary: '#2e7cf6',
          hover: '#2563eb',
          active: '#1d4ed8',
          light: '#60a5fa',
          muted: 'rgba(46, 124, 246, 0.12)',
        },
        'ice-primary': '#2e7cf6',
        'ice-light': '#60a5fa',
        'coach-rose': '#e11d48',
        'studio-mint': '#0d9488',
        danger: {
          DEFAULT: '#ef4444',
          hover: '#dc2626',
        },
        carbon: {
          blue: '#2e7cf6',
          'blue-hover': '#2563eb',
          'blue-active': '#1d4ed8',
          'blue-light': '#60a5fa',
          'blue-muted': 'rgba(46, 124, 246, 0.12)',
        },
        // Functional / Semantic
        support: {
          success: '#10b981',
          warning: '#f59e0b',
          error: '#ef4444',
          info: '#3b82f6',
        },
        // Mapeo retrocompatible refinado
        cobalt: {
          DEFAULT: '#2e7cf6',
          hover: '#2563eb',
          light: '#60a5fa',
          muted: 'rgba(46, 124, 246, 0.12)',
          '400': '#60a5fa',
          '500': '#2e7cf6',
          '600': '#2563eb',
          'pro': '#2e7cf6',
        },
        cyan: {
          DEFAULT: '#2e7cf6',
          hover: '#2563eb',
          light: '#60a5fa',
          glow: 'rgba(46, 124, 246, 0.15)',
        },
        mint: {
          DEFAULT: '#0d9488',   // Studio Mint
          hover: '#0f766e',
          light: '#2dd4bf',
          glow: 'rgba(13, 148, 136, 0.15)',
          'laser': '#0d9488',
          '400': '#2dd4bf',
        },
        coral: {
          DEFAULT: '#e11d48',   // Coach Rose
          hover: '#be123c',
          light: '#fb7185',
          glow: 'rgba(225, 29, 72, 0.15)',
          'flame': '#e11d48',
          '400': '#fb7185',
          '500': '#e11d48',
        },
        neon: {
          canvas: '#121417',
          surface: '#181b20',
          card: '#202329',
          hover: '#282c34',
          active: 'rgba(255, 255, 255, 0.08)',
          glass: 'rgba(24, 27, 32, 0.94)',
        },
        border: {
          subtle: 'rgba(255, 255, 255, 0.065)',
          medium: 'rgba(255, 255, 255, 0.11)',
          strong: 'rgba(255, 255, 255, 0.18)',
          interactive: '#2e7cf6',
        },
        text: {
          primary: '#F7F8F9',   // Bear Text Primary (alto contraste)
          secondary: '#9CA3AF', // Bear Text Secondary
          helper: '#6B7280',    // Bear Text Helper
          disabled: '#4B5563',  // Bear Text Disabled
        },
      },
      spacing: {
        touch: '48px',
      },
      minWidth: {
        touch: '48px',
      },
      minHeight: {
        touch: '48px',
      },
      borderRadius: {
        xs: '4px',
        sm: '6px',
        md: '8px',
        lg: '12px',
        xl: '16px',
        '2xl': '20px',
        '3xl': '24px',
        card: '12px',
        subtle: '8px',
        sheet: '20px',
      },
      boxShadow: {
        'elevation-1': '0 1px 3px 0 rgba(0, 0, 0, 0.25), 0 1px 2px -1px rgba(0, 0, 0, 0.25)',
        'elevation-2': '0 4px 12px 0 rgba(0, 0, 0, 0.35), 0 2px 4px -1px rgba(0, 0, 0, 0.25)',
        'elevation-3': '0 12px 28px 0 rgba(0, 0, 0, 0.45), 0 4px 8px -2px rgba(0, 0, 0, 0.35)',
        'soft-elevation': '0 2px 8px 0 rgba(0, 0, 0, 0.25)',
        'glass-hud': '0 4px 16px 0 rgba(0, 0, 0, 0.35)',
        // Sombras suaves sin halos fluorescentes
        'glow-coral': '0 2px 8px 0 rgba(225, 29, 72, 0.2)',
        'glow-cyan': '0 2px 8px 0 rgba(46, 124, 246, 0.2)',
        'glow-mint': '0 2px 8px 0 rgba(13, 148, 136, 0.2)',
        'glow-cobalt': '0 2px 8px 0 rgba(46, 124, 246, 0.2)',
        'accent-glow': '0 2px 8px 0 rgba(46, 124, 246, 0.2)',
      },
      transitionTimingFunction: {
        spring: 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
      transitionDuration: {
        ui: '150ms',
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'scale-in': {
          '0%': { opacity: '0', transform: 'scale(0.98)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 150ms ease-out both',
        'scale-in': 'scale-in 150ms cubic-bezier(0.16, 1, 0.3, 1) both',
      },
    },
  },
  plugins: [
    plugin(({ addVariant }) => {
      addVariant('landscape', '@media (orientation: landscape)');
      addVariant('portrait', '@media (orientation: portrait)');
      addVariant('touch', '@media (hover: none) and (pointer: coarse)');
      addVariant('stylus', '@media (hover: none) and (pointer: fine)');
    }),
  ],
}
