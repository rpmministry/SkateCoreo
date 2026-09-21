/**
 * Metronome — Web Audio API Lookahead Scheduler
 *
 * ARQUITECTURA DE SINCRONIZACIÓN:
 * - CERO temporizadores de JavaScript para el timing musical.
 * - Los `setTimeout` solo despiertan el planificador periódicamente (~20ms).
 * - TODOS los cálculos de tiempo usan exclusivamente `AudioContext.currentTime`,
 *   el reloj de hardware de la tarjeta de sonido (precisión sub-milisegundo).
 * - Los beats se programan en el futuro (`scheduleAheadSec = 0.15s`) para que
 *   el sistema operativo tenga margen de encolado sin underruns.
 * - Al cambiar BPM o Compás, la resincronización es instantánea: recalcula el
 *   índice del próximo beat sin detener ni reiniciar la reproducción musical.
 *
 * COMPASES SOPORTADOS: 1/4, 2/4, 3/4, 4/4, 5/4, 6/8, 7/8
 * - El primer pulso de cada compás recibe acento (frecuencia y ganancia elevadas).
 */

import { MetronomeConfig } from '../../types/audio';

export type TimeSignature = 1 | 2 | 3 | 4 | 5 | 6 | 7;
export type TimeSignatureDenominator = 4 | 8;

export interface TimeSignatureDef {
  beats: TimeSignature;
  denominator: TimeSignatureDenominator;
  label: string;
}

export const TIME_SIGNATURES: TimeSignatureDef[] = [
  { beats: 1, denominator: 4, label: '1/4' },
  { beats: 2, denominator: 4, label: '2/4' },
  { beats: 3, denominator: 4, label: '3/4' },
  { beats: 4, denominator: 4, label: '4/4' },
  { beats: 5, denominator: 4, label: '5/4' },
  { beats: 6, denominator: 8, label: '6/8' },
  { beats: 7, denominator: 8, label: '7/8' },
];

export class Metronome {
  private ctx: AudioContext | null = null;
  private outputNode: AudioNode | null = null;
  private timerId: number | null = null;

  private config: MetronomeConfig = {
    enabled: true,
    bpm: 140,
    beatsPerMeasure: 4,
    volume: 0.8,
    accentFirstBeat: true,
    accentPitch: 1400,
    normalPitch: 850
  };

  private isRunning = false;
  private audioZeroCtxTime = 0;
  private playbackRate = 1.0;
  private nextBeatIndex = 0;
  private phaseOffsetSec = 0;

  private readonly lookaheadMs = 20;
  private readonly scheduleAheadSec = 0.15;

  constructor(config?: Partial<MetronomeConfig>) {
    if (config) {
      this.config = { ...this.config, ...config };
    }
  }

  public init(ctx: AudioContext, outputNode: AudioNode) {
    this.ctx = ctx;
    this.outputNode = outputNode;
  }

  public setConfig(newConfig: Partial<MetronomeConfig>) {
    this.config = { ...this.config, ...newConfig };
    if (this.isRunning && this.ctx) {
      const currentSongTime = (this.ctx.currentTime - this.audioZeroCtxTime) * this.playbackRate;
      this.sync(Math.max(0, currentSongTime), this.playbackRate);
    }
  }

  public getConfig(): MetronomeConfig {
    return { ...this.config };
  }

  /**
   * Cambio dinámico de BPM: recalcula el intervalo de beats y resincroniza
   * inmediatamente sin detener la reproducción musical.
   */
  public setBpm(bpm: number) {
    this.config.bpm = Math.max(30, Math.min(300, Math.round(bpm)));
    if (this.isRunning && this.ctx) {
      const currentSongTime = (this.ctx.currentTime - this.audioZeroCtxTime) * this.playbackRate;
      this.sync(Math.max(0, currentSongTime), this.playbackRate);
    }
  }

  /**
   * Selector de compás (Time Signature).
   * Acepta cualquier valor de TIME_SIGNATURES.
   */
  public setBeatsPerMeasure(beats: number) {
    const clamped = Math.max(1, Math.min(7, Math.round(beats))) as 1 | 2 | 3 | 4 | 5 | 6 | 7;
    this.config.beatsPerMeasure = clamped;
    if (this.isRunning && this.ctx) {
      const currentSongTime = (this.ctx.currentTime - this.audioZeroCtxTime) * this.playbackRate;
      this.sync(Math.max(0, currentSongTime), this.playbackRate);
    }
  }

  public setVolume(volume: number) {
    this.config.volume = Math.max(0, Math.min(1, volume));
  }

  public setEnabled(enabled: boolean) {
    this.config.enabled = enabled;
  }

  public setPhaseOffset(offsetSec: number) {
    this.phaseOffsetSec = Math.max(0, offsetSec);
  }

  /**
   * Arranque del metrónomo sincronizado al reloj de hardware.
   * `syncAudioTimeSec` es la posición actual de la canción en segundos.
   */
  public start(syncAudioTimeSec: number = 0, playbackRate: number = 1.0) {
    this.stop();

    if (!this.ctx || !this.outputNode) return;
    this.isRunning = true;
    this.playbackRate = Math.max(0.1, playbackRate || 1.0);

    this.audioZeroCtxTime = this.ctx.currentTime - (syncAudioTimeSec / this.playbackRate);

    const secondsPerBeat = 60.0 / this.config.bpm;
    const effectiveSongTime = Math.max(0, syncAudioTimeSec - this.phaseOffsetSec);
    const beatFloat = effectiveSongTime / secondsPerBeat;

    if (effectiveSongTime < 0.025 || (beatFloat - Math.floor(beatFloat)) < 0.05) {
      this.nextBeatIndex = Math.max(0, Math.floor(beatFloat + 0.05));
    } else {
      this.nextBeatIndex = Math.max(0, Math.ceil(beatFloat));
    }

    this.scheduler();
  }

  public stop() {
    this.isRunning = false;
    if (this.timerId !== null) {
      globalThis.clearTimeout(this.timerId);
      this.timerId = null;
    }
    this.nextBeatIndex = 0;
  }

  /**
   * Resincroniza el metrónomo sin detenerlo (seek, cambio de BPM, cambio de playbackRate).
   */
  public sync(currentAudioTimeSec: number, playbackRate?: number) {
    if (!this.ctx) return;
    if (playbackRate !== undefined) {
      this.playbackRate = Math.max(0.1, playbackRate);
    }
    this.audioZeroCtxTime = this.ctx.currentTime - (currentAudioTimeSec / this.playbackRate);

    const secondsPerBeat = 60.0 / this.config.bpm;
    const effectiveSongTime = Math.max(0, currentAudioTimeSec - this.phaseOffsetSec);
    const beatFloat = effectiveSongTime / secondsPerBeat;

    if (effectiveSongTime < 0.025 || (beatFloat - Math.floor(beatFloat)) < 0.05) {
      this.nextBeatIndex = Math.max(0, Math.floor(beatFloat + 0.05));
    } else {
      this.nextBeatIndex = Math.max(0, Math.ceil(beatFloat));
    }
  }

  /**
   * Bucle del planificador de Web Audio API.
   * Planifica notas en el hardware de audio con antelación para latencia cero y cero jitter.
   */
  private scheduler = () => {
    if (!this.isRunning || !this.ctx) return;

    const secondsPerBeat = 60.0 / this.config.bpm;
    const horizonCtxTime = this.ctx.currentTime + this.scheduleAheadSec;

    while (this.isRunning) {
      const songBeatTime = this.phaseOffsetSec + (this.nextBeatIndex * secondsPerBeat);
      const ctxBeatTime = this.audioZeroCtxTime + (songBeatTime / this.playbackRate);

      if (ctxBeatTime > horizonCtxTime) {
        break; // Aún no corresponde planificar, esperar el próximo tick
      }

      // Encolar si el beat está en el presente o futuro inmediato
      if (ctxBeatTime >= this.ctx.currentTime - 0.02) {
        const beatInMeasure = this.nextBeatIndex % this.config.beatsPerMeasure;
        this.scheduleNote(beatInMeasure, Math.max(this.ctx.currentTime, ctxBeatTime));
      }

      this.nextBeatIndex++;
    }

    this.timerId = globalThis.setTimeout(this.scheduler, this.lookaheadMs) as any;
  };

  /**
   * Emite un pulso sonoro con transitorio de percusión de madera (Woodblock) de alta fidelidad.
   */
  private scheduleNote(beatNumber: number, time: number) {
    if (!this.ctx || !this.outputNode || !this.config.enabled || this.config.volume <= 0) {
      return;
    }

    try {
      const isAccent = beatNumber === 0 && this.config.accentFirstBeat;
      const osc = this.ctx.createOscillator();
      const noteGain = this.ctx.createGain();

      osc.type = 'triangle'; // Onda clara y penetrante

      // Caída de tono percusiva (Pitch envelope) para click nítido que corta el audio
      const startFreq = isAccent ? 1400 : 850;
      const endFreq = isAccent ? 700 : 400;

      osc.frequency.setValueAtTime(startFreq, time);
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), time + 0.025);

      const baseGain = (isAccent ? 1.0 : 0.65) * this.config.volume;
      
      // Envolvente de volumen rápida (Attack instantáneo, decay de 35ms)
      noteGain.gain.setValueAtTime(baseGain, time);
      noteGain.gain.exponentialRampToValueAtTime(0.0001, time + 0.04);

      osc.connect(noteGain);
      noteGain.connect(this.outputNode);

      osc.start(time);
      osc.stop(time + 0.045);
    } catch (e) {}
  }

  public getBeatDurationSec(): number {
    return 60.0 / this.config.bpm;
  }

  /**
   * Disparo puntual de click acentuado (usado en cuenta regresiva o pruebas)
   */
  public scheduleAccentClick(time: number, isAccent: boolean = true) {
    if (!this.ctx || !this.outputNode || !this.config.enabled || this.config.volume <= 0) return;

    try {
      const osc = this.ctx.createOscillator();
      const noteGain = this.ctx.createGain();

      osc.type = 'triangle';
      const startFreq = isAccent ? 1400 : 850;
      const endFreq = isAccent ? 700 : 400;

      osc.frequency.setValueAtTime(startFreq, time);
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), time + 0.025);

      const baseGain = (isAccent ? 1.0 : 0.7) * this.config.volume;
      noteGain.gain.setValueAtTime(baseGain, time);
      noteGain.gain.exponentialRampToValueAtTime(0.0001, time + 0.045);

      osc.connect(noteGain);
      noteGain.connect(this.outputNode);

      osc.start(time);
      osc.stop(time + 0.05);
    } catch (e) {}
  }
}
