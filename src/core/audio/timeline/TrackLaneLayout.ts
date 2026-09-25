/**
 * TrackLaneLayout — Altura de carril adaptativa al espacio disponible.
 *
 * PROBLEMA QUE RESUELVE
 * --------------------
 * La altura de cada pista se decidía SOLO por el número de pistas
 * (84/72/64/56 px fijos). En consecuencia:
 *  - en móvil vertical, 5 pistas quedaban en 56 px: demasiado pequeñas para tocar;
 *  - en un monitor alto, 2 pistas se quedaban en 84 px: se desaprovechaba espacio.
 *
 * SOLUCIÓN (concepto de AudioMass: `min_track_h`/`max_track_h`, `trackHeight()`)
 * -----------------------------------------------------------------------------
 * La altura se deriva del ALTO REAL disponible y del número de pistas, acotada
 * entre un mínimo táctil y un máximo que evita filas gigantes. Móvil recibe un
 * mínimo mayor (más área táctil); escritorio un máximo más compacto. Si el alto
 * disponible aún no se conoce, se conserva el comportamiento anterior como
 * respaldo, para que el primer render no cambie.
 *
 * Es una función PURA: no toca el DOM ni el modelo de datos.
 */

export interface TrackLaneHeightOptions {
  /** Dispositivo móvil/tablet: mínimos más altos para priorizar el toque. */
  isMobile: boolean;
  /** Espacio reservado (en px) para la regla y los márgenes. Por defecto 56. */
  reservedPx?: number;
}

/**
 * Mínimo táctil / máximo para que las filas no crezcan sin sentido.
 * El mínimo sube respecto a versiones previas porque la cabecera ahora apila
 * NOMBRE (hasta 2 líneas) + fila de controles: identidad de pista siempre legible.
 */
export const TRACK_LANE_BOUNDS = {
  mobile: { min: 64, max: 112 },
  desktop: { min: 56, max: 100 },
} as const;

/**
 * Anchos de cabecera de pista (px), centralizados para no dispersar "números
 * mágicos". Principio de AudioMass: la zona de identidad de pista es una REGIÓN
 * REAL con espacio para el nombre completo y sus controles, no un icono flotante.
 */
export const TRACK_HEADER_WIDTHS = {
  compact: 132, // móvil
  medium: 172, // tablet / ventana media
  wide: 208, // escritorio
} as const;

/**
 * Ancho de cabecera según el ANCHO REAL DISPONIBLE de la pista (no del viewport
 * del navegador): así la cabecera se adapta también si el Studio vive dentro de
 * otro layout. Nunca devuelve un ancho que impida leer el nombre.
 */
export function computeTrackHeaderWidth(availableWidthPx: number): number {
  if (!Number.isFinite(availableWidthPx) || availableWidthPx <= 0) {
    return TRACK_HEADER_WIDTHS.compact;
  }
  if (availableWidthPx < 560) return TRACK_HEADER_WIDTHS.compact;
  if (availableWidthPx < 900) return TRACK_HEADER_WIDTHS.medium;
  return TRACK_HEADER_WIDTHS.wide;
}

/** Altura clásica por número de pistas, usada mientras no hay medida de viewport. */
export function fallbackTrackLaneHeight(trackCount: number): number {
  if (trackCount <= 2) return 84;
  if (trackCount <= 3) return 72;
  if (trackCount <= 4) return 64;
  return 56;
}

export function computeTrackLaneHeight(
  availableHeightPx: number,
  trackCount: number,
  options: TrackLaneHeightOptions
): number {
  const count = Math.max(1, Math.floor(trackCount));
  const { min, max } = options.isMobile ? TRACK_LANE_BOUNDS.mobile : TRACK_LANE_BOUNDS.desktop;
  const reserved = options.reservedPx ?? 56;
  const usable = availableHeightPx - reserved;

  if (!Number.isFinite(availableHeightPx) || availableHeightPx <= 0 || usable <= 0) {
    // Sin medida fiable del viewport: comportamiento previo.
    return fallbackTrackLaneHeight(count);
  }

  const ideal = usable / count;
  return Math.round(Math.max(min, Math.min(max, ideal)));
}
