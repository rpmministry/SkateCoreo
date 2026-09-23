/**
 * TemplateSubtractor — SUSTRACCIÓN MATEMÁTICA de la plantilla impresa.
 *
 * Idea central del rediseño: no preguntar "¿qué círculos hay en la foto?" sino
 * "¿qué tinta NUEVA (roja/azul) aparece sobre una plantilla que YA CONOZCO?".
 *
 * Como la plantilla es acromática, la mera segmentación por croma de Lab ya la
 * elimina. La sustracción por plantilla cumple dos funciones adicionales:
 *   1. Eliminar el "fringe" de color que dejan JPEG/óptica alrededor de las líneas
 *      negras impresas (bordes cromáticos falsos).
 *   2. Impedir que la rejilla, diagonales o el círculo central generen candidatos.
 *
 * Se dilata la máscara impresa conocida (modelo digital) y se RESTA de la máscara
 * de tinta. El radio de protección debe cubrir el desalineado residual de la
 * homografía (~1-4 px en una imagen rectificada de 2000 px).
 */

import { andMask, andNotMask, dilate, orMask } from './ImageOps';

export interface SubtractionResult {
  /** Tinta de color que NO coincide con la plantilla impresa. */
  residual: Uint8Array;
  /** Píxeles de tinta descartados por proximidad a la plantilla. */
  removedByTemplate: number;
  protectionRadiusPx: number;
}

/**
 * Resta la plantilla impresa. `strongInkMask` (croma alto) es OPCIONAL y se
 * reincorpora SIEMPRE: un trazo real de marcador que cruza una línea impresa debe
 * conservarse; solo se elimina el color débil (fringe) pegado a la plantilla.
 */
export function subtractPrintedMask(
  inkMask: Uint8Array,
  printedMask: Uint8Array,
  width: number,
  height: number,
  protectionRadiusPx = 3,
  strongInkMask?: Uint8Array
): SubtractionResult {
  const protection =
    protectionRadiusPx > 0 ? dilate(printedMask, width, height, protectionRadiusPx) : printedMask;

  let residual = andNotMask(inkMask, protection);
  if (strongInkMask) {
    // La tinta fuerte sobrevive aunque cruce la plantilla.
    residual = orMask(residual, andMask(strongInkMask, inkMask));
  }

  let removed = 0;
  for (let i = 0; i < inkMask.length; i++) {
    if (inkMask[i] === 1 && residual[i] === 0) removed++;
  }

  return { residual, removedByTemplate: removed, protectionRadiusPx };
}
