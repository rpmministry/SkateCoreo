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
 *
 * AUTORIDAD TEMPORAL ÚNICA
 * ------------------------
 * Además de la proyección, esta geometría expone la REGLA ADAPTATIVA
 * (`rulerStep()` + `computeRulerStep`), la ventana visible (`visibleRange()`), el
 * formateo de etiquetas (`formatTimelineTime`) y la tolerancia de snap en píxeles
 * (`snapToleranceSec`). Regla, waveform, playhead, markers, nodos, clips, split,
 * selección, zoom, scroll y snap consumen esta única relación segundos ↔ píxeles.
 * El zoom solo cambia `pixelsPerSecond`; NUNCA el significado temporal de un
 * punto. Los tiempos internos son números de doble precisión (sin redondeo a
 * milisegundos): el redondeo existe solo al etiquetar o al alinear a muestra.
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
  /** Alias canónico de `timeToPx`. */
  timeToPixel(timeSec: number, clamp?: boolean): number;
  /** Alias canónico de `pxToTime`. */
  pixelToTime(px: number, clamp?: boolean): number;
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
  /**
   * Escala temporal de la regla (paso mayor/menor) derivada de `pixelsPerSecond`.
   * Es la MISMA autoridad que gobierna la proyección: no hay pasos fijos.
   */
  rulerStep(minPx?: number): RulerStep;
  /** Tramo de tiempo visible dados `scrollLeft` y ancho del viewport (px). */
  visibleRange(
    scrollLeftPx: number,
    viewportWidthPx: number
  ): { startPx: number; endPx: number; startSec: number; endSec: number };
  /** Convierte una tolerancia en píxeles a segundos con la escala actual. */
  snapToleranceSec(px: number): number;
}

/** Escala temporal adaptativa de la regla (sin pasos fijos por zoom). */
export interface RulerStep {
  /** Separación temporal entre marcas mayores (segundos). */
  majorStepSec: number;
  /** Separación temporal entre marcas menores (0 = sin subdivisiones). */
  minorStepSec: number;
  /** Número de subdivisiones menores por tramo mayor (1 = sin menores). */
  subdivisions: number;
  /** Decimales necesarios para etiquetar el paso actual sin ruido visual. */
  labelDecimals: number;
}

/** Una marca de la regla. `timeSec` es tiempo REAL, nunca una coordenada. */
export interface RulerTick {
  timeSec: number;
  isMajor: boolean;
}

/**
 * Distancia visual mínima entre marcas mayores. Inspirado en AudioMass
 * (`timelineRuler()`): se busca que las marcas no queden ni apiñadas ni
 * desperdigadas. Con la progresión 1-2-5 la separación real resultante queda
 * aproximadamente en 60–160 px.
 */
export const RULER_MIN_MAJOR_PX = 60;
/** Distancia mínima entre marcas menores para que aporten precisión útil. */
export const RULER_MIN_MINOR_PX = 7;

/**
 * Escala temporal natural 1-2-5 (con valores sexagesimales para segundos y
 * minutos). Nunca se elige un paso arbitrario: siempre cae en esta escalera.
 */
export const RULER_STEPS_SEC: readonly number[] = [
  0.0005, 0.001, 0.002, 0.005,
  0.01, 0.02, 0.05,
  0.1, 0.2, 0.5,
  1, 2, 5, 10, 15, 20, 30,
  60, 120, 300,
  600, 900, 1200, 1800, 3600,
  7200, 10800, 18000, 36000, 72000,
];

/** Decimales de etiqueta necesarios para representar `stepSec` sin ambigüedad. */
export function decimalsForStep(stepSec: number): number {
  if (!Number.isFinite(stepSec) || stepSec <= 0) return 0;
  const decimals = Math.ceil(-Math.log10(stepSec) - 1e-9);
  return Math.max(0, Math.min(4, decimals));
}

/**
 * Elige el paso temporal mayor cuyo tamaño visual sea >= `minPx`. A mayor zoom
 * (más px/s) el paso cae a escalas menores automáticamente; a menor zoom sube.
 * Deriva de él las subdivisiones menores que aún resulten legibles.
 */
export function computeRulerStep(
  pixelsPerSecond: number,
  minPx: number = RULER_MIN_MAJOR_PX
): RulerStep {
  const pps =
    Number.isFinite(pixelsPerSecond) && pixelsPerSecond > 0 ? pixelsPerSecond : 0;

  let majorStepSec = 1;
  if (pps > 0) {
    majorStepSec =
      RULER_STEPS_SEC.find((step) => step * pps >= minPx) ??
      RULER_STEPS_SEC[RULER_STEPS_SEC.length - 1];
  }

  const labelDecimals = decimalsForStep(majorStepSec);

  let subdivisions = 1;
  if (pps > 0) {
    for (const candidate of [5, 4, 2]) {
      if ((majorStepSec / candidate) * pps >= RULER_MIN_MINOR_PX) {
        subdivisions = candidate;
        break;
      }
    }
  }

  return {
    majorStepSec,
    minorStepSec: subdivisions > 1 ? majorStepSec / subdivisions : 0,
    subdivisions,
    labelDecimals,
  };
}

/** Redondeo a nanosegundo: elimina ruido de coma flotante sin perder precisión. */
function roundTickNoise(value: number): number {
  return Math.round(value * 1e9) / 1e9;
}

/**
 * Genera las marcas (mayores + menores) dentro de `[startSec, endSec]`. El
 * consumidor decide la ventana visible; aquí no se redondea el TIEMPO a
 * milisegundos, solo se limpia el ruido numérico de la rejilla.
 */
export function computeRulerTicks(
  startSec: number,
  endSec: number,
  step: RulerStep
): RulerTick[] {
  if (
    !Number.isFinite(startSec) ||
    !Number.isFinite(endSec) ||
    !Number.isFinite(step.majorStepSec) ||
    step.majorStepSec <= 0
  ) {
    return [];
  }
  const from = Math.min(startSec, endSec);
  const to = Math.max(startSec, endSec);
  const { majorStepSec, minorStepSec, subdivisions } = step;
  const eps = majorStepSec * 1e-6;
  const ticks: RulerTick[] = [];

  const firstMajor = Math.floor(from / majorStepSec) - 1;
  const lastMajor = Math.ceil(to / majorStepSec) + 1;

  for (let i = firstMajor; i <= lastMajor; i++) {
    const majorTime = i * majorStepSec;
    if (minorStepSec > 0 && subdivisions > 1) {
      for (let k = subdivisions - 1; k >= 1; k--) {
        const minorTime = majorTime - k * minorStepSec;
        if (minorTime < from - eps || minorTime > to + eps) continue;
        if (minorTime < -eps) continue;
        ticks.push({ timeSec: roundTickNoise(minorTime), isMajor: false });
      }
    }
    if (majorTime < from - eps || majorTime > to + eps) continue;
    if (majorTime < -eps) continue;
    ticks.push({ timeSec: roundTickNoise(majorTime), isMajor: true });
  }

  ticks.sort((a, b) => a.timeSec - b.timeSec);

  const deduped: RulerTick[] = [];
  const tolerance = majorStepSec * 1e-6;
  for (const tick of ticks) {
    const prev = deduped[deduped.length - 1];
    if (prev && Math.abs(prev.timeSec - tick.timeSec) <= tolerance) {
      if (tick.isMajor) deduped[deduped.length - 1] = tick;
      continue;
    }
    deduped.push(tick);
  }
  return deduped;
}

/**
 * Formatea un tiempo a `mm:ss[.decimales]`. Únicamente convierte number → string:
 * NUNCA debe usarse el resultado como fuente de cálculo de tiempo.
 */
export function formatTimelineTime(timeSec: number, decimals = 0): string {
  if (!Number.isFinite(timeSec)) return '--:--';
  const safeDecimals = Math.max(0, Math.min(4, Math.floor(decimals)));
  const negative = timeSec < 0;
  // Se redondea primero al total de segundos y después se derivan minutos y
  // segundos: así un valor como 59.9997 acarrea correctamente a "01:00.000" en
  // vez de producir "00:60.000".
  const factor = 10 ** safeDecimals;
  const rounded = Math.round(Math.abs(timeSec) * factor) / factor;
  const minutes = Math.floor(rounded / 60);
  const seconds = rounded - minutes * 60;
  const secondsStr = seconds
    .toFixed(safeDecimals)
    .padStart(safeDecimals > 0 ? 3 + safeDecimals : 2, '0');
  const minutesStr = String(minutes).padStart(2, '0');
  return `${negative ? '-' : ''}${minutesStr}:${secondsStr}`;
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
    timeToPixel: timeToPx,
    pixelToTime: pxToTime,
    rulerStep: (minPx?: number) => computeRulerStep(pixelsPerSecond, minPx),
    visibleRange: (scrollLeftPx: number, viewportWidthPx: number) => {
      const safeScroll = Number.isFinite(scrollLeftPx) ? scrollLeftPx : 0;
      const safeViewport =
        Number.isFinite(viewportWidthPx) && viewportWidthPx > 0
          ? viewportWidthPx
          : contentWidth;
      const startPx = Math.max(0, safeScroll);
      const endPx = Math.min(contentWidth, safeScroll + safeViewport);
      return {
        startPx,
        endPx,
        startSec: pxToTime(startPx),
        endSec: pxToTime(endPx),
      };
    },
    snapToleranceSec: (px: number) =>
      Number.isFinite(px) && pixelsPerSecond > 0 ? px / pixelsPerSecond : 0,
  };
}
