import { create } from 'zustand';
import { 
  AudioTimeNode, 
  AudioStudioTrack, 
  StudioMetronomeConfig, 
  AudioClip, 
  StudioTool,
  CARBON_TRACK_COLORS,
  GlobalAudioControls,
  ClipContextMenuState,
  MixProjectMetadata,
  AudioTrackMetadata,
  AudioClipMetadata,
  DraggingGhostState,
  TrashDragState,
} from '../types/audioStudio';
import { BpmDetector } from '../core/audio/BpmDetector';
import { snapToZeroCrossing } from '../core/audio/zeroCrossing';
import { audioEngine } from '../core/audio/AudioEngine';
import { useRinkAudioStore } from './useRinkAudioStore';
import { ttsService } from '../services/ttsService';
import { useChoreographyStore } from './useChoreographyStore';
import { renderStudioMixdown, bounceStudioClipsToBuffer } from '../core/audio/studioMixdown';
import { VoiceRecorder, normalizeAudioBufferPeak } from '../core/audio/VoiceRecorder';
import {
  computeSnapOffset,
  snapToleranceSec,
  SNAP_PX,
  BEAT_SNAP_PX,
} from '../core/audio/timeline/snap';

/**
 * Instantánea del estado EDITABLE del Studio (para undo/redo). No incluye
 * reproducción, zoom ni selección: solo lo que el usuario espera deshacer.
 */
export interface StudioEditSnapshot {
  tracks: AudioStudioStoreState['tracks'];
  additionalTracks: AudioStudioTrack[];
  audioNodes: AudioTimeNode[];
  totalDurationSec: number;
}

export interface AudioStudioStoreState {
  // Pistas del editor multitrack (1 principal de música + auxiliares)
  tracks: {
    music: AudioStudioTrack;
    voice: AudioStudioTrack;
    metronome: AudioStudioTrack;
    /** Pista dedicada de GRABACIÓN DE VOZ (tomas reales), independiente de la música. */
    recording: AudioStudioTrack;
    [key: string]: AudioStudioTrack;
  };
  additionalTracks: AudioStudioTrack[]; // Máximo 4 pistas adicionales (1 principal + 4 = 5 en total)

  // Feedback Visual Drag & Drop y Snapping Magnético
  draggingGhost: DraggingGhostState | null;
  setDraggingGhost: (ghost: DraggingGhostState | null) => void;
  calculateSnapOffset: (
    targetTrackId: string,
    clipId: string | null,
    rawOffsetSec: number,
    clipDurationSec: number,
    pixelsPerSecond?: number
  ) => { snappedSec: number; snapLineSec: number | null };

  // Consolidación Continua del Buffer en Web Audio API
  consolidateStudioAudio: () => Promise<AudioBuffer | null>;

  // Controles Globales (Metrónomo, Voces Guía, BPM Global)
  globalControls: GlobalAudioControls;
  setGlobalBpm: (bpm: number) => void;
  toggleMetronomeMute: () => void;
  setMetronomeVolume: (vol: number) => void;
  toggleMetronomeEnabled: () => void;
  toggleVoiceGuideMute: () => void;
  setVoiceGuideVolume: (vol: number) => void;
  toggleVoiceGuideEnabled: () => void;

  // Menú contextual flotante táctil
  contextMenu: ClipContextMenuState | null;
  openContextMenu: (trackId: string, clipId: string, x: number, y: number) => void;
  closeContextMenu: () => void;

  // Modo "arrastrar a la basura" (pulsación larga en móvil/táctil)
  trashDrag: TrashDragState;
  /** Activa el modo basura para un clip (disparado por `useLongPress`). */
  beginTrashDrag: (trackId: string, clipId: string) => void;
  /** Actualiza si el puntero está sobre la Dropzone (resalta el basurero). */
  setTrashHover: (overTrash: boolean) => void;
  /** Sale del modo basura sin borrar (cancelación). */
  endTrashDrag: () => void;

  // Manifiesto reactivo ligero de la mezcla para sincronización sin buffers pesados
  mixManifest: MixProjectMetadata;
  getMixManifest: () => MixProjectMetadata;

  // Herramientas de Edición Mini-DAW
  activeTool: StudioTool;
  setActiveTool: (tool: StudioTool) => void;
  activeTrackId: string;
  setActiveTrackId: (trackId: string) => void;
  selectedClipId: string | null;
  setSelectedClipId: (clipId: string | null) => void;
  clipboardClip: AudioClip | null;
  audioClipboard: AudioClip | null;
  /**
   * Instante EXACTO del último corte (en segundos de timeline), solo para dibujar
   * la línea de "CORTE" con su tiempo. Es feedback visual transitorio de una función
   * existente (split); no forma parte de los datos de la coreografía.
   */
  lastCutSec: number | null;
  setLastCutSec: (sec: number | null) => void;

  // Acciones de Clips
  splitClip: (trackId: string, clipId: string, splitTimeSec: number) => boolean;
  moveClip: (trackId: string, clipId: string, newStartOffsetSec: number) => void;
  moveClipToTrack: (fromTrackId: string, toTrackId: string, clipId: string, newStartOffsetSec: number) => void;
  duplicateClipToTrack: (fromTrackId: string, toTrackId: string, clipId: string, newStartOffsetSec: number) => AudioClip | null;
  deleteClip: (trackId?: string, clipId?: string) => void;
  copyClip: (clip?: AudioClip) => void;
  pasteClip: (trackId?: string, atTimeSec?: number, pixelsPerSecond?: number) => AudioClip | null;
  setClipFades: (trackId: string, clipId: string, fadeInSec: number, fadeOutSec: number) => void;

  // Acciones de Pistas Libres Dinámicas (hasta 4 pistas adicionales)
  addAudioTrack: (name?: string, buffer?: AudioBuffer, fileName?: string) => AudioStudioTrack;
  removeAudioTrack: (id: string) => void;
  /** Limpia TODAS las pistas, clips y nodos pertenecientes exclusivamente al Estudio de Audio. */
  clearAllStudioTracks: () => void;

  // Marcadores de tiempo (Nodos sin coordenadas espaciales)
  audioNodes: AudioTimeNode[];
  selectedNodeId: string | null;

  // Estado de reproducción y transporte
  currentTimeSec: number;
  totalDurationSec: number;
  isPlaying: boolean;
  zoom: number; // Factor de zoom horizontal (1 a 35)
  snapEnabled: boolean;
  setSnapEnabled: (enabled: boolean | ((prev: boolean) => boolean)) => void;

  // Metrónomo y BPM (retrocompatible con MetronomeConfig)
  metronomeConfig: StudioMetronomeConfig;
  detectedBpm: number | null;
  isAnalyzingBpm: boolean;

  // Acciones de Pistas
  setTrackBuffer: (trackKey: string, buffer: AudioBuffer, fileName?: string) => void;
  setTrackVolume: (trackKey: string, volume: number) => void;
  toggleTrackMute: (trackKey: string) => void;
  toggleTrackSolo: (trackKey: string) => void;
  setTrackTrim: (trackKey: string, trimStartSec: number, trimEndSec: number) => void;
  setTrackFades: (trackKey: string, fadeInSec: number, fadeOutSec: number) => void;

  // Acciones de Nodos Temporales (Marcadores)
  addTimeNode: (timestampSec: number, label?: string) => AudioTimeNode;
  /**
   * Movimiento CONTINUO de un marcador durante un arrastre táctil: actualiza
   * `timestampSec` y renumera SIN empujar historial. El historial se empuja UNA
   * vez al iniciar el gesto (`pushStudioEdit`), no en cada frame: hacerlo por
   * `pointermove` llenaba el undo de instantáneas casi idénticas y provocaba
   * copias pesadas que se percibían como saltos al arrastrar un nodo.
   */
  moveTimeNodeLive: (id: string, timestampSec: number) => void;
  deleteTimeNode: (id: string) => void;
  clearTimeNodes: () => void;
  setSelectedNodeId: (id: string | null) => void;

  // Transporte & BPM
  setCurrentTimeSec: (sec: number) => void;
  setIsPlaying: (playing: boolean) => void;
  setZoom: (zoom: number) => void;
  setMetronomeConfig: (config: Partial<StudioMetronomeConfig>) => void;
  analyzeBpm: () => Promise<number | null>;

  // Historial de edición (undo/redo) — Fase 5.3
  studioHistory: StudioEditSnapshot[];
  studioFuture: StudioEditSnapshot[];
  pushStudioEdit: () => void;
  undoStudio: () => void;
  redoStudio: () => void;

  // Grabación de voz (Fase 4)
  isRecording: boolean;
  recordingElapsedSec: number;
  recordingStartSec: number;
  recordingError: string | null;
  /** Monitorización de entrada (por defecto OFF; auriculares recomendados). */
  recordingMonitorEnabled: boolean;
  recordingMonitorError: string | null;
  setRecordingMonitor: (enabled: boolean) => void;
  /** Pre-inicio (cuenta atrás) antes de capturar; explícito, sin offsets mágicos. */
  recordingCountdownEnabled: boolean;
  recordingCountdownSec: number;
  recordingCountdown: number;
  setRecordingCountdownEnabled: (enabled: boolean) => void;
  setRecordingCountdownSec: (sec: number) => void;
  startVoiceRecording: () => Promise<boolean>;
  stopVoiceRecording: () => Promise<AudioClip | null>;
  cancelVoiceRecording: () => void;

  // Función Puente (Audio-to-Canvas Bridge) & Mixdown
  sendMixToChoreo: () => { nodes: AudioTimeNode[]; success: boolean };
  /**
   * "Editar en Estudio": crea un BORRADOR del Studio a partir del audio PUBLICADO
   * de la Pista 2D (snapshot), sin mover ni alterar ese audio publicado. Es el
   * único puente Rink → Studio y solo se ejecuta de forma explícita.
   */
  loadPublishedIntoStudio: () => boolean;
  /**
   * Snapshot completo Rink → Studio al abrir el Estudio: carga el audio publicado
   * (solo si el borrador aún no tiene música, para no pisar ediciones) y
   * RECONCILIA los nodos colocados en la Pista 2D como marcadores temporales,
   * por identidad estable (`sourceStudioMarkerId`). Es idempotente: abrir el
   * Estudio N veces produce los mismos ids y timestamps, sin duplicados.
   */
  syncRinkSnapshotIntoStudio: () => boolean;
  /** Reconciliación idempotente de marcadores Rink → Studio por `sourceStudioMarkerId`. */
  syncMarkersFromRink: () => boolean;
  renderAndExportMixdown: () => Promise<{ success: boolean; durationSec: number }>;
  /** Devuelve el Estudio a su estado inicial (cambio de cuenta / logout). */
  resetStudio: () => void;
}

const DEFAULT_METRONOME_CONFIG: StudioMetronomeConfig = {
  enabled: true,
  bpm: 140,
  beatsPerMeasure: 4,
  subdivision: 1,
  accentFirstBeat: true,
  volume: 0.8,
};

const DEFAULT_GLOBAL_CONTROLS: GlobalAudioControls = {
  bpm: 140,
  beatsPerMeasure: 4,
  metronome: {
    enabled: true,
    volume: 0.8,
    accentFirstBeat: true,
    muted: false,
    subdivision: 1,
  },
  voiceGuide: {
    enabled: true,
    volume: 1.0,
    muted: false,
  },
};

const buildManifest = (
  tracks: { music: AudioStudioTrack; [key: string]: AudioStudioTrack },
  additionalTracks: AudioStudioTrack[],
  globalControls: GlobalAudioControls,
  totalDurationSec: number
): MixProjectMetadata => {
  const mapTrack = (t: AudioStudioTrack): AudioTrackMetadata => ({
    id: t.id,
    name: t.name,
    color: t.color,
    type: t.type,
    volume: t.volume,
    muted: t.muted,
    solo: t.solo,
    fileName: t.fileName,
    clips: (t.clips || []).map((c): AudioClipMetadata => ({
      id: c.id,
      name: c.name,
      startOffsetSec: c.startOffsetSec,
      durationSec: Math.max(0.01, c.trimEndSec - c.trimStartSec),
      trimStartSec: c.trimStartSec,
      trimEndSec: c.trimEndSec,
      fadeInSec: c.fadeInSec,
      fadeOutSec: c.fadeOutSec,
    })),
  });

  return {
    bpm: globalControls.bpm,
    totalDurationSec,
    masterTrack: mapTrack(tracks.music),
    additionalTracks: additionalTracks.map(mapTrack),
    globalControls,
  };
};

const isMasterId = (id: string) => id === 'music' || id === 'track-music' || id === 'master';

const initialTracks = {
  music: {
    id: 'track-music',
    // Nombre legible por personas (antes 'Master'): el header de pista lo muestra
    // completo y la etiqueta MASTER pasa a ser el estado, no el nombre.
    name: 'Música Principal',
    color: CARBON_TRACK_COLORS[0], // Cyan Eléctrico
    type: 'music' as const,
    buffer: null,
    clips: [],
    volume: 1.0,
    muted: false,
    solo: false,
    trimStartSec: 0,
    trimEndSec: 0,
    fadeInSec: 0,
    fadeOutSec: 0,
    fileName: null,
  },
  voice: {
    id: 'track-voice',
    name: 'Voz & Guías Técnicas',
    color: CARBON_TRACK_COLORS[1], // Magenta Neón
    type: 'voice' as const,
    buffer: null,
    clips: [],
    volume: 1.0,
    muted: false,
    solo: false,
    trimStartSec: 0,
    trimEndSec: 0,
    fadeInSec: 0,
    fadeOutSec: 0,
    fileName: null,
  },
  metronome: {
    id: 'track-metronome',
    name: 'Metrónomo Sintético',
    color: CARBON_TRACK_COLORS[3], // Ámbar Cálido
    type: 'metronome' as const,
    buffer: null,
    clips: [],
    volume: 0.8,
    muted: false,
    solo: false,
    trimStartSec: 0,
    trimEndSec: 0,
    fadeInSec: 0,
    fadeOutSec: 0,
  },
  recording: {
    id: 'track-recording',
    name: '🎙 VOZ (Grabación)',
    color: CARBON_TRACK_COLORS[6], // Coral Neón
    type: 'voice' as const,
    buffer: null,
    clips: [],
    volume: 1.0,
    muted: false,
    solo: false,
    trimStartSec: 0,
    trimEndSec: 0,
    fadeInSec: 0,
    fadeOutSec: 0,
    fileName: null,
  },
};

/**
 * Bandera de consolidación diferida.
 * Mientras hay reproducción activa NO se puede reemplazar el buffer maestro
 * (AudioEngine.setAudioBuffer detiene la fuente), porque eso producía el
 * "Play fantasma": la UI seguía mostrando "reproduciendo" con el audio ya
 * detenido y los toques posteriores se desincronizaban.
 * En su lugar se marca pendiente y se aplica al pausar/detener.
 */
let pendingConsolidation = false;

/** Grabador de voz activo (singleton de sesión) y ticker de duración en vivo. */
let voiceRecorder: VoiceRecorder | null = null;
let recordingTicker: ReturnType<typeof setInterval> | null = null;

/** Monitorización de entrada (opcional, por defecto OFF para evitar realimentación). */
let monitorSource: MediaStreamAudioSourceNode | null = null;
let monitorGain: GainNode | null = null;

/** Cuenta atrás de pre-inicio de grabación (explícita y cancelable). */
let countdownTimer: ReturnType<typeof setInterval> | null = null;
let countdownCancelled = false;

const stopRecordingMonitor = (): void => {
  try {
    monitorSource?.disconnect();
  } catch {
    /* ignorar */
  }
  try {
    monitorGain?.disconnect();
  } catch {
    /* ignorar */
  }
  monitorSource = null;
  monitorGain = null;
};

/**
 * Enruta el micrófono a la MISMA salida del usuario (auriculares recomendados).
 * Nunca incluye audio del Rink: la fuente es exclusivamente el stream de voz.
 */
const startRecordingMonitor = (): { ok: boolean; error?: string } => {
  const stream = voiceRecorder?.getStream();
  if (!stream) return { ok: false, error: 'No hay micrófono activo para monitorizar.' };
  const ctx = audioEngine.getAudioContext();
  if (!ctx) return { ok: false, error: 'Sin contexto de audio disponible.' };
  try {
    monitorSource = ctx.createMediaStreamSource(stream);
    monitorGain = ctx.createGain();
    monitorGain.gain.value = 0.8;
    monitorSource.connect(monitorGain);
    monitorGain.connect(ctx.destination);
    return { ok: true };
  } catch {
    stopRecordingMonitor();
    return { ok: false, error: 'No se pudo iniciar la monitorización.' };
  }
};

/** Cuenta atrás de pre-inicio: 1 tick por segundo, cancelable al instante. */
const runRecordingCountdown = (
  seconds: number,
  onTick: (remaining: number) => void
): Promise<void> =>
  new Promise((resolve) => {
    countdownCancelled = false;
    let remaining = seconds;
    onTick(remaining);
    countdownTimer = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        if (countdownTimer) {
          clearInterval(countdownTimer);
          countdownTimer = null;
        }
        onTick(0);
        resolve();
      } else {
        onTick(remaining);
      }
    }, 1000);
  });

/**
 * Arreglo del Studio: Master (música) + VOZ grabada + pistas adicionales. La pista
 * de grabación entra en reproducción y en la mezcla final, pero NO en la pista de
 * música del Rink (que solo recibe el mix renderizado).
 */
const arrangementOf = (state: AudioStudioStoreState): AudioStudioTrack[] => [
  state.tracks.music,
  state.tracks.recording,
  ...state.additionalTracks,
];

/** Captura el estado editable para el historial de undo/redo. */
const captureEdit = (s: AudioStudioStoreState): StudioEditSnapshot => ({
  tracks: s.tracks,
  additionalTracks: s.additionalTracks,
  audioNodes: s.audioNodes,
  totalDurationSec: s.totalDurationSec,
});

/**
 * Alias de id de UI → clave real del objeto `tracks`. La UI usa `track.id`
 * (p. ej. `track-recording`) mientras que `tracks` está indexado por nombre
 * (`recording`); sin esto, las acciones de edición sobre esas pistas eran no-ops.
 */
const CORE_TRACK_KEY_BY_ID: Record<string, string> = {
  'track-music': 'music',
  'track-voice': 'voice',
  'track-metronome': 'metronome',
  'track-recording': 'recording',
  master: 'music',
};

const resolveCoreKey = (
  tracks: AudioStudioStoreState['tracks'],
  trackId: string
): string | null => (tracks[trackId] ? trackId : CORE_TRACK_KEY_BY_ID[trackId] ?? null);

/** La pista de VOZ grabada es EXCLUSIVA: rechaza clips de otras pistas. */
const isRecordingTarget = (
  tracks: AudioStudioStoreState['tracks'],
  additionalTracks: AudioStudioTrack[],
  trackId: string
): boolean => {
  if (resolveCoreKey(tracks, trackId) === 'recording') return true;
  return additionalTracks.some((t) => t.id === trackId && t.id === 'track-recording');
};

const runStudioConsolidation = (): boolean => {
  try {
    const state = useAudioStudioStore.getState();
    const arrangementTracks = arrangementOf(state);
    const hasAnyClips = arrangementTracks.some((t) => (t.clips && t.clips.length > 0) || t.buffer);
    if (!hasAnyClips) return false;

    const buffer = bounceStudioClipsToBuffer(arrangementTracks, state.totalDurationSec);
    if (buffer) {
      // preservePosition: conservar el cabezal tras re-renderizar la mezcla
      audioEngine.setAudioBuffer(buffer, 'Mezcla_Estudio_Consolidada.wav', true);
      return true;
    }
  } catch (e) {
    // silent fallback
  }
  return false;
};

export const triggerStudioConsolidation = () => {
  // Nunca cortar la reproducción: se difiere hasta pausa/stop.
  if (audioEngine.getState().isPlaying) {
    pendingConsolidation = true;
    return;
  }
  runStudioConsolidation();
};

/** Aplica la consolidación diferida. Invocar al pausar/detener la reproducción. */
export const flushPendingConsolidation = () => {
  if (!pendingConsolidation) return;
  pendingConsolidation = false;
  runStudioConsolidation();
};

/** Indica si quedan cambios de mezcla sin consolidar en el buffer maestro. */
export const hasPendingConsolidation = () => pendingConsolidation;

/**
 * Anula el PCM de una lista de clips para que el recolector pueda reclamarlo.
 *
 * ⚠️ SOLO es seguro cuando esos clips ya están fuera del historial (undo/redo),
 * del portapapeles y del arreglo actual. Su único uso válido hoy es `resetStudio`,
 * donde acto seguido se restaura la instantánea inicial (historial vacío).
 *
 * NUNCA llamarlo sobre clips que el historial todavía referencia: mutar el objeto
 * compartido deja la instantánea sin PCM y el deshacer restauraría un clip mudo.
 * En ediciones normales (borrar, quitar pista) basta con dejar de referenciar el
 * buffer: la instantánea más antigua sale del tope de 50 y el GC reclama el PCM.
 */
function releaseClipBuffers(clips: Array<AudioClip | undefined | null>): void {
  for (const clip of clips) {
    if (clip && clip.buffer) {
      try {
        (clip as { buffer: AudioBuffer | null }).buffer = null;
      } catch (e) {
        /* Clip inmutable: se ignora. */
      }
    }
  }
}

/**
 * Instantánea del estado inicial del Estudio. Se captura justo después de crear
 * el store y permite restaurar TODO (pistas, clips, controles, selección…) al
 * cambiar de cuenta, sin enumerar campo por campo.
 */
let initialStudioSnapshot: AudioStudioStoreState | null = null;

export const useAudioStudioStore = create<AudioStudioStoreState>((set, get) => ({
  tracks: initialTracks,
  additionalTracks: [],

  /**
   * Reset completo del Estudio (cambio de cuenta / logout). Libera los buffers
   * de audio de los clips actuales antes de restaurar el estado inicial.
   */
  resetStudio: () => {
    const snapshot = initialStudioSnapshot;
    if (!snapshot) return;
    const current = get();
    releaseClipBuffers(current.tracks.music?.clips || []);
    releaseClipBuffers(current.tracks.recording?.clips || []);
    releaseClipBuffers(current.additionalTracks.flatMap((t) => t.clips || []));
    if (recordingTicker) {
      clearInterval(recordingTicker);
      recordingTicker = null;
    }
    countdownCancelled = true;
    if (countdownTimer) {
      clearInterval(countdownTimer);
      countdownTimer = null;
    }
    stopRecordingMonitor();
    voiceRecorder?.cancel();
    voiceRecorder = null;
    pendingConsolidation = false;
    set(snapshot);
  },

  draggingGhost: null,
  setDraggingGhost: (ghost) => set({ draggingGhost: ghost }),

  calculateSnapOffset: (targetTrackId, clipId, rawOffsetSec, clipDurationSec, pixelsPerSecond) => {
    const state = get();

    // El snap es OPCIONAL e INDEPENDIENTE de la regla visual: con el interruptor
    // apagado, arrastrar/pegar devuelve la posición temporal libre del puntero.
    if (!state.snapEnabled) {
      const raw = Number.isFinite(rawOffsetSec) ? Math.max(0, rawOffsetSec) : 0;
      return { snappedSec: raw, snapLineSec: null };
    }

    const targetCoreKey = resolveCoreKey(state.tracks, targetTrackId);
    const targetTrack = targetCoreKey
      ? state.tracks[targetCoreKey]
      : state.additionalTracks.find((t) => t.id === targetTrackId);

    // Los bordes del resto de clips de la pista destino son la referencia prioritaria.
    const clipEdges = (targetTrack?.clips ?? [])
      .filter((other) => other.id !== clipId)
      .map((other) => {
        const durationSec = Math.max(0.01, other.trimEndSec - other.trimStartSec);
        return { startSec: other.startOffsetSec, endSec: other.startOffsetSec + durationSec };
      });

    // Tolerancia derivada de PÍXELES visibles. Si no se conoce la escala (p. ej.
    // pegado desde un menú flotante sin geometría), se conserva el umbral clásico.
    const hasScale =
      typeof pixelsPerSecond === 'number' &&
      Number.isFinite(pixelsPerSecond) &&
      pixelsPerSecond > 0;
    const snapTolerance = hasScale ? snapToleranceSec(pixelsPerSecond!, SNAP_PX) : 0.5;
    const beatTolerance = hasScale ? snapToleranceSec(pixelsPerSecond!, BEAT_SNAP_PX) : 0.25;

    const result = computeSnapOffset({
      rawTimeSec: rawOffsetSec,
      clipDurationSec,
      snapToleranceSec: snapTolerance,
      beatToleranceSec: beatTolerance,
      clipEdges,
      playheadSec: state.currentTimeSec,
      originSec: 0,
      bpm: state.globalControls.bpm || 120,
      gridEnabled: state.snapEnabled,
    });

    return { snappedSec: result.snappedSec, snapLineSec: result.snapLineSec };
  },

  consolidateStudioAudio: async () => {
    const state = get();
    const arrangementTracks = arrangementOf(state);
    const hasAnyClips = arrangementTracks.some((t) => (t.clips && t.clips.length > 0) || t.buffer);
    if (!hasAnyClips) return null;

    try {
      const buffer = bounceStudioClipsToBuffer(
        arrangementTracks,
        state.totalDurationSec
      );
      if (buffer) {
        // Preserva el cabezal: el llamador decide desde dónde reproducir.
        audioEngine.setAudioBuffer(buffer, 'Mezcla_Estudio_Consolidada.wav', true);
        pendingConsolidation = false;
        return buffer;
      }
    } catch (err) {
      console.warn('[AudioStudioStore] Fallo al consolidar buffer de estudio:', err);
    }
    return null;
  },

  globalControls: DEFAULT_GLOBAL_CONTROLS,

  contextMenu: null,
  openContextMenu: (trackId, clipId, x, y) => {
    set({
      contextMenu: { isOpen: true, trackId, clipId, x, y },
      selectedClipId: clipId,
    });
  },
  closeContextMenu: () => set({ contextMenu: null }),

  // ── Modo "arrastrar a la basura" (pulsación larga en móvil) ──
  trashDrag: { active: false, trackId: null, clipId: null, overTrash: false },
  beginTrashDrag: (trackId, clipId) => {
    set({
      trashDrag: { active: true, trackId, clipId, overTrash: false },
      selectedClipId: clipId,
      // El modo basura reemplaza al menú contextual para no solaparse.
      contextMenu: null,
    });
  },
  setTrashHover: (overTrash) => {
    const current = get().trashDrag;
    if (!current.active || current.overTrash === overTrash) return;
    set({ trashDrag: { ...current, overTrash } });
  },
  endTrashDrag: () => {
    const current = get().trashDrag;
    if (!current.active) return;
    set({ trashDrag: { active: false, trackId: null, clipId: null, overTrash: false } });
  },

  mixManifest: buildManifest(initialTracks, [], DEFAULT_GLOBAL_CONTROLS, 120),
  getMixManifest: () => {
    const s = get();
    return buildManifest(s.tracks, s.additionalTracks, s.globalControls, s.totalDurationSec);
  },

  setGlobalBpm: (bpm) => {
    const clamped = Math.max(40, Math.min(260, Math.round(bpm)));
    set((state) => {
      const updatedControls = { ...state.globalControls, bpm: clamped };
      const updatedMetro = { ...state.metronomeConfig, bpm: clamped };
      audioEngine.metronome.setBpm(clamped);
      return {
        globalControls: updatedControls,
        metronomeConfig: updatedMetro,
        mixManifest: buildManifest(state.tracks, state.additionalTracks, updatedControls, state.totalDurationSec),
      };
    });
  },

  toggleMetronomeMute: () => {
    // El estado se decide ANTES de actualizar; el efecto sobre el motor se
    // ejecuta DESPUÉS del `set` (fuera del updater) para evitar cualquier
    // problema de pureza/orden con el estado de React en móviles.
    const newMuted = !get().globalControls.metronome.muted;
    const newEnabled = !newMuted;
    set((state) => {
      const updatedControls = {
        ...state.globalControls,
        metronome: { ...state.globalControls.metronome, muted: newMuted, enabled: newEnabled },
      };
      return {
        globalControls: updatedControls,
        metronomeConfig: { ...state.metronomeConfig, enabled: newEnabled },
        tracks: {
          ...state.tracks,
          metronome: { ...state.tracks.metronome, muted: newMuted },
        },
        mixManifest: buildManifest(state.tracks, state.additionalTracks, updatedControls, state.totalDurationSec),
      };
    });
    // Una sola llamada coordina habilitado lógico, planificador y GainNode/desconexión
    // del sub-bus (silencio absoluto de lo ya programado).
    audioEngine.setMetronomeAudible(newEnabled);
  },

  setMetronomeVolume: (vol) => {
    const clamped = Math.max(0, Math.min(1, vol));
    set((state) => {
      const updatedControls = {
        ...state.globalControls,
        metronome: { ...state.globalControls.metronome, volume: clamped },
      };
      audioEngine.metronome.setVolume(clamped);
      return {
        globalControls: updatedControls,
        metronomeConfig: { ...state.metronomeConfig, volume: clamped },
        tracks: {
          ...state.tracks,
          metronome: { ...state.tracks.metronome, volume: clamped },
        },
        mixManifest: buildManifest(state.tracks, state.additionalTracks, updatedControls, state.totalDurationSec),
      };
    });
  },

  toggleMetronomeEnabled: () => {
    set((state) => {
      const newEnabled = !state.globalControls.metronome.enabled;
      // `enabled` y `muted` van siempre juntos (misma fuente para Pista 2D y
      // Estudio): encender limpia el mute y apagar silencia de inmediato.
      const newMuted = !newEnabled;
      const updatedControls = {
        ...state.globalControls,
        metronome: { ...state.globalControls.metronome, enabled: newEnabled, muted: newMuted },
      };
      audioEngine.setMetronomeAudible(newEnabled);
      return {
        globalControls: updatedControls,
        metronomeConfig: { ...state.metronomeConfig, enabled: newEnabled },
        tracks: {
          ...state.tracks,
          metronome: { ...state.tracks.metronome, muted: newMuted },
        },
        mixManifest: buildManifest(state.tracks, state.additionalTracks, updatedControls, state.totalDurationSec),
      };
    });
  },

  toggleVoiceGuideMute: () => {
    set((state) => {
      const newMuted = !state.globalControls.voiceGuide.muted;
      const updatedControls = {
        ...state.globalControls,
        voiceGuide: { ...state.globalControls.voiceGuide, muted: newMuted },
      };
      audioEngine.voiceCueEngine.setConfig({ enabled: !newMuted && state.globalControls.voiceGuide.enabled });
      // Silencio ABSOLUTO del sub-bus de voz: corta también la locución en curso
      // (y los cues ya agendados) sin detener la pista maestra ni su sincronía.
      audioEngine.setVoiceGuideMuted(newMuted);
      // El fallback del navegador (SpeechSynthesis) no pasa por el grafo Web
      // Audio, así que además se cancela explícitamente al silenciar.
      if (newMuted) ttsService.stop();
      return {
        globalControls: updatedControls,
        tracks: {
          ...state.tracks,
          voice: { ...state.tracks.voice, muted: newMuted },
        },
        mixManifest: buildManifest(state.tracks, state.additionalTracks, updatedControls, state.totalDurationSec),
      };
    });
  },

  setVoiceGuideVolume: (vol) => {
    const clamped = Math.max(0, Math.min(1, vol));
    set((state) => {
      const updatedControls = {
        ...state.globalControls,
        voiceGuide: { ...state.globalControls.voiceGuide, volume: clamped },
      };
      audioEngine.voiceCueEngine.setVolume(clamped);
      return {
        globalControls: updatedControls,
        tracks: {
          ...state.tracks,
          voice: { ...state.tracks.voice, volume: clamped },
        },
        mixManifest: buildManifest(state.tracks, state.additionalTracks, updatedControls, state.totalDurationSec),
      };
    });
  },

  toggleVoiceGuideEnabled: () => {
    set((state) => {
      const newEnabled = !state.globalControls.voiceGuide.enabled;
      const updatedControls = {
        ...state.globalControls,
        voiceGuide: { ...state.globalControls.voiceGuide, enabled: newEnabled },
      };
      audioEngine.voiceCueEngine.setConfig({ enabled: newEnabled && !state.globalControls.voiceGuide.muted });
      return {
        globalControls: updatedControls,
        mixManifest: buildManifest(state.tracks, state.additionalTracks, updatedControls, state.totalDurationSec),
      };
    });
  },

  activeTool: 'select',
  setActiveTool: (tool) => set({ activeTool: tool }),
  activeTrackId: 'music',
  setActiveTrackId: (trackId) => set({ activeTrackId: trackId }),
  selectedClipId: null,
  setSelectedClipId: (clipId) => set({ selectedClipId: clipId }),
  clipboardClip: null,
  audioClipboard: null,
  lastCutSec: null,
  setLastCutSec: (sec) => set({ lastCutSec: sec }),

  splitClip: (trackId, clipId, splitTimeSec) => {
    get().pushStudioEdit();
    let wasSplit = false;
    let newSplitClipId: string | null = null;
    let cutSec: number | null = null;
    set((state) => {
      const updateClips = (track: AudioStudioTrack): AudioStudioTrack => {
        const clipIndex = track.clips.findIndex((c) => c.id === clipId);
        if (clipIndex === -1) return track;
        const clip = track.clips[clipIndex];

        const clipDuration = clip.trimEndSec - clip.trimStartSec;
        let relativeSplit = splitTimeSec - clip.startOffsetSec;

        // Margen mínimo de 20ms para evitar fragmentos inservibles
        if (relativeSplit <= 0.02 || relativeSplit >= clipDuration - 0.02) {
          return track;
        }

        let bufferSplitPoint = clip.trimStartSec + relativeSplit;

        // Corte milimétrico sin clic: ajustar al cruce por cero más cercano
        if (clip.buffer) {
          try {
            bufferSplitPoint = snapToZeroCrossing(clip.buffer, bufferSplitPoint, 4);
            relativeSplit = bufferSplitPoint - clip.trimStartSec;
            if (relativeSplit <= 0.005 || relativeSplit >= clipDuration - 0.005) {
              return track;
            }
          } catch (err) {
            // Ante cualquier fallo, conservar el punto solicitado
          }
        }

        const splitOffsetSec = clip.startOffsetSec + relativeSplit;
        cutSec = splitOffsetSec;

        // Identificadores basados en un único sello de tiempo para que el clip
        // seleccionado tras el corte coincida exactamente con el segundo fragmento.
        const stamp = Date.now();
        const secondClipId = `clip-${stamp}-b`;

        const firstClip: AudioClip = {
          ...clip,
          id: `clip-${stamp}-a`,
          trimEndSec: bufferSplitPoint,
          fadeOutSec: Math.min(clip.fadeOutSec, 0.2),
        };

        const secondClip: AudioClip = {
          ...clip,
          id: secondClipId,
          startOffsetSec: splitOffsetSec,
          trimStartSec: bufferSplitPoint,
          fadeInSec: Math.min(clip.fadeInSec, 0.2),
        };

        const newClips = [...track.clips];
        newClips.splice(clipIndex, 1, firstClip, secondClip);
        wasSplit = true;
        newSplitClipId = secondClipId;

        return {
          ...track,
          clips: newClips,
        };
      };

      const coreKey = resolveCoreKey(state.tracks, trackId);
      const updatedTracks = coreKey
        ? { ...state.tracks, [coreKey]: updateClips(state.tracks[coreKey]) }
        : state.tracks;

      const updatedAdditional = state.additionalTracks.map((t) =>
        t.id === trackId ? updateClips(t) : t
      );

      return {
        tracks: updatedTracks,
        additionalTracks: updatedAdditional,
        selectedClipId: wasSplit && newSplitClipId ? newSplitClipId : state.selectedClipId,
        // Instante exacto (ya ajustado a cruce por cero) para la marca de corte.
        lastCutSec: cutSec !== null ? cutSec : state.lastCutSec,
        mixManifest: buildManifest(updatedTracks, updatedAdditional, state.globalControls, state.totalDurationSec),
      };
    });

    if (wasSplit) triggerStudioConsolidation();
    return wasSplit;
  },

  moveClip: (trackId, clipId, newStartOffsetSec) => {
    get().pushStudioEdit();
    const clampedOffset = Number.isFinite(newStartOffsetSec)
      ? Math.max(0, newStartOffsetSec)
      : 0;
    set((state) => {
      let clipEnd = 0;
      const updateClips = (track: AudioStudioTrack): AudioStudioTrack => ({
        ...track,
        clips: track.clips.map((c) => {
          if (c.id === clipId) {
            clipEnd = clampedOffset + (c.trimEndSec - c.trimStartSec);
            return { ...c, startOffsetSec: clampedOffset };
          }
          return c;
        }),
      });

      const coreKey = resolveCoreKey(state.tracks, trackId);
      const updatedTracks = coreKey
        ? { ...state.tracks, [coreKey]: updateClips(state.tracks[coreKey]) }
        : state.tracks;

      const updatedAdditional = state.additionalTracks.map((t) =>
        t.id === trackId ? updateClips(t) : t
      );

      const newTotalDuration = Math.max(state.totalDurationSec, Math.ceil(clipEnd + 5));

      return {
        tracks: updatedTracks,
        additionalTracks: updatedAdditional,
        totalDurationSec: newTotalDuration,
        mixManifest: buildManifest(updatedTracks, updatedAdditional, state.globalControls, newTotalDuration),
      };
    });

    triggerStudioConsolidation();
  },

  moveClipToTrack: (fromTrackId, toTrackId, clipId, newStartOffsetSec) => {
    get().pushStudioEdit();
    const clampedOffset = Number.isFinite(newStartOffsetSec)
      ? Math.max(0, newStartOffsetSec)
      : 0;
    set((state) => {
      // La pista de grabación de voz es EXCLUSIVA: rechaza clips de otras pistas.
      if (isRecordingTarget(state.tracks, state.additionalTracks, toTrackId)) {
        return state;
      }
      let movedClip: AudioClip | null = null;

      // 1. Extraer clip de pista origen
      const removeClipFrom = (track: AudioStudioTrack): AudioStudioTrack => {
        const found = track.clips.find((c) => c.id === clipId);
        if (found) movedClip = { ...found, startOffsetSec: clampedOffset };
        return {
          ...track,
          clips: track.clips.filter((c) => c.id !== clipId),
        };
      };

      const fromKey = resolveCoreKey(state.tracks, fromTrackId);
      const intermediateTracks = fromKey
        ? { ...state.tracks, [fromKey]: removeClipFrom(state.tracks[fromKey]) }
        : state.tracks;

      const intermediateAdditional = state.additionalTracks.map((t) =>
        t.id === fromTrackId ? removeClipFrom(t) : t
      );

      if (!movedClip) return state;

      // 2. Insertar clip en pista destino
      const insertClipInto = (track: AudioStudioTrack): AudioStudioTrack => ({
        ...track,
        clips: [...track.clips, movedClip!],
      });

      const toKey = resolveCoreKey(intermediateTracks, toTrackId);
      const finalTracks = toKey
        ? { ...intermediateTracks, [toKey]: insertClipInto(intermediateTracks[toKey]) }
        : intermediateTracks;

      const finalAdditional = toKey
        ? intermediateAdditional
        : intermediateAdditional.map((t) => (t.id === toTrackId ? insertClipInto(t) : t));

      const targetClip = movedClip as unknown as AudioClip;
      const movedEnd = targetClip ? clampedOffset + (targetClip.trimEndSec - targetClip.trimStartSec) : 0;
      const newTotalDuration = Math.max(state.totalDurationSec, Math.ceil(movedEnd + 5));

      return {
        tracks: finalTracks,
        additionalTracks: finalAdditional,
        selectedClipId: clipId,
        totalDurationSec: newTotalDuration,
        mixManifest: buildManifest(finalTracks, finalAdditional, state.globalControls, newTotalDuration),
      };
    });

    triggerStudioConsolidation();
  },

  duplicateClipToTrack: (fromTrackId, toTrackId, clipId, newStartOffsetSec) => {
    get().pushStudioEdit();
    const state = get();
    const clampedOffset = Number.isFinite(newStartOffsetSec)
      ? Math.max(0, newStartOffsetSec)
      : 0;

    // Buscar clip original
    const fromKey = resolveCoreKey(state.tracks, fromTrackId);
    const fromTrack = fromKey
      ? state.tracks[fromKey]
      : state.additionalTracks.find((t) => t.id === fromTrackId);
    const sourceClip = fromTrack?.clips.find((c) => c.id === clipId);
    if (!sourceClip) return null;
    // La pista de grabación de voz es EXCLUSIVA: rechaza clips de otras pistas.
    if (isRecordingTarget(state.tracks, state.additionalTracks, toTrackId)) return null;

    const duplicatedClip: AudioClip = {
      ...sourceClip,
      id: `clip-dup-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      startOffsetSec: clampedOffset,
    };

    set((currState) => {
      const addClip = (track: AudioStudioTrack): AudioStudioTrack => ({
        ...track,
        clips: [...track.clips, duplicatedClip],
      });

      const toKey = resolveCoreKey(currState.tracks, toTrackId);
      const updatedTracks = toKey
        ? { ...currState.tracks, [toKey]: addClip(currState.tracks[toKey]) }
        : currState.tracks;

      const updatedAdditional = toKey
        ? currState.additionalTracks
        : currState.additionalTracks.map((t) => (t.id === toTrackId ? addClip(t) : t));

      const dupEnd = clampedOffset + (duplicatedClip.trimEndSec - duplicatedClip.trimStartSec);
      const newTotalDuration = Math.max(currState.totalDurationSec, Math.ceil(dupEnd + 5));

      return {
        tracks: updatedTracks,
        additionalTracks: updatedAdditional,
        selectedClipId: duplicatedClip.id,
        totalDurationSec: newTotalDuration,
        mixManifest: buildManifest(updatedTracks, updatedAdditional, currState.globalControls, newTotalDuration),
      };
    });

    triggerStudioConsolidation();
    return duplicatedClip;
  },

  deleteClip: (trackId, clipId) => {
    get().pushStudioEdit();
    set((state) => {
      const targetClipId = clipId || state.selectedClipId;
      if (!targetClipId) return state;

      const updateClips = (track: AudioStudioTrack): AudioStudioTrack => {
        const kept = track.clips.filter((c) => c.id !== targetClipId);
        // Sin cambios en esta pista: se devuelve la MISMA referencia (compartición
        // estructural, para no retener copias innecesarias en el historial).
        return kept.length === track.clips.length ? track : { ...track, clips: kept };
      };

      let updatedTracks = { ...state.tracks };
      let updatedAdditional = state.additionalTracks.map((t) => updateClips(t));

      if (trackId && isMasterId(trackId)) {
        updatedTracks.music = updateClips(updatedTracks.music);
      } else if (trackId && updatedTracks[trackId]) {
        updatedTracks[trackId] = updateClips(updatedTracks[trackId]);
      } else {
        for (const k of Object.keys(updatedTracks)) {
          if (updatedTracks[k].clips.some((c) => c.id === targetClipId)) {
            updatedTracks[k] = updateClips(updatedTracks[k]);
            break;
          }
        }
      }

      // NO se anula el `buffer` del clip eliminado. El historial (que acaba de
      // capturarse en `pushStudioEdit`) referencia ESE MISMO objeto de clip, así
      // que anular su PCM rompía el deshacer: al deshacer, el clip volvía sin
      // audio. El recolector libera el PCM cuando la instantánea sale del tope de
      // 50 ediciones. (Antes se liberaba aquí "para ayudar al GC", pero no liberaba
      // nada —el buffer seguía referenciado— y corrompía el undo.)

      return {
        tracks: updatedTracks,
        additionalTracks: updatedAdditional,
        selectedClipId: state.selectedClipId === targetClipId ? null : state.selectedClipId,
        contextMenu: null,
        mixManifest: buildManifest(updatedTracks, updatedAdditional, state.globalControls, state.totalDurationSec),
      };
    });

    triggerStudioConsolidation();
  },

  copyClip: (clip) => {
    if (clip) {
      set({ clipboardClip: { ...clip }, audioClipboard: { ...clip } });
      return;
    }
    const state = get();
    // 1. Si hay selectedClipId
    if (state.selectedClipId) {
      const allTracks = [state.tracks.music, state.tracks.voice, ...state.additionalTracks];
      for (const t of allTracks) {
        const found = t.clips.find((c) => c.id === state.selectedClipId);
        if (found) {
          set({ clipboardClip: { ...found }, audioClipboard: { ...found } });
          return;
        }
      }
    }
    // 2. Si no hay selectedClipId pero hay un clip bajo el cabezal en activeTrackId
    const activeCoreKey = resolveCoreKey(state.tracks, state.activeTrackId);
    const activeTrack = activeCoreKey
      ? state.tracks[activeCoreKey]
      : state.additionalTracks.find((t) => t.id === state.activeTrackId);
    if (activeTrack) {
      const found = activeTrack.clips.find(
        (c) => state.currentTimeSec >= c.startOffsetSec && state.currentTimeSec <= c.startOffsetSec + (c.trimEndSec - c.trimStartSec)
      );
      if (found) {
        set({ clipboardClip: { ...found }, audioClipboard: { ...found }, selectedClipId: found.id });
        return;
      }
    }
  },

  pasteClip: (trackId, atTimeSec, pixelsPerSecond) => {
    const { clipboardClip, audioClipboard, currentTimeSec, activeTrackId, calculateSnapOffset } = get();
    const clipToPaste = clipboardClip || audioClipboard;
    if (!clipToPaste) return null;
    get().pushStudioEdit();

    // Si no se especifica pista, pegar en la pista activa o master
    const targetTrackId = trackId || activeTrackId || 'music';
    const targetTime = atTimeSec !== undefined ? atTimeSec : currentTimeSec;
    const clipDur = Math.max(0.01, clipToPaste.trimEndSec - clipToPaste.trimStartSec);

    // Snapping al pegar con el MISMO imán (tolerancia en píxeles) que el arrastre.
    const snap = calculateSnapOffset(
      targetTrackId,
      null,
      Math.max(0, targetTime),
      clipDur,
      pixelsPerSecond
    );
    const startOffsetSec = snap.snappedSec;

    const newClip: AudioClip = {
      ...clipToPaste,
      id: `clip-paste-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      startOffsetSec,
    };

    set((state) => {
      const addClip = (track: AudioStudioTrack): AudioStudioTrack => ({
        ...track,
        clips: [...track.clips, newClip],
      });

      const targetCoreKey = resolveCoreKey(state.tracks, targetTrackId);
      const updatedTracks = targetCoreKey
        ? { ...state.tracks, [targetCoreKey]: addClip(state.tracks[targetCoreKey]) }
        : state.tracks;

      const updatedAdditional = targetCoreKey
        ? state.additionalTracks
        : state.additionalTracks.map((t) => (t.id === targetTrackId ? addClip(t) : t));

      const pasteEnd = newClip.startOffsetSec + (newClip.trimEndSec - newClip.trimStartSec);
      const newTotalDuration = Math.max(state.totalDurationSec, Math.ceil(pasteEnd + 5));

      return {
        tracks: updatedTracks,
        additionalTracks: updatedAdditional,
        selectedClipId: newClip.id,
        contextMenu: null,
        totalDurationSec: newTotalDuration,
        mixManifest: buildManifest(updatedTracks, updatedAdditional, state.globalControls, newTotalDuration),
      };
    });

    triggerStudioConsolidation();
    return newClip;
  },

  setClipFades: (trackId, clipId, fadeInSec, fadeOutSec) => {
    set((state) => {
      const updateClips = (track: AudioStudioTrack): AudioStudioTrack => ({
        ...track,
        clips: track.clips.map((c) =>
          c.id === clipId
            ? { ...c, fadeInSec: Math.max(0, fadeInSec), fadeOutSec: Math.max(0, fadeOutSec) }
            : c
        ),
      });

      const coreKey = resolveCoreKey(state.tracks, trackId);
      const updatedTracks = coreKey
        ? { ...state.tracks, [coreKey]: updateClips(state.tracks[coreKey]) }
        : state.tracks;

      const updatedAdditional = state.additionalTracks.map((t) =>
        t.id === trackId ? updateClips(t) : t
      );

      return {
        tracks: updatedTracks,
        additionalTracks: updatedAdditional,
        mixManifest: buildManifest(updatedTracks, updatedAdditional, state.globalControls, state.totalDurationSec),
      };
    });
  },

  addAudioTrack: (name, buffer, fileName) => {
    const currentAdditional = get().additionalTracks;
    // Límite estricto de arquitectura: máximo 4 pistas adicionales (1 master + 4 = 5 pistas en total)
    if (currentAdditional.length >= 4) {
      console.warn('[AudioStudioStore] Límite alcanzado: Máximo 4 pistas adicionales permitidas (5 pistas en total).');
      return currentAdditional[currentAdditional.length - 1];
    }

    const newId = `track-additional-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const currentCount = currentAdditional.length;
    // Paleta Carbon: asignación cíclica de color (Pista 2: Magenta, Pista 3: Menta, Pista 4: Ámbar, Pista 5: Púrpura)
    const colorIndex = (1 + currentCount) % CARBON_TRACK_COLORS.length;
    const assignedColor = CARBON_TRACK_COLORS[colorIndex];

    const initialClips: AudioClip[] = buffer
      ? [{
          id: `clip-${newId}-init`,
          name: fileName || name || `Pista ${currentCount + 2}`,
          buffer,
          startOffsetSec: 0,
          trimStartSec: 0,
          trimEndSec: buffer.duration,
          fadeInSec: 0,
          fadeOutSec: 0,
        }]
      : [];

    const newTrack: AudioStudioTrack = {
      id: newId,
      name: name || `Pista ${currentCount + 2}`,
      color: assignedColor,
      type: 'additional',
      buffer: buffer || null,
      clips: initialClips,
      volume: 1.0,
      muted: false,
      solo: false,
      trimStartSec: 0,
      trimEndSec: buffer ? buffer.duration : 0,
      fadeInSec: 0,
      fadeOutSec: 0,
      fileName: fileName || null,
    };

    set((state) => {
      const updatedAdditional = [...state.additionalTracks, newTrack];
      return {
        additionalTracks: updatedAdditional,
        mixManifest: buildManifest(state.tracks, updatedAdditional, state.globalControls, state.totalDurationSec),
      };
    });

    if (buffer) {
      get().setTrackBuffer(newId, buffer, fileName);
    }

    return newTrack;
  },

  removeAudioTrack: (id) => {
    get().pushStudioEdit();
    set((state) => {
      const updatedAdditional = state.additionalTracks.filter((t) => t.id !== id);
      return {
        additionalTracks: updatedAdditional,
        mixManifest: buildManifest(state.tracks, updatedAdditional, state.globalControls, state.totalDurationSec),
      };
    });
  },

  audioNodes: [],
  selectedNodeId: null,

  currentTimeSec: 0,
  totalDurationSec: 120, // 2 minutos por defecto
  isPlaying: false,
  zoom: 1,
  snapEnabled: true,
  setSnapEnabled: (arg) => set((s) => ({ snapEnabled: typeof arg === 'function' ? arg(s.snapEnabled) : arg })),

  metronomeConfig: DEFAULT_METRONOME_CONFIG,
  detectedBpm: null,
  isAnalyzingBpm: false,

  // ── Grabación de voz (Fase 4) ──
  isRecording: false,
  recordingElapsedSec: 0,
  recordingStartSec: 0,
  recordingError: null,
  recordingMonitorEnabled: false,
  recordingMonitorError: null,

  setRecordingMonitor: (enabled) => {
    if (!enabled) {
      stopRecordingMonitor();
      set({ recordingMonitorEnabled: false, recordingMonitorError: null });
      return;
    }
    // Si aún no se está grabando, se guarda como preferencia y se aplicará al
    // arrancar la toma (el stream todavía no existe).
    if (!voiceRecorder) {
      set({ recordingMonitorEnabled: true, recordingMonitorError: null });
      return;
    }
    const result = startRecordingMonitor();
    set({
      recordingMonitorEnabled: result.ok,
      recordingMonitorError: result.ok ? null : result.error ?? null,
    });
  },

  recordingCountdownEnabled: false,
  recordingCountdownSec: 3,
  recordingCountdown: 0,
  setRecordingCountdownEnabled: (enabled) => set({ recordingCountdownEnabled: enabled }),
  setRecordingCountdownSec: (sec) =>
    set({ recordingCountdownSec: Math.max(1, Math.min(10, Math.round(sec))) }),

  // ── Historial de edición (undo/redo, Fase 5.3) ──
  studioHistory: [],
  studioFuture: [],
  pushStudioEdit: () => {
    set((s) => ({
      studioHistory: [...s.studioHistory.slice(-49), captureEdit(s)],
      studioFuture: [],
    }));
    // Cualquier edición del borrador deja "cambios sin enviar" al Rink.
    useRinkAudioStore.getState().markStudioDirty(true);
  },
  undoStudio: () => {
    set((s) => {
      if (s.studioHistory.length === 0) return s;
      const previous = s.studioHistory[s.studioHistory.length - 1];
      return {
        studioHistory: s.studioHistory.slice(0, -1),
        studioFuture: [captureEdit(s), ...s.studioFuture].slice(0, 50),
        tracks: previous.tracks,
        additionalTracks: previous.additionalTracks,
        audioNodes: previous.audioNodes,
        totalDurationSec: previous.totalDurationSec,
      };
    });
    useRinkAudioStore.getState().markStudioDirty(true);
  },
  redoStudio: () => {
    set((s) => {
      if (s.studioFuture.length === 0) return s;
      const next = s.studioFuture[0];
      return {
        studioFuture: s.studioFuture.slice(1),
        studioHistory: [...s.studioHistory, captureEdit(s)],
        tracks: next.tracks,
        additionalTracks: next.additionalTracks,
        audioNodes: next.audioNodes,
        totalDurationSec: next.totalDurationSec,
      };
    });
    useRinkAudioStore.getState().markStudioDirty(true);
  },

  setTrackBuffer: (trackKey, buffer, fileName) => {
    const duration = buffer.duration;
    const resolvedKey = resolveCoreKey(get().tracks, trackKey) ?? (isMasterId(trackKey) ? 'music' : trackKey);
    set((state) => {
      const isCore = !!state.tracks[resolvedKey];
      const updatedTracks = { ...state.tracks };
      let updatedAdditional = [...state.additionalTracks];

      const initialClip: AudioClip = {
        id: `clip-${resolvedKey}-${Date.now()}`,
        name: fileName || (isCore ? updatedTracks[resolvedKey]?.name : 'Audio') || 'Audio',
        buffer,
        startOffsetSec: 0,
        trimStartSec: 0,
        trimEndSec: duration,
        fadeInSec: 0,
        fadeOutSec: 0,
      };

      if (isCore) {
        updatedTracks[resolvedKey] = {
          ...updatedTracks[resolvedKey],
          buffer,
          clips: [initialClip],
          trimEndSec: duration,
          fileName: fileName || state.tracks[resolvedKey].fileName,
        };

        // DRAFT → PUBLISH: cargar audio en el Studio NO publica NADA en la Pista 2D.
        // El Studio escribe exclusivamente su propia sesión (slot 'studio' del
        // motor, activo porque el dominio es 'studio'). La Pista 2D solo cambia con
        // "Enviar al visor" (publishRinkAudio). Antes esta línea PUBLICABA el audio
        // del Master en el motor global y rompía la separación Rink/Studio.
      } else {
        updatedAdditional = updatedAdditional.map((t) => {
          if (t.id === resolvedKey) {
            return {
              ...t,
              buffer,
              clips: [initialClip],
              trimEndSec: duration,
              fileName: fileName || t.fileName,
            };
          }
          return t;
        });
      }

      const allBuffers = [
        updatedTracks.music?.buffer,
        ...updatedAdditional.map((t) => t.buffer),
      ].filter(Boolean) as AudioBuffer[];

      const maxDuration = allBuffers.reduce((max, b) => Math.max(max, b.duration), duration);
      const newTotalDuration = Math.max(10, Math.round(maxDuration * 10) / 10);

      return {
        tracks: updatedTracks,
        additionalTracks: updatedAdditional,
        totalDurationSec: newTotalDuration,
        mixManifest: buildManifest(updatedTracks, updatedAdditional, state.globalControls, newTotalDuration),
      };
    });

    // Cargar material en el borrador implica "cambios sin enviar".
    useRinkAudioStore.getState().markStudioDirty(true);
  },

  setTrackVolume: (trackKey, volume) => {
    const clamped = Math.max(0, Math.min(1, volume));
    const resolvedKey = resolveCoreKey(get().tracks, trackKey) ?? (isMasterId(trackKey) ? 'music' : trackKey);
    set((state) => {
      let updatedTracks = { ...state.tracks };
      let updatedAdditional = [...state.additionalTracks];

      if (updatedTracks[resolvedKey]) {
        updatedTracks[resolvedKey] = {
          ...updatedTracks[resolvedKey],
          volume: clamped,
        };
      } else {
        updatedAdditional = updatedAdditional.map((t) =>
          t.id === resolvedKey ? { ...t, volume: clamped } : t
        );
      }

      return {
        tracks: updatedTracks,
        additionalTracks: updatedAdditional,
        mixManifest: buildManifest(updatedTracks, updatedAdditional, state.globalControls, state.totalDurationSec),
      };
    });

    // Sincronizar con AudioEngine
    if (resolvedKey === 'music') {
      audioEngine.setMusicVolume(clamped);
    } else if (resolvedKey === 'metronome') {
      audioEngine.metronome.setVolume(clamped);
    } else if (resolvedKey === 'voice') {
      audioEngine.voiceCueEngine.setVolume(clamped);
    } else if (audioEngine.getIsPlaying()) {
      // Pista adicional horneada en la mezcla consolidada: se re-mezcla y se
      // intercambia el buffer SIN detener el transporte (volumen en vivo).
      const s = get();
      const buffer = bounceStudioClipsToBuffer(arrangementOf(s), s.totalDurationSec);
      if (buffer) {
        audioEngine.swapAudioBuffer(buffer, 'Mezcla_Estudio_Consolidada.wav', 'studio-mix');
      }
    }
  },

  toggleTrackMute: (trackKey) => {
    const resolvedKey = resolveCoreKey(get().tracks, trackKey) ?? (isMasterId(trackKey) ? 'music' : trackKey);
    set((state) => {
      let updatedTracks = { ...state.tracks };
      let updatedAdditional = [...state.additionalTracks];
      let updatedControls = state.globalControls;
      let updatedMetronomeConfig = state.metronomeConfig;

      if (updatedTracks[resolvedKey]) {
        const newMuted = !updatedTracks[resolvedKey].muted;
        const updatedTrack = {
          ...updatedTracks[resolvedKey],
          muted: newMuted,
        };
        updatedTracks[resolvedKey] = updatedTrack;

        // Silenciadores ABSOLUTOS por GainNode: además de la lógica de habilitado,
        // se fuerza el sub-bus a 0 para cortar cualquier sonido ya programado por
        // el lookahead, sin detener ni desincronizar la pista maestra.
        if (resolvedKey === 'music') {
          audioEngine.setMusicVolume(newMuted ? 0 : updatedTrack.volume);
          audioEngine.setMusicMuted(newMuted);
        } else if (resolvedKey === 'metronome') {
          // La pista de metrónomo mueve el MISMO estado global que el mezclador,
          // evitando que Pista 2D y Estudio muestren estados distintos.
          updatedControls = {
            ...state.globalControls,
            metronome: { ...state.globalControls.metronome, muted: newMuted, enabled: !newMuted },
          };
          updatedMetronomeConfig = { ...state.metronomeConfig, enabled: !newMuted };
        } else if (resolvedKey === 'voice') {
          audioEngine.voiceCueEngine.setConfig({ enabled: !newMuted });
          audioEngine.setVoiceGuideMuted(newMuted);
          if (newMuted) ttsService.stop();
        }
      } else {
        updatedAdditional = updatedAdditional.map((t) =>
          t.id === resolvedKey ? { ...t, muted: !t.muted } : t
        );
      }

      return {
        tracks: updatedTracks,
        additionalTracks: updatedAdditional,
        globalControls: updatedControls,
        metronomeConfig: updatedMetronomeConfig,
        mixManifest: buildManifest(updatedTracks, updatedAdditional, state.globalControls, state.totalDurationSec),
      };
    });

    // Efecto del MUTE del metrónomo FUERA del updater (una sola verdad, aplicada
    // tras actualizar el estado). Evita inconsistencias en móviles.
    if (resolvedKey === 'metronome') {
      audioEngine.setMetronomeAudible(!get().globalControls.metronome.muted);
    }

    // MUTE EN TIEMPO REAL: si la pista vive dentro de la mezcla consolidada
    // (pistas adicionales) y hay reproducción, se re-mezcla y se intercambia el
    // buffer conservando la posición exacta: ni STOP, ni reinicio, ni desfase.
    if (
      resolvedKey !== 'music' &&
      resolvedKey !== 'metronome' &&
      resolvedKey !== 'voice' &&
      audioEngine.getIsPlaying()
    ) {
      const s = get();
      const buffer = bounceStudioClipsToBuffer(arrangementOf(s), s.totalDurationSec);
      if (buffer) {
        audioEngine.swapAudioBuffer(buffer, 'Mezcla_Estudio_Consolidada.wav', 'studio-mix');
      }
    }
  },

  toggleTrackSolo: (trackKey) => {
    const resolvedKey = resolveCoreKey(get().tracks, trackKey) ?? (isMasterId(trackKey) ? 'music' : trackKey);
    set((state) => {
      let updatedTracks = { ...state.tracks };
      let updatedAdditional = [...state.additionalTracks];

      if (updatedTracks[resolvedKey]) {
        const newSolo = !updatedTracks[resolvedKey].solo;
        updatedTracks[resolvedKey] = {
          ...updatedTracks[resolvedKey],
          solo: newSolo,
        };
      } else {
        updatedAdditional = updatedAdditional.map((t) =>
          t.id === resolvedKey ? { ...t, solo: !t.solo } : t
        );
      }

      return {
        tracks: updatedTracks,
        additionalTracks: updatedAdditional,
        mixManifest: buildManifest(updatedTracks, updatedAdditional, state.globalControls, state.totalDurationSec),
      };
    });

    // SOLO EN TIEMPO REAL: como el mute, si hay reproducción se re-mezcla y se
    // intercambia el buffer conservando la posición (sin STOP ni reinicio).
    if (audioEngine.getIsPlaying()) {
      const s = get();
      const buffer = bounceStudioClipsToBuffer(arrangementOf(s), s.totalDurationSec);
      if (buffer) {
        audioEngine.swapAudioBuffer(buffer, 'Mezcla_Estudio_Consolidada.wav', 'studio-mix');
      }
    }
  },

  setTrackTrim: (trackKey, trimStartSec, trimEndSec) => {
    set((state) => {
      const validStart = Math.max(0, trimStartSec);
      const validEnd = Math.max(trimStartSec + 0.1, trimEndSec);

      let updatedTracks = { ...state.tracks };
      let updatedAdditional = [...state.additionalTracks];

      if (updatedTracks[trackKey]) {
        updatedTracks[trackKey] = {
          ...updatedTracks[trackKey],
          trimStartSec: validStart,
          trimEndSec: validEnd,
        };
      } else {
        updatedAdditional = updatedAdditional.map((t) =>
          t.id === trackKey
            ? { ...t, trimStartSec: validStart, trimEndSec: validEnd }
            : t
        );
      }

      return {
        tracks: updatedTracks,
        additionalTracks: updatedAdditional,
        mixManifest: buildManifest(updatedTracks, updatedAdditional, state.globalControls, state.totalDurationSec),
      };
    });
  },

  setTrackFades: (trackKey, fadeInSec, fadeOutSec) => {
    set((state) => {
      const validFadeIn = Math.max(0, fadeInSec);
      const validFadeOut = Math.max(0, fadeOutSec);

      let updatedTracks = { ...state.tracks };
      let updatedAdditional = [...state.additionalTracks];

      if (updatedTracks[trackKey]) {
        updatedTracks[trackKey] = {
          ...updatedTracks[trackKey],
          fadeInSec: validFadeIn,
          fadeOutSec: validFadeOut,
        };
      } else {
        updatedAdditional = updatedAdditional.map((t) =>
          t.id === trackKey
            ? { ...t, fadeInSec: validFadeIn, fadeOutSec: validFadeOut }
            : t
        );
      }

      return {
        tracks: updatedTracks,
        additionalTracks: updatedAdditional,
        mixManifest: buildManifest(updatedTracks, updatedAdditional, state.globalControls, state.totalDurationSec),
      };
    });
  },

  // ── Marcadores Temporales (Time Nodes) ──
  addTimeNode: (timestampSec, label) => {
    get().pushStudioEdit();
    const state = get();
    const safeTime = Number.isFinite(timestampSec) ? timestampSec : 0;
    const clampedTime = Math.max(0, Math.min(state.totalDurationSec, safeTime));
    const newId = `node-audio-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    const currentNodes = [...state.audioNodes, {
      id: newId,
      numeroSecuencial: 0,
      timestampSec: clampedTime,
      label: label || '',
    }];

    // Ordenar estrictamente por timestamp y renumerar 1, 2, 3...
    currentNodes.sort((a, b) => a.timestampSec - b.timestampSec);
    const sequencedNodes = currentNodes.map((node, index) => ({
      ...node,
      numeroSecuencial: index + 1,
    }));

    set({
      audioNodes: sequencedNodes,
      selectedNodeId: newId,
    });

    return sequencedNodes.find((n) => n.id === newId)!;
  },

  moveTimeNodeLive: (id, timestampSec) => {
    // Sin `pushStudioEdit`: es un movimiento continuo de arrastre. El historial
    // se captura UNA vez al iniciar el gesto desde la interfaz.
    set((state) => {
      const safeTime = Number.isFinite(timestampSec) ? timestampSec : 0;
      const updated = state.audioNodes.map((node) =>
        node.id === id
          ? { ...node, timestampSec: Math.max(0, Math.min(state.totalDurationSec, safeTime)) }
          : node
      );
      updated.sort((a, b) => a.timestampSec - b.timestampSec);
      return {
        audioNodes: updated.map((node, index) => ({ ...node, numeroSecuencial: index + 1 })),
      };
    });
  },

  deleteTimeNode: (id) => {
    get().pushStudioEdit();
    set((state) => {
      const filtered = state.audioNodes.filter((n) => n.id !== id);
      const renumbered = filtered.map((node, index) => ({
        ...node,
        numeroSecuencial: index + 1,
      }));

      return {
        audioNodes: renumbered,
        selectedNodeId: state.selectedNodeId === id ? null : state.selectedNodeId,
      };
    });
  },

  clearAllStudioTracks: () => {
    audioEngine.clearStudioAudio();
    const freshTracks = {
      music: {
        ...initialTracks.music,
        clips: [],
        buffer: null,
        fileName: null,
      },
      voice: {
        ...initialTracks.voice,
        clips: [],
        buffer: null,
        fileName: null,
      },
      metronome: {
        ...initialTracks.metronome,
        clips: [],
        buffer: null,
      },
      recording: {
        ...initialTracks.recording,
        clips: [],
        buffer: null,
        fileName: null,
      },
    };
    set({
      tracks: freshTracks,
      additionalTracks: [],
      audioNodes: [],
      selectedClipId: null,
      selectedNodeId: null,
      currentTimeSec: 0,
      isPlaying: false,
      totalDurationSec: 30,
      mixManifest: buildManifest(freshTracks, [], get().globalControls, 30),
      contextMenu: null,
      trashDrag: { active: false, trackId: null, clipId: null, overTrash: false },
    });
    useRinkAudioStore.getState().markStudioDirty(false);
  },

  clearTimeNodes: () => {
    get().pushStudioEdit();
    set({ audioNodes: [], selectedNodeId: null });
  },

  setSelectedNodeId: (id) => {
    set({ selectedNodeId: id });
  },

  setCurrentTimeSec: (sec) => {
    set({ currentTimeSec: Math.max(0, sec) });
  },

  setIsPlaying: (playing) => {
    set({ isPlaying: playing });
  },

  setZoom: (zoom) => {
    set({ zoom: Math.max(1.0, Math.min(35.0, zoom)) });
  },

  setMetronomeConfig: (config) => {
    set((state) => {
      const updated = { ...state.metronomeConfig, ...config };
      audioEngine.metronome.setBpm(updated.bpm);
      audioEngine.metronome.setBeatsPerMeasure(updated.beatsPerMeasure);
      audioEngine.metronome.setSubdivision(updated.subdivision);
      audioEngine.metronome.setVolume(updated.volume);
      audioEngine.metronome.setConfig({ accentFirstBeat: updated.accentFirstBeat });
      audioEngine.setMetronomeAudible(updated.enabled && !state.tracks.metronome.muted);

      const updatedControls: GlobalAudioControls = {
        ...state.globalControls,
        bpm: updated.bpm,
        beatsPerMeasure: updated.beatsPerMeasure,
        metronome: {
          ...state.globalControls.metronome,
          enabled: updated.enabled,
          volume: updated.volume,
          accentFirstBeat: updated.accentFirstBeat,
          subdivision: updated.subdivision,
        },
      };

      return {
        metronomeConfig: updated,
        globalControls: updatedControls,
        tracks: {
          ...state.tracks,
          metronome: {
            ...state.tracks.metronome,
            volume: updated.volume,
          },
        },
        mixManifest: buildManifest(state.tracks, state.additionalTracks, updatedControls, state.totalDurationSec),
      };
    });
  },

  analyzeBpm: async () => {
    const musicBuffer = get().tracks.music.buffer;
    if (!musicBuffer) return null;

    set({ isAnalyzingBpm: true });
    try {
      const result = BpmDetector.detect(musicBuffer);
      set({
        detectedBpm: result.bpm,
        isAnalyzingBpm: false,
      });

      // Sincronizar automáticamente el metrónomo y el BPM global
      get().setGlobalBpm(result.bpm);
      return result.bpm;
    } catch (err) {
      console.warn('[AudioStudioStore] Error analizando BPM:', err);
      set({ isAnalyzingBpm: false });
      return null;
    }
  },

  // ── GRABACIÓN DE VOZ (Fase 4) ─────────────────────────────────────────────
  startVoiceRecording: async () => {
    if (get().isRecording) return false;
    if (!VoiceRecorder.isSupported()) {
      set({ recordingError: 'La grabación de voz no está disponible en este navegador.' });
      return false;
    }
    try {
      const recorder = new VoiceRecorder();
      // Detener la reproducción evita monitorización/realimentación y fija una
      // única referencia temporal: el cabezal y la toma arrancan en el mismo punto.
      audioEngine.pause();
      await recorder.prepare();
      voiceRecorder = recorder;

      // Pre-inicio EXPLÍCITO (opcional): cuenta atrás antes de capturar. No se
      // compensa con offsets: la toma arranca cuando termina la cuenta.
      if (get().recordingCountdownEnabled && get().recordingCountdownSec > 0) {
        await runRecordingCountdown(get().recordingCountdownSec, (remaining) =>
          set({ recordingCountdown: remaining })
        );
        if (countdownCancelled || voiceRecorder !== recorder) {
          recorder.cancel();
          if (voiceRecorder === recorder) voiceRecorder = null;
          set({ isRecording: false, recordingCountdown: 0, recordingElapsedSec: 0 });
          return false;
        }
      }

      await recorder.start();

      // Aplicar la preferencia de monitorización con el stream ya disponible.
      if (get().recordingMonitorEnabled) {
        const monitor = startRecordingMonitor();
        set({ recordingMonitorError: monitor.ok ? null : monitor.error ?? null });
      }

      if (recordingTicker) clearInterval(recordingTicker);
      recordingTicker = setInterval(() => {
        const active = voiceRecorder;
        if (active) set({ recordingElapsedSec: active.elapsedSec() });
      }, 200);

      set({
        isRecording: true,
        recordingError: null,
        recordingStartSec: get().currentTimeSec,
        recordingElapsedSec: 0,
        recordingCountdown: 0,
      });
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo iniciar la grabación.';
      voiceRecorder = null;
      set({ isRecording: false, recordingError: message });
      return false;
    }
  },

  stopVoiceRecording: async () => {
    const recorder = voiceRecorder;
    if (recordingTicker) {
      clearInterval(recordingTicker);
      recordingTicker = null;
    }
    if (!recorder) {
      set({ isRecording: false, recordingElapsedSec: 0 });
      return null;
    }

    let buffer: AudioBuffer | null = null;
    try {
      buffer = await recorder.stop();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al detener la grabación.';
      set({ recordingError: message });
    }
    stopRecordingMonitor();
    voiceRecorder = null;

    const startBase = get().recordingStartSec;
    if (!buffer) {
      set({ isRecording: false, recordingElapsedSec: 0, recordingError: get().recordingError ?? 'La toma quedó vacía.' });
      return null;
    }

    // Nivel: normaliza el pico de la toma (el micrófono suele entrar muy bajo).
    normalizeAudioBufferPeak(buffer);

    const state = get();
    const voiceTrack = state.tracks.recording;

    // Evita que dos tomas queden EXACTAMENTE superpuestas en el mismo cabezal:
    // si ya hay una toma en ese punto, la nueva se coloca al final de la anterior.
    const recordingEnd = voiceTrack.clips.reduce(
      (max, c) => Math.max(max, c.startOffsetSec + (c.trimEndSec - c.trimStartSec)),
      0
    );
    const overlapsExisting = voiceTrack.clips.some(
      (c) => Math.abs(c.startOffsetSec - startBase) < 0.05
    );
    const startSec = overlapsExisting ? Math.max(startBase, recordingEnd + 0.01) : startBase;

    const takeNumber = voiceTrack.clips.length + 1;
    const clip: AudioClip = {
      id: `voice-take-${Date.now()}-${takeNumber}`,
      name: `Voz ${takeNumber}`,
      buffer,
      startOffsetSec: startSec,
      trimStartSec: 0,
      trimEndSec: buffer.duration,
      fadeInSec: 0,
      fadeOutSec: 0,
    };

    // Tomas MÚLTIPLES: nunca se sobrescribe una toma anterior.
    get().pushStudioEdit();
    set({
      isRecording: false,
      recordingElapsedSec: 0,
      totalDurationSec: Math.max(state.totalDurationSec, startSec + buffer.duration),
      tracks: {
        ...state.tracks,
        recording: {
          ...voiceTrack,
          buffer: voiceTrack.buffer ?? buffer,
          clips: [...voiceTrack.clips, clip],
        },
      },
    });

    pendingConsolidation = true;
    triggerStudioConsolidation();
    return clip;
  },

  cancelVoiceRecording: () => {
    if (recordingTicker) {
      clearInterval(recordingTicker);
      recordingTicker = null;
    }
    // Cancelar una posible cuenta atrás de pre-inicio en curso.
    countdownCancelled = true;
    if (countdownTimer) {
      clearInterval(countdownTimer);
      countdownTimer = null;
    }
    stopRecordingMonitor();
    voiceRecorder?.cancel();
    voiceRecorder = null;
    set({ isRecording: false, recordingElapsedSec: 0, recordingCountdown: 0 });
  },

  // ── PUENTE Rink → Studio: "Editar en Estudio" (snapshot del audio publicado) ──
  loadPublishedIntoStudio: () => {
    const published = audioEngine.getPublishedAudio();
    if (!published.buffer) return false;

    // Se comparte la REFERENCIA del buffer publicado (eficiencia): todas las
    // operaciones del Studio son no destructivas (crean buffers nuevos) y nunca
    // mutan el buffer publicado, así que el Rink queda intacto.
    get().setTrackBuffer('music', published.buffer, published.name || 'Audio publicado');
    get().syncMarkersFromRink();
    return true;
  },

  /**
   * Reconciliación IDEMPOTENTE de marcadores Rink → Studio.
   *
   * Los nodos ya colocados en la Pista 2D conservan su identidad estable en
   * `sourceStudioMarkerId` (que coincide con el `id` del marcador original del
   * Studio). Por cada nodo con esa procedencia:
   *   - si el marcador YA existe en el Studio → NO se crea otro (evita duplicados);
   *   - si no existe → se añade con su `timestampSec` redondeado a ms.
   *
   * No se transforma la posición espacial X/Y del Rink: en el Studio el único dato
   * relevante es el tiempo. Tampoco se tocan los marcadores creados en el Studio
   * que aún no se han colocado en la Pista 2D.
   */
  syncMarkersFromRink: () => {
    const placedPoints = useChoreographyStore.getState().points;
    if (placedPoints.length === 0) return false;

    const state = get();
    const existingIds = new Set(state.audioNodes.map((n) => n.id));

    // Duración objetivo: solo cuenta el tiempo de los marcadores AÑADIDOS, para
    // no crecer el timeline en +1s en cada reapertura sin motivo.
    let maxMarkerSec = 0;
    const added: AudioTimeNode[] = [];

    for (const point of placedPoints) {
      const markerId = point.sourceStudioMarkerId;
      if (!markerId || existingIds.has(markerId)) continue;
      const timeMs = Number.isFinite(point.timestamp) ? point.timestamp : point.time_ms;
      if (!Number.isFinite(timeMs)) continue;
      const timestampSec = Math.max(0, timeMs / 1000);
      existingIds.add(markerId);
      maxMarkerSec = Math.max(maxMarkerSec, timestampSec);
      added.push({
        id: markerId,
        numeroSecuencial: 0,
        timestampSec,
        label: point.label || '',
      });
    }

    if (added.length === 0) return false;

    const merged = [...state.audioNodes, ...added]
      .sort((a, b) => a.timestampSec - b.timestampSec)
      .map((node, index) => ({ ...node, numeroSecuencial: index + 1 }));

    set({
      audioNodes: merged,
      // Asegura que los marcadores recién traídos caigan dentro del timeline.
      totalDurationSec: Math.max(state.totalDurationSec, Math.ceil(maxMarkerSec + 1)),
    });
    // Traer nodos del Rink es un cambio del borrador hasta que se envíe de vuelta.
    useRinkAudioStore.getState().markStudioDirty(true);
    return true;
  },

  syncRinkSnapshotIntoStudio: () => {
    // Se mira el BUFFER, no el número de clips: `deleteClip` conserva el buffer
    // del borrador, así que un borrador con audio pero sin clips NO debe
    // sobrescribirse con el audio publicado al reabrir.
    const hasStudioMusic = !!get().tracks.music.buffer;

    if (!hasStudioMusic) {
      // Reutiliza el ÚNICO puente de audio (también reconcilia marcadores) para
      // no tener dos implementaciones divergentes de la siembra.
      if (get().loadPublishedIntoStudio()) return true;
      // Sin audio publicado pero con nodos en la Pista 2D: aún así se traen.
      get().syncMarkersFromRink();
      return false;
    }

    // El borrador ya tiene audio: solo se reconcilian los marcadores.
    get().syncMarkersFromRink();
    return true;
  },

  // ── PUENTE DE DATOS: Exportar a Pista 2D (sendMixToChoreo) ──
  sendMixToChoreo: () => {
    const state = get();
    const nodes = state.audioNodes;

    // 1. Enviar a la Pista 2D la MEZCLA consolidada (respetando cortes, offsets,
    //    fades y mutes), NO el buffer original de la pista Master: enviar
    //    `musicTrack.buffer` reproducía el archivo completo ignorando los clips.
    const arrangementTracks = arrangementOf(state);
    const mixed = bounceStudioClipsToBuffer(arrangementTracks, state.totalDurationSec);
    const buffer = mixed ?? state.tracks.music.buffer ?? null;

    // PUBLICACIÓN (Studio Draft → Rink Published): ÚNICO punto que reemplaza el
    // audio publicado del Rink. Si no hay material válido, no se publica nada.
    if (buffer && buffer.length > 0) {
      const name = mixed
        ? 'mezcla_estudio.wav'
        : state.tracks.music.fileName || 'mezcla_estudio.wav';
      audioEngine.publishRinkAudio(buffer, name, 'studio-mix');
      useRinkAudioStore.getState().syncFromEngine();
      useRinkAudioStore.getState().markStudioDirty(false);
    }

    // 2. Los NODOS son anotaciones temporales: viajan a la bandeja de la Pista 2D
    //    con independencia de la publicación del audio.
    useChoreographyStore.getState().setUnplacedNodes(nodes);

    return {
      nodes,
      success: true,
    };
  },

  // ── RENDERIZADO MIXDOWN POR HARDWARE: Exportar mezcla combinada a Pista 2D ──
  renderAndExportMixdown: async () => {
    const state = get();
    // En la nueva arquitectura, las pistas de audio activas son la Principal (Música)
    // + la VOZ grabada + las pistas adicionales.
    const arrangementTracks: AudioStudioTrack[] = arrangementOf(state);

    try {
      const result = await renderStudioMixdown(
        arrangementTracks,
        state.totalDurationSec,
        // Sin metrónomo horneado: el Rink reproduce su metrónomo EN VIVO. Hornearlo
        // producía dos clics desfasados (fase/timbre/BPM distintos).
        { ...state.metronomeConfig, enabled: false }
      );

      // VALIDACIÓN previa a la publicación: nunca reemplazar el audio del Rink
      // con un render vacío o inválido.
      if (!result || !result.buffer || result.buffer.length === 0) {
        throw new Error('El render de la mezcla resultó vacío o inválido');
      }

      // PUBLICACIÓN ATÓMICA: render → validate → publish. Es el ÚNICO punto que
      // reemplaza el audio publicado del Rink; el borrador del Studio queda intacto.
      audioEngine.publishRinkAudio(result.buffer, 'Mezcla final (Audio Studio).wav', 'studio-mix');
      useRinkAudioStore.getState().syncFromEngine();
      useRinkAudioStore.getState().markStudioDirty(false);

      // Enviar nodos temporales a la bandeja lateral de la Pista 2D
      useChoreographyStore.getState().setUnplacedNodes(state.audioNodes);

      return {
        success: true,
        durationSec: result.durationSec,
      };
    } catch (err) {
      console.error('[AudioStudioStore] Error rendering mixdown with OfflineAudioContext:', err);
      // FALLO DE PUBLICACIÓN: no se toca el audio publicado anterior ni el borrador;
      // el Rink conserva íntegra su versión previa.
      return {
        success: false,
        durationSec: state.totalDurationSec,
      };
    }
  },
}));


initialStudioSnapshot = useAudioStudioStore.getState();

