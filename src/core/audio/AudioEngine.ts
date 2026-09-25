import {
  AudioEngineState,
  AudioPlaybackDomain,
  ChannelRoutingMode,
  StateChangeCallback,
  TimeUpdateCallback
} from '../../types/audio';
import { ElementLog, ChoreographyPathPoint } from '../../types/choreography';
import { Metronome } from './Metronome';
import { PlaybackLoop, normalizeLoop, wrapLoopPositionSec } from './playbackLoop';
import { VoiceCueEngine } from './VoiceCueEngine';
import { MediaSessionManager } from './MediaSession';
import { BpmDetector, BpmDetectionResult } from './BpmDetector';
import { renderChoreographyMixdown } from './audioMixdown';
import { readWaveformPeaks } from './timeline/WaveformPeakCache';
import { adquirirPantallaActiva, liberarPantallaActiva } from '../system/wakeLock';
import { loadProgress } from '../../store/loadProgressStore';

/** Trazabilidad de audio solo en desarrollo (cero coste en producción). */
const AUDIO_DEBUG = Boolean((import.meta as { env?: { DEV?: boolean } })?.env?.DEV);

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

/* ── Validación y sondeo previos (evitan OOM en iOS) ─────────────────────
 *
 * En Safari/iOS `decodeAudioData` decodifica TODO el audio a PCM Float32 en
 * memoria (≈10–20× el tamaño del archivo comprimido) y, si la pestaña supera el
 * límite de memoria de WebKit, el sistema la MATA (vuelve al inicio sin error
 * JS). Por eso, antes de leer/decodificar se valida:
 *   · formato permitido (extensión o MIME),
 *   · tamaño del archivo fuente,
 *   · duración real (sondeo por metadatos, sin decodificar).
 * Nunca se limita "porque sí": el límite de duración es el que evita la
 * amplificación de memoria (una pista de 15 min genera ~150 MB de PCM estéreo).
 */
const AUDIO_FILE_EXTENSION_RE = /\.(mp3|m4a|m4b|aac|wav|wave|ogg|oga|opus|aif|aiff|flac|caf|mp4|webm)$/i;
const AUDIO_MIME_RE = /^(audio\/|video\/mp4)/i;

/** Tamaño máximo del archivo fuente (no del audio decodificado). */
export const MAX_AUDIO_FILE_BYTES = 100 * 1024 * 1024; // 100 MB
/** Duración máxima: acota el PCM decodificado en memoria. */
export const MAX_AUDIO_DURATION_SEC = 900; // 15 min

/** Valida formato y tamaño ANTES de cualquier lectura pesada. */
export function validateAudioFile(file: File | Blob): void {
  const name = typeof File !== 'undefined' && file instanceof File ? file.name : '';
  const type = (file.type || '').toLowerCase();
  const size = file.size || 0;

  if (size === 0) {
    throw new Error('El archivo está vacío o no se pudo leer.');
  }
  // Se acepta si la extensión O el MIME son de audio conocidos (iOS a veces
  // entrega MIME vacío para .m4a desde la app Archivos).
  const extOk = name ? AUDIO_FILE_EXTENSION_RE.test(name) : false;
  const mimeOk = AUDIO_MIME_RE.test(type);
  if (!extOk && !mimeOk) {
    throw new Error('Formato no compatible. Usa MP3, M4A/AAC, WAV, OGG o FLAC.');
  }
  if (size > MAX_AUDIO_FILE_BYTES) {
    const mb = Math.round(size / (1024 * 1024));
    throw new Error(
      `El archivo es demasiado grande (${mb} MB). El máximo es ${Math.round(MAX_AUDIO_FILE_BYTES / (1024 * 1024))} MB.`
    );
  }
}

/**
 * Sondea la duración leyendo SOLO los metadatos (`<audio preload="metadata">`),
 * sin decodificar el audio completo. Devuelve `null` si no puede determinarse.
 * Libera siempre el Object URL para no fugar memoria.
 */
export function probeAudioDurationSec(file: File | Blob): Promise<number | null> {
  return new Promise((resolve) => {
    if (
      typeof window === 'undefined' ||
      typeof document === 'undefined' ||
      typeof URL === 'undefined' ||
      typeof URL.createObjectURL !== 'function'
    ) {
      resolve(null);
      return;
    }

    let url = '';
    const audio = document.createElement('audio');
    audio.preload = 'metadata';
    audio.muted = true;
    let settled = false;

    const finish = (value: number | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      audio.removeAttribute('src');
      try {
        audio.load();
      } catch {
        /* Ignorar. */
      }
      if (url) {
        try {
          URL.revokeObjectURL(url);
        } catch {
          /* Ignorar. */
        }
      }
      resolve(value);
    };

    const timer = setTimeout(() => finish(null), 4000);
    audio.onloadedmetadata = () => {
      const d = audio.duration;
      finish(Number.isFinite(d) && d > 0 ? d : null);
    };
    audio.onerror = () => finish(null);

    try {
      url = URL.createObjectURL(file);
      audio.src = url;
    } catch {
      finish(null);
    }
  });
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  // ── Sesiones de audio separadas (UN solo AudioContext) ──
  //   'rink'   → audio PUBLICADO de la Pista 2D (archivo directo o mezcla publicada).
  //   'studio' → BORRADOR editable que reproduce el Audio Studio.
  // Editar/cargar en el Studio escribe SIEMPRE en el slot 'studio': el audio
  // publicado del Rink no puede cambiar salvo publicación explícita
  // (`publishRinkAudio`). Es el principio DRAFT → PUBLISH.
  private buffers: Record<AudioPlaybackDomain, AudioBuffer | null> = { rink: null, studio: null };
  private durations: Record<AudioPlaybackDomain, number> = { rink: 0, studio: 0 };
  private fileNames: Record<AudioPlaybackDomain, string | null> = { rink: null, studio: null };
  private sourceKinds: Record<AudioPlaybackDomain, 'file' | 'studio-mix'> = {
    rink: 'file',
    studio: 'studio-mix',
  };
  /** Identidad de revisión del audio PUBLICADO del Rink (incrementa al publicar). */
  private rinkRevision = 0;
  private rinkAudioId = 'rink-audio-0';

  /**
   * Buffer del DOMINIO ACTIVO. Toda la maquinaria existente (trim, fades, seek,
   * waveform, metrónomo, loop…) sigue leyendo `this.audioBuffer` y, por tanto,
   * opera sobre la sesión activa sin cambios. Cargar/editar en el Studio ya no
   * puede tocar el buffer del Rink: cada dominio tiene su propio slot.
   */
  private get audioBuffer(): AudioBuffer | null {
    return this.buffers[this.playbackDomain];
  }
  private set audioBuffer(buffer: AudioBuffer | null) {
    this.buffers[this.playbackDomain] = buffer;
  }
  private get durationMs(): number {
    return this.durations[this.playbackDomain];
  }
  private set durationMs(value: number) {
    this.durations[this.playbackDomain] = value;
  }
  private get fileName(): string | null {
    return this.fileNames[this.playbackDomain];
  }
  private set fileName(value: string | null) {
    this.fileNames[this.playbackDomain] = value;
  }
  private get sourceKind(): 'file' | 'studio-mix' {
    return this.sourceKinds[this.playbackDomain];
  }
  private set sourceKind(value: 'file' | 'studio-mix') {
    this.sourceKinds[this.playbackDomain] = value;
  }
  /** Guarda anti-solapamiento de importaciones (evita picos de memoria en iOS). */
  private isImporting = false;
  private sourceNode: AudioBufferSourceNode | null = null;

  // Sub-busses & Volume Nodes
  private musicGainNode: GainNode | null = null;
  private metronomeGainNode: GainNode | null = null;
  /**
   * Estado de conexión del bus del metrónomo. El MUTE no solo baja la ganancia:
   * DESCONECTA el sub-bus del árbol de audio. En móviles (iOS/WebKit) el cambio
   * de ganancia programado podía no aplicarse si el AudioContext acababa de
   * reanudarse; desconectar garantiza silencio absoluto en todas las plataformas.
   */
  private metronomeBusConnected = true;
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
  /** Blob original del archivo importado (solo para empaquetar/exportar .coreo). */
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

  /**
   * Dominio activo de reproducción. Por defecto 'rink'. El Audio Studio lo pone a
   * 'studio', lo que DESACTIVA metrónomo y voces guía de los nodos: son exclusivos
   * de la Pista 2D y nunca deben sonar dentro del editor de audio.
   */
  private playbackDomain: AudioPlaybackDomain = 'rink';

  /** Bucle de reproducción activo (null = sin bucle). */
  private loop: PlaybackLoop | null = null;

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
      this.ctx.resume().then(() => this.applyBusMutes()).catch(() => {});
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
          // RE-ASSERTAR los silenciadores al volver del segundo plano: WebKit
          // puede restaurar el grafo de audio al reanudar y el MUTE debe seguir
          // siendo absoluto (se reaplica bus + estado).
          this.applyBusMutes();
          if (this.metronomeMuted) this.metronome.setMuted(true);
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

    const setBus = (node: GainNode | null, gainValue: number) => {
      if (!node) return;
      try {
        node.gain.cancelScheduledValues(0);
      } catch {
        /* Ignorar. */
      }
      // Se aplica en t=0 (absoluto) además de en `now`: así el mute es efectivo
      // aunque el reloj del contexto se haya reanudado con retraso (móvil).
      try {
        node.gain.setValueAtTime(gainValue, 0);
      } catch {
        /* Ignorar. */
      }
      node.gain.setValueAtTime(gainValue, now);
    };

    setBus(this.musicGainNode, this.musicMuted ? 0 : 1);
    setBus(this.voiceCueGainNode, this.voiceGuideMuted ? 0 : 1);

    // MUTE del metrónomo = desconectar su sub-bus (silencio absoluto garantizado
    // en móvil, independientemente del scheduling de ganancia de WebKit).
    if (this.metronomeGainNode && this.coachBusGainNode) {
      if (this.metronomeMuted) {
        this.metronomeGainNode.gain.setValueAtTime(0, now);
        if (this.metronomeBusConnected) {
          try {
            this.metronomeGainNode.disconnect();
          } catch {
            /* Ignorar. */
          }
          this.metronomeBusConnected = false;
        }
      } else {
        if (!this.metronomeBusConnected) {
          try {
            this.metronomeGainNode.connect(this.coachBusGainNode);
          } catch {
            /* Ignorar. */
          }
          this.metronomeBusConnected = true;
        }
        setBus(this.metronomeGainNode, 1);
      }
    } else {
      setBus(this.metronomeGainNode, this.metronomeMuted ? 0 : 1);
    }
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
    // Mute ABSOLUTO: además del estado lógico, se destruyen los pulsos ya
    // programados y se bloquea toda creación futura de osciladores.
    this.metronome.setMuted(!audible);
    if (!audible) {
      this.metronome.suspend();
    }
    const metronomeOff = !this.metronome.getConfig().enabled;
    this.voiceCueEngine.setCueTicksEnabled(metronomeOff && !this.metronomeMuted);
    this.applyBusMutes();
    if (AUDIO_DEBUG) {
      console.debug(
        `[METRONOME] mute ${this.metronomeMuted ? 'ON' : 'OFF'}` +
          ` · instancias=${Metronome.getLiveInstanceCount()}` +
          ` · scheduler=${this.metronome.hasActiveScheduler() ? 'ON' : 'OFF'}` +
          ` · busConnected=${this.metronomeBusConnected}` +
          ` · ctx=${this.ctx?.state ?? 'none'}`
      );
    }
    this.emitStateChange();
  }

  public setVoiceGuideMuted(muted: boolean) {
    this.voiceGuideMuted = muted;
    // Silencio INMEDIATO de la locución en curso (buffers agendados + voz del
    // navegador) sin detener la música ni el reloj de sincronización.
    if (muted) this.voiceCueEngine.silenceImmediate();
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
      // Mute real: destruye lo programado y bloquea nuevos clicks.
      this.metronome.setMuted(flags.metronome);
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

  /**
   * Contexto de audio del motor (lo inicializa si hace falta). Se usa para
   * monitorización de grabación: la señal del micrófono se enruta a la MISMA
   * salida que usa el usuario, nunca a la pista del Rink.
   */
  public getAudioContext(): AudioContext | null {
    this.initAudioContext();
    return this.ctx;
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
    preservePosition: boolean = false,
    sourceKind: 'file' | 'studio-mix' = 'file'
  ) {
    const previousPosition = this.pausedAtTime;
    this.stop();
    this.audioBuffer = buffer;
    this.durationMs = Math.round(buffer.duration * 1000);
    this.sourceKind = sourceKind;
    if (fileName !== undefined) {
      this.fileName = fileName;
    }
    this.pausedAtTime = preservePosition
      ? Math.max(0, Math.min(previousPosition, this.durationMs))
      : 0;
    // Re-sanea el bucle contra la nueva duración (si estaba activo).
    if (this.loop) this.loop = normalizeLoop(this.loop, buffer.duration);
    this.mediaSession.updateMetadata(this.fileName || 'Pista de Audio');
    this.emitStateChange();
  }

  /**
   * Vacía por completo el audio cargado (sin reproducir nada). Se usa al cambiar
   * de cuenta para que una sesión nueva arranque SIN la pista del usuario previo.
   */
  public clearAudioBuffer() {
    this.stop();
    // Se vacían AMBAS sesiones: una cuenta nueva no debe heredar ni el audio
    // publicado del Rink ni el borrador del Studio del usuario anterior.
    this.buffers.rink = null;
    this.buffers.studio = null;
    this.durations.rink = 0;
    this.durations.studio = 0;
    this.fileNames.rink = null;
    this.fileNames.studio = null;
    this.sourceKinds.rink = 'file';
    this.sourceKinds.studio = 'studio-mix';
    this.rawBlob = null;
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
    // Guarda anti-solapamiento: decodificar dos archivos a la vez multiplica la
    // memoria y es la vía más rápida al cierre de pestaña en iOS.
    if (this.isImporting) {
      throw new Error('Ya se está procesando un archivo de audio. Espera a que termine.');
    }
    this.isImporting = true;

    try {
      // 1. Validación barata ANTES de tocar memoria: formato y tamaño.
      validateAudioFile(file);

      this.initAudioContext();
      if (!this.ctx) throw new Error('No se pudo inicializar AudioContext');

      if (this.ctx.state === 'suspended') {
        await this.ctx.resume().catch(() => {});
      }

      // 2. Duración real por metadatos (sin decodificar) → acota el PCM en memoria.
      onStage?.(2, 'Analizando archivo…');
      const durationSec = await probeAudioDurationSec(file);
      if (durationSec !== null && durationSec > MAX_AUDIO_DURATION_SEC) {
        const min = Math.round(durationSec / 60);
        throw new Error(
          `La pista dura ${min} min y supera el máximo de ${Math.round(MAX_AUDIO_DURATION_SEC / 60)} min.`
        );
      }

      // 3. Lectura Safari-safe (FileReader).
      onStage?.(5, 'Leyendo archivo…');
      let arrayBuffer: ArrayBuffer | null = await readBlobAsArrayBuffer(file, (fraction) => {
        onStage?.(5 + fraction * 63, 'Leyendo archivo…');
      });

      onStage?.(72, 'Decodificando audio…');

      // 4. Decodificación SIN copia defensiva: se entrega el ArrayBuffer leído
      //    directamente (una copia completa duplicaba el consumo en iOS). WebKit
      //    puede "consumir" el buffer; como NO se reutiliza después, no importa.
      let decoded: AudioBuffer;
      try {
        decoded = await this.decodeArrayBuffer(arrayBuffer);
      } catch (firstErr) {
        // Ruta de recuperación (rara): si WebKit detachó el buffer o falló la
        // primera pasada, se relee el blob y se reintenta UNA vez.
        onStage?.(74, 'Reintentando decodificación…');
        const fresh = await readBlobAsArrayBuffer(file);
        decoded = await this.decodeArrayBuffer(fresh);
      } finally {
        // Se libera la referencia al Archivo leído en cuanto termina la
        // decodificación, para que el recolector recupere memoria en iOS.
        arrayBuffer = null;
      }

      onStage?.(88, 'Preparando pista…');
      return decoded;
    } finally {
      this.isImporting = false;
    }
  }

  /** Decodifica un ArrayBuffer con soporte dual promesa/callback (Safari iOS). */
  private decodeArrayBuffer(buffer: ArrayBuffer): Promise<AudioBuffer> {
    const ctx = this.ctx;
    if (!ctx) return Promise.reject(new Error('AudioContext no disponible'));

    return new Promise<AudioBuffer>((resolve, reject) => {
      let settled = false;
      const ok = (buf: AudioBuffer) => {
        if (settled) return;
        settled = true;
        resolve(buf);
      };
      const fail = (err?: unknown) => {
        if (settled) return;
        settled = true;
        reject(
          err instanceof Error
            ? err
            : new Error(
                'No fue posible decodificar este archivo. Verifica que sea audio compatible (.mp3, .wav, .m4a, .aac).'
              )
        );
      };

      try {
        const promise = ctx.decodeAudioData(
          buffer,
          (decodedBuffer) => ok(decodedBuffer),
          (err) => fail(err)
        );
        if (promise && typeof promise.then === 'function') {
          promise.then(ok).catch(fail);
        }
      } catch (err) {
        fail(err);
      }
    });
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
      loadProgress.done();
      return decoded;
    } catch (err) {
      // Error controlado: se oculta el indicador y se propaga para que la UI
      // muestre un mensaje. La aplicación NUNCA se cierra por un audio inválido.
      loadProgress.reset();
      throw err;
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
      loadProgress.done();
      this.emitStateChange();
      return this.audioBuffer;
    } catch (err) {
      // Cualquier fallo (formato, tamaño, duración o decodificación) se maneja
      // aquí: se limpia el estado y se propaga un error legible. Sin crash.
      loadProgress.reset();
      throw err;
    } finally {
      void liberarPantallaActiva();
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

  // NOTA: se eliminaron `generateDemoTrack()` y `ensureAudioBuffer()`. El motor
  // NO fabrica ninguna pista sintética. La app arranca en «lienzo en blanco» y,
  // si no hay música real cargada, `play()` no reproduce nada: solo suena lo que
  // exista de verdad (música importada, metrónomo y voz guía). Así se elimina la
  // "pista de prueba" (Pista_RollArt_CarlosTango_Demo) que se colaba al pulsar
  // PLAY/conteo sin música cargada. El usuario importa su música con «Cargar Audio».

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
    // Sin música real NO se sintetiza ni se reproduce nada. Antes se generaba aquí
    // una "pista demo" que se oía junto al metrónomo al usar el conteo. Abortamos
    // el arranque: `executePlay`/`startPreRoll` lo detectan y no arrancan.
    if (!this.audioBuffer) return false;

    if (this.isPlaying) this.stopSource();

    const clampedOffsetSec = Math.max(0, Math.min(offsetMs / 1000, this.audioBuffer.duration));
    const loop = this.loop;
    // Si el cabezal está más allá del final del bucle, arranca desde el inicio del bucle.
    const startOffsetSec = loop && clampedOffsetSec > loop.endSec ? loop.startSec : clampedOffsetSec;

    this.sourceNode = this.ctx.createBufferSource();
    this.sourceNode.buffer = this.audioBuffer;
    this.sourceNode.playbackRate.value = this.playbackRate;
    if (loop) {
      // Bucle NATIVO: precisión de muestra, sin clics ni reagendados manuales.
      this.sourceNode.loop = true;
      this.sourceNode.loopStart = Math.min(loop.startSec, this.audioBuffer.duration);
      this.sourceNode.loopEnd = Math.min(loop.endSec, this.audioBuffer.duration);
    }
    this.sourceNode.connect(this.musicGainNode);
    this.updateMatrixGains();

    this.sourceNode.onended = () => {
      if (!this.sourceNode?.loop && this.isPlaying && this.getCurrentTimeMs() >= this.durationMs - 150) {
        this.stop();
      }
    };

    this.startTime = whenCtxTime - startOffsetSec / this.playbackRate;
    this.sourceNode.start(whenCtxTime, startOffsetSec);
    return true;
  }

  /** Conmuta a "playing" exactamente en el instante agendado de la música. */
  private beginPlaybackAt(whenCtxTime: number, offsetMs: number) {
    const clampedOffsetSec = Math.max(0, Math.min(offsetMs / 1000, this.audioBuffer?.duration ?? 0));

    this.isPreRollActive = false;
    this.preRollState = 'idle';
    this.preRollCountdown = 0;
    this.isPlaying = true;

    // Metrónomo y voz anclados al MISMO instante absoluto que la música, PERO
    // solo en el dominio de la Pista 2D. En el Audio Studio ('studio') estas
    // fuentes se detienen: son exclusivas del Rink y no deben contaminar el editor.
    if (this.playbackDomain === 'rink') {
      this.metronome.start(clampedOffsetSec, this.playbackRate, whenCtxTime);
      // UNA SOLA FUENTE RÍTMICA: los "cue ticks" son un acento corto de la Voz
      // Guía que podía percibirse como un SEGUNDO metrónomo. Solo se permiten si
      // el usuario APAGÓ el metrónomo por completo (no si lo muteó): así MUTE =
      // silencio total y no queda ningún click de fondo.
      const metronomeOff = !this.metronome.getConfig().enabled;
      this.voiceCueEngine.setCueTicksEnabled(metronomeOff && !this.metronomeMuted);
      this.voiceCueEngine.resetTriggeredCues(offsetMs);
      this.voiceCueEngine.startSync(
        whenCtxTime - clampedOffsetSec / this.playbackRate,
        this.playbackRate
      );
    } else {
      // AUDIO STUDIO: el metrónomo SÍ funciona en su propio dominio (botón de la
      // campana operativo), pero las VOCES GUÍA de nodos son exclusivas de la
      // Pista 2D: así los metrónomos/voces de cada vista no se mezclan.
      this.metronome.start(clampedOffsetSec, this.playbackRate, whenCtxTime);
      this.voiceCueEngine.stop();
    }

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

    if (buffer && this.voiceCueGainNode) {
      try {
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        const gain = ctx.createGain();
        gain.gain.value = volume;
        source.connect(gain);
        // Se enruta por el sub-bus de Voz Guía (no directamente al bus de coach):
        // así el mute global de la Voz Guía silencia también el conteo ya agendado,
        // sin afectar a la música ni a la voz grabada de la entrenadora.
        gain.connect(this.voiceCueGainNode);
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

  /**
   * Cambia el dominio de reproducción. Al entrar en 'studio' se detienen de
   * inmediato metrónomo y voces guía (exclusivos del Rink); al volver a 'rink'
   * se re-sincronizan si había reproducción activa.
   */
  public setPlaybackDomain(domain: AudioPlaybackDomain): void {
    if (this.playbackDomain === domain) return;

    // Cambiar de sesión detiene TODO lo de la sesión anterior (fuente, metrónomo,
    // voces y pre-roll) y arranca la nueva en 0:00. Así una preview del Studio no
    // puede seguir sonando dentro del Rink ni viceversa.
    this.cancelPreRoll(true);
    this.stopSource();
    this.metronome.stop();
    this.voiceCueEngine.stop();
    this.isPlaying = false;
    this.stopTracking();
    this.lastTimeEmitMs = -1;

    this.playbackDomain = domain;
    this.pausedAtTime = 0;
    if (domain === 'rink' && this.loop) {
      this.loop = normalizeLoop(this.loop, this.buffers.rink?.duration ?? 0);
    }

    this.emitTimeUpdate(0);
    this.emitStateChange();
  }

  public getIsPlaying(): boolean {
    return this.isPlaying;
  }

  /**
   * Sustituye el buffer de reproducción SIN detener el transporte.
   *
   * Conserva la posición actual y el estado play/pause, de modo que aplicar un
   * cambio de mezcla (mute/volumen de una pista del Estudio) es instantáneo y no
   * reinicia la reproducción, el playhead, el metrónomo ni la Voz Guía.
   * Un único `sourceNode` re-agendado en el mismo instante del reloj de audio.
   */
  public swapAudioBuffer(
    buffer: AudioBuffer,
    fileName?: string | null,
    sourceKind: 'file' | 'studio-mix' = 'studio-mix'
  ) {
    const wasPlaying = this.isPlaying;
    const positionMs = this.getCurrentTimeMs();

    // Corta SOLO la fuente actual (no resetea isPlaying ni cancela pre-roll).
    this.stopSource();

    this.audioBuffer = buffer;
    this.durationMs = Math.round(buffer.duration * 1000);
    this.sourceKind = sourceKind;
    if (fileName !== undefined) {
      this.fileName = fileName;
    }
    if (this.loop) this.loop = normalizeLoop(this.loop, buffer.duration);
    this.mediaSession.updateMetadata(this.fileName || 'Pista de Audio');

    const targetMs = Math.max(0, Math.min(positionMs, this.durationMs));
    if (wasPlaying) {
      this.executePlay(targetMs);
    } else {
      this.pausedAtTime = targetMs;
      this.emitTimeUpdate(targetMs);
      this.emitStateChange();
    }
  }

  public getPlaybackDomain(): AudioPlaybackDomain {
    return this.playbackDomain;
  }

  /**
   * PUBLICA una mezcla como audio oficial de la Pista 2D. Es la ÚNICA operación
   * que reemplaza el audio publicado del Rink. Escribe explícitamente el slot
   * 'rink' (no el del dominio activo), así que puede invocarse desde el Studio
   * sin tocar su borrador. Devuelve la nueva revisión.
   *
   * El llamador DEBE haber renderizado y validado el buffer antes; esta función
   * es el commit de la operación atómica render → validate → publish.
   */
  public publishRinkAudio(
    buffer: AudioBuffer,
    fileName: string,
    sourceKind: 'file' | 'studio-mix' = 'studio-mix'
  ): number {
    // Si el Rink está reproduciéndose, se detiene antes de sustituir su fuente.
    if (this.playbackDomain === 'rink') {
      this.stop();
    }

    this.buffers.rink = buffer;
    this.durations.rink = Math.round(buffer.duration * 1000);
    this.fileNames.rink = fileName;
    this.sourceKinds.rink = sourceKind;
    this.rinkRevision += 1;
    this.rinkAudioId = `rink-audio-${this.rinkRevision}`;

    if (this.playbackDomain === 'rink') {
      this.loop = this.loop ? normalizeLoop(this.loop, buffer.duration) : null;
      this.pausedAtTime = 0;
      this.mediaSession.updateMetadata(fileName);
      this.emitTimeUpdate(0);
      this.emitStateChange();
    }
    return this.rinkRevision;
  }

  /** Estado del audio PUBLICADO (siempre el del Rink, no el del dominio activo). */
  public getPublishedAudio(): {
    id: string;
    revision: number;
    kind: 'direct-file' | 'studio-mix';
    name: string | null;
    durationSec: number;
    buffer: AudioBuffer | null;
  } {
    return {
      id: this.rinkAudioId,
      revision: this.rinkRevision,
      kind: this.sourceKinds.rink === 'studio-mix' ? 'studio-mix' : 'direct-file',
      name: this.fileNames.rink,
      durationSec: this.durations.rink / 1000,
      buffer: this.buffers.rink,
    };
  }

  /**
   * Snapshot para "Editar en Estudio": devuelve el audio PUBLICADO para sembrar
   * el borrador del Studio. Compartir la referencia del `AudioBuffer` es seguro
   * porque TODAS las operaciones del Studio son no destructivas (crean buffers
   * nuevos) y nunca mutan el buffer publicado.
   */
  public snapshotPublishedToStudio(): AudioBuffer | null {
    return this.buffers.rink;
  }

  /**
   * Activa/desactiva el bucle y define su región. `endSec <= 0` = hasta el final.
   * El bucle audible es nativo (`AudioBufferSourceNode.loop`), sin clics ni
   * reagendados manuales; aquí solo se sanea y se aplica a la fuente activa.
   */
  public setLoop(enabled: boolean, startSec = 0, endSec = 0): void {
    const durationSec = (this.audioBuffer?.duration ?? 0) || this.durationMs / 1000;
    this.loop = normalizeLoop({ enabled, startSec, endSec }, durationSec);
    if (this.sourceNode && this.loop) {
      try {
        this.sourceNode.loop = true;
        this.sourceNode.loopStart = this.loop.startSec;
        this.sourceNode.loopEnd = this.loop.endSec;
      } catch {
        /* la fuente pudo terminar */
      }
    } else if (this.sourceNode && !this.loop) {
      try {
        this.sourceNode.loop = false;
      } catch {
        /* ignorar */
      }
    }
    this.emitStateChange();
  }

  public getLoop(): PlaybackLoop | null {
    return this.loop;
  }

  /**
   * Handoff al Audio Studio: detiene por completo la reproducción del Rink
   * (música, metrónomo, voces guía y pre-roll) y cede el dominio al Estudio.
   * Garantiza que al abrir el editor de audio NO suene nada de la Pista 2D.
   */
  public handoffToStudio(): void {
    this.pause();
    this.setPlaybackDomain('studio');
  }

  public setPlaybackRate(rate: number) {
    this.playbackRate = Math.max(0.5, Math.min(2.0, rate));
    if (this.sourceNode && this.ctx) {
      this.sourceNode.playbackRate.setValueAtTime(this.playbackRate, this.ctx.currentTime);
      const currentPosSec = this.getCurrentTimeMs() / 1000;
      this.startTime = this.ctx.currentTime - currentPosSec / this.playbackRate;
      if (this.playbackDomain === 'rink') {
        this.metronome.sync(currentPosSec, this.playbackRate);
        if (this.isPlaying) {
          this.voiceCueEngine.startSync(this.startTime, this.playbackRate);
        }
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
    }    const elapsedSec = (this.ctx.currentTime - this.startTime) * this.playbackRate;
    // Con bucle activo, la posición visible vuelve al rango del bucle (el audio ya
    // lo hace de forma nativa; esto mantiene coherentes playhead y evaluación de cues).
    const positionSec = wrapLoopPositionSec(elapsedSec, this.loop);
    const currentMs = Math.round(positionSec * 1000);
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
        // precisión temporal en los cues (ventana de disparo estrecha), PERO solo
        // en el dominio del Rink: dentro del Audio Studio nunca deben sonar.
        if (this.playbackDomain === 'rink') {
          this.voiceCueEngine.checkPlaybackTime(time);
        }

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
      sourceKind: this.sourceKind,
      isPreRollActive: this.isPreRollActive,
      preRollCountdown: this.preRollCountdown
    };
  }

  /**
   * Picos normalizados de una sesión de audio. Por defecto la del RINK (audio
   * PUBLICADO), de modo que el visor de la Pista 2D nunca dibuja el borrador del
   * Studio. Pasa `'studio'` solo para diagnósticos del propio editor.
   *
   * No recorre el PCM: deriva los buckets de la caché de picos (`WeakMap`, paso
   * 128). Cambiar el zoom (numBuckets) no vuelve a barrer millones de muestras.
   */
  public getWaveformData(
    numBuckets: number = 300,
    domain: AudioPlaybackDomain = 'rink'
  ): number[] {
    const source = this.buffers[domain];
    if (!source) return [];

    const buckets = Math.max(1, Math.floor(numBuckets));
    const raw = readWaveformPeaks(source, buckets);

    let globalMax = 0.001;
    for (let i = 0; i < raw.length; i++) {
      if (raw[i] > globalMax) globalMax = raw[i];
    }

    const peaks = new Array<number>(raw.length);
    for (let i = 0; i < raw.length; i++) {
      peaks[i] = Math.min(1.0, raw[i] / globalMax);
    }
    return peaks;
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
