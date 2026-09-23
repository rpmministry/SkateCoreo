/**
 * playbackLoop.ts — Matemática PURA del bucle de reproducción (Fase 5.2).
 *
 * El bucle audible lo realiza el navegador con `AudioBufferSourceNode.loop`
 * (precisión de muestra, sin clics). Estas funciones solo traducen/mantienen la
 * posición del cabezal dentro del rango del bucle y lo sanean contra la duración.
 */

export interface PlaybackLoop {
  enabled: boolean;
  startSec: number;
  endSec: number;
}

/**
 * Sanea un bucle contra la duración real. Devuelve `null` si está desactivado o si
 * el rango es degenerado (< 50 ms). `endSec <= 0` significa "hasta el final".
 */
export function normalizeLoop(loop: PlaybackLoop | null, durationSec: number): PlaybackLoop | null {
  if (!loop || !loop.enabled) return null;
  const duration = Math.max(0, durationSec);
  const start = Math.max(0, Math.min(loop.startSec, duration));
  const requestedEnd = loop.endSec > 0 ? loop.endSec : duration;
  const end = Math.max(start, Math.min(requestedEnd, duration));
  if (end - start < 0.05) return null;
  return { enabled: true, startSec: start, endSec: end };
}

/**
 * Posición efectiva del cabezal: si supera el final del bucle, vuelve dentro del
 * rango (módulo) para que la UI y las evaluaciones de cues coincidan con el audio.
 */
export function wrapLoopPositionSec(positionSec: number, loop: PlaybackLoop | null): number {
  if (!loop) return positionSec;
  const span = loop.endSec - loop.startSec;
  if (span <= 0) return positionSec;
  if (positionSec <= loop.endSec) return Math.max(0, positionSec);
  const offset = (positionSec - loop.startSec) % span;
  return loop.startSec + (offset < 0 ? offset + span : offset);
}
