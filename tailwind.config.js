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
      'xs': '320px',          // mobile_portrait: 320px a 479px
      'sm': '480px',          // mobile_landscape: 480px a 767px
      'md': '768px',          // tablet_portrait: 768px a 1023px
      'lg': '1024px',         // tablet_landscape_and_laptop: 1024px a 1279px
      'xl': '1280px',         // desktop_large: 1280px o más
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
        // Geometría oficial de marca (SkateCoreo wordmark & titulares)
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
        // Lienzo profundo Navy / Slate
        neon: {
          canvas: '#0B0F19',       // Fondo más profundo (viewport root)
          surface: '#121826',      // Superficies elevadas base (sidebar / sheet)
          card: '#192234',         // Tarjetas / paneles flotantes / items
          hover: '#222E46',        // Feedback hover sutil
          active: '#2B3B59',       // Estado presionado
          glass: 'rgba(18, 24, 38, 0.85)', // HUD flotante
        },
        // Triada de Neones Funcionales
        coral: {
          DEFAULT: '#FF4C79',
          hover: '#FF3366',
          glow: 'rgba(255, 76, 121, 0.45)',
        },
        cyan: {
          DEFAULT: '#00D2FF',
          hover: '#00B8E6',
          glow: 'rgba(0, 210, 255, 0.45)',
        },
        mint: {
          DEFAULT: '#10F49C',
          hover: '#0DE08E',
          glow: 'rgba(16, 244, 156, 0.45)',
        },
        // Compatibilidad semántica previa
        surface: {
          canvas: '#0B0F19',
          card: '#121826',
          hover: '#192234',
          active: '#222E46',
        },
        border: {
          subtle: 'rgba(255, 255, 255, 0.08)',
          strong: 'rgba(255, 255, 255, 0.16)',
        },
        text: {
          primary: '#FFFFFF',
          secondary: '#94A3B8',
          tertiary: '#64748B',
        },
        accent: {
          DEFAULT: '#00D2FF',
          hover: '#00B8E6',
          contrast: '#0B0F19',
          glow: 'rgba(0, 210, 255, 0.45)',
        }
      },
      // Ergonomía Touch Target (Apple HIG / Android)
      spacing: {
        touch: '48px',
      },
      minWidth: {
        touch: '48px',
      },
      minHeight: {
        touch: '48px',
      },
      // Soft UI Curves
      borderRadius: {
        subtle: '10px',
        card: '16px',
        sheet: '24px',
        '2xl': '16px',
        '3xl': '24px',
      },
      // Resplandor Neón & Sombras de Elevación Profunda
      boxShadow: {
        'soft-elevation': '0 12px 36px -4px rgba(0, 0, 0, 0.65), 0 4px 12px -2px rgba(0, 0, 0, 0.45)',
        'glass-hud': '0 8px 32px 0 rgba(0, 0, 0, 0.5)',
        'glow-coral': '0 0 24px -2px rgba(255, 76, 121, 0.45), 0 4px 12px -2px rgba(255, 76, 121, 0.3)',
        'glow-cyan': '0 0 24px -2px rgba(0, 210, 255, 0.45), 0 4px 12px -2px rgba(0, 210, 255, 0.3)',
        'glow-mint': '0 0 24px -2px rgba(16, 244, 156, 0.45), 0 4px 12px -2px rgba(16, 244, 156, 0.3)',
        'accent-glow': '0 0 24px -2px rgba(0, 210, 255, 0.45)',
      },
      transitionTimingFunction: {
        spring: 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
      transitionDuration: {
        ui: '180ms',
      },
      // Animaciones nativas (sin dependencias externas)
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
        'fade-in': 'fade-in 220ms ease-out both',
        'scale-in': 'scale-in 200ms cubic-bezier(0.16, 1, 0.3, 1) both',
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
