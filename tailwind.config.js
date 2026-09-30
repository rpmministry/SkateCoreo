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
        // ── Carbon Design System Dark Theme Tokens (Gray 100/90) ──
        canvas: {
          DEFAULT: '#12161f',   // Base Carbon dark slate
          deep: '#0d1117',
        },
        surface: {
          1: '#1a2130',         // Carbon Layer 01 (Sidebars, Header, Tables)
          2: '#222b3d',         // Carbon Layer 02 (Cards, Dialogs)
          3: '#2c374d',         // Carbon Layer 03 (Elevated, Hover)
          hover: '#273247',
          active: '#313e57',
        },
        // IBM Blue 60 Primary (Authoritative, precise, zero neon glare)
        carbon: {
          blue: '#0f62fe',
          'blue-hover': '#0353e9',
          'blue-active': '#002d9c',
          'blue-light': '#78a9ff',
          'blue-muted': 'rgba(15, 98, 254, 0.12)',
        },
        // Functional / Semantic
        support: {
          success: '#24a148',
          warning: '#f1c21b',
          error: '#da1e28',
          info: '#4589ff',
        },
        // Mapeo retrocompatible refinado a tokens Carbon
        cobalt: {
          DEFAULT: '#0f62fe',   // IBM Blue 60
          hover: '#0353e9',     // IBM Blue 70
          light: '#78a9ff',     // IBM Blue 40 (readable text)
          muted: 'rgba(15, 98, 254, 0.12)',
          '400': '#78a9ff',
          '500': '#0f62fe',
          '600': '#0353e9',
          'pro': '#0f62fe',
        },
        cyan: {
          DEFAULT: '#0f62fe',   // Reemplaza el cian neón agresivo por IBM Blue 60
          hover: '#0353e9',
          light: '#78a9ff',
          glow: 'rgba(15, 98, 254, 0.2)',
        },
        mint: {
          DEFAULT: '#009d9a',   // Carbon Teal 50 deportivo controlado
          hover: '#007d79',
          light: '#3ddbd9',
          glow: 'rgba(0, 157, 154, 0.2)',
          'laser': '#009d9a',
          '400': '#3ddbd9',
        },
        coral: {
          DEFAULT: '#ee5396',   // Carbon Magenta 50 profesional (Panel de Entrenador)
          hover: '#d12771',
          light: '#ff7eb6',
          glow: 'rgba(238, 83, 150, 0.2)',
          'flame': '#ee5396',
          '400': '#ff7eb6',
          '500': '#ee5396',
        },
        neon: {
          canvas: '#12161f',
          surface: '#1a2130',
          card: '#222b3d',
          hover: '#273247',
          active: '#313e57',
          glass: 'rgba(26, 33, 48, 0.92)',
        },
        border: {
          subtle: 'rgba(255, 255, 255, 0.08)',
          medium: 'rgba(255, 255, 255, 0.14)',
          strong: 'rgba(255, 255, 255, 0.22)',
          interactive: '#0f62fe',
        },
        text: {
          primary: '#F4F4F4',   // Carbon Text Primary (alto contraste)
          secondary: '#C6C6C6', // Carbon Text Secondary
          helper: '#8D8D8D',    // Carbon Text Helper
          disabled: '#525252',  // Carbon Text Disabled
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
        'elevation-1': '0 2px 4px 0 rgba(0, 0, 0, 0.35), 0 1px 2px 0 rgba(0, 0, 0, 0.25)',
        'elevation-2': '0 4px 12px 0 rgba(0, 0, 0, 0.45), 0 2px 4px 0 rgba(0, 0, 0, 0.35)',
        'elevation-3': '0 12px 32px 0 rgba(0, 0, 0, 0.6), 0 4px 8px 0 rgba(0, 0, 0, 0.4)',
        'soft-elevation': '0 4px 16px 0 rgba(0, 0, 0, 0.45)',
        'glass-hud': '0 4px 16px 0 rgba(0, 0, 0, 0.5)',
        // Se reemplazan los halos neón difusos por bordes sutiles y sombras nítidas
        'glow-coral': '0 2px 8px 0 rgba(238, 83, 150, 0.25)',
        'glow-cyan': '0 2px 8px 0 rgba(15, 98, 254, 0.25)',
        'glow-mint': '0 2px 8px 0 rgba(0, 157, 154, 0.25)',
        'glow-cobalt': '0 2px 8px 0 rgba(15, 98, 254, 0.25)',
        'accent-glow': '0 2px 8px 0 rgba(15, 98, 254, 0.25)',
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
