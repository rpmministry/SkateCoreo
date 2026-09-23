/**
 * orientation.ts — Lógica ÚNICA de orientación (OrientationGuard).
 *
 * Regla de producto SkateCoreo: en teléfonos/tablets (dispositivo táctil, viewport
 * pequeño) la app solo se usa en horizontal. En vertical se muestra una pantalla
 * "Gira tu dispositivo". En escritorio nunca se bloquea, aunque la ventana sea
 * estrecha, porque no hay rotación posible y el usuario puede redimensionar.
 *
 * Es una función PURA para poder probarla sin DOM.
 */

export const SMALL_VIEWPORT_MAX = 1024;

export interface OrientationSnapshot {
  width: number;
  height: number;
  /** true si el puntero principal es grueso (dedo/táctil). */
  coarsePointer: boolean;
}

export type OrientationMode = 'app' | 'rotate' | 'landscape';

/** ¿La ventana está en vertical (más alta que ancha)? */
export function isPortrait(width: number, height: number): boolean {
  return height > width;
}

/** ¿Es un viewport de teléfono/tablet (ancho < 1024 px, breakpoint `lg`)? */
export function isSmallViewport(width: number, height: number): boolean {
  void height;
  return width < SMALL_VIEWPORT_MAX;
}

/**
 * Decide si debe mostrarse la pantalla "Gira tu dispositivo" en lugar de la app.
 * Solo bloquea en táctil + viewport pequeño + vertical.
 */
export function shouldShowRotateScreen(snapshot: OrientationSnapshot): boolean {
  const { width, height, coarsePointer } = snapshot;
  if (!coarsePointer) return false;
  if (width <= 0 || height <= 0) return false;
  return isSmallViewport(width, height) && isPortrait(width, height);
}

/** Modo de orientación resultante (útil para tests y para el gate). */
export function getOrientationMode(snapshot: OrientationSnapshot): OrientationMode {
  if (shouldShowRotateScreen(snapshot)) return 'rotate';
  if (isSmallViewport(snapshot.width, snapshot.height)) return 'landscape';
  return 'app';
}
