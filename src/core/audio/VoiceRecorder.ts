/**
 * VoiceRecorder — Captura de voz del Audio Studio (Fase 4).
 *
 * Arquitectura elegida (robusta y de calidad, sin recomprimir en bucle):
 *   getUserMedia → MediaStream → MediaRecorder → Blob → decodeAudioData → AudioBuffer
 *
 * - Se graba el stream de audio con `MediaRecorder` (Opus en WebM/Chrome-Android,
 *   AAC/MP4 en Safari-iOS como respaldo), que es la captura más estable y ligera en
 *   los navegadores objetivo.
 * - El audio se decodifica UNA sola vez a `AudioBuffer` con el `AudioContext` del
 *   motor (misma frecuencia de muestreo del contexto), lista para editarse y
 *   renderizarse en la mezcla final sin recodificaciones intermedias.
 * - Constraint de calidad: sin cancelación de eco / supresión de ruido / AGC
 *   automáticos, para no degradar la voz grabada.
 *
 * El AudioWorklet (PCM crudo a la frecuencia del contexto) queda como mejora futura
 * documentada; MediaRecorder ofrece mejor compatibilidad con Safari iOS hoy.
 */

import { audioEngine } from '../../services/audioEngine';

const MIME_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4;codecs=mp4a.40.2',
  'audio/mp4',
  'audio/ogg;codecs=opus',
];

/**
 * Normaliza el pico de la toma a `targetPeak` (por defecto −0.3 dBFS) para que la
 * voz grabada no quede inaudible. Limita la ganancia a +18 dB para no amplificar
 * ruido de fondo. Modifica el buffer in situ.
 */
export function normalizeAudioBufferPeak(buffer: AudioBuffer, targetPeak = 0.97): void {
  let peak = 0;
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < data.length; i++) {
      const a = Math.abs(data[i]);
      if (a > peak) peak = a;
    }
  }
  if (peak <= 0.0001 || peak >= targetPeak) return;
  const gain = Math.min(10, targetPeak / peak); // tope ≈ +20 dB para no amplificar ruido
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < data.length; i++) data[i] *= gain;
  }
}

export class VoiceRecorder {  private stream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private mimeType = '';
  private startedAtMs = 0;
  private recording = false;

  /** ¿Este navegador soporta captura de voz? */
  static isSupported(): boolean {
    const MR = (globalThis as unknown as { MediaRecorder?: unknown }).MediaRecorder;
    return (
      typeof navigator !== 'undefined' &&
      !!navigator.mediaDevices?.getUserMedia &&
      typeof MR === 'function'
    );
  }

  private static pickMimeType(): string {
    const MR = (globalThis as unknown as { MediaRecorder?: { isTypeSupported?: (t: string) => boolean } })
      .MediaRecorder;
    if (!MR?.isTypeSupported) return '';
    for (const candidate of MIME_CANDIDATES) {
      try {
        if (MR.isTypeSupported(candidate)) return candidate;
      } catch {
        /* ignorar */
      }
    }
    return '';
  }

  isRecording(): boolean {
    return this.recording;
  }

  /** Stream de micrófono activo (para monitorización opcional). */
  getStream(): MediaStream | null {
    return this.stream;
  }

  /** Segundos transcurridos desde el inicio de la grabación. */
  elapsedSec(): number {
    return this.startedAtMs ? (performance.now() - this.startedAtMs) / 1000 : 0;
  }

  /**
   * Adquiere el micrófono (y su permiso) SIN empezar a capturar. Permite ejecutar
   * una cuenta atrás explícita antes de iniciar la toma.
   */
  async prepare(): Promise<void> {
    if (this.stream) return;
    if (!VoiceRecorder.isSupported()) {
      throw new Error('La grabación de voz no está disponible en este navegador.');
    }
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });
  }

  async start(): Promise<void> {
    if (this.recording) return;
    if (!this.stream) await this.prepare();
    const stream = this.stream;
    if (!stream) throw new Error('No hay micrófono preparado.');

    const MR = (globalThis as unknown as { MediaRecorder: new (s: MediaStream, o?: MediaRecorderOptions) => MediaRecorder })
      .MediaRecorder;
    this.mimeType = VoiceRecorder.pickMimeType();

    try {
      this.recorder = this.mimeType ? new MR(stream, { mimeType: this.mimeType }) : new MR(stream);
    } catch (err) {
      this.stopTracks();
      throw err;
    }

    this.chunks = [];
    this.recorder.ondataavailable = (e: BlobEvent) => {
      if (e.data && e.data.size > 0) this.chunks.push(e.data);
    };
    this.startedAtMs = performance.now();
    this.recording = true;
    // Timeslice de 250 ms: entrega datos periódicamente (menos riesgo de pérdida).
    this.recorder.start(250);
  }

  /** Detiene y decodifica la toma. Devuelve null si no hubo audio. */
  async stop(): Promise<AudioBuffer | null> {
    if (!this.recording || !this.recorder) return null;
    const recorder = this.recorder;
    const stopped = new Promise<void>((resolve) => {
      recorder.onstop = () => resolve();
    });
    try {
      recorder.stop();
    } catch {
      /* ya detenido */
    }
    await stopped;

    this.recording = false;
    const blob = new Blob(this.chunks, this.mimeType ? { type: this.mimeType } : undefined);
    this.chunks = [];
    this.recorder = null;
    this.stopTracks();

    if (blob.size === 0) return null;
    return audioEngine.decodeAudioFile(blob);
  }

  /** Cancela la toma sin conservarla. */
  cancel(): void {
    if (this.recorder) {
      try {
        this.recorder.onstop = null;
        this.recorder.stop();
      } catch {
        /* ignorar */
      }
    }
    this.recorder = null;
    this.chunks = [];
    this.recording = false;
    this.stopTracks();
  }

  private stopTracks(): void {
    this.stream?.getTracks().forEach((track) => {
      try {
        track.stop();
      } catch {
        /* ignorar */
      }
    });
    this.stream = null;
  }
}
