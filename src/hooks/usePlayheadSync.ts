import { useEffect, useRef } from 'react';
import { playbackClock } from '../core/audio/PlaybackClock';

export interface UsePlayheadSyncOptions {
  /** Ejecuta el bucle de frames solo durante la reproducción. */
  active: boolean;
  /**
   * Clave que fuerza una escritura puntual cuando la geometría cambia
   * (zoom, ancho del contenedor, duración total, pista cargada…).
   * Evita que el playhead quede descolocado tras un pan/zoom en pausa.
   */
  refreshKey?: unknown;
}

/**
 * usePlayheadSync — Mueve el playhead con el reloj de hardware, sin re-renderizar.
 *
 * @param update Callback que recibe el tiempo EXACTO (ms) de cada frame. Debe
 *   mutar el DOM directamente (transform/canvas) y NO llamar a `setState`.
 *
 * Comportamiento:
 * - Durante la reproducción: se suscribe al `PlaybackClock` compartido (un solo
 *   `requestAnimationFrame` para toda la app) y recibe el tiempo de hardware en
 *   cada frame → sincronía al milisegundo, 60fps estables.
 * - En pausa/seek/zoom: una única escritura puntual con el tiempo real, de modo
 *   que la línea queda clavada en su posición exacta sin consumir frames.
 */
export function usePlayheadSync(
  update: (timeMs: number, isPlaying: boolean) => void,
  { active, refreshKey }: UsePlayheadSyncOptions
): void {
  const updateRef = useRef(update);
  updateRef.current = update;

  // Bucle de frames compartido mientras hay reproducción
  useEffect(() => {
    if (!active) return;
    return playbackClock.subscribe((timeMs, isPlaying) => {
      updateRef.current(timeMs, isPlaying);
    });
  }, [active]);

  // Escritura puntual al pausar, al hacer seek y al cambiar la geometría
  useEffect(() => {
    if (active) return;
    updateRef.current(playbackClock.now(), playbackClock.isPlaying());
  }, [active, refreshKey]);
}
