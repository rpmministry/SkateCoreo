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
} from '../types/audioStudio';
import { BpmDetector } from '../core/audio/BpmDetector';
import { audioEngine } from '../core/audio/AudioEngine';
import { useChoreographyStore } from './useChoreographyStore';
import { renderStudioMixdown } from '../core/audio/studioMixdown';

export interface AudioStudioStoreState {
  // Pistas del editor multitrack (1 principal de música + auxiliares)
  tracks: {
    music: AudioStudioTrack;
    voice: AudioStudioTrack;
    metronome: AudioStudioTrack;
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
    thresholdSec?: number
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

  // Acciones de Clips
  splitClip: (trackId: string, clipId: string, splitTimeSec: number) => boolean;
  moveClip: (trackId: string, clipId: string, newStartOffsetSec: number) => void;
  moveClipToTrack: (fromTrackId: string, toTrackId: string, clipId: string, newStartOffsetSec: number) => void;
  duplicateClipToTrack: (fromTrackId: string, toTrackId: string, clipId: string, newStartOffsetSec: number) => AudioClip | null;
  deleteClip: (trackId?: string, clipId?: string) => void;
  copyClip: (clip?: AudioClip) => void;
  pasteClip: (trackId?: string, atTimeSec?: number) => AudioClip | null;
  setClipFades: (trackId: string, clipId: string, fadeInSec: number, fadeOutSec: number) => void;

  // Acciones de Pistas Libres Dinámicas (hasta 4 pistas adicionales)
  addAudioTrack: (name?: string, buffer?: AudioBuffer, fileName?: string) => AudioStudioTrack;
  removeAudioTrack: (id: string) => void;

  // Marcadores de tiempo (Nodos sin coordenadas espaciales)
  audioNodes: AudioTimeNode[];
  selectedNodeId: string | null;

  // Estado de reproducción y transporte
  currentTimeSec: number;
  totalDurationSec: number;
  isPlaying: boolean;
  zoom: number; // Factor de zoom horizontal (1 a 35)

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
  updateTimeNode: (id: string, timestampSec: number, label?: string) => void;
  deleteTimeNode: (id: string) => void;
  clearTimeNodes: () => void;
  setSelectedNodeId: (id: string | null) => void;

  // Transporte & BPM
  setCurrentTimeSec: (sec: number) => void;
  setIsPlaying: (playing: boolean) => void;
  setZoom: (zoom: number) => void;
  setMetronomeConfig: (config: Partial<StudioMetronomeConfig>) => void;
  analyzeBpm: () => Promise<number | null>;

  // Función Puente (Audio-to-Canvas Bridge) & Mixdown
  sendMixToChoreo: () => { nodes: AudioTimeNode[]; success: boolean };
  renderAndExportMixdown: () => Promise<{ success: boolean; durationSec: number }>;
}

const DEFAULT_METRONOME_CONFIG: StudioMetronomeConfig = {
  enabled: true,
  bpm: 140,
  beatsPerMeasure: 4,
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
    name: 'Master',
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
};

let studioConsolidateTimer: any = null;
export const triggerStudioConsolidation = () => {
  if (studioConsolidateTimer) clearTimeout(studioConsolidateTimer);
  studioConsolidateTimer = setTimeout(() => {
    useAudioStudioStore.getState().consolidateStudioAudio().catch(() => {});
  }, 100);
};

export const useAudioStudioStore = create<AudioStudioStoreState>((set, get) => ({
  tracks: initialTracks,
  additionalTracks: [],

  draggingGhost: null,
  setDraggingGhost: (ghost) => set({ draggingGhost: ghost }),

  calculateSnapOffset: (targetTrackId, clipId, rawOffsetSec, clipDurationSec, thresholdSec = 0.18) => {
    const state = get();
    const targetTrack = isMasterId(targetTrackId)
      ? state.tracks.music
      : (state.tracks[targetTrackId] || state.additionalTracks.find((t) => t.id === targetTrackId));

    const snapPoints: number[] = [0.0]; // 0.0s inicio de la pista

    // Playhead
    snapPoints.push(state.currentTimeSec);

    // BPM Grid snap points (beats)
    const bpm = state.globalControls.bpm || 120;
    const beatSec = 60 / bpm;
    const minSnapTime = Math.max(0, rawOffsetSec - 1);
    const maxSnapTime = rawOffsetSec + clipDurationSec + 1;
    const startBeat = Math.floor(minSnapTime / beatSec);
    const endBeat = Math.ceil(maxSnapTime / beatSec);
    for (let b = startBeat; b <= endBeat; b++) {
      snapPoints.push(Math.round(b * beatSec * 1000) / 1000);
    }

    // Bordes de otros clips en la misma pista (snap clip-to-clip)
    if (targetTrack?.clips) {
      for (const other of targetTrack.clips) {
        if (other.id === clipId) continue;
        const otherDur = Math.max(0.05, other.trimEndSec - other.trimStartSec);
        const otherStart = other.startOffsetSec;
        const otherEnd = otherStart + otherDur;
        snapPoints.push(otherStart);
        snapPoints.push(otherEnd);
      }
    }

    let bestSnappedOffset = rawOffsetSec;
    let minDistance = thresholdSec;
    let snapLineSec: number | null = null;

    // 1. Probar snap en el inicio del clip (clipStart -> snapPoint)
    for (const pt of snapPoints) {
      const dist = Math.abs(rawOffsetSec - pt);
      if (dist < minDistance) {
        minDistance = dist;
        bestSnappedOffset = pt;
        snapLineSec = pt;
      }
    }

    // 2. Probar snap en el fin del clip (clipEnd -> snapPoint => clipStart = snapPoint - clipDurationSec)
    const rawEndSec = rawOffsetSec + clipDurationSec;
    for (const pt of snapPoints) {
      const dist = Math.abs(rawEndSec - pt);
      if (dist < minDistance) {
        minDistance = dist;
        bestSnappedOffset = Math.max(0, pt - clipDurationSec);
        snapLineSec = pt;
      }
    }

    return {
      snappedSec: Math.max(0, Math.round(bestSnappedOffset * 1000) / 1000),
      snapLineSec,
    };
  },

  consolidateStudioAudio: async () => {
    const state = get();
    const arrangementTracks = [state.tracks.music, ...state.additionalTracks];
    const hasAnyClips = arrangementTracks.some((t) => (t.clips && t.clips.length > 0) || t.buffer);
    if (!hasAnyClips) return null;

    try {
      const mixResult = await renderStudioMixdown(
        arrangementTracks,
        state.totalDurationSec,
        state.metronomeConfig
      );
      if (mixResult && mixResult.buffer) {
        audioEngine.setAudioBuffer(mixResult.buffer, 'Mezcla_Estudio_Consolidada.wav');
        return mixResult.buffer;
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
    set((state) => {
      const newMuted = !state.globalControls.metronome.muted;
      const updatedControls = {
        ...state.globalControls,
        metronome: { ...state.globalControls.metronome, muted: newMuted },
      };
      const isEnabled = state.metronomeConfig.enabled && !newMuted;
      audioEngine.metronome.setEnabled(isEnabled);
      return {
        globalControls: updatedControls,
        tracks: {
          ...state.tracks,
          metronome: { ...state.tracks.metronome, muted: newMuted },
        },
        mixManifest: buildManifest(state.tracks, state.additionalTracks, updatedControls, state.totalDurationSec),
      };
    });
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
      const updatedControls = {
        ...state.globalControls,
        metronome: { ...state.globalControls.metronome, enabled: newEnabled },
      };
      audioEngine.metronome.setEnabled(newEnabled && !state.globalControls.metronome.muted);
      return {
        globalControls: updatedControls,
        metronomeConfig: { ...state.metronomeConfig, enabled: newEnabled },
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

  splitClip: (trackId, clipId, splitTimeSec) => {
    let wasSplit = false;
    set((state) => {
      const updateClips = (track: AudioStudioTrack): AudioStudioTrack => {
        const clipIndex = track.clips.findIndex((c) => c.id === clipId);
        if (clipIndex === -1) return track;
        const clip = track.clips[clipIndex];

        const clipDuration = clip.trimEndSec - clip.trimStartSec;
        const relativeSplit = splitTimeSec - clip.startOffsetSec;

        if (relativeSplit <= 0.05 || relativeSplit >= clipDuration - 0.05) {
          return track;
        }

        const bufferSplitPoint = clip.trimStartSec + relativeSplit;

        const firstClip: AudioClip = {
          ...clip,
          id: `clip-${Date.now()}-a`,
          trimEndSec: bufferSplitPoint,
          fadeOutSec: Math.min(clip.fadeOutSec, 0.2),
        };

        const secondClip: AudioClip = {
          ...clip,
          id: `clip-${Date.now()}-b`,
          startOffsetSec: splitTimeSec,
          trimStartSec: bufferSplitPoint,
          fadeInSec: Math.min(clip.fadeInSec, 0.2),
        };

        const newClips = [...track.clips];
        newClips.splice(clipIndex, 1, firstClip, secondClip);
        wasSplit = true;

        return {
          ...track,
          clips: newClips,
        };
      };

      const trackIsMaster = isMasterId(trackId);
      const updatedTracks = trackIsMaster
        ? { ...state.tracks, music: updateClips(state.tracks.music) }
        : state.tracks[trackId]
          ? { ...state.tracks, [trackId]: updateClips(state.tracks[trackId]) }
          : state.tracks;

      const updatedAdditional = state.additionalTracks.map((t) =>
        t.id === trackId ? updateClips(t) : t
      );

      return {
        tracks: updatedTracks,
        additionalTracks: updatedAdditional,
        selectedClipId: wasSplit ? `clip-${Date.now()}-b` : state.selectedClipId,
        mixManifest: buildManifest(updatedTracks, updatedAdditional, state.globalControls, state.totalDurationSec),
      };
    });

    if (wasSplit) triggerStudioConsolidation();
    return wasSplit;
  },

  moveClip: (trackId, clipId, newStartOffsetSec) => {
    const clampedOffset = Math.max(0, Math.round(newStartOffsetSec * 100) / 100);
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

      const trackIsMaster = isMasterId(trackId);
      const updatedTracks = trackIsMaster
        ? { ...state.tracks, music: updateClips(state.tracks.music) }
        : state.tracks[trackId]
          ? { ...state.tracks, [trackId]: updateClips(state.tracks[trackId]) }
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
    const clampedOffset = Math.max(0, Math.round(newStartOffsetSec * 100) / 100);
    set((state) => {
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

      const fromIsMaster = isMasterId(fromTrackId);
      const intermediateTracks = fromIsMaster
        ? { ...state.tracks, music: removeClipFrom(state.tracks.music) }
        : state.tracks[fromTrackId]
          ? { ...state.tracks, [fromTrackId]: removeClipFrom(state.tracks[fromTrackId]) }
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

      const toIsMaster = isMasterId(toTrackId);
      const finalTracks = toIsMaster
        ? { ...intermediateTracks, music: insertClipInto(intermediateTracks.music) }
        : intermediateTracks[toTrackId]
          ? { ...intermediateTracks, [toTrackId]: insertClipInto(intermediateTracks[toTrackId]) }
          : intermediateTracks;

      const finalAdditional = intermediateAdditional.map((t) =>
        t.id === toTrackId ? insertClipInto(t) : t
      );

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
    const state = get();
    const clampedOffset = Math.max(0, Math.round(newStartOffsetSec * 100) / 100);

    // Buscar clip original
    const fromIsMaster = isMasterId(fromTrackId);
    const fromTrack = fromIsMaster
      ? state.tracks.music
      : (state.tracks[fromTrackId] || state.additionalTracks.find((t) => t.id === fromTrackId));
    const sourceClip = fromTrack?.clips.find((c) => c.id === clipId);
    if (!sourceClip) return null;

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

      const toIsMaster = isMasterId(toTrackId);
      const updatedTracks = toIsMaster
        ? { ...currState.tracks, music: addClip(currState.tracks.music) }
        : currState.tracks[toTrackId]
          ? { ...currState.tracks, [toTrackId]: addClip(currState.tracks[toTrackId]) }
          : currState.tracks;

      const updatedAdditional = currState.additionalTracks.map((t) =>
        t.id === toTrackId ? addClip(t) : t
      );

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
    set((state) => {
      const targetClipId = clipId || state.selectedClipId;
      if (!targetClipId) return state;

      const updateClips = (track: AudioStudioTrack): AudioStudioTrack => ({
        ...track,
        clips: track.clips.filter((c) => c.id !== targetClipId),
      });

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
    const activeTrack = isMasterId(state.activeTrackId)
      ? state.tracks.music
      : (state.tracks[state.activeTrackId] || state.additionalTracks.find((t) => t.id === state.activeTrackId));
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

  pasteClip: (trackId, atTimeSec) => {
    const { clipboardClip, audioClipboard, currentTimeSec, activeTrackId } = get();
    const clipToPaste = clipboardClip || audioClipboard;
    if (!clipToPaste) return null;

    // Si no se especifica pista, pegar en la pista activa o master
    const targetTrackId = trackId || activeTrackId || 'music';
    const targetTime = atTimeSec !== undefined ? atTimeSec : currentTimeSec;

    const newClip: AudioClip = {
      ...clipToPaste,
      id: `clip-paste-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      startOffsetSec: Math.max(0, targetTime),
    };

    set((state) => {
      const addClip = (track: AudioStudioTrack): AudioStudioTrack => ({
        ...track,
        clips: [...track.clips, newClip],
      });

      const targetIsMaster = isMasterId(targetTrackId);
      const updatedTracks = targetIsMaster
        ? { ...state.tracks, music: addClip(state.tracks.music) }
        : state.tracks[targetTrackId]
          ? { ...state.tracks, [targetTrackId]: addClip(state.tracks[targetTrackId]) }
          : state.tracks;

      const updatedAdditional = state.additionalTracks.map((t) =>
        t.id === targetTrackId ? addClip(t) : t
      );

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

      const trackIsMaster = isMasterId(trackId);
      const updatedTracks = trackIsMaster
        ? { ...state.tracks, music: updateClips(state.tracks.music) }
        : state.tracks[trackId]
          ? { ...state.tracks, [trackId]: updateClips(state.tracks[trackId]) }
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

  metronomeConfig: DEFAULT_METRONOME_CONFIG,
  detectedBpm: null,
  isAnalyzingBpm: false,

  setTrackBuffer: (trackKey, buffer, fileName) => {
    const duration = buffer.duration;
    const resolvedKey = isMasterId(trackKey) ? 'music' : trackKey;
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

        // Si es la pista principal, sincronizar con AudioEngine de la Pista 2D
        if (resolvedKey === 'music') {
          audioEngine.setAudioBuffer(buffer, fileName || 'musica_master.wav');
        }
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
  },

  setTrackVolume: (trackKey, volume) => {
    const clamped = Math.max(0, Math.min(1, volume));
    const resolvedKey = isMasterId(trackKey) ? 'music' : trackKey;
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
    }
  },

  toggleTrackMute: (trackKey) => {
    const resolvedKey = isMasterId(trackKey) ? 'music' : trackKey;
    set((state) => {
      let updatedTracks = { ...state.tracks };
      let updatedAdditional = [...state.additionalTracks];

      if (updatedTracks[resolvedKey]) {
        const newMuted = !updatedTracks[resolvedKey].muted;
        const updatedTrack = {
          ...updatedTracks[resolvedKey],
          muted: newMuted,
        };
        updatedTracks[resolvedKey] = updatedTrack;

        if (resolvedKey === 'music') {
          audioEngine.setMusicVolume(newMuted ? 0 : updatedTrack.volume);
        } else if (resolvedKey === 'metronome') {
          audioEngine.metronome.setEnabled(!newMuted && state.metronomeConfig.enabled);
        } else if (resolvedKey === 'voice') {
          audioEngine.voiceCueEngine.setConfig({ enabled: !newMuted });
        }
      } else {
        updatedAdditional = updatedAdditional.map((t) =>
          t.id === resolvedKey ? { ...t, muted: !t.muted } : t
        );
      }

      return {
        tracks: updatedTracks,
        additionalTracks: updatedAdditional,
        mixManifest: buildManifest(updatedTracks, updatedAdditional, state.globalControls, state.totalDurationSec),
      };
    });
  },

  toggleTrackSolo: (trackKey) => {
    const resolvedKey = isMasterId(trackKey) ? 'music' : trackKey;
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
    const state = get();
    const clampedTime = Math.max(0, Math.min(state.totalDurationSec, timestampSec));
    const newId = `node-audio-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    const currentNodes = [...state.audioNodes, {
      id: newId,
      numeroSecuencial: 0,
      timestampSec: Math.round(clampedTime * 100) / 100,
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

  updateTimeNode: (id, timestampSec, label) => {
    set((state) => {
      const updated = state.audioNodes.map((node) => {
        if (node.id === id) {
          return {
            ...node,
            timestampSec: Math.max(0, Math.min(state.totalDurationSec, Math.round(timestampSec * 100) / 100)),
            label: label !== undefined ? label : node.label,
          };
        }
        return node;
      });

      updated.sort((a, b) => a.timestampSec - b.timestampSec);
      const renumbered = updated.map((node, index) => ({
        ...node,
        numeroSecuencial: index + 1,
      }));

      return { audioNodes: renumbered };
    });
  },

  deleteTimeNode: (id) => {
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

  clearTimeNodes: () => {
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
      audioEngine.metronome.setVolume(updated.volume);
      audioEngine.metronome.setConfig({ accentFirstBeat: updated.accentFirstBeat });
      audioEngine.metronome.setEnabled(updated.enabled && !state.tracks.metronome.muted);

      const updatedControls: GlobalAudioControls = {
        ...state.globalControls,
        bpm: updated.bpm,
        beatsPerMeasure: updated.beatsPerMeasure,
        metronome: {
          ...state.globalControls.metronome,
          enabled: updated.enabled,
          volume: updated.volume,
          accentFirstBeat: updated.accentFirstBeat,
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

  // ── PUENTE DE DATOS: Exportar a Pista 2D (sendMixToChoreo) ──
  sendMixToChoreo: () => {
    const state = get();
    const nodes = state.audioNodes;

    // 1. Si hay audio en el estudio, sincronizar con AudioEngine
    const musicTrack = state.tracks.music;
    if (musicTrack.buffer) {
      audioEngine.setAudioBuffer(musicTrack.buffer, musicTrack.fileName || 'mezcla_estudio.wav');
    }

    // 2. Enviar nodos a la bandeja lateral de la Pista 2D
    useChoreographyStore.getState().setUnplacedNodes(nodes);

    return {
      nodes,
      success: true,
    };
  },

  // ── RENDERIZADO MIXDOWN POR HARDWARE: Exportar mezcla combinada a Pista 2D ──
  renderAndExportMixdown: async () => {
    const state = get();
    // En la nueva arquitectura, las pistas de audio activas son la Principal (Música) + Pistas adicionales
    const arrangementTracks: AudioStudioTrack[] = [
      state.tracks.music,
      ...state.additionalTracks,
    ];

    try {
      const result = await renderStudioMixdown(
        arrangementTracks,
        state.totalDurationSec,
        state.metronomeConfig
      );

      // Inyectar el AudioBuffer combinado directamente en AudioEngine (Pista 2D)
      audioEngine.setAudioBuffer(result.buffer, 'mezcla_skatecoreo_master.wav');

      // Actualizar también la pista de música del estudio con la mezcla unificada
      get().setTrackBuffer('music', result.buffer, 'mezcla_skatecoreo_master.wav');

      // Enviar nodos temporales a la bandeja lateral de la Pista 2D
      useChoreographyStore.getState().setUnplacedNodes(state.audioNodes);

      return {
        success: true,
        durationSec: result.durationSec,
      };
    } catch (err) {
      console.error('[AudioStudioStore] Error rendering mixdown with OfflineAudioContext:', err);
      // Fallback seguro
      state.sendMixToChoreo();
      return {
        success: false,
        durationSec: state.totalDurationSec,
      };
    }
  },
}));
