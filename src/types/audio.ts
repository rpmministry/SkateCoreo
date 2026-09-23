export type ChannelRoutingMode = 
  | 'split-coach'  // Left = Música (Pista/PA), Right = Metrónomo & Guías de voz (Auricular coach)
  | 'stereo'       // Ambos canales reciben Música + Metrónomo + Guías
  | 'solo-music'   // Solo música en ambos canales
  | 'solo-coach'   // Solo metrónomo y guías en ambos canales
  | 'solo-left'    // Canal Izquierdo al 100%, Derecho en silencio absoluto
  | 'solo-right';  // Canal Derecho al 100%, Izquierdo en silencio absoluto

/**
 * Dominio de reproducción. Aísla los dos mundos de audio de SkateCoreo:
 *  - 'rink'   → Pista 2D: música + voces guía de nodos + metrónomo.
 *  - 'studio' → Audio Studio: SOLO su propia mezcla (nunca voces guía ni
 *               metrónomo de la Pista 2D).
 */
export type AudioPlaybackDomain = 'rink' | 'studio';

export interface AudioEngineState {
  isPlaying: boolean;
  currentTimeMs: number;
  durationMs: number;
  playbackRate: number;
  pan: number; // -1.0 (Left) to +1.0 (Right)
  channelMode: ChannelRoutingMode;
  musicVolume: number; // 0.0 to 1.0
  coachVolume: number; // 0.0 to 1.0
  isBluetoothDetected: boolean;
  bluetoothLatencyWarning: string | null;
  hasAudioLoaded: boolean;
  fileName: string | null;
  /** Origen de la pista cargada en la Pista 2D (identidad de dominio, req. 30). */
  sourceKind: 'file' | 'studio-mix';
  isPreRollActive: boolean;
  preRollCountdown: number; // 3, 2, 1...
}

export interface MetronomeConfig {
  enabled: boolean;
  bpm: number;
  beatsPerMeasure: 1 | 2 | 3 | 4 | 5 | 6 | 7; // Compás: 1/4, 2/4, 3/4, 4/4, 5/4, 6/8, 7/8
  volume: number; // 0.0 to 1.0
  accentFirstBeat: boolean;
  accentPitch: number; // Hz (default 1000)
  normalPitch: number; // Hz (default 600)
}

export type TTSEngineType = 'browser' | 'google-cloud';

export interface VoiceCueConfig {
  enabled: boolean;
  volume: number; // 0.0 to 1.0
  introDelaySec: number; // 0, 3, 5, 10s pre-roll delay before music starts
  warningLeadTimeSec: number; // 2 or 3s before technical element node
  /**
   * Sincronización anticipada (Anticipatory Cues): segundos ADICIONALES de
   * antelación con los que se anuncia el nombre de la figura antes de que el
   * Playhead alcance el nodo. El patinador necesita oír la instrucción antes
   * de llegar al punto de ejecución, no en el instante exacto.
   */
  anticipationSec: number; // 0.0 to 5.0
  language: 'es' | 'en';
  voiceSpeed: number; // 0.7 to 1.5
  voicePitch: number; // 0.5 to 1.5
  selectedVoiceURI: string | null;
  ttsEngine: TTSEngineType;
  googleApiKey: string | null;
  googleVoiceName: string;
  /**
   * La Voz Guía es SIEMPRE femenina latina. El campo se conserva por
   * compatibilidad de formato, pero su valor es fijo.
   */
  voiceGender: 'female';
}

// Tipado estricto para aislamiento de la voz guía (TTS)
export type StrictCountdownToken = '3' | '2' | '1' | '¡Ya!' | 'Three' | 'Two' | 'One' | 'Go!';

export type RollArtTechnicalFigure =
  | 'Axel' | 'Doble Axel' | 'Triple Axel'
  | 'Salchow' | 'Doble Salchow' | 'Triple Salchow'
  | 'Toe Loop' | 'Loop' | 'Flip' | 'Lutz'
  | 'Trompo' | 'Camel Spin' | 'Sit Spin' | 'Trompo Combinado'
  | 'Secuencia de Pasos' | 'Secuencia Coreográfica'
  | 'Paso' | 'Salto' | 'Giro' | 'Coreografía' | 'Entrada';

export type StrictVoiceCuePayload =
  | StrictCountdownToken
  | `¡Ya! ${string}`
  | `Go! ${string}`
  | `${string} en ${number}`
  | `${string} in ${number}`;

export interface VoiceCueEvent {
  id: string;
  timeMs: number;
  text: StrictVoiceCuePayload | string;
  type: 'intro-countdown' | 'element-alert' | 'measure-callout' | 'countdown-3' | 'countdown-2' | 'countdown-1' | 'figure-arrival' | 'figure-name';
  elementId?: string;
}

export type TimeUpdateCallback = (currentTimeMs: number) => void;
export type StateChangeCallback = (state: AudioEngineState) => void;

