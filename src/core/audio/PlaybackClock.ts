import { audioEngine } from '../../services/audioEngine';

/**
 * PlaybackClock — Reloj visual de hardware compartido.
 *
 * PROBLEMA QUE RESUELVE (desincronización audio ↔ playhead)
 * ---------------------------------------------------------
 * La única fuente de verdad temporal en la Web Audio API es
 * `AudioContext.currentTime`, un reloj de hardware que avanza de forma
 * monotónica e independiente del hilo principal. Sin embargo, el playhead se
 * movía con `setState` de React alimentado por callbacks: cada emisión provocaba
 * un re-render completo del árbol, se encolaba detrás del trabajo de React y
 * llegaba tarde e irregular → la línea iba por detrás de la música y "temblaba".
 *
 * ARQUITECTURA
 * ------------
 * - **Un único bucle `requestAnimationFrame`** para toda la aplicación: no
 *   importa cuántos playheads existan (Pista 2D, regla de tiempo, onda sonora),
 *   todos comparten el mismo frame y el mismo instante de hardware.
 * - En cada frame se lee `audioEngine.getCurrentTimeMs()`, que internamente
 *   calcula `(audioCtx.currentTime - startTime) * playbackRate`. Este cálculo ya
 *   incorpora el offset de pausa/seek, así que al reanudar la línea continúa
 *   exactamente donde estaba, sin saltos.
 * - Los suscriptores mutan el DOM directamente (`transform: translateX(...)`
 *   o un canvas). **Cero `setState` por frame**.
 * - El bucle se detiene solo cuando no queda ningún suscriptor (ahorro de batería).
 */

export type PlaybackFrameCallback = (timeMs: number, isPlaying: boolean) => void;

class PlaybackClock {
  private callbacks = new Set<PlaybackFrameCallback>();
  private rafId: number | null = null;
  private lastFrameTimeMs = 0;

  /**
   * Lectura puntual y exacta del tiempo de reproducción.
   * Es la fuente de verdad para cualquier operación lógica (cortar, marcar,
   * sincronizar) en lugar del `currentTimeSec` de React, que va con retraso.
   */
  public now(): number {
    return audioEngine.getCurrentTimeMs();
  }

  public isPlaying(): boolean {
    return audioEngine.getState().isPlaying;
  }

  public subscribe(callback: PlaybackFrameCallback): () => void {
    this.callbacks.add(callback);
    this.ensureRunning();
    return () => {
      this.callbacks.delete(callback);
      if (this.callbacks.size === 0) this.stop();
    };
  }

  /** Tiempo del último frame servido (útil para depuración en pantalla). */
  public getLastFrameTimeMs(): number {
    return this.lastFrameTimeMs;
  }

  private ensureRunning(): void {
    if (this.rafId !== null || typeof requestAnimationFrame === 'undefined') return;

    const loop = () => {
      const timeMs = this.now();
      this.lastFrameTimeMs = timeMs;
      const playing = this.isPlaying();

      // Copia defensiva: un suscriptor puede desuscribirse durante el frame
      for (const callback of Array.from(this.callbacks)) {
        try {
          callback(timeMs, playing);
        } catch (err) {
          console.warn('[PlaybackClock] Error en suscriptor de frame:', err);
        }
      }

      this.rafId = requestAnimationFrame(loop);
    };

    this.rafId = requestAnimationFrame(loop);
  }

  private stop(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }
}

export const playbackClock = new PlaybackClock();

// Nota: la proyección tiempo → píxeles del playhead ya NO vive aquí. Se unificó
// en `AudioTimelineGeometry.timeToPx()` (la única transformación temporal del
// proyecto), que además es la que usan el Audio Studio y la Pista 2D. Mantener
// una segunda copia de esa fórmula invitaba a que ambas divergieran.
