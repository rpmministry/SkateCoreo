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
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      colors: {
        // Nueva Identidad «Obsidian Precision Tech»
        obsidian: {
          deep: '#070A10',    // Lienzo más profundo
          surface: '#0D131F', // Capa 1: Paneles y sidebars
          card: '#131B2B',    // Capa 2: Tarjetas y listas
          raised: '#1A2438',  // Capa 3: Tarjetas activas / Modales
          hover: '#22304A',   // Estado hover
          active: '#2A3C5C',  // Estado presionado
        },
        cobalt: {
          DEFAULT: '#0072FF',
          hover: '#005ECC',
          light: '#338EFF',
          muted: 'rgba(0, 114, 255, 0.15)',
          glow: 'rgba(0, 114, 255, 0.35)',
        },

        // Mapeo retrocompatible refinado
        neon: {
          canvas: '#070A10',       // Obsidian Deep
          surface: '#0D131F',      // Titanium Slate L1
          card: '#131B2B',         // Titanium Slate L2
          hover: '#22304A',
          active: '#2A3C5C',
          glass: 'rgba(13, 19, 31, 0.85)',
        },
        coral: {
          DEFAULT: '#FF3366',      // Coral Flame deportivo
          hover: '#E61E52',
          glow: 'rgba(255, 51, 102, 0.35)',
        },
        cyan: {
          DEFAULT: '#0072FF',      // Cobalt Pro precisión
          hover: '#005ECC',
          glow: 'rgba(0, 114, 255, 0.35)',
        },
        mint: {
          DEFAULT: '#00E599',      // Laser Mint deportivo
          hover: '#00C782',
          glow: 'rgba(0, 229, 153, 0.35)',
        },
        surface: {
          canvas: '#070A10',
          card: '#0D131F',
          hover: '#131B2B',
          active: '#22304A',
        },
        border: {
          subtle: 'rgba(255, 255, 255, 0.08)',
          medium: 'rgba(255, 255, 255, 0.14)',
          strong: 'rgba(255, 255, 255, 0.22)',
        },
        text: {
          primary: '#F8FAFC',
          secondary: '#94A3B8',
          tertiary: '#64748B',
        },
        accent: {
          DEFAULT: '#0072FF',
          hover: '#005ECC',
          contrast: '#FFFFFF',
          glow: 'rgba(0, 114, 255, 0.35)',
        }
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
        xs: '6px',
        sm: '8px',
        md: '12px',
        lg: '16px',
        xl: '20px',
        '2xl': '24px',
        '3xl': '28px',
        subtle: '10px',
        card: '16px',
        sheet: '24px',
      },
      boxShadow: {
        'elevation-1': '0 2px 8px -1px rgba(0, 0, 0, 0.5), 0 1px 3px -1px rgba(0, 0, 0, 0.4)',
        'elevation-2': '0 8px 24px -4px rgba(0, 0, 0, 0.65), 0 3px 8px -2px rgba(0, 0, 0, 0.5)',
        'elevation-3': '0 16px 48px -8px rgba(0, 0, 0, 0.8), 0 6px 16px -4px rgba(0, 0, 0, 0.6)',
        'soft-elevation': '0 16px 40px -4px rgba(0, 0, 0, 0.7), 0 4px 12px -2px rgba(0, 0, 0, 0.5)',
        'glass-hud': '0 8px 32px 0 rgba(0, 0, 0, 0.6)',
        'glow-coral': '0 0 24px -2px rgba(255, 51, 102, 0.35), 0 4px 12px -2px rgba(255, 51, 102, 0.2)',
        'glow-cyan': '0 0 24px -2px rgba(0, 114, 255, 0.35), 0 4px 12px -2px rgba(0, 114, 255, 0.2)',
        'glow-mint': '0 0 24px -2px rgba(0, 229, 153, 0.35), 0 4px 12px -2px rgba(0, 229, 153, 0.2)',
        'glow-cobalt': '0 0 24px -2px rgba(0, 114, 255, 0.35), 0 4px 12px -2px rgba(0, 114, 255, 0.2)',
        'accent-glow': '0 0 24px -2px rgba(0, 114, 255, 0.35)',
      },
      transitionTimingFunction: {
        spring: 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
      transitionDuration: {
        ui: '180ms',
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'scale-in': {
          '0%': { opacity: '0', transform: 'scale(0.97)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        'glow-pulse': {
          '0%, 100%': { opacity: '0.55' },
          '50%': { opacity: '1' },
        },
      },
      animation: {
        'fade-in': 'fade-in 200ms ease-out both',
        'scale-in': 'scale-in 180ms cubic-bezier(0.16, 1, 0.3, 1) both',
        'glow-pulse': 'glow-pulse 3.2s ease-in-out infinite',
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

