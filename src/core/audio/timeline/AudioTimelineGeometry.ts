/**
 * AudioTimelineGeometry — Única transformación tiempo ↔ píxeles del editor y del
 * visor de audio.
 *
 * PROBLEMA QUE RESUELVE
 * --------------------
 * Antes, la regla de tiempo, los clips, los nodos de la Pista 2D, el playhead y
 * la guía de snapping calculaban `(tiempo / duración) * ancho` cada uno por su
 * cuenta, con padding y denominadores distintos (unos restaban el radio de los
 * nodos, otros usaban `Math.max(10, dur)`, otros `120000` ms por defecto). Eso
 * producía desalineaciones sutiles y hacía imposible razonar sobre una única
 * escala temporal.
 *
 * Aquí la proyección vive en un solo lugar. Es una función PURA, sin dependencias
 * de React, del DOM ni del motor de audio, de modo que puede testearse en
 * aislamiento y reutilizarse en el Audio Studio y en el visor de la Pista 2D.
 *
 * REFERENCIA TÉCNICA
 * ------------------
 * La filosofía de "una única variable px_por_segundo gobierna toda conversión"
 * está inspirada en AudioMass (multitrack.js, `px_per_sec` + `zoomTo()`),
 * reimplementada en TypeScript para la arquitectura de SkateCoreo. AudioMass es
 * MIT (Copyright 2018-present Pantelis Kalogiros); no se copia código, solo el
 * concepto. No introduce ningún cambio en el modelo de datos ni en el motor.
 *
 * SEMÁNTICA DE UNIDADES
 * ---------------------
 * `durationSec` y el argumento `timeSec` comparten unidad (segundos, salvo en el
 * visor de la Pista 2D, que opera en milisegundos: la igualdad se mantiene
 * siempre que ambos usen la misma). `timeToPx` es una proyección lineal SIN
 * recorte; pasa `clamp = true` para saturar al rango [0, duración], que es lo que
 * necesitan playhead y nodos.
 */

const EPSILON = 1e-6;

export interface AudioTimelineGeometryOptions {
  /** Ancho total en píxeles del área temporal (sin contar el origen externo). */
  contentWidth: number;
  /** Duración total mapeada sobre el ancho útil. Misma unidad que `timeSec`. */
  durationSec: number;
  /** Desplazamiento en píxeles del inicio del contenido (p. ej. ancho de cabecera de pista). */
  originPx?: number;
  /** Padding interno simétrico en píxeles (p. ej. radio de los nodos en la Pista 2D). */
  insetPx?: number;
}

export interface AudioTimelineGeometry {
  readonly contentWidth: number;
  readonly durationSec: number;
  readonly originPx: number;
  readonly insetPx: number;
  /** Ancho de dibujo real en píxeles (`contentWidth - 2 * insetPx`, mínimo 1). */
  readonly usableWidth: number;
  /** Píxeles por unidad de tiempo dentro del área útil. */
  readonly pixelsPerSecond: number;
  /** Unidades de tiempo por píxel dentro del área útil. */
  readonly secondsPerPixel: number;
  /** Proyecta un tiempo a píxeles. Con `clamp`, satura a [0, duración]. */
  timeToPx(timeSec: number, clamp?: boolean): number;
  /** Convierte píxeles a tiempo. Con `clamp`, satura al rango [0, duración]. */
  pxToTime(px: number, clamp?: boolean): number;
  /** Proporción 0..1 de un tiempo sobre la duración (sin recorte). */
  timeToRatio(timeSec: number): number;
  /** Tiempo correspondiente a una proporción de la duración. */
  ratioToTime(ratio: number): number;
  /** Ancho en píxeles que ocupa una duración. */
  durationToPx(durationSec: number): number;
  /** Duración que abarca un ancho en píxeles (inverso de `durationToPx`). */
  pxToDuration(px: number): number;
  /** Satura un tiempo al rango válido [0, duración]. */
  clampTime(timeSec: number): number;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

export function createTimelineGeometry(
  options: AudioTimelineGeometryOptions
): AudioTimelineGeometry {
  const contentWidth = Number.isFinite(options.contentWidth)
    ? Math.max(0, options.contentWidth)
    : 0;

  const durationSec =
    Number.isFinite(options.durationSec) && options.durationSec > 0
      ? options.durationSec
      : EPSILON;

  const originPx = Number.isFinite(options.originPx) ? (options.originPx as number) : 0;

  const insetPx =
    Number.isFinite(options.insetPx) && (options.insetPx as number) > 0
      ? (options.insetPx as number)
      : 0;

  const usableWidth = Math.max(1, contentWidth - insetPx * 2);
  const pixelsPerSecond = usableWidth / durationSec;
  const secondsPerPixel = durationSec / usableWidth;
  const anchorPx = originPx + insetPx;

  const clampTime = (timeSec: number): number => {
    if (!Number.isFinite(timeSec)) return 0;
    if (timeSec <= 0) return 0;
    if (timeSec >= durationSec) return durationSec;
    return timeSec;
  };

  const timeToRatio = (timeSec: number): number =>
    Number.isFinite(timeSec) ? timeSec / durationSec : 0;

  const timeToPx = (timeSec: number, clamp = false): number => {
    if (!Number.isFinite(timeSec)) return anchorPx;
    const ratio = clamp ? clamp01(timeSec / durationSec) : timeSec / durationSec;
    return anchorPx + ratio * usableWidth;
  };

  const pxToTime = (px: number, clamp = false): number => {
    if (!Number.isFinite(px)) return 0;
    const ratio = (px - anchorPx) / usableWidth;
    return (clamp ? clamp01(ratio) : ratio) * durationSec;
  };

  return {
    contentWidth,
    durationSec,
    originPx,
    insetPx,
    usableWidth,
    pixelsPerSecond,
    secondsPerPixel,
    timeToPx,
    pxToTime,
    timeToRatio,
    ratioToTime: (ratio: number) => (Number.isFinite(ratio) ? ratio * durationSec : 0),
    durationToPx: (duration: number) =>
      Number.isFinite(duration) ? (duration / durationSec) * usableWidth : 0,
    pxToDuration: (px: number) =>
      Number.isFinite(px) ? (px / usableWidth) * durationSec : 0,
    clampTime,
  };
}
