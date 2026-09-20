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
  };

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
  setTrackBuffer: (trackKey: 'music' | 'voice', buffer: AudioBuffer, fileName?: string) => void;
  setTrackVolume: (trackKey: 'music' | 'voice' | 'metronome', volume: number) => void;
  toggleTrackMute: (trackKey: 'music' | 'voice' | 'metronome') => void;
  toggleTrackSolo: (trackKey: 'music' | 'voice' | 'metronome') => void;
  setTrackTrim: (trackKey: 'music' | 'voice', trimStartSec: number, trimEndSec: number) => void;
  setTrackFades: (trackKey: 'music' | 'voice', fadeInSec: number, fadeOutSec: number) => void;

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
      const updatedTrack = {
        ...state.tracks[trackKey],
        buffer,
        trimEndSec: duration,
        fileName: fileName || state.tracks[trackKey].fileName,
      };

      const maxDuration = Math.max(
        duration,
        trackKey === 'music' ? duration : (state.tracks.music.buffer?.duration || 120)
      );

      return {
        tracks: {
          ...state.tracks,
          [trackKey]: updatedTrack,
        },
        totalDurationSec: Math.max(10, Math.round(maxDuration * 10) / 10),
      };
    });
  },

  setTrackVolume: (trackKey, volume) => {
    const clamped = Math.max(0, Math.min(1, volume));
    set((state) => ({
      tracks: {
        ...state.tracks,
        [trackKey]: {
          ...state.tracks[trackKey],
          volume: clamped,
        },
      },
    }));

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
    });
  },

  toggleTrackSolo: (trackKey) => {
    set((state) => {
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
    });
  },

  setTrackTrim: (trackKey, trimStartSec, trimEndSec) => {
    set((state) => ({
      tracks: {
        ...state.tracks,
        [trackKey]: {
          ...state.tracks[trackKey],
          trimStartSec: Math.max(0, trimStartSec),
          trimEndSec: Math.max(trimStartSec + 0.1, trimEndSec),
        },
      },
    }));
  },

  setTrackFades: (trackKey, fadeInSec, fadeOutSec) => {
    set((state) => ({
      tracks: {
        ...state.tracks,
        [trackKey]: {
          ...state.tracks[trackKey],
          fadeInSec: Math.max(0, fadeInSec),
          fadeOutSec: Math.max(0, fadeOutSec),
        },
      },
    }));
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
    set({ zoom: Math.max(0.5, Math.min(4, zoom)) });
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
