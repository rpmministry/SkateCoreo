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

/**
 * Umbral de bloqueo de landscape. Se aplica SOLO a teléfonos y tablets
 * pequeñas (lado corto < 768). Tablets con lado corto ≥ 768 y escritorio no se
 * bloquean, porque su diseño sí admite ambas orientaciones.
 */
export const PHONE_LANDSCAPE_LOCK_MAX = 768;

export interface OrientationSnapshot {
  width: number;
  height: number;
  /** true si el puntero principal es grueso (dedo/táctil). */
  coarsePointer: boolean;
  /**
   * Orientación FÍSICA real. Se prefiere `screen.orientation.type` (fiable con
   * el teclado abierto); `matchMedia('(orientation: landscape)')` queda como
   * respaldo. Si se omite, se cae al aspecto (útil en tests).
   */
  landscape?: boolean;
  /**
   * true si hay un campo de texto enfocado (input/textarea/select/contenteditable).
   * Con el teclado abierto NUNCA debe mostrarse la pantalla de rotación: el
   * usuario está editando y perder el foco destruiría su trabajo.
   */
  editableFocused?: boolean;
  /**
   * true si se detecta el teclado virtual abierto (viewport reducido respecto a
   * la altura estable). Evita interpretar el `resize` del teclado como un giro.
   */
  keyboardOpen?: boolean;
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
  const { width, height, coarsePointer, landscape, editableFocused } = snapshot;
  if (!coarsePointer) return false;
  if (width <= 0 || height <= 0) return false;

  // ESTABILIDAD CON TECLADO: mientras se edita texto (input/textarea/select)
  // la app NUNCA se bloquea; el teclado virtual reduce el viewport y no debe
  // interpretarse como un giro. (El estado del teclado NO se usa para permitir
  // landscape: eso impedía bloquear el giro real, porque al rotar el alto cae.)
  if (editableFocused) return false;

  const isLandscape = landscape ?? !isPortrait(width, height);
  const isPhoneOrSmallTablet = Math.min(width, height) < PHONE_LANDSCAPE_LOCK_MAX;
  return isPhoneOrSmallTablet && isLandscape;
}

/** Modo de orientación resultante (útil para tests y para el gate). */
export function getOrientationMode(snapshot: OrientationSnapshot): OrientationMode {
  if (shouldShowRotateScreen(snapshot)) return 'rotate';
  if (isPhoneOrTabletViewport(snapshot.width, snapshot.height)) return 'portrait';
  return 'app';
}
