/**
 * cameraBounds.ts — Matemática PURA de límites de la cámara virtual de la Pista 2D.
 *
 * Evita que el usuario "pierda" la pista al hacer pan/zoom: si el contenido cabe en
 * el viewport se centra; si no, se exige que quede al menos `margin` px visibles.
 * No depende de React para poder probarse de forma aislada.
 */

export interface CameraState {
  /** Traslación horizontal en píxeles CSS. */
  x: number;
  /** Traslación vertical en píxeles CSS. */
  y: number;
  /** Escala (1.0 = 100%). */
  zoom: number;
}

/**
 * Geometría estática de la pista dentro del lienzo (a zoom 1), calculada por
 * `RinkMath.calculateViewportMetrics`.
 */
export interface CameraBounds {
  rectW: number;
  rectH: number;
  offsetX: number;
  offsetY: number;
  renderedW: number;
  renderedH: number;
}

/** Mantiene la pista visible/centrada según el zoom actual. */
export function clampCamera(
  camera: CameraState,
  bounds: CameraBounds,
  margin = 48
): CameraState {
  const { zoom } = camera;
  const contentW = bounds.renderedW * zoom;
  const contentH = bounds.renderedH * zoom;

  let x: number;
  if (contentW <= bounds.rectW - margin * 2) {
    // Cabe a lo ancho: centrar.
    x = (bounds.rectW - contentW) / 2 - bounds.offsetX * zoom;
  } else {
    const minX = margin - (bounds.offsetX + bounds.renderedW) * zoom;
    const maxX = bounds.rectW - margin - bounds.offsetX * zoom;
    x = Math.min(maxX, Math.max(minX, camera.x));
  }

  let y: number;
  if (contentH <= bounds.rectH - margin * 2) {
    y = (bounds.rectH - contentH) / 2 - bounds.offsetY * zoom;
  } else {
    const minY = margin - (bounds.offsetY + bounds.renderedH) * zoom;
    const maxY = bounds.rectH - margin - bounds.offsetY * zoom;
    y = Math.min(maxY, Math.max(minY, camera.y));
  }

  return { x, y, zoom };
}
