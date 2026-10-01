import React from 'react';
import type { LucideProps } from 'lucide-react';

/**
 * RinkIcon — Icono vectorial de la pista reglamentaria de patinaje (Pista 2D).
 *
 * Diseñado conforme a las especificaciones exactas del sistema de iconos Lucide:
 * - Cuadrícula de diseño: 24x24 px
 * - Trazo uniforme: strokeWidth 2, strokeLinecap="round", strokeLinejoin="round"
 * - Alineación entera en cuadrícula: sin desenfoques subpíxel
 * - Geometría: Perímetro de pista reglamentaria con bordes redondeados (rx=5),
 *   eje divisorio transversal (x=12) y círculo central de rotación (cx=12, cy=12, r=3).
 *
 * Forma una familia visual perfectamente balanceada junto con `AudioLines` (Estudio)
 * y `Users` (Entrenador).
 */
export const RinkIcon = React.forwardRef<SVGSVGElement, LucideProps>(
  (
    {
      color = 'currentColor',
      size = 24,
      strokeWidth = 2,
      className = '',
      children,
      ...rest
    },
    ref
  ) => {
    return (
      <svg
        ref={ref}
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
        aria-hidden="true"
        {...rest}
      >
        {/* Perímetro reglamentario de la pista (estadio oval con esquinas redondeadas) */}
        <rect width="20" height="16" x="2" y="4" rx="5" />
        {/* Eje transversal divisorio de la pista */}
        <line x1="12" x2="12" y1="4" y2="20" />
        {/* Círculo central reglamentario / rotación de figuras */}
        <circle cx="12" cy="12" r="3" />
        {children}
      </svg>
    );
  }
);

RinkIcon.displayName = 'RinkIcon';

export default RinkIcon;
