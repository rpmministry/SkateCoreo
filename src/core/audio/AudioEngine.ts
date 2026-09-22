import {
  AudioEngineState,
  ChannelRoutingMode,
  StateChangeCallback,
  TimeUpdateCallback
} from '../../types/audio';
import { ElementLog, ChoreographyPathPoint } from '../../types/choreography';
import { Metronome } from './Metronome';
import { VoiceCueEngine } from './VoiceCueEngine';
import { MediaSessionManager } from './MediaSession';
import { BpmDetector, BpmDetectionResult } from './BpmDetector';
import { renderChoreographyMixdown } from './audioMixdown';
import { adquirirPantallaActiva, liberarPantallaActiva } from '../system/wakeLock';
import { loadProgress } from '../../store/loadProgressStore';

/**
 * Lee un Blob/File como ArrayBuffer priorizando `FileReader`.
 *
 * Safari iOS 15+ presenta fallos conocidos con `Blob.prototype.arrayBuffer()`
 * (sobre todo con blobs grandes o tipos MIME ambiguos como `.m4a`/`.mp4`): la
 * promesa puede rechazar o resolver con 0 bytes. `FileReader.readAsArrayBuffer()`
 * es la ruta clásica y estable en WebKit, así que se usa como vía principal y
 * `Blob.arrayBuffer()` queda como respaldo moderno.
 */
function readBlobAsArrayBuffer(
  file: Blob,
  onProgress?: (fraction: number) => void
): Promise<ArrayBuffer> {
  if (typeof FileReader !== 'undefined') {
    return new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader();
      reader.onprogress = (e) => {
        if (onProgress && e.lengthComputable && e.total > 0) {
          onProgress(Math.max(0, Math.min(1, e.loaded / e.total)));
        }
      };
      reader.onload = () => {
        const result = reader.result;
        if (result instanceof ArrayBuffer && result.byteLength > 0) {
          onProgress?.(1);
          resolve(result);
        } else {
          reject(new Error('El archivo está vacío o no se pudo leer.'));
        }
      };
      reader.onerror = () => reject(reader.error || new Error('No se pudo leer el archivo de audio.'));
      reader.onabort = () => reject(new Error('Lectura de archivo cancelada.'));
      reader.readAsArrayBuffer(file);
    });
  }

  if (typeof file.arrayBuffer === 'function') {
    return file.arrayBuffer().then((buf) => {
      onProgress?.(1);
      return buf;
    });
  }
  return Promise.reject(new Error('Este navegador no puede leer archivos binarios.'));
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private audioBuffer: AudioBuffer | null = null;
  private sourceNode: AudioBufferSourceNode | null = null;

  // Sub-busses & Volume Nodes
  private musicGainNode: GainNode | null = null;
  private metronomeGainNode: GainNode | null = null;
  private voiceCueGainNode: GainNode | null = null;
  private coachBusGainNode: GainNode | null = null;

  // Strict L/R Routing Matrix Nodes
  private musicToLeftGain: GainNode | null = null;
  private musicToRightGain: GainNode | null = null;
  private coachToLeftGain: GainNode | null = null;
  private coachToRightGain: GainNode | null = null;
  private mergerNode: ChannelMergerNode | null = null;
  private masterGainNode: GainNode | null = null;

  // Sub-modules
  public metronome: Metronome;
  public voiceCueEngine: VoiceCueEngine;
  public mediaSession: MediaSessionManager;

  // Playback state
  private isPlaying = false;
  private startTime = 0;
  private pausedAtTime = 0;
  private playbackRate = 1.0;
  private pan = 0.0;
  private channelMode: ChannelRoutingMode = 'stereo'; // Default to stereo so both ears receive music and voice cleanly
  private musicVolume = 1.0;
  private coachVolume = 1.0;
  private durationMs = 0;
  private fileName: string | null = null;
  private rawBlob: Blob | null = null;
  private animationFrameId: number | null = null;


  // Pre-roll state — ÚNICA fuente de verdad del conteo de entrada a pista.
  private isPreRollActive = false;
  private preRollCountdown = 0;
  private preRollState: 'idle' | 'preparing' | 'counting' | 'starting' | 'cancelled' = 'idle';
  private preRollCancelToken = 0;
  private preRollTickerId: number | null = null;
  private preRollTimers: ReturnType<typeof setTimeout>[] = [];
  private preRollSources: AudioBufferSourceNode[] = [];

  // Listeners
  private timeUpdateCallbacks: Set<TimeUpdateCallback> = new Set();
  private stateChangeCallbacks: Set<StateChangeCallback> = new Set();

  // Bluetooth heuristic
  private isBluetoothDetected = false;
  private bluetoothWarning: string | null = null;

  constructor() {
    this.metronome = new Metronome();
    this.voiceCueEngine = new VoiceCueEngine();
    this.mediaSession = new MediaSessionManager();

    this.initVisibilityListener();
    this.initIosUnlockListener();
    this.setupMediaSession();
  }

  /**
   * DESBLOQUEO iOS / iPadOS (política de autoplay de Safari).
   *
   * WebKit crea el `AudioContext` en estado `suspended` y solo lo activa si
   * `resume()` se ejecuta DENTRO del gesto del usuario. Si el primer gesto es un
   * toque en un botón que no inicializa audio (p. ej. navegar), el contexto puede
   * quedar suspendido y la reproducción falla EN SILENCIO.
   *
   * Red de seguridad: en el PRIMER gesto real (pointerdown / touchend / keydown)
   * se reanuda el contexto si existe y sigue suspendido, y se reproduce un
   * buffer de silencio de 1 muestra para dejar el pipeline de hardware listo.
   * Es idempotente y no altera ninguna lógica de reproducción.
   */
  private initIosUnlockListener() {
    if (typeof document === 'undefined') return;

    const unlock = () => {
      const ctx = this.ctx;

      // Si todavía no existe el AudioContext, se CONSERVAN los listeners: el
      // gesto que realmente lo cree (cargar/reproducir) hará el desbloqueo.
      if (!ctx) return;

      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }

      try {
        // Buffer de silencio: "calienta" la salida de hardware en iOS.
        const silent = ctx.createBuffer(1, 1, ctx.sampleRate || 44100);
        const source = ctx.createBufferSource();
        source.buffer = silent;
        source.connect(ctx.destination);
        source.start(0);
      } catch (e) {
        /* No es crítico: solo es un refuerzo del desbloqueo. */
      }

      // Pre-genera el banco de voz del conteo en el primer gesto real: así el
      // Play no tiene que sintetizar nada en el instante crítico.
      void this.voiceCueEngine.prepareCountdownBank();

      document.removeEventListener('pointerdown', unlock, true);
      document.removeEventListener('touchend', unlock, true);
      document.removeEventListener('keydown', unlock, true);
    };

    document.addEventListener('pointerdown', unlock, true);
    document.addEventListener('touchend', unlock, true);
    document.addEventListener('keydown', unlock, true);
  }

  public initAudioContext() {
    if (!this.ctx) {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AudioCtxClass({ latencyHint: 'interactive' });

      // iOS WebKit silent switch bypass
      if ('audioSession' in navigator && (navigator as any).audioSession) {
        try {
          (navigator as any).audioSession.type = 'playback';
        } catch (e) {
          console.warn('[AudioEngine] audioSession.type no disponible:', e);
        }
      }

      // Master Gain
      this.masterGainNode = this.ctx.createGain();

      // Sub-busses
      this.musicGainNode = this.ctx.createGain();
      this.metronomeGainNode = this.ctx.createGain();
      this.voiceCueGainNode = this.ctx.createGain();
      this.coachBusGainNode = this.ctx.createGain();

      // Connect metronome and voice cue into coach sub-bus
      this.metronomeGainNode.connect(this.coachBusGainNode);
      this.voiceCueGainNode.connect(this.coachBusGainNode);

      // Create Strict Matrix Gain Nodes
      this.musicToLeftGain = this.ctx.createGain();
      this.musicToRightGain = this.ctx.createGain();
      this.coachToLeftGain = this.ctx.createGain();
      this.coachToRightGain = this.ctx.createGain();

      // Connect music to matrix
      this.musicGainNode.connect(this.musicToLeftGain);
      this.musicGainNode.connect(this.musicToRightGain);

      // Connect coach to matrix
      this.coachBusGainNode.connect(this.coachToLeftGain);
      this.coachBusGainNode.connect(this.coachToRightGain);

      // Create 2-channel merger (0 = Left, 1 = Right)
      this.mergerNode = this.ctx.createChannelMerger(2);

      this.musicToLeftGain.connect(this.mergerNode, 0, 0);
      this.coachToLeftGain.connect(this.mergerNode, 0, 0);

      this.musicToRightGain.connect(this.mergerNode, 0, 1);
      this.coachToRightGain.connect(this.mergerNode, 0, 1);

      this.mergerNode.connect(this.masterGainNode);
      this.masterGainNode.connect(this.ctx.destination);

      // Initialize sub-modules with AudioContext & nodes
      this.metronome.init(this.ctx, this.metronomeGainNode);
      this.voiceCueEngine.init(this.ctx, this.voiceCueGainNode);

      this.updateMatrixGains();
      // Reaplicar el estado de silencio si el usuario ya había silenciado algo
      // antes de inicializar el contexto de audio.
      this.applyBusMutes();
    }

    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  private setupMediaSession() {
    this.mediaSession.init({
      onPlay: () => this.play(),
      onPause: () => this.pause(),
      onStop: () => this.stop(),
      onSeekBackward: (sec) => {
        const target = Math.max(0, this.getCurrentTimeMs() - sec * 1000);
        this.seek(target);
      },
      onSeekForward: (sec) => {
        const target = Math.min(this.durationMs, this.getCurrentTimeMs() + sec * 1000);
        this.seek(target);
      },
      onSeekTo: (posSec) => {
        this.seek(posSec * 1000);
      }
    });
  }

  private initVisibilityListener() {
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (!this.ctx) return;
        if (document.visibilityState === 'hidden') {
          if (!this.isPlaying) {
            this.ctx.suspend().catch(() => {});
          }
        } else {
          if (this.ctx.state === 'suspended' && this.isPlaying) {
            this.ctx.resume().catch(() => {});
          }
        }
      });
    }
  }

  /**
   * Actualiza las ganancias de la matriz L/R para garantizar aislamiento estricto
   */
  public updateMatrixGains() {
    if (
      !this.ctx ||
      !this.musicToLeftGain ||
      !this.musicToRightGain ||
      !this.coachToLeftGain ||
      !this.coachToRightGain
    ) {
      return;
    }

    const now = this.ctx.currentTime;
    const mVol = Math.max(0, Math.min(1, this.musicVolume));
    const cVol = Math.max(0, Math.min(1, this.coachVolume));

    let musicL = 0;
    let musicR = 0;
    let coachL = 0;
    let coachR = 0;

    switch (this.channelMode) {
      case 'split-coach':
        // Modo Pista + Coach:
        // Left = 100% Música (Pista/PA). Cero guías.
        // Right = 100% Coach (Metrónomo + Voz). Cero música.
        musicL = mVol;
        musicR = 0.0;
        coachL = 0.0;
        coachR = cVol;
        break;

      case 'stereo':
        // Ambos canales reciben música y guías completas
        musicL = mVol;
        musicR = mVol;
        coachL = cVol;
        coachR = cVol;
        break;

      case 'solo-music':
        // Solo música en ambos canales (modo presentación/competición)
        musicL = mVol;
        musicR = mVol;
        coachL = 0.0;
        coachR = 0.0;
        break;

      case 'solo-coach':
        // Solo metrónomo y guías vocales (entrenamiento de tiempo puro)
        musicL = 0.0;
        musicR = 0.0;
        coachL = cVol;
        coachR = cVol;
        break;

      case 'solo-left':
        // 100% canal izquierdo, 0% canal derecho absoluto
        musicL = mVol;
        musicR = 0.0;
        coachL = cVol;
        coachR = 0.0;
        break;

      case 'solo-right':
        // 100% canal derecho, 0% canal izquierdo absoluto
        musicL = 0.0;
        musicR = mVol;
        coachL = 0.0;
        coachR = cVol;
        break;
    }

    this.musicToLeftGain.gain.setValueAtTime(musicL, now);
    this.musicToRightGain.gain.setValueAtTime(musicR, now);
    this.coachToLeftGain.gain.setValueAtTime(coachL, now);
    this.coachToRightGain.gain.setValueAtTime(coachR, now);
  }

  public setChannelMode(mode: ChannelRoutingMode) {
    this.channelMode = mode;
    this.updateMatrixGains();
    this.emitStateChange();
  }

  /* ── Silenciadores absolutos por sub-bus ─────────────────────────
     Cada canal tiene su propio GainNode antes del bus de coach/música.
     Se usa `setValueAtTime` (cambio ABSOLUTO e inmediato) en lugar de
     `setEnabled(false)`, que solo evita programar sonidos nuevos: el
     metrónomo y las voces se programan con lookahead, así que al silenciar
     quedaban clics/avisos ya agendados sonando. Poner el gain a 0 silencia
     también lo ya programado, sin detener ni resincronizar la pista maestra. */

  private musicMuted = false;
  private metronomeMuted = false;
  private voiceGuideMuted = false;

  /** Aplica los silenciadores a los GainNode de cada sub-bus. */
  private applyBusMutes() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    this.musicGainNode?.gain.setValueAtTime(this.musicMuted ? 0 : 1, now);
    this.metronomeGainNode?.gain.setValueAtTime(this.metronomeMuted ? 0 : 1, now);
    this.voiceCueGainNode?.gain.setValueAtTime(this.voiceGuideMuted ? 0 : 1, now);
  }

  public setMusicMuted(muted: boolean) {
    this.musicMuted = muted;
    this.applyBusMutes();
    this.emitStateChange();
  }

  /**
   * Control ÚNICO de audición del metrónomo (una sola fuente de verdad).
   *
   * Coordina las tres capas que antes podían desincronizarse entre la Pista 2D
   * y el Estudio: el habilitado lógico, el planificador y el GainNode del
   * sub-bus. Es el método que deben usar ambos controles de la interfaz.
   */
  public setMetronomeAudible(audible: boolean) {
    this.metronomeMuted = !audible;
    this.metronome.setEnabled(audible);
    if (!audible) {
      this.metronome.suspend();
    }
    this.applyBusMutes();
    this.emitStateChange();
  }

  public setVoiceGuideMuted(muted: boolean) {
    this.voiceGuideMuted = muted;
    this.applyBusMutes();
    this.emitStateChange();
  }

  public isMusicMuted(): boolean {
    return this.musicMuted;
  }

  public isMetronomeMuted(): boolean {
    return this.metronomeMuted;
  }

  public isVoiceGuideMuted(): boolean {
    return this.voiceGuideMuted;
  }

  /**
   * Reaplica los silenciadores a partir del estado del store.
   * Se invoca al inicializar el AudioContext y tras hidratar el estado.
   */
  public syncBusMutes(flags: {
    music?: boolean;
    metronome?: boolean;
    voiceGuide?: boolean;
  }) {
    if (flags.music !== undefined) this.musicMuted = flags.music;
    if (flags.metronome !== undefined) {
      this.metronomeMuted = flags.metronome;
      if (flags.metronome) this.metronome.suspend();
      else this.metronome.resume();
    }
    if (flags.voiceGuide !== undefined) this.voiceGuideMuted = flags.voiceGuide;
    this.applyBusMutes();
  }

  public setMusicVolume(vol: number) {
    this.musicVolume = Math.max(0, Math.min(1, vol));
    this.updateMatrixGains();
    this.emitStateChange();
  }

  public setCoachVolume(vol: number) {
    this.coachVolume = Math.max(0, Math.min(1, vol));
    this.updateMatrixGains();
    this.emitStateChange();
  }

  public setPan(pan: number) {
    this.pan = Math.max(-1.0, Math.min(1.0, pan));
    this.updateMatrixGains();
    this.emitStateChange();
  }

  /**
   * @deprecated La Voz Guía es SIEMPRE femenina latina. Se conserva por
   * compatibilidad; el motor de cues fuerza el género femenino.
   */
  public setVoiceGender(_gender?: 'female') {
    this.voiceCueEngine.setVoiceGender('female');
    this.emitStateChange();
  }

  /** Género de la Voz Guía (fuente única: el motor de cues). Siempre femenino. */
  public getVoiceGender(): 'female' {
    return this.voiceCueEngine.getVoiceGender();
  }

  /**
   * Sincroniza los puntos y figuras de la pista 2D con el secuenciador de alertas vocales (3, 2, 1, ¡Ya!)
   */
  public setNodes(nodes: ChoreographyPathPoint[]) {
    this.voiceCueEngine.loadNodes(nodes);
  }

  public getAudioBuffer(): AudioBuffer | null {
    return this.audioBuffer;
  }

  public getRawAudioBlob(): Blob | null {
    return this.rawBlob;
  }


  /**
   * Instala un nuevo buffer maestro.
   *
   * @param preservePosition Conserva el cabezal actual en lugar de volver a 0:00.
   *   Se usa al re-renderizar la mezcla (consolidación) para no expulsar al
   *   usuario de su punto de trabajo.
   */
  public setAudioBuffer(
    buffer: AudioBuffer,
    fileName?: string | null,
    preservePosition: boolean = false
  ) {
    const previousPosition = this.pausedAtTime;
    this.stop();
    this.audioBuffer = buffer;
    this.durationMs = Math.round(buffer.duration * 1000);
    if (fileName !== undefined) {
      this.fileName = fileName;
    }
    this.pausedAtTime = preservePosition
      ? Math.max(0, Math.min(previousPosition, this.durationMs))
      : 0;
    this.mediaSession.updateMetadata(this.fileName || 'Pista de Audio');
    this.emitStateChange();
  }

  /**
   * Vacía por completo el audio cargado (sin reproducir nada). Se usa al cambiar
   * de cuenta para que una sesión nueva arranque SIN la pista del usuario previo.
   */
  public clearAudioBuffer() {
    this.stop();
    this.audioBuffer = null;
    this.rawBlob = null;
    this.fileName = null;
    this.durationMs = 0;
    this.pausedAtTime = 0;
    this.mediaSession.updateMetadata('Sin pista');
    this.emitTimeUpdate(0);
    this.emitStateChange();
  }

  /**
   * Núcleo de lectura + decodificación, con reporte de progreso real.
   *
   * El porcentaje informado combina dos fases medidas de verdad:
   *  - Lectura del archivo (FileReader.onprogress): 2% → 70%.
   *  - Decodificación por hardware (`decodeAudioData`): 74% → 88%.
   * No se inventan temporizadores: si la lectura es instantánea, el porcentaje
   * salta de inmediato a la fase de decodificación.
   */
  private async readAndDecode(
    file: File | Blob,
    onStage?: (percent: number, label: string) => void
  ): Promise<AudioBuffer> {
    this.initAudioContext();
    if (!this.ctx) throw new Error('No se pudo inicializar AudioContext');

    if (this.ctx.state === 'suspended') {
      await this.ctx.resume().catch(() => {});
    }

    onStage?.(2, 'Leyendo archivo…');

    // Lectura Safari-safe (FileReader) + copia defensiva: `decodeAudioData` de
    // WebKit antiguo "consume" (detacha) el ArrayBuffer, así que se le entrega
    // siempre un buffer propio que no rompa el blob original.
    const arrayBuffer = await readBlobAsArrayBuffer(file, (fraction) => {
      onStage?.(2 + fraction * 68, 'Leyendo archivo…');
    });
    const copy = arrayBuffer.slice(0);

    onStage?.(74, 'Decodificando audio…');

    const decoded = await new Promise<AudioBuffer>((resolve, reject) => {
      // Fallback dual promesa/callback para compatibilidad con Safari iOS y Android Chrome
      const promise = this.ctx!.decodeAudioData(
        copy,
        (decodedBuffer) => resolve(decodedBuffer),
        (err) => reject(err || new Error('Fallo al decodificar audio. Verifique que sea un archivo de audio compatible (.mp3, .wav, .m4a, .aac).'))
      );
      if (promise && typeof promise.then === 'function') {
        promise.then(resolve).catch((err) => {
          reject(new Error('Fallo al decodificar audio: ' + (err?.message || 'Formato no soportado')));
        });
      }
    });

    onStage?.(88, 'Preparando pista…');
    return decoded;
  }

  /**
   * Decodifica cualquier archivo o Blob de audio sin alterar el buffer maestro ni detener la reproducción.
   * Reporta el progreso real al indicador global.
   */
  public async decodeAudioFile(file: File | Blob): Promise<AudioBuffer> {
    loadProgress.begin('Cargando audio…');
    try {
      const decoded = await this.readAndDecode(file, (percent, label) =>
        loadProgress.report(percent, label)
      );
      loadProgress.report(100, 'Listo');
      return decoded;
    } finally {
      loadProgress.done();
    }
  }

  public async loadAudioFile(file: File | Blob, name?: string): Promise<AudioBuffer> {
    this.initAudioContext();
    if (!this.ctx) throw new Error('No se pudo inicializar AudioContext');

    // Mantener la pantalla activa durante la decodificación y el análisis de BPM:
    // en iOS, si la pantalla se apaga, la pestaña se suspende a mitad de la carga.
    await adquirirPantallaActiva();

    loadProgress.begin('Cargando pista…');

    try {
      this.stop();
      this.fileName = name || (file instanceof File ? file.name : 'pista_audio.wav');
      this.rawBlob = file instanceof Blob ? file : new Blob([file]);

      // Lectura + decodificación (0–88%) con progreso real medido.
      const decoded = await this.readAndDecode(file, (percent, label) =>
        loadProgress.report(percent, label)
      );
      this.audioBuffer = decoded;
      this.durationMs = Math.round(decoded.duration * 1000);
      this.pausedAtTime = 0;

      // Detectar y ajustar BPM automáticamente si la pista tiene transitorios rítmicos claros
      loadProgress.report(92, 'Analizando tempo (BPM)…');
      this.detectAndApplyBpm(this.audioBuffer);

      // Pre-calienta el banco de voz del conteo (una sola voz) mientras el
      // usuario aún está en la pantalla de carga: cero delay al pulsar Play.
      void this.voiceCueEngine.prepareCountdownBank();

      this.mediaSession.updateMetadata(this.fileName);
      await this.checkBluetoothAndLatency();
      loadProgress.report(100, 'Listo');
      this.emitStateChange();
      return this.audioBuffer;
    } finally {
      void liberarPantallaActiva();
      loadProgress.done();
    }
  }

  /**
   * Estimador de BPM y fase rítmica por DSP (Filtro Pasa-Bajos + Flujo de Energía + Autocorrelación)
   */
  public detectAndApplyBpm(buffer: AudioBuffer): number {
    try {
      const result = BpmDetector.detect(buffer);
      if (result.confidence >= 0.25 && result.bpm >= 60 && result.bpm <= 220) {
        this.metronome.setBpm(result.bpm);
        if (result.phaseOffsetSec > 0) {
          this.metronome.setPhaseOffset(result.phaseOffsetSec);
        }
        return result.bpm;
      }
    } catch (e) {
      console.warn('[AudioEngine] No se pudo estimar el BPM automáticamente con BpmDetector:', e);
    }
    return this.metronome.getConfig().bpm;
  }

  /**
   * Ejecuta el análisis DSP detallado del buffer cargado
   */
  public detectBpm(): BpmDetectionResult {
    if (!this.audioBuffer) {
      return { bpm: this.metronome.getConfig().bpm, confidence: 0, phaseOffsetSec: 0 };
    }
    return BpmDetector.detect(this.audioBuffer);
  }

  /**
   * Sincroniza la pista de música para que encaje exactamente con el tempo objetivo del metrónomo
   * mediante ajuste dinámico de playbackRate (Time-Stretching)
   */
  public syncTrackToBpm(targetBpm: number): number {
    if (!this.audioBuffer) return 1.0;
    const detected = this.detectBpm();
    if (detected.bpm > 0) {
      const rate = Math.max(0.5, Math.min(2.0, targetBpm / detected.bpm));
      this.setPlaybackRate(Math.round(rate * 1000) / 1000);
      return rate;
    }
    return 1.0;
  }

  // NOTA: se eliminó `generateDemoTrack()`. La aplicación arranca en «lienzo en
  // blanco»: no se pre-carga ninguna pista de música de ejemplo. El usuario
  // importa su propia música con «Cargar Audio».

  public ensureAudioBuffer(): AudioBuffer {
    if (this.audioBuffer) return this.audioBuffer;
    this.initAudioContext();
    if (!this.ctx) throw new Error('AudioContext no disponible');

    const sampleRate = this.ctx.sampleRate;
    const durationSec = 120; // 2 minutos
    const numSamples = sampleRate * durationSec;
    const buffer = this.ctx.createBuffer(2, numSamples, sampleRate);

    const leftChannel = buffer.getChannelData(0);
    const rightChannel = buffer.getChannelData(1);

    const bpm = this.metronome.getConfig().bpm || 120;
    const beatInterval = 60 / bpm;

    for (let i = 0; i < numSamples; i++) {
      const t = i / sampleRate;
      const beatProgress = (t % beatInterval) / beatInterval;
      const beatNum = Math.floor(t / beatInterval) % 3;
      let sample = 0;

      if (beatNum === 0) {
        const env = Math.exp(-beatProgress * 15);
        sample += Math.sin(2 * Math.PI * 70 * (1 - beatProgress * 0.5) * t) * env * 0.6;
      } else {
        const env = Math.exp(-beatProgress * 8);
        const freq = beatNum === 1 ? 440 : 523.25;
        sample += Math.sin(2 * Math.PI * freq * t) * env * 0.25;
      }

      const melodyFreq = 220 + Math.sin(t * 0.5) * 80;
      sample += Math.sin(2 * Math.PI * melodyFreq * t) * 0.08;

      leftChannel[i] = sample;
      rightChannel[i] = sample;
    }

    this.audioBuffer = buffer;
    this.durationMs = durationSec * 1000;
    this.fileName = 'Pista_RollArt_CarlosTango_Demo.wav';
    this.pausedAtTime = 0;
    this.mediaSession.updateMetadata(this.fileName);
    this.emitStateChange();
    return buffer;
  }

  public trimAudio(startMs: number, endMs: number): AudioBuffer {
    this.initAudioContext();
    if (!this.audioBuffer || !this.ctx) throw new Error('No hay audio cargado para recortar');

    const sampleRate = this.audioBuffer.sampleRate;
    const numChannels = this.audioBuffer.numberOfChannels;

    const startSec = Math.max(0, startMs / 1000);
    const endSec = Math.min(this.audioBuffer.duration, endMs / 1000);
    if (endSec <= startSec) throw new Error('El tiempo final debe ser mayor que el tiempo inicial');

    const startSample = Math.floor(startSec * sampleRate);
    const endSample = Math.floor(endSec * sampleRate);
    const frameCount = Math.max(1, endSample - startSample);

    const newBuffer = this.ctx.createBuffer(numChannels, frameCount, sampleRate);

    for (let ch = 0; ch < numChannels; ch++) {
      const srcData = this.audioBuffer.getChannelData(ch);
      const destData = newBuffer.getChannelData(ch);
      for (let i = 0; i < frameCount; i++) {
        destData[i] = srcData[startSample + i] || 0;
      }
    }

    const trimmedName = (this.fileName ? this.fileName.replace(/\.[^/.]+$/, '') : 'pista') + '_recortada.wav';
    this.setAudioBuffer(newBuffer, trimmedName);
    return newBuffer;
  }

  public applyFades(fadeInSec: number, fadeOutSec: number): AudioBuffer {
    this.initAudioContext();
    if (!this.audioBuffer || !this.ctx) throw new Error('No hay audio cargado');

    const sampleRate = this.audioBuffer.sampleRate;
    const numChannels = this.audioBuffer.numberOfChannels;
    const totalFrames = this.audioBuffer.length;

    const fadeInFrames = Math.min(totalFrames, Math.floor(Math.max(0, fadeInSec) * sampleRate));
    const fadeOutFrames = Math.min(totalFrames, Math.floor(Math.max(0, fadeOutSec) * sampleRate));

    const newBuffer = this.ctx.createBuffer(numChannels, totalFrames, sampleRate);

    for (let ch = 0; ch < numChannels; ch++) {
      const src = this.audioBuffer.getChannelData(ch);
      const dst = newBuffer.getChannelData(ch);

      for (let i = 0; i < totalFrames; i++) {
        let gain = 1.0;
        if (fadeInFrames > 0 && i < fadeInFrames) {
          gain = Math.sin((i / fadeInFrames) * (Math.PI / 2));
        }
        if (fadeOutFrames > 0 && i >= totalFrames - fadeOutFrames) {
          const offset = i - (totalFrames - fadeOutFrames);
          gain *= Math.cos((offset / fadeOutFrames) * (Math.PI / 2));
        }
        dst[i] = src[i] * gain;
      }
    }

    this.setAudioBuffer(newBuffer, this.fileName);
    return newBuffer;
  }

  public concatenateAudioTracks(buffers: AudioBuffer[], crossfadeSec: number = 0.5): AudioBuffer {
    this.initAudioContext();
    if (!this.ctx) throw new Error('AudioContext no inicializado');
    if (buffers.length === 0) throw new Error('No se han provisto pistas');
    if (buffers.length === 1) {
      this.setAudioBuffer(buffers[0], this.fileName);
      return buffers[0];
    }

    const sampleRate = this.ctx.sampleRate;
    const numChannels = 2;

    let totalDurationSec = 0;
    for (let i = 0; i < buffers.length; i++) {
      totalDurationSec += buffers[i].duration;
      if (i > 0 && crossfadeSec > 0) {
        totalDurationSec -= crossfadeSec;
      }
    }

    const totalFrames = Math.max(1, Math.floor(totalDurationSec * sampleRate));
    const outBuffer = this.ctx.createBuffer(numChannels, totalFrames, sampleRate);
    const outL = outBuffer.getChannelData(0);
    const outR = outBuffer.getChannelData(1);

    let currentOffset = 0;

    for (let bIdx = 0; bIdx < buffers.length; bIdx++) {
      const b = buffers[bIdx];
      const bFrames = b.length;
      const bLeft = b.getChannelData(0);
      const bRight = b.numberOfChannels > 1 ? b.getChannelData(1) : bLeft;

      const crossFrames = bIdx > 0 ? Math.floor(crossfadeSec * sampleRate) : 0;
      const insertStart = Math.max(0, currentOffset - crossFrames);

      for (let i = 0; i < bFrames; i++) {
        const targetIdx = insertStart + i;
        if (targetIdx >= totalFrames) break;

        let gain = 1.0;
        if (crossFrames > 0 && i < crossFrames) {
          gain = i / crossFrames;
        }

        outL[targetIdx] = (outL[targetIdx] || 0) + bLeft[i] * gain;
        outR[targetIdx] = (outR[targetIdx] || 0) + bRight[i] * gain;
      }

      currentOffset = insertStart + bFrames;
    }

    this.setAudioBuffer(outBuffer, 'Pista_Maestra_Unida.wav');
    return outBuffer;
  }

  public exportBufferToWav(buffer?: AudioBuffer): Blob {
    const buf = buffer || this.audioBuffer;
    if (!buf) throw new Error('No hay audio cargado para exportar');

    const numChannels = buf.numberOfChannels;
    const sampleRate = buf.sampleRate;
    const length = buf.length * numChannels * 2;
    const bufferArray = new ArrayBuffer(44 + length);
    const view = new DataView(bufferArray);

    view.setUint32(0, 0x52494646, false); // "RIFF"
    view.setUint32(4, 36 + length, true);
    view.setUint32(8, 0x57415645, false); // "WAVE"

    view.setUint32(12, 0x666d7420, false); // "fmt "
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numChannels * 2, true);
    view.setUint16(32, numChannels * 2, true);
    view.setUint16(34, 16, true);

    view.setUint32(36, 0x64617461, false); // "data"
    view.setUint32(40, length, true);

    let offset = 44;
    const channels: Float32Array[] = [];
    for (let ch = 0; ch < numChannels; ch++) {
      channels.push(buf.getChannelData(ch));
    }

    for (let i = 0; i < buf.length; i++) {
      for (let ch = 0; ch < numChannels; ch++) {
        const sample = Math.max(-1, Math.min(1, channels[ch][i]));
        const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
        view.setInt16(offset, intSample, true);
        offset += 2;
      }
    }

    return new Blob([view], { type: 'audio/wav' });
  }

  /**
   * Exporta la mezcla estéreo completa con aislamiento L/R por hardware (OfflineAudioContext):
   * Canal Derecho (R): Pista de música limpia (0% metrónomo, 0% voz de coach).
   * Canal Izquierdo (L): Pista del entrenador (100% metrónomo + 100% guías vocales TTS, 0% música).
   */
  public async exportStereoMixdown(points?: ChoreographyPathPoint[]): Promise<Blob> {
    if (!this.audioBuffer) {
      throw new Error('No hay pista de audio cargada para exportar la mezcla');
    }

    return renderChoreographyMixdown({
      musicBuffer: this.audioBuffer,
      bpm: this.metronome.getConfig().bpm,
      beatsPerMeasure: this.metronome.getConfig().beatsPerMeasure,
      metronomeEnabled: this.metronome.getConfig().enabled,
      voiceCuesEnabled: this.voiceCueEngine.getConfig().enabled,
      warningLeadTimeSec: this.voiceCueEngine.getConfig().warningLeadTimeSec,
      musicVolume: this.musicVolume,
      coachVolume: this.coachVolume,
      points: points || [],
      playbackRate: this.playbackRate
    });
  }

  public async checkBluetoothAndLatency(): Promise<boolean> {
    this.isBluetoothDetected = false;
    this.bluetoothWarning = null;

    try {
      if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const btKeywords = ['bluetooth', 'airpod', 'wireless', 'hands-free', 'auricular'];
        const hasBt = devices.some((d) => btKeywords.some((kw) => (d.label || '').toLowerCase().includes(kw)));
        if (hasBt) {
          this.isBluetoothDetected = true;
        }
      }

      if (this.ctx && (this.ctx as any).outputLatency && (this.ctx as any).outputLatency > 0.08) {
        this.isBluetoothDetected = true;
      }

      if (this.isBluetoothDetected) {
        this.bluetoothWarning =
          'Latencia inalámbrica detectada. Para calibrar compases de alta precisión, se recomienda usar altavoz o auriculares con cable.';
      }
    } catch (e) {}

    this.emitStateChange();
    return this.isBluetoothDetected;
  }

  /**
   * Carga los elementos técnicos del programa para que la guía de voz los avise con anticipación
   */
  public setProgramElementsForCues(elements: ElementLog[]) {
    this.voiceCueEngine.loadProgramElements(elements);
  }

  /**
   * Inicia la reproducción.
   *
   * Si hay "Espera Pre-roll (entrada a pista)" configurada (>0 s) y arrancamos
   * desde el inicio, se lee la INTRO hablada ("3, 2, 1, ¡Ya!") y, al terminar el
   * conteo, suena la música. La cuenta atrás se lanza de forma SÍNCRONA: no
   * espera a ninguna promesa de red (TTS) ni a buffers externos; el único retardo
   * es el propio conteo configurado. Con pre-roll a 0, la música arranca de
   * inmediato.
   *
   * Las figuras se siguen agendando por nodos de la Pista 2D contra el reloj del
   * timeline (`startSync`) dentro de `executePlay`.
   */
  public play(offsetMs?: number, options?: { countIn?: boolean }) {
    this.initAudioContext();
    if (!this.ctx) return;

    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }

    const currentOffset = offsetMs !== undefined ? offsetMs : this.pausedAtTime;
    const isAtStart = currentOffset < 100;
    // El count-in (entrada a pista) es para la Pista 2D. El Estudio puede pedir
    // arranque directo con `{ countIn: false }`.
    const wantCountIn = options?.countIn !== false;

    if (
      wantCountIn &&
      isAtStart &&
      this.voiceCueEngine.getConfig().introDelaySec > 0 &&
      !this.isPlaying &&
      !this.isPreRollActive
    ) {
      this.startPreRoll();
      return;
    }

    this.executePlay(currentOffset);
  }

  /** Alias histórico: reproduce con la cuenta atrás hablada configurada. */
  public playWithPreRoll(offsetMs?: number) {
    this.play(offsetMs);
  }

  /**
   * Pre-Inicio (countdown) DETERMINISTA y perfectamente sincronizado.
   *
   * Arquitectura:
   *  1. `prepareCountdownBank()` pre-genera TODO el conteo con la voz estándar
   *     (una sola voz, lista antes del instante crítico → cero delay).
   *  2. Se elige un instante FUTURO exacto `musicStart` en el reloj de audio.
   *  3. Se agendan los números y el "¡Ya!" en ese mismo reloj, y la fuente de
   *     música con `start(musicStart, offset)`. Sin cadenas de `setTimeout`
   *     midiendo el tiempo → sin deriva.
   *  4. Un ÚNICO bucle de frames (reloj de audio) actualiza el número visible y
   *     conmuta a "playing" en `musicStart`.
   */
  private startPreRoll() {
    const ctx = this.ctx;
    if (!ctx) return;

    const n = Math.max(0, Math.min(30, Math.round(this.voiceCueEngine.getConfig().introDelaySec)));
    if (n <= 0) {
      this.executePlay(this.pausedAtTime);
      return;
    }

    // Idempotencia: cancelar cualquier pre-roll previo (nada de countdowns dobles).
    this.cancelPreRoll(true);
    const token = ++this.preRollCancelToken;

    this.preRollState = 'preparing';
    this.isPreRollActive = true;
    this.preRollCountdown = n;
    // El metrónomo se detiene durante el conteo (la intro manda).
    this.metronome.stop();
    this.emitStateChange();

    void (async () => {
      // 1. Voz pregenerada (una sola voz) lista ANTES de contar.
      await this.voiceCueEngine.prepareCountdownBank();
      if (token !== this.preRollCancelToken || !this.ctx) return;

      // 2. Instante exacto de arranque de la música (con margen de agendado).
      const lead = 0.12;
      const musicStart = this.ctx.currentTime + lead + n;
      this.preRollState = 'counting';

      // 3. Música agendada para `musicStart` (silenciosa hasta entonces).
      if (!this.scheduleMusicSourceAt(musicStart, 0)) {
        this.cancelPreRoll();
        return;
      }

      // 3b. Voces: n…1 en cada segundo y "¡Ya!" justo antes del inicio.
      for (let i = 0; i < n; i++) {
        this.schedulePreRollVoice(String(n - i), musicStart - n + i);
      }
      const yaBuffer = this.voiceCueEngine.getCountdownBuffer('ya');
      const yaDur = yaBuffer ? yaBuffer.duration : 0.42;
      this.schedulePreRollVoice('ya', Math.max(musicStart - n + 0.05, musicStart - yaDur));

      this.preRollState = 'starting';

      // 4. Ticker único basado en el reloj de audio (no acumula error).
      const tick = () => {
        if (token !== this.preRollCancelToken || !this.ctx) return;
        const remaining = musicStart - this.ctx.currentTime;
        // El rótulo visual sigue EXACTAMENTE a la voz: durante el último tramo
        // (duración del "¡Ya!") se muestra 0 → la UI pinta "¡YA!" mientras la
        // voz lo dice, y la música entra justo después.
        const display = remaining <= yaDur ? 0 : Math.ceil(remaining - yaDur);
        if (display !== this.preRollCountdown) {
          this.preRollCountdown = display;
          this.emitStateChange();
        }
        if (remaining <= 0) {
          this.preRollTickerId = null;
          this.beginPlaybackAt(musicStart, 0);
          return;
        }
        this.preRollTickerId = globalThis.requestAnimationFrame(tick);
      };
      this.preRollTickerId = globalThis.requestAnimationFrame(tick);
    })();
  }

  /** Agenda la fuente de música para un instante EXACTO del reloj de audio. */
  private scheduleMusicSourceAt(whenCtxTime: number, offsetMs: number): boolean {
    if (!this.ctx || !this.musicGainNode) return false;
    if (!this.audioBuffer) this.ensureAudioBuffer();
    if (!this.audioBuffer) return false;

    if (this.isPlaying) this.stopSource();

    const clampedOffsetSec = Math.max(0, Math.min(offsetMs / 1000, this.audioBuffer.duration));

    this.sourceNode = this.ctx.createBufferSource();
    this.sourceNode.buffer = this.audioBuffer;
    this.sourceNode.playbackRate.value = this.playbackRate;
    this.sourceNode.connect(this.musicGainNode);
    this.updateMatrixGains();

    this.sourceNode.onended = () => {
      if (this.isPlaying && this.getCurrentTimeMs() >= this.durationMs - 150) {
        this.stop();
      }
    };

    this.startTime = whenCtxTime - clampedOffsetSec / this.playbackRate;
    this.sourceNode.start(whenCtxTime, clampedOffsetSec);
    return true;
  }

  /** Conmuta a "playing" exactamente en el instante agendado de la música. */
  private beginPlaybackAt(whenCtxTime: number, offsetMs: number) {
    const clampedOffsetSec = Math.max(0, Math.min(offsetMs / 1000, this.audioBuffer?.duration ?? 0));

    this.isPreRollActive = false;
    this.preRollState = 'idle';
    this.preRollCountdown = 0;
    this.isPlaying = true;

    // Metrónomo y voz anclados al MISMO instante absoluto que la música.
    this.metronome.start(clampedOffsetSec, this.playbackRate, whenCtxTime);
    // UNA SOLA FUENTE RÍTMICA: con el metrónomo sonando, se silencian los beeps
    // de acento de los cues (sin "doble metrónomo").
    const metronomeAudible = this.metronome.getConfig().enabled && !this.metronomeMuted;
    this.voiceCueEngine.setCueTicksEnabled(!metronomeAudible);
    this.voiceCueEngine.resetTriggeredCues(offsetMs);
    this.voiceCueEngine.startSync(
      whenCtxTime - clampedOffsetSec / this.playbackRate,
      this.playbackRate
    );

    this.mediaSession.updatePlaybackState(true);
    this.mediaSession.updatePositionState(this.durationMs / 1000, clampedOffsetSec, this.playbackRate);

    this.lastTimeEmitMs = -1;
    this.startTracking();
    this.emitStateChange();
  }

  /**
   * Reproduce una voz del conteo con UNA ÚNICA voz estándar.
   * Si el banco natural está listo, usa el AudioBuffer agendado (cero delay);
   * si no, cae al sintetizador del navegador (misma voz para todo el conteo).
   */
  private schedulePreRollVoice(value: string, whenCtxTime: number) {
    const ctx = this.ctx;
    if (!ctx) return;

    const buffer = this.voiceCueEngine.getCountdownBuffer(value);
    const volume = Math.max(0, Math.min(1, this.voiceCueEngine.getConfig().volume ?? 1));

    if (buffer && this.coachBusGainNode) {
      try {
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        const gain = ctx.createGain();
        gain.gain.value = volume;
        source.connect(gain);
        gain.connect(this.coachBusGainNode);
        this.preRollSources.push(source);
        source.onended = () => {
          this.preRollSources = this.preRollSources.filter((s) => s !== source);
          try {
            source.disconnect();
            gain.disconnect();
          } catch {
            /* ya desconectado */
          }
        };
        source.start(Math.max(ctx.currentTime, whenCtxTime));
        return;
      } catch {
        /* cae al respaldo de voz del navegador */
      }
    }

    const words: Record<string, string> = {
      '1': 'uno', '2': 'dos', '3': 'tres', '4': 'cuatro',
      '5': 'cinco', '6': 'seis', '7': 'siete', '8': 'ocho', 'ya': '¡Ya!',
    };
    const text = words[value] ?? value;
    const token = this.preRollCancelToken;
    const delayMs = Math.max(0, (whenCtxTime - ctx.currentTime) * 1000);
    const id = globalThis.setTimeout(() => {
      if (token === this.preRollCancelToken) this.voiceCueEngine.speakCountdown(text);
    }, delayMs);
    this.preRollTimers.push(id);
  }

  /**
   * Cancela el pre-roll por completo: timers, ticker, voces agendadas y la
   * música pendiente. No deja procesos huérfanos en segundo plano.
   */
  private cancelPreRoll(silent = false) {
    this.preRollCancelToken++;

    if (this.preRollTickerId !== null) {
      globalThis.cancelAnimationFrame(this.preRollTickerId);
      this.preRollTickerId = null;
    }
    for (const id of this.preRollTimers) globalThis.clearTimeout(id);
    this.preRollTimers = [];

    for (const src of this.preRollSources) {
      try {
        src.stop();
        src.disconnect();
      } catch {
        /* ya detenido */
      }
    }
    this.preRollSources = [];

    // La música pudo quedar agendada en el futuro: se descarta.
    if (this.preRollState === 'counting' || this.preRollState === 'starting') {
      this.stopSource();
    }

    const changed = this.isPreRollActive || this.preRollCountdown !== 0 || this.preRollState !== 'idle';
    this.isPreRollActive = false;
    this.preRollCountdown = 0;
    this.preRollState = 'idle';

    this.voiceCueEngine.cancelPreRoll();
    if (changed && !silent) this.emitStateChange();
  }

  private executePlay(offsetMs: number) {
    this.initAudioContext();
    if (!this.ctx || !this.musicGainNode) return;

    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }

    const when = this.ctx.currentTime;
    if (!this.scheduleMusicSourceAt(when, offsetMs)) return;
    this.beginPlaybackAt(when, offsetMs);
  }

  public pause() {
    // Cancela por completo cualquier pre-roll (ticker, voces, música agendada).
    this.cancelPreRoll(true);

    this.metronome.stop();
    this.voiceCueEngine.stop();

    if (!this.isPlaying) {
      this.stopTracking();
      this.emitStateChange();
      return;
    }

    this.pausedAtTime = this.getCurrentTimeMs();
    this.stopSource();
    this.isPlaying = false;
    this.stopTracking();
    this.lastTimeEmitMs = -1;

    // Notifica la posición final exacta de forma inmediata (sin esperar a
    // reproducir) para que las etiquetas de tiempo queden clavadas al pausar.
    this.emitTimeUpdate(this.pausedAtTime);

    this.mediaSession.updatePlaybackState(false);
    this.mediaSession.updatePositionState(this.durationMs / 1000, this.pausedAtTime / 1000, this.playbackRate);

    this.emitStateChange();
  }

  public stop() {
    // Cancela por completo cualquier pre-roll (ticker, voces, música agendada).
    this.cancelPreRoll(true);

    this.stopSource();
    this.metronome.stop();
    this.voiceCueEngine.stop();
    this.pausedAtTime = 0;
    this.isPlaying = false;
    this.stopTracking();

    this.mediaSession.updatePlaybackState(false);
    this.mediaSession.updatePositionState(this.durationMs / 1000, 0, this.playbackRate);

    this.emitTimeUpdate(0);
    this.emitStateChange();
  }

  public seek(timeMs: number) {
    const clamped = Math.max(0, Math.min(timeMs, this.durationMs));
    this.pausedAtTime = clamped;
    this.voiceCueEngine.resetTriggeredCues(clamped);

    if (this.isPlaying) {
      this.executePlay(clamped);
    } else {
      // Cualquier seek (incluido volver a 0:00) cancela un pre-roll pendiente:
      // nunca quedan voces ni música agendada de un conteo abandonado.
      this.cancelPreRoll();
      this.emitTimeUpdate(clamped);
      this.mediaSession.updatePositionState(this.durationMs / 1000, clamped / 1000, this.playbackRate);
      this.emitStateChange();
    }
  }

  public setPlaybackRate(rate: number) {
    this.playbackRate = Math.max(0.5, Math.min(2.0, rate));
    if (this.sourceNode && this.ctx) {
      this.sourceNode.playbackRate.setValueAtTime(this.playbackRate, this.ctx.currentTime);
      const currentPosSec = this.getCurrentTimeMs() / 1000;
      this.startTime = this.ctx.currentTime - currentPosSec / this.playbackRate;
      this.metronome.sync(currentPosSec, this.playbackRate);
      if (this.isPlaying) {
        this.voiceCueEngine.startSync(this.startTime, this.playbackRate);
      }
    }
    this.emitStateChange();
  }

  private stopSource() {
    if (this.sourceNode) {
      try {
        this.sourceNode.stop();
        this.sourceNode.disconnect();
      } catch (e) {}
      this.sourceNode = null;
    }
  }

  public getCurrentTimeMs(): number {
    if (!this.isPlaying || !this.ctx) {
      return this.pausedAtTime;
    }
    const elapsedSec = (this.ctx.currentTime - this.startTime) * this.playbackRate;
    const currentMs = Math.round(elapsedSec * 1000);
    return Math.max(0, Math.min(currentMs, this.durationMs));
  }

  /**
   * Cadencia de notificación de tiempo hacia la UI (etiquetas numéricas).
   *
   * NO se emite a 60fps a propósito: cada emisión provoca re-renderizados en
   * React (App y panel de preparación) que encolan trabajo en el hilo principal
   * y retrasan el frame del playhead. El movimiento visual de la línea NO
   * depende de estas emisiones: lo gobierna `PlaybackClock` con `transform`
   * directo sobre el DOM.
   */
  private static readonly TIME_EMIT_INTERVAL_MS = 80; // ~12.5 Hz
  private lastTimeEmitMs = 0;

  private startTracking() {
    const loop = () => {
      if (this.isPlaying) {
        const time = this.getCurrentTimeMs();

        // Los avisos de voz se evalúan en CADA frame de hardware para no perder
        // precisión temporal en los cues (ventana de disparo estrecha).
        this.voiceCueEngine.checkPlaybackTime(time);

        // La UI se notifica a ~12Hz y siempre que el tiempo retroceda (seek).
        if (
          time - this.lastTimeEmitMs >= AudioEngine.TIME_EMIT_INTERVAL_MS ||
          time < this.lastTimeEmitMs
        ) {
          this.lastTimeEmitMs = time;
          this.emitTimeUpdate(time);
        }

        this.animationFrameId = requestAnimationFrame(loop);
      }
    };
    this.animationFrameId = requestAnimationFrame(loop);
  }

  private stopTracking() {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  public getState(): AudioEngineState {
    return {
      isPlaying: this.isPlaying,
      currentTimeMs: this.getCurrentTimeMs(),
      durationMs: this.durationMs,
      playbackRate: this.playbackRate,
      pan: this.pan,
      channelMode: this.channelMode,
      musicVolume: this.musicVolume,
      coachVolume: this.coachVolume,
      isBluetoothDetected: this.isBluetoothDetected,
      bluetoothLatencyWarning: this.bluetoothWarning,
      hasAudioLoaded: this.audioBuffer !== null,
      fileName: this.fileName,
      isPreRollActive: this.isPreRollActive,
      preRollCountdown: this.preRollCountdown
    };
  }

  public getWaveformData(numBuckets: number = 300): number[] {
    if (!this.audioBuffer) return [];

    const channelData = this.audioBuffer.getChannelData(0);
    const blockSize = Math.floor(channelData.length / numBuckets);
    const peaks: number[] = [];

    for (let i = 0; i < numBuckets; i++) {
      const start = i * blockSize;
      let max = 0;
      for (let j = 0; j < blockSize; j += 10) {
        const val = Math.abs(channelData[start + j] || 0);
        if (val > max) max = val;
      }
      peaks.push(max);
    }

    const globalMax = Math.max(...peaks, 0.001);
    return peaks.map((p) => Math.min(1.0, p / globalMax));
  }

  // Observers
  public onTimeUpdate(cb: TimeUpdateCallback): () => void {
    this.timeUpdateCallbacks.add(cb);
    return () => this.timeUpdateCallbacks.delete(cb);
  }

  public onStateChange(cb: StateChangeCallback): () => void {
    this.stateChangeCallbacks.add(cb);
    return () => this.stateChangeCallbacks.delete(cb);
  }

  private emitTimeUpdate(timeMs: number) {
    for (const cb of this.timeUpdateCallbacks) {
      cb(timeMs);
    }
  }

  private emitStateChange() {
    const state = this.getState();
    for (const cb of this.stateChangeCallbacks) {
      cb(state);
    }
  }
}

export const audioEngine = new AudioEngine();
