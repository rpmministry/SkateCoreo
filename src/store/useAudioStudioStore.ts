import { create } from 'zustand';
import { 
  AudioTimeNode, 
  AudioStudioTrack, 
  StudioMetronomeConfig, 
  AudioClip, 
  StudioTool,
  CARBON_TRACK_COLORS 
} from '../types/audioStudio';
import { BpmDetector } from '../core/audio/BpmDetector';
import { audioEngine } from '../core/audio/AudioEngine';
import { useChoreographyStore } from './useChoreographyStore';
import { renderStudioMixdown } from '../core/audio/studioMixdown';

export interface AudioStudioStoreState {
  // Pistas del editor multitrack
  tracks: {
    music: AudioStudioTrack;
    voice: AudioStudioTrack;
    metronome: AudioStudioTrack;
    [key: string]: AudioStudioTrack;
  };
  additionalTracks: AudioStudioTrack[];

  // Herramientas de Edición Mini-DAW
  activeTool: StudioTool;
  setActiveTool: (tool: StudioTool) => void;
  selectedClipId: string | null;
  setSelectedClipId: (clipId: string | null) => void;
  clipboardClip: AudioClip | null;
  audioClipboard: AudioClip | null;

  // Acciones de Clips
  splitClip: (trackId: string, clipId: string, splitTimeSec: number) => boolean;
  moveClip: (trackId: string, clipId: string, newStartOffsetSec: number) => void;
  deleteClip: (trackId?: string, clipId?: string) => void;
  copyClip: (clip?: AudioClip) => void;
  pasteClip: (trackId?: string, atTimeSec?: number) => AudioClip | null;
  setClipFades: (trackId: string, clipId: string, fadeInSec: number, fadeOutSec: number) => void;

  // Acciones de Pistas Libres Dinámicas (+ Añadir Pista de Audio)
  addAudioTrack: (name?: string, buffer?: AudioBuffer, fileName?: string) => AudioStudioTrack;
  removeAudioTrack: (id: string) => void;

  // Marcadores de tiempo (Nodos sin coordenadas espaciales)
  audioNodes: AudioTimeNode[];
  selectedNodeId: string | null;

  // Estado de reproducción y transporte
  currentTimeSec: number;
  totalDurationSec: number;
  isPlaying: boolean;
  zoom: number; // Factor de zoom horizontal (1 a 5)

  // Metrónomo y BPM
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

export const useAudioStudioStore = create<AudioStudioStoreState>((set, get) => ({
  tracks: {
    music: {
      id: 'track-music',
      name: 'Música Principal',
      color: CARBON_TRACK_COLORS[0], // Cyan Eléctrico
      type: 'music',
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
      type: 'voice',
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
      type: 'metronome',
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
  },
  additionalTracks: [],

  activeTool: 'select',
  setActiveTool: (tool) => set({ activeTool: tool }),
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

        if (relativeSplit <= 0.1 || relativeSplit >= clipDuration - 0.1) {
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

      if (state.tracks[trackId]) {
        return {
          tracks: {
            ...state.tracks,
            [trackId]: updateClips(state.tracks[trackId]),
          },
          selectedClipId: `clip-${Date.now()}-b`,
        };
      }

      return {
        additionalTracks: state.additionalTracks.map((t) =>
          t.id === trackId ? updateClips(t) : t
        ),
        selectedClipId: `clip-${Date.now()}-b`,
      };
    });

    return wasSplit;
  },

  moveClip: (trackId, clipId, newStartOffsetSec) => {
    const clampedOffset = Math.max(0, Math.round(newStartOffsetSec * 100) / 100);
    set((state) => {
      const updateClips = (track: AudioStudioTrack): AudioStudioTrack => ({
        ...track,
        clips: track.clips.map((c) =>
          c.id === clipId ? { ...c, startOffsetSec: clampedOffset } : c
        ),
      });

      if (state.tracks[trackId]) {
        return {
          tracks: {
            ...state.tracks,
            [trackId]: updateClips(state.tracks[trackId]),
          },
        };
      }

      return {
        additionalTracks: state.additionalTracks.map((t) =>
          t.id === trackId ? updateClips(t) : t
        ),
      };
    });
  },

  deleteClip: (trackId, clipId) => {
    set((state) => {
      const targetClipId = clipId || state.selectedClipId;
      if (!targetClipId) return state;

      const updateClips = (track: AudioStudioTrack): AudioStudioTrack => ({
        ...track,
        clips: track.clips.filter((c) => c.id !== targetClipId),
      });

      if (trackId && state.tracks[trackId]) {
        return {
          tracks: {
            ...state.tracks,
            [trackId]: updateClips(state.tracks[trackId]),
          },
          selectedClipId: state.selectedClipId === targetClipId ? null : state.selectedClipId,
        };
      }

      // If trackId not specified, search all tracks
      const newTracks = { ...state.tracks };
      for (const k of Object.keys(newTracks)) {
        if (newTracks[k].clips.some((c) => c.id === targetClipId)) {
          newTracks[k] = updateClips(newTracks[k]);
          break;
        }
      }

      const newAdditional = state.additionalTracks.map((t) =>
        t.clips.some((c) => c.id === targetClipId) ? updateClips(t) : t
      );

      return {
        tracks: newTracks,
        additionalTracks: newAdditional,
        selectedClipId: state.selectedClipId === targetClipId ? null : state.selectedClipId,
      };
    });
  },

  copyClip: (clip) => {
    if (clip) {
      set({ clipboardClip: { ...clip }, audioClipboard: { ...clip } });
      return;
    }
    const state = get();
    if (!state.selectedClipId) return;
    const allTracks = [state.tracks.music, state.tracks.voice, ...state.additionalTracks];
    for (const t of allTracks) {
      const found = t.clips.find((c) => c.id === state.selectedClipId);
      if (found) {
        set({ clipboardClip: { ...found }, audioClipboard: { ...found } });
        return;
      }
    }
  },

  pasteClip: (trackId, atTimeSec) => {
    const { clipboardClip, currentTimeSec } = get();
    if (!clipboardClip) return null;

    // Arquitectura Master Track: Si no se especifica o por defecto, SIEMPRE pegar en 'music' (Pista 1 - Principal)
    const targetTrackId = trackId || 'music';

    const targetTime = atTimeSec !== undefined ? atTimeSec : currentTimeSec;
    const newClip: AudioClip = {
      ...clipboardClip,
      id: `clip-paste-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      startOffsetSec: Math.max(0, targetTime),
    };

    set((state) => {
      const addClip = (track: AudioStudioTrack): AudioStudioTrack => ({
        ...track,
        clips: [...track.clips, newClip],
      });

      if (state.tracks[targetTrackId!]) {
        return {
          tracks: {
            ...state.tracks,
            [targetTrackId!]: addClip(state.tracks[targetTrackId!]),
          },
          selectedClipId: newClip.id,
        };
      }

      return {
        additionalTracks: state.additionalTracks.map((t) =>
          t.id === targetTrackId ? addClip(t) : t
        ),
        selectedClipId: newClip.id,
      };
    });

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

      if (state.tracks[trackId]) {
        return {
          tracks: {
            ...state.tracks,
            [trackId]: updateClips(state.tracks[trackId]),
          },
        };
      }

      return {
        additionalTracks: state.additionalTracks.map((t) =>
          t.id === trackId ? updateClips(t) : t
        ),
      };
    });
  },

  addAudioTrack: (name, buffer, fileName) => {
    const newId = `track-user-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const currentCount = get().additionalTracks.length;
    // Asignación de color cíclica Carbon (comenzando en Verde Neón para la primera pista libre)
    const colorIndex = (2 + currentCount) % CARBON_TRACK_COLORS.length;
    const assignedColor = CARBON_TRACK_COLORS[colorIndex];

    const initialClips: AudioClip[] = buffer
      ? [{
          id: `clip-${newId}-init`,
          name: fileName || name || `Pista Libre ${currentCount + 1}`,
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
      name: name || `Pista Libre ${currentCount + 1}`,
      color: assignedColor,
      type: 'user',
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

    set((state) => ({
      additionalTracks: [...state.additionalTracks, newTrack],
    }));

    if (buffer) {
      get().setTrackBuffer(newId, buffer, fileName);
    }

    return newTrack;
  },

  removeAudioTrack: (id) => {
    set((state) => ({
      additionalTracks: state.additionalTracks.filter((t) => t.id !== id),
    }));
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
    set((state) => {
      const isCore = !!state.tracks[trackKey];
      const updatedTracks = { ...state.tracks };
      let updatedAdditional = [...state.additionalTracks];

      const initialClip: AudioClip = {
        id: `clip-${trackKey}-${Date.now()}`,
        name: fileName || (isCore ? updatedTracks[trackKey]?.name : 'Pista Libre') || 'Audio',
        buffer,
        startOffsetSec: 0,
        trimStartSec: 0,
        trimEndSec: duration,
        fadeInSec: 0,
        fadeOutSec: 0,
      };

      if (isCore) {
        const existingClips = updatedTracks[trackKey].clips;
        updatedTracks[trackKey] = {
          ...updatedTracks[trackKey],
          buffer,
          clips: existingClips.length > 0 ? existingClips : [initialClip],
          trimEndSec: duration,
          fileName: fileName || state.tracks[trackKey].fileName,
        };
      } else {
        updatedAdditional = updatedAdditional.map((t) => {
          if (t.id === trackKey) {
            const existingClips = t.clips || [];
            return {
              ...t,
              buffer,
              clips: existingClips.length > 0 ? existingClips : [initialClip],
              trimEndSec: duration,
              fileName: fileName || t.fileName,
            };
          }
          return t;
        });
      }

      const allBuffers = [
        updatedTracks.music?.buffer,
        updatedTracks.voice?.buffer,
        ...updatedAdditional.map((t) => t.buffer),
      ].filter(Boolean) as AudioBuffer[];

      const maxDuration = allBuffers.reduce((max, b) => Math.max(max, b.duration), duration);

      return {
        tracks: updatedTracks,
        additionalTracks: updatedAdditional,
        totalDurationSec: Math.max(10, Math.round(maxDuration * 10) / 10),
      };
    });
  },

  setTrackVolume: (trackKey, volume) => {
    const clamped = Math.max(0, Math.min(1, volume));
    set((state) => {
      if (state.tracks[trackKey]) {
        return {
          tracks: {
            ...state.tracks,
            [trackKey]: {
              ...state.tracks[trackKey],
              volume: clamped,
            },
          },
        };
      }
      return {
        additionalTracks: state.additionalTracks.map((t) =>
          t.id === trackKey ? { ...t, volume: clamped } : t
        ),
      };
    });

    // Sincronizar con AudioEngine
    if (trackKey === 'music') {
      audioEngine.setMusicVolume(clamped);
    } else if (trackKey === 'metronome') {
      audioEngine.metronome.setVolume(clamped);
    } else if (trackKey === 'voice') {
      audioEngine.voiceCueEngine.setVolume(clamped);
    }
  },

  toggleTrackMute: (trackKey) => {
    set((state) => {
      if (state.tracks[trackKey]) {
        const newMuted = !state.tracks[trackKey].muted;
        const updatedTrack = {
          ...state.tracks[trackKey],
          muted: newMuted,
        };

        if (trackKey === 'music') {
          audioEngine.setMusicVolume(newMuted ? 0 : updatedTrack.volume);
        } else if (trackKey === 'metronome') {
          audioEngine.metronome.setEnabled(!newMuted && state.metronomeConfig.enabled);
        } else if (trackKey === 'voice') {
          audioEngine.voiceCueEngine.setConfig({ enabled: !newMuted });
        }

        return {
          tracks: {
            ...state.tracks,
            [trackKey]: updatedTrack,
          },
        };
      }

      return {
        additionalTracks: state.additionalTracks.map((t) =>
          t.id === trackKey ? { ...t, muted: !t.muted } : t
        ),
      };
    });
  },

  toggleTrackSolo: (trackKey) => {
    set((state) => {
      if (state.tracks[trackKey]) {
        const newSolo = !state.tracks[trackKey].solo;
        return {
          tracks: {
            ...state.tracks,
            [trackKey]: {
              ...state.tracks[trackKey],
              solo: newSolo,
            },
          },
        };
      }
      return {
        additionalTracks: state.additionalTracks.map((t) =>
          t.id === trackKey ? { ...t, solo: !t.solo } : t
        ),
      };
    });
  },

  setTrackTrim: (trackKey, trimStartSec, trimEndSec) => {
    set((state) => {
      const validStart = Math.max(0, trimStartSec);
      const validEnd = Math.max(trimStartSec + 0.1, trimEndSec);
      if (state.tracks[trackKey]) {
        return {
          tracks: {
            ...state.tracks,
            [trackKey]: {
              ...state.tracks[trackKey],
              trimStartSec: validStart,
              trimEndSec: validEnd,
            },
          },
        };
      }
      return {
        additionalTracks: state.additionalTracks.map((t) =>
          t.id === trackKey
            ? { ...t, trimStartSec: validStart, trimEndSec: validEnd }
            : t
        ),
      };
    });
  },

  setTrackFades: (trackKey, fadeInSec, fadeOutSec) => {
    set((state) => {
      const validFadeIn = Math.max(0, fadeInSec);
      const validFadeOut = Math.max(0, fadeOutSec);
      if (state.tracks[trackKey]) {
        return {
          tracks: {
            ...state.tracks,
            [trackKey]: {
              ...state.tracks[trackKey],
              fadeInSec: validFadeIn,
              fadeOutSec: validFadeOut,
            },
          },
        };
      }
      return {
        additionalTracks: state.additionalTracks.map((t) =>
          t.id === trackKey
            ? { ...t, fadeInSec: validFadeIn, fadeOutSec: validFadeOut }
            : t
        ),
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

      return {
        metronomeConfig: updated,
        tracks: {
          ...state.tracks,
          metronome: {
            ...state.tracks.metronome,
            volume: updated.volume,
          },
        },
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

      // Sincronizar automáticamente el metrónomo con los beats detectados
      get().setMetronomeConfig({ bpm: result.bpm });
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
    const allTracks: AudioStudioTrack[] = [
      state.tracks.music,
      state.tracks.voice,
      ...state.additionalTracks,
    ];

    try {
      const result = await renderStudioMixdown(
        allTracks,
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
