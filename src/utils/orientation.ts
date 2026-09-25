/**
 * orientation.ts — Lógica ÚNICA de orientación (OrientationGuard).
 *
 * Regla de producto SkateCoreo:
 *  - TELÉFONO: portrait-first. Si gira a horizontal se muestra «Gira tu
 *    dispositivo» y se pide volver a vertical.
 *  - TABLET ≥7": admite AMBAS orientaciones. Nunca se bloquea: en horizontal
 *    usa la composición de escritorio y en vertical una variante compacta de la
 *    misma arquitectura.
 *  - ESCRITORIO (puntero fino): nunca se bloquea, aunque la ventana sea estrecha.
 *
 * FUENTE ÚNICA DE VERDAD: para no divergir del layout, la decisión de bloqueo
 * usa la MISMA clasificación de capacidades (`classifyFormFactor`) que decide
 * `data-form-factor`. Cuando el snapshot no aporta `formFactor` (tests puros),
 * se cae al criterio por lado corto (< 600 px). Es una función PURA.
 */

import {
  TABLET_MIN_LONG_SIDE,
  TABLET_MIN_SHORT_SIDE,
  type FormFactor,
} from './deviceFormFactor';

export const SMALL_VIEWPORT_MAX = 1024;

export interface OrientationSnapshot {
  width: number;
  height: number;
  /** true si el puntero principal es grueso (dedo/táctil). */
  coarsePointer: boolean;
  /**
   * Clasificación de dispositivo (teléfono/tablet/escritorio). Si se aporta,
   * manda sobre el criterio por dimensiones para que el bloqueo de rotación
   * coincida EXACTAMENTE con la composición que se muestra.
   */
  formFactor?: FormFactor;
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
 * ¿Es un viewport de TELÉFONO? Se decide por el LADO CORTO (< 600 px, umbral de
 * tablet de 7"): así una tablet 1024×600 no se confunde con un teléfono.
 */
export function isPhoneViewport(width: number, height: number): boolean {
  return Math.min(width, height) < TABLET_MIN_SHORT_SIDE;
}

/**
 * ¿Es una tablet real (7"+, lado corto ≥ 600 px y lado largo suficiente)?
 * Comparte los umbrales con `deviceFormFactor` para no derivar.
 */
export function isTabletViewport(width: number, height: number): boolean {
  return (
    Math.min(width, height) >= TABLET_MIN_SHORT_SIDE &&
    Math.max(width, height) >= TABLET_MIN_LONG_SIDE
  );
}

/**
 * ¿El dispositivo es un teléfono o tablet pequeña? Se conserva por
 * compatibilidad; el umbral es el lado corto < 1024 (`lg`).
 */
export function isPhoneOrTabletViewport(width: number, height: number): boolean {
  return Math.min(width, height) < SMALL_VIEWPORT_MAX;
}

/**
 * Decide si debe mostrarse la pantalla «Gira tu dispositivo» en lugar de la app.
 * Solo bloquea en TELÉFONO + táctil + horizontal. Las tablets ≥7" admiten
 * horizontal (composición de escritorio) y nunca se bloquean.
 */
export function shouldShowRotateScreen(snapshot: OrientationSnapshot): boolean {
  const { width, height, coarsePointer, landscape, editableFocused, formFactor } = snapshot;
  if (!coarsePointer) return false;
  if (width <= 0 || height <= 0) return false;

  // ESTABILIDAD CON TECLADO: mientras se edita texto (input/textarea/select)
  // la app NUNCA se bloquea; el teclado virtual reduce el viewport y no debe
  // interpretarse como un giro.
  if (editableFocused) return false;

  const isLandscape = landscape ?? !isPortrait(width, height);
  if (!isLandscape) return false;

  // Misma fuente de verdad que el layout: solo el teléfono se bloquea.
  if (formFactor) return formFactor === 'phone';
  return isPhoneViewport(width, height);
}

/** Modo de orientación resultante (útil para tests y para el gate). */
export function getOrientationMode(snapshot: OrientationSnapshot): OrientationMode {
  if (shouldShowRotateScreen(snapshot)) return 'rotate';
  if (snapshot.formFactor) return snapshot.formFactor === 'phone' ? 'portrait' : 'app';
  return isPhoneViewport(snapshot.width, snapshot.height) ? 'portrait' : 'app';
}
