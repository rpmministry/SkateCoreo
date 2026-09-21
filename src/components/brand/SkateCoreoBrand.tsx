import React from 'react';

export type BrandSize = 'sm' | 'md' | 'lg' | 'xl';

interface SkateCoreoBrandProps {
  className?: string;
  /**
   * Escala del lockup completo (isotipo + wordmark). Todas las tallas
   * garantizan legibilidad y jerarquía en portrait y landscape.
   */
  size?: BrandSize;
  /** Muestra el descriptor de producto bajo el wordmark. */
  showTagline?: boolean;
  /** Apila el wordmark bajo el isotipo (ideal para sidebars estrechas). */
  stacked?: boolean;
  /**
   * Renderiza únicamente el isotipo. Se usa en rieles de navegación muy
   * estrechos; el lockup completo con tipografía vive en el header y el Hero.
   */
  markOnly?: boolean;
}

const SCALE: Record<
  BrandSize,
  { mark: string; word: string; tagline: string; gap: string; stroke: number }
> = {
  sm: { mark: 'h-7 w-7', word: 'text-[13px]', tagline: 'text-[6px] tracking-[0.2em]', gap: 'gap-2', stroke: 6 },
  md: { mark: 'h-8 w-8', word: 'text-[17px]', tagline: 'text-[7px] tracking-[0.2em]', gap: 'gap-2.5', stroke: 6 },
  lg: { mark: 'h-11 w-11', word: 'text-2xl', tagline: 'text-[9px] tracking-[0.24em]', gap: 'gap-3', stroke: 5.5 },
  xl: { mark: 'h-14 w-14 sm:h-16 sm:w-16', word: 'text-3xl sm:text-4xl', tagline: 'text-[10px] sm:text-[11px] tracking-[0.28em]', gap: 'gap-3.5', stroke: 5 },
};

/**
 * SkateCoreoBrand — Identidad oficial (Carbon Design System + Apple HIG).
 *
 * Reglas de la marca:
 * - El isotipo NUNCA viaja solo: siempre va acompañado del wordmark
 *   tipográfico "SkateCoreo" para anclar la jerarquía visual.
 * - Se renderiza en SVG puro + tipografía del sistema para eliminar
 *   cualquier 404, parpadeo o dependencia de assets externos.
 * - Escala de forma fluida mediante variantes sin romper el layout.
 */
export const SkateCoreoBrand: React.FC<SkateCoreoBrandProps> = ({
  className = '',
  size = 'md',
  showTagline = true,
  stacked = false,
  markOnly = false,
}) => {
  const s = SCALE[size];

  return (
    <div
      className={[
        'flex select-none items-center shrink-0 min-w-0',
        stacked ? 'flex-col text-center' : 'flex-row',
        s.gap,
        className,
      ].join(' ')}
    >
      {/* Isotipo vectorial con halo de marca */}
      <span className="relative inline-flex items-center justify-center shrink-0">
        <span
          aria-hidden="true"
          className="absolute inset-[-18%] rounded-2xl bg-cyan/12 blur-md"
        />
        <svg
          viewBox="0 0 64 64"
          className={`relative ${s.mark} object-contain`}
          fill="none"
          role="img"
          aria-label="SkateCoreo"
        >
          <title>SkateCoreo</title>
          <path
            d="M47 20 A15 12 0 1 0 32 32 A15 12 0 1 1 17 44"
            fill="none"
            stroke="#FFFFFF"
            strokeWidth={s.stroke}
            strokeLinecap="round"
          />
          <circle cx="47" cy="20" r="6.5" fill="#00D2FF" />
          <circle cx="17" cy="44" r="6.5" fill="#FFFFFF" />
        </svg>
      </span>

      {/* Wordmark tipográfico oficial */}
      {!markOnly && (
      <span className={`flex min-w-0 flex-col ${stacked ? 'items-center' : 'items-start'}`}>
        <span
          className={`font-display font-extrabold leading-none tracking-[-0.02em] ${s.word} whitespace-nowrap`}
        >
          <span className="text-white">Skate</span>
          <span className="text-gradient-brand">Coreo</span>
        </span>
        {showTagline && (
          <span
            className={`mt-1 font-semibold uppercase text-slate-400/90 leading-none whitespace-nowrap ${s.tagline}`}
          >
            Choreography Studio
          </span>
        )}
      </span>
      )}
    </div>
  );
};
