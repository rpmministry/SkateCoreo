import { create } from 'zustand';
import { AudioTimeNode, AudioStudioTrack, StudioMetronomeConfig } from '../types/audioStudio';
import { BpmDetector } from '../core/audio/BpmDetector';
import { audioEngine } from '../core/audio/AudioEngine';
import { useChoreographyStore } from './useChoreographyStore';

export interface AudioStudioStoreState {
  // Pistas del editor multitrack
  tracks: {
    music: AudioStudioTrack;
    voice: AudioStudioTrack;
    metronome: AudioStudioTrack;
    [key: string]: AudioStudioTrack;
  };
  additionalTracks: AudioStudioTrack[];

  // Acciones de Pistas Libres Dinámicas (+ Añadir Pista de Audio)
  addAudioTrack: (name?: string) => AudioStudioTrack;
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

  // Función Puente (Audio-to-Canvas Bridge)
  sendMixToChoreo: () => { nodes: AudioTimeNode[]; success: boolean };
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
      type: 'music',
      buffer: null,
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
      type: 'voice',
      buffer: null,
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
      type: 'metronome',
      buffer: null,
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

  addAudioTrack: (name) => {
    const newId = `track-user-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const trackCount = get().additionalTracks.length + 1;
    const newTrack: AudioStudioTrack = {
      id: newId,
      name: name || `Pista Libre ${trackCount}`,
      type: 'music',
      buffer: null,
      volume: 1.0,
      muted: false,
      solo: false,
      trimStartSec: 0,
      trimEndSec: 0,
      fadeInSec: 0,
      fadeOutSec: 0,
      fileName: null,
    };
    set((state) => ({
      additionalTracks: [...state.additionalTracks, newTrack],
    }));
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

      if (isCore) {
        updatedTracks[trackKey] = {
          ...state.tracks[trackKey],
          buffer,
          trimEndSec: duration,
          fileName: fileName || state.tracks[trackKey].fileName,
        };
      } else {
        updatedAdditional = updatedAdditional.map((t) =>
          t.id === trackKey
            ? { ...t, buffer, trimEndSec: duration, fileName: fileName || t.fileName }
            : t
        );
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
}));
