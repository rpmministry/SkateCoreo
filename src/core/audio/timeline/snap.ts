/**
 * snap — Cálculo de imán temporal con tolerancia en PÍXELES.
 *
 * PROBLEMA QUE RESUELVE
 * --------------------
 * El snapping usaba un umbral FIJO de 0.5 s, independiente del zoom. Consecuencia:
 *  - alejado (zoom out) el imán era demasiado agresivo en tiempo: "pegaba" clips a
 *    medio segundo de distancia, que en pantalla es un salto enorme;
 *  - acercado (zoom in) era demasiado tosco: costaba enganchar al milímetro.
 *
 * SOLUCIÓN (concepto de AudioMass `snap_px` / `beat_snap_px`)
 * ----------------------------------------------------------
 * La tolerancia se deriva de PÍXELES VISIBLES y se convierte a segundos con los
 * píxeles-por-segundo actuales. Así el imán se siente igual de "pegajoso" en
 * pantalla a cualquier zoom: alejado abarca más tiempo, acercado es más preciso.
 *
 * PRIORIDAD EXPLÍCITA (gana la primera referencia que esté dentro de tolerancia):
 *   1. borde de clip (y acoplamientos fin-a-inicio / inicio-a-inicio)
 *   2. playhead
 *   3. origen de la pista (0 s)
 *   4. cuadrícula BPM (beat snap), solo si el snap está activado
 *
 * Es una función PURA: no toca el DOM, ni el store, ni el motor de audio.
 */

/** Tolerancia de las referencias duras (bordes, playhead, origen). */
export const SNAP_PX = 9;
/** Tolerancia del beat snap (cuadrícula BPM): más fina que las referencias. */
export const BEAT_SNAP_PX = 4;

export type SnapKind = 'clip' | 'playhead' | 'origin' | 'grid';

export interface SnapClipEdge {
  startSec: number;
  endSec: number;
}

export interface ComputeSnapInput {
  rawTimeSec: number;
  clipDurationSec: number;
  snapToleranceSec: number;
  beatToleranceSec: number;
  clipEdges: SnapClipEdge[];
  playheadSec?: number | null;
  originSec?: number;
  bpm?: number | null;
  gridEnabled?: boolean;
}

export interface SnapResult {
  snappedSec: number;
  snapLineSec: number | null;
  kind: SnapKind | null;
}

/** Convierte una tolerancia en píxeles a segundos según la escala actual. */
export function snapToleranceSec(pixelsPerSecond: number, px: number = SNAP_PX): number {
  const pps = Number.isFinite(pixelsPerSecond) && pixelsPerSecond > 0 ? pixelsPerSecond : 0;
  return pps > 0 ? px / pps : 0;
}

/**
 * Nota de precisión: NO se redondea el tiempo a milisegundos. El imán devuelve
 * valores exactos (borde real, playhead real, rejilla BPM exacta) o el valor
 * crudo continuo cuando no hay referencia. Redondear a ms destruiría la
 * precisión necesaria a zoom alto.
 */
export function computeSnapOffset(input: ComputeSnapInput): SnapResult {
  const raw = Math.max(0, input.rawTimeSec);
  const clipDur = Math.max(0, input.clipDurationSec);
  const snapTol = Math.max(0, input.snapToleranceSec);
  const beatTol = Math.max(0, input.beatToleranceSec);
  const origin = input.originSec ?? 0;

  // 1) Bordes de clip (máxima prioridad).
  let bestTime = raw;
  let bestLine: number | null = null;
  let bestDist = snapTol;

  for (const edge of input.clipEdges) {
    // A: fin del vecino anterior → inicio del clip arrastrado.
    // B: inicio del vecino siguiente → fin del clip arrastrado.
    // C: alinear inicios.
    const candidates: Array<{ time: number; line: number; dist: number }> = [
      { time: edge.endSec, line: edge.endSec, dist: Math.abs(raw - edge.endSec) },
      {
        time: Math.max(0, edge.startSec - clipDur),
        line: edge.startSec,
        dist: Math.abs(raw + clipDur - edge.startSec),
      },
      { time: edge.startSec, line: edge.startSec, dist: Math.abs(raw - edge.startSec) },
    ];
    for (const candidate of candidates) {
      if (candidate.dist <= bestDist) {
        bestDist = candidate.dist;
        bestTime = candidate.time;
        bestLine = candidate.line;
      }
    }
  }

  if (bestLine !== null) {
    return { snappedSec: Math.max(0, bestTime), snapLineSec: bestLine, kind: 'clip' };
  }

  // 2) Playhead.
  if (input.playheadSec != null && Number.isFinite(input.playheadSec)) {
    if (Math.abs(raw - input.playheadSec) <= snapTol) {
      return {
        snappedSec: Math.max(0, input.playheadSec),
        snapLineSec: input.playheadSec,
        kind: 'playhead',
      };
    }
  }

  // 3) Origen de la pista.
  if (Math.abs(raw - origin) <= snapTol) {
    return { snappedSec: Math.max(0, origin), snapLineSec: origin, kind: 'origin' };
  }

  // 4) Cuadrícula BPM (beat snap).
  if (input.gridEnabled && input.bpm && input.bpm > 0) {
    const beatSec = 60 / input.bpm;
    const nearest = Math.round(raw / beatSec) * beatSec;
    if (Math.abs(raw - nearest) <= beatTol) {
      const snapped = Math.max(0, nearest);
      return { snappedSec: snapped, snapLineSec: snapped, kind: 'grid' };
    }
  }

  return {
    snappedSec: Math.max(0, raw),
    snapLineSec: null,
    kind: null,
  };
}
