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

import { MetronomeConfig, MetronomeSubdivision } from '../../types/audio';

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

/**
 * Subdivisiones del metrónomo: nº de pulsos por beat.
 *  1/1 → 1 pulso por beat · 1/2 → 2 · 1/4 → 4 · 1/8 → 8
 * La etiqueta refleja exactamente el comportamiento real.
 */
export interface MetronomeSubdivisionDef {
  value: MetronomeSubdivision;
  label: string;
}

export const METRONOME_SUBDIVISIONS: MetronomeSubdivisionDef[] = [
  { value: 1, label: '1/1' },
  { value: 2, label: '1/2' },
  { value: 4, label: '1/4' },
  { value: 8, label: '1/8' },
];

/** Normaliza cualquier valor a una subdivisión válida (por defecto 1 = 1/1). */
export function normalizeSubdivision(value: number | undefined | null): MetronomeSubdivision {
  return value === 2 || value === 4 || value === 8 ? value : 1;
}

export class Metronome {
  private ctx: AudioContext | null = null;
  private outputNode: AudioNode | null = null;
  private timerId: number | null = null;

  private config: MetronomeConfig = {
    enabled: true,
    bpm: 140,
    beatsPerMeasure: 4,
    subdivision: 1,
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

  /**
   * Último índice de beat EFECTIVAMENTE programado.
   *
   * Es el guardián contra los METRÓNOMOS DUPLICADOS: el planificador nunca
   * vuelve a encolar un índice ya emitido, aunque un resync (cambio de BPM,
   * compás o seek) recalcule `nextBeatIndex` hacia atrás.
   */
  private lastScheduledBeatIndex = -1;

  /**
   * Resincronización diferida. Los cambios de configuración llegan en ráfaga
   * (BPM + compás + volumen + acento + enabled desde una sola acción de la UI);
   * así se colapsan en UNA aplicación dentro del siguiente tick en lugar de
   * provocar cinco recálculos consecutivos sobre los mismos beats.
   */
  private pendingResync = false;

  /**
   * Generación del bucle del planificador. Cada `start()` la incrementa, de modo
   * que cualquier tick ya encolado del ciclo anterior se autodescarta. Es la
   * garantía estructural de que NUNCA coexistan dos bucles (causa directa de la
   * cacofonía de metrónomos).
   */
  private schedulerToken = 0;

  /**
   * Nodos de audio vivos (oscilador + ganancia). Permiten una limpieza ABSOLUTA
   * e inmediata en `stop()`: sin `stop()`/`disconnect()` explícitos, un nodo ya
   * encolado seguiría sonando aunque el temporizador se haya cancelado.
   */
  private activeNodes: Set<{ osc: OscillatorNode; gain: GainNode }> = new Set();

  private readonly lookaheadMs = 20;
  private readonly scheduleAheadSec = 0.15;
  /** Tope defensivo de iteraciones por tick (evita cualquier bucle patológico). */
  private readonly maxBeatsPerTick = 64;

  constructor(config?: Partial<MetronomeConfig>) {
    if (config) {
      this.config = { ...this.config, ...config };
    }
  }

  public init(ctx: AudioContext, outputNode: AudioNode) {
    this.ctx = ctx;
    this.outputNode = outputNode;
  }

  /**
   * Marca una resincronización para el siguiente tick.
   *
   * NO toca `nextBeatIndex` en el acto: eso permitía que varios setters en
   * cadena reencolaran el mismo beat. El planificador la aplica una sola vez y
   * siempre sin retroceder por debajo de lo ya programado.
   */
  private requestResync() {
    if (!this.isRunning || !this.ctx) return;
    this.pendingResync = true;
  }

  /**
   * Recalcula el próximo PULSO a partir del reloj de hardware SIN rebobinar.
   * Invariante: `nextBeatIndex` (índice de pulso) nunca es menor que
   * `lastScheduledBeatIndex + 1`.
   */
  private applyResync(currentSongTimeSec?: number) {
    if (!this.ctx) return;

    const songTime = currentSongTimeSec !== undefined
      ? currentSongTimeSec
      : Math.max(0, (this.ctx.currentTime - this.audioZeroCtxTime) * this.playbackRate);

    const secondsPerPulse = this.getPulseDurationSec();
    const effectiveSongTime = Math.max(0, songTime - this.phaseOffsetSec);
    const pulseFloat = effectiveSongTime / secondsPerPulse;

    const candidate = (effectiveSongTime < 0.025 || (pulseFloat - Math.floor(pulseFloat)) < 0.05)
      ? Math.max(0, Math.floor(pulseFloat + 0.05))
      : Math.max(0, Math.ceil(pulseFloat));

    this.nextBeatIndex = Math.max(candidate, this.lastScheduledBeatIndex + 1);
  }

  public setConfig(newConfig: Partial<MetronomeConfig>) {
    this.config = { ...this.config, ...newConfig };
    this.requestResync();
  }

  public getConfig(): MetronomeConfig {
    return { ...this.config };
  }

  /**
   * Cambio dinámico de BPM: recalcula el intervalo de beats sin detener la
   * reproducción musical y sin duplicar pulsos ya programados.
   */
  public setBpm(bpm: number) {
    this.config.bpm = Math.max(30, Math.min(300, Math.round(bpm)));
    this.requestResync();
  }

  /**
   * Selector de compás (Time Signature).
   * Acepta cualquier valor de TIME_SIGNATURES.
   */
  public setBeatsPerMeasure(beats: number) {
    const clamped = Math.max(1, Math.min(7, Math.round(beats))) as 1 | 2 | 3 | 4 | 5 | 6 | 7;
    this.config.beatsPerMeasure = clamped;
    this.requestResync();
  }

  public setVolume(volume: number) {
    this.config.volume = Math.max(0, Math.min(1, volume));
  }

  /**
   * Subdivisión (pulsos por beat): 1/1 → 1, 1/2 → 2, 1/4 → 4, 1/8 → 8.
   * Resincroniza sin rebobinar el transporte.
   */
  public setSubdivision(subdivision: number) {
    this.config.subdivision = normalizeSubdivision(subdivision);
    this.requestResync();
  }

  /**
   * Habilitar / deshabilitar la audición del metrónomo.
   *
   * Al DESHABILITAR no basta con marcar la bandera: hay que DETENER el
   * planificador (cancelar el `setTimeout` pendiente e invalidar la generación)
   * y silenciar los nodos ya programados por el lookahead. Así el botón de
   * apagado/silencio corta el sonido de inmediato en lugar de dejar un eco.
   *
   * Al REHABILITAR se rearma el bucle desde el reloj de hardware y, gracias al
   * guardián `lastScheduledBeatIndex`, NO se reproducen de golpe los beats
   * perdidos mientras estuvo apagado (nada de ráfagas ni clicks duplicados).
   */
  public setEnabled(enabled: boolean) {
    if (this.config.enabled === enabled) return;
    this.config.enabled = enabled;

    if (!enabled) {
      this.haltScheduler();
    } else if (this.isRunning && this.timerId === null) {
      this.pendingResync = false;
      this.applyResync();
      this.runScheduler();
    }
  }

  /**
   * Silencia y detiene el planificador SIN cambiar `enabled`.
   * Se usa para el Mute absoluto del sub-bus: corta el scheduler y los nodos ya
   * programados, y `resume()` lo rearma exactamente donde corresponde.
   */
  public suspend() {
    this.haltScheduler();
  }

  /** Rearma el planificador tras un `suspend()` (idempotente). */
  public resume() {
    if (this.isRunning && this.config.enabled && this.timerId === null) {
      this.pendingResync = false;
      this.applyResync();
      this.runScheduler();
    }
  }

  /** Detiene el planificador sin alterar el estado de transporte (`isRunning`). */
  private haltScheduler() {
    this.schedulerToken++; // cualquier tick encolado se autodescarta
    this.pendingResync = false;
    if (this.timerId !== null) {
      globalThis.clearTimeout(this.timerId);
      this.timerId = null;
    }
    this.stopAllNodes();
  }

  public setPhaseOffset(offsetSec: number) {
    this.phaseOffsetSec = Math.max(0, offsetSec);
  }

  /**
   * Arranque del metrónomo sincronizado al reloj de hardware.
   * `syncAudioTimeSec` es la posición actual de la canción en segundos.
   *
   * IDEMPOTENTE: siempre ejecuta `stop()` primero, que cancela el temporizador,
   * invalida la generación del bucle y silencia los nodos vivos. Llamar a
   * `start()` dos veces no puede dejar dos planificadores en marcha.
   */
  public start(
    syncAudioTimeSec: number = 0,
    playbackRate: number = 1.0,
    startCtxTime?: number
  ) {
    this.stop();

    if (!this.ctx || !this.outputNode) return;
    this.isRunning = true;
    this.playbackRate = Math.max(0.1, playbackRate || 1.0);

    // `startCtxTime` permite anclar el pulso a un instante FUTURO exacto del
    // reloj de audio (p. ej., el final del pre-roll) en lugar de "ahora".
    const anchor = startCtxTime !== undefined ? startCtxTime : this.ctx.currentTime;
    this.audioZeroCtxTime = anchor - (syncAudioTimeSec / this.playbackRate);

    this.lastScheduledBeatIndex = -1;
    this.pendingResync = false;
    this.applyResync(syncAudioTimeSec);

    // Con el metrónomo apagado no se arranca el bucle: `isRunning` queda en
    // `true` para que un `setEnabled(true)` posterior lo rearme sin reiniciar
    // el transporte.
    if (this.config.enabled) {
      this.runScheduler();
    }
  }

  /**
   * LIMPIEZA ABSOLUTA — evita la duplicación de nodos y las fugas de memoria.
   *
   * 1. Marca el motor como detenido.
   * 2. Invalida la generación: cualquier tick ya encolado se autodescarta.
   * 3. Cancela el temporizador pendiente.
   * 4. Detiene y desconecta TODOS los nodos vivos (osciladores + ganancias),
   *    incluidos los ya programados para sonar en el futuro.
   */
  public stop() {
    this.isRunning = false;
    this.schedulerToken++; // invalida cualquier tick del ciclo anterior
    this.pendingResync = false;

    if (this.timerId !== null) {
      globalThis.clearTimeout(this.timerId);
      this.timerId = null;
    }

    this.stopAllNodes();

    this.nextBeatIndex = 0;
    this.lastScheduledBeatIndex = -1;
  }

  /**
   * Silencia y libera todos los nodos vivos.
   *
   * Fase crítica de la limpieza: un `OscillatorNode` ya encolado en el hardware
   * sigue sonando aunque el temporizador esté cancelado, así que hay que pararlo
   * explícitamente (`stop()` + `disconnect()`) para que el recolector de basura
   * pueda reclamarlo y para que no se solape con el siguiente arranque.
   */
  private stopAllNodes() {
    for (const entry of this.activeNodes) {
      try {
        entry.osc.onended = null;
        entry.osc.stop();
      } catch (e) {
        /* Ya estaba detenido. */
      }
      try {
        entry.osc.disconnect();
        entry.gain.disconnect();
      } catch (e) {
        /* Ya estaba desconectado. */
      }
    }
    this.activeNodes.clear();
  }

  /**
   * Resincroniza el metrónomo sin detenerlo (seek, cambio de BPM o de velocidad).
   *
   * Nunca rebobina por debajo de lo ya programado: eso era exactamente lo que
   * producía pulsos DUPLICADOS al cambiar la configuración durante la
   * reproducción (varios setters en cadena reencolaban el mismo beat).
   */
  public sync(currentAudioTimeSec: number, playbackRate?: number) {
    if (!this.ctx) return;
    if (playbackRate !== undefined) {
      this.playbackRate = Math.max(0.1, playbackRate);
    }
    this.audioZeroCtxTime = this.ctx.currentTime - (currentAudioTimeSec / this.playbackRate);
    this.pendingResync = false;
    this.applyResync(currentAudioTimeSec);
  }

  /**
   * Arranca una NUEVA generación del bucle del planificador.
   *
   * El contador `schedulerToken` se incrementa al arrancar y cada tick lleva
   * asociado el token con el que nació: si el token ya no coincide (se llamó a
   * `stop()` o a un `start()` posterior), el tick se descarta sin reprogramarse.
   * Así es imposible que queden dos bucles vivos en paralelo.
   */
  private runScheduler() {
    const token = ++this.schedulerToken;

    const tick = () => {
      if (!this.isRunning || !this.ctx || token !== this.schedulerToken) {
        return; // Generación obsoleta: se autodescarta.
      }

      // Aplica (una sola vez) cualquier resync pendiente de la configuración.
      if (this.pendingResync) {
        this.pendingResync = false;
        this.applyResync();
      }

      const secondsPerPulse = this.getPulseDurationSec();
      const horizonCtxTime = this.ctx.currentTime + this.scheduleAheadSec;

      let guard = 0;
      while (this.isRunning && guard++ < this.maxBeatsPerTick) {
        // Guardián anti-duplicación: jamás se reencola un pulso ya emitido.
        if (this.nextBeatIndex <= this.lastScheduledBeatIndex) {
          this.nextBeatIndex = this.lastScheduledBeatIndex + 1;
        }

        // Referencia ABSOLUTA (sin drift): pulso n = phaseOffset + n × duraciónDePulso.
        // Nunca "pulso anterior + duración", que acumularía error con el tiempo.
        const songPulseTime = this.phaseOffsetSec + (this.nextBeatIndex * secondsPerPulse);
        const ctxPulseTime = this.audioZeroCtxTime + (songPulseTime / this.playbackRate);

        if (ctxPulseTime > horizonCtxTime) {
          break; // Aún no corresponde planificar: se espera al próximo tick.
        }

        if (ctxPulseTime >= this.ctx.currentTime - 0.02) {
          this.scheduleNote(this.nextBeatIndex, Math.max(this.ctx.currentTime, ctxPulseTime));
        }
        // Se marca SIEMPRE (también los pulsos ya vencidos) para no reintentarlos.
        this.lastScheduledBeatIndex = this.nextBeatIndex;
        this.nextBeatIndex++;
      }

      this.timerId = globalThis.setTimeout(tick, this.lookaheadMs) as any;
    };

    tick();
  }

  /**
   * Crea un pulso con transitorio de percusión de madera (Woodblock).
   *
   * El nodo se REGISTRA en `activeNodes` y se auto-libera al terminar:
   *  - `stop()` puede silenciar de inmediato cualquier click ya programado en el
   *    futuro (evita que el metrónomo siga sonando tras pausar).
   *  - El recolector de basura recupera la memoria en cuanto el nodo suena.
   */
  private emitClick(time: number, isAccent: boolean, normalGain: number) {
    if (!this.ctx || !this.outputNode) return;
    if (!this.config.enabled || this.config.volume <= 0) return;

    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'triangle'; // Onda clara y penetrante

      // Caída de tono percusiva (pitch envelope) para un click nítido
      const startFreq = isAccent ? 1400 : 850;
      const endFreq = isAccent ? 700 : 400;

      osc.frequency.setValueAtTime(startFreq, time);
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), time + 0.025);

      const baseGain = (isAccent ? 1.0 : normalGain) * this.config.volume;

      // Envolvente de volumen rápida (ataque instantáneo, decay ~40 ms)
      gain.gain.setValueAtTime(baseGain, time);
      gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.04);

      osc.connect(gain);
      gain.connect(this.outputNode);

      const entry = { osc, gain };
      this.activeNodes.add(entry);

      osc.onended = () => {
        this.activeNodes.delete(entry);
        try {
          osc.disconnect();
          gain.disconnect();
        } catch (e) {
          /* Ya estaba desconectado. */
        }
      };

      osc.start(time);
      osc.stop(time + 0.045);
    } catch (e) {
      /* Un fallo al crear el click nunca debe romper el planificador. */
    }
  }

  /**
   * Pulso del compás con jerarquía de acentos:
   *   · Primer pulso del compás → acento (si `accentFirstBeat`).
   *   · Inicio de beat → ganancia media.
   *   · Subdivisión (1/2, 1/4, 1/8) → ganancia suave.
   */
  private scheduleNote(pulseIndex: number, time: number) {
    const pulsesPerBeat = normalizeSubdivision(this.config.subdivision);
    const pulsesPerMeasure = Math.max(1, this.config.beatsPerMeasure * pulsesPerBeat);
    const pulseInMeasure = ((pulseIndex % pulsesPerMeasure) + pulsesPerMeasure) % pulsesPerMeasure;

    const isDownbeat = pulseInMeasure === 0 && this.config.accentFirstBeat;
    const isBeatStart = pulseInMeasure % pulsesPerBeat === 0;
    const gain = isDownbeat ? 1.0 : isBeatStart ? 0.65 : 0.4;

    this.emitClick(time, isDownbeat, gain);
  }

  /** Duración de un BEAT (negra) a partir del BPM. */
  public getBeatDurationSec(): number {
    return 60.0 / this.config.bpm;
  }

  /** Duración de un PULSO = duración de beat / subdivisión. */
  public getPulseDurationSec(): number {
    return (60.0 / this.config.bpm) / normalizeSubdivision(this.config.subdivision);
  }

  /** Disparo puntual de click acentuado (cuenta regresiva o pruebas). */
  public scheduleAccentClick(time: number, isAccent: boolean = true) {
    this.emitClick(time, isAccent, 0.7);
  }
}
