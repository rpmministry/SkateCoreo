/**
 * orientation.ts — Lógica ÚNICA de orientación (OrientationGuard).
 *
 * Regla de producto SkateCoreo (portrait-first): en teléfonos/tablets
 * (dispositivo táctil, viewport pequeño) la app se usa EXCLUSIVAMENTE en
 * vertical. Si el dispositivo gira físicamente a horizontal se muestra una
 * pantalla "Gira tu dispositivo" pidiendo volver a vertical. En escritorio
 * nunca se bloquea, aunque la ventana sea estrecha, porque no hay rotación
 * posible y el usuario puede redimensionar.
 *
 * Es una función PURA para poder probarla sin DOM.
 */

export const SMALL_VIEWPORT_MAX = 1024;

export interface OrientationSnapshot {
  width: number;
  height: number;
  /** true si el puntero principal es grueso (dedo/táctil). */
  coarsePointer: boolean;
  /**
   * Orientación FÍSICA real reportada por el navegador
   * (`matchMedia('(orientation: landscape)')`). No se deriva del aspecto
   * `width`/`height` porque el teclado virtual puede encoger el alto del
   * viewport (`interactive-widget=resizes-content`) y falsear el resultado.
   * Si se omite, se cae al aspecto como aproximación (útil en tests).
   */
  landscape?: boolean;
}

export type OrientationMode = 'app' | 'rotate' | 'portrait';

/** ¿La ventana está en vertical (más alta que ancha)? */
export function isPortrait(width: number, height: number): boolean {
  return height > width;
}

/**
 * ¿El dispositivo es un teléfono/tablet? Se decide por el LADO CORTO (< 1024 px,
 * breakpoint `lg`): así un tablet en horizontal (p. ej. 1180 × 820) se reconoce
 * como dispositivo pequeño y se le pide volver a vertical.
 */
export function isPhoneOrTabletViewport(width: number, height: number): boolean {
  return Math.min(width, height) < SMALL_VIEWPORT_MAX;
}

/**
 * Decide si debe mostrarse la pantalla "Gira tu dispositivo" en lugar de la app.
 * Solo bloquea en táctil + teléfono/tablet + horizontal.
 *
 * La experiencia vertical es la ÚNICA soportada en móvil: no existe un layout
 * horizontal alternativo.
 */
export function shouldShowRotateScreen(snapshot: OrientationSnapshot): boolean {
  const { width, height, coarsePointer, landscape } = snapshot;
  if (!coarsePointer) return false;
  if (width <= 0 || height <= 0) return false;
  const isLandscape = landscape ?? !isPortrait(width, height);
  return isPhoneOrTabletViewport(width, height) && isLandscape;
}

/** Modo de orientación resultante (útil para tests y para el gate). */
export function getOrientationMode(snapshot: OrientationSnapshot): OrientationMode {
  if (shouldShowRotateScreen(snapshot)) return 'rotate';
  if (isPhoneOrTabletViewport(snapshot.width, snapshot.height)) return 'portrait';
  return 'app';
}
