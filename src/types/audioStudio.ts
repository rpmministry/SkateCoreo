/**
 * audioStudio.ts — Tipos de datos para el Estudio de Audio Multitrack (DAW Lite)
 * Optimizado para Landscape Móvil, Carbon Design System y Web Audio API.
 */

export interface AudioTimeNode {
  id: string;
  numeroSecuencial: number; // 1, 2, 3...
  timestampSec: number;     // Tiempo exacto en segundos
  label?: string;
}

export type TrackType = 'music' | 'voice' | 'metronome' | 'user' | 'additional';

export type StudioTool = 'select' | 'split' | 'delete';

export const CARBON_TRACK_COLORS = [
  '#00F0FF', // Cyan Eléctrico (Pista 1 - Música Principal)
  '#D946EF', // Magenta Neón (Pista 2 - Secundaria 1)
  '#10F49C', // Verde Menta Neón (Pista 3 - Secundaria 2)
  '#F59E0B', // Ámbar Cálido (Pista 4 - Secundaria 3)
  '#8B5CF6', // Púrpura Eléctrico (Pista 5 - Secundaria 4)
  '#38BDF8', // Azul Cielo
  '#F43F5E', // Coral Neón
  '#A3E635', // Lima Neón
];

export interface AudioClip {
  id: string;
  name: string;
  buffer: AudioBuffer;
  startOffsetSec: number; // Posición en la línea de tiempo global (cuándo empieza a sonar)
  trimStartSec: number;   // Recorte inicial dentro del buffer
  trimEndSec: number;     // Recorte final dentro del buffer
  fadeInSec: number;      // Duración de fundido de entrada (s)
  fadeOutSec: number;     // Duración de fundido de salida (s)
}

export interface AudioStudioTrack {
  id: string;
  name: string;
  color: string;          // Color vibrante Carbon Design
  type: TrackType;
  buffer: AudioBuffer | null;
  clips: AudioClip[];     // Colección de clips cortables y desplazables
  volume: number;         // 0.0 a 1.0 (0% a 100%)
  muted: boolean;
  solo: boolean;
  trimStartSec: number;     // Tiempo de inicio del recorte (en segundos)
  trimEndSec: number;       // Tiempo de fin del recorte (en segundos, 0 = sin recorte final)
  fadeInSec: number;        // Duración de fundido de entrada en segundos
  fadeOutSec: number;       // Duración de fundido de salida en segundos
  fileName?: string | null;
}

export interface StudioMetronomeConfig {
  enabled: boolean;
  bpm: number;
  beatsPerMeasure: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  accentFirstBeat: boolean;
  volume: number;
}

export interface GlobalVoiceGuideConfig {
  enabled: boolean;
  volume: number;
  muted: boolean;
}

export interface GlobalAudioControls {
  bpm: number;
  beatsPerMeasure: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  metronome: {
    enabled: boolean;
    volume: number;
    accentFirstBeat: boolean;
    muted: boolean;
  };
  voiceGuide: GlobalVoiceGuideConfig;
}

export interface ClipContextMenuState {
  isOpen: boolean;
  x: number;
  y: number;
  trackId: string;
  clipId: string;
}

export interface DraggingGhostState {
  clip: AudioClip;
  fromTrackId: string;
  targetTrackIndex: number;
  targetTrackId: string;
  targetTrackName: string;
  startOffsetSec: number;
  cursorX: number;
  cursorY: number;
  isOverMaster: boolean;
  snapLineSec: number | null;
}

export interface AudioClipMetadata {
  id: string;
  name: string;
  startOffsetSec: number;
  durationSec: number;
  trimStartSec: number;
  trimEndSec: number;
  fadeInSec: number;
  fadeOutSec: number;
}

export interface AudioTrackMetadata {
  id: string;
  name: string;
  color: string;
  type: TrackType;
  volume: number;
  muted: boolean;
  solo: boolean;
  fileName?: string | null;
  clips: AudioClipMetadata[];
}

export interface MixProjectMetadata {
  bpm: number;
  totalDurationSec: number;
  masterTrack: AudioTrackMetadata;
  additionalTracks: AudioTrackMetadata[];
  globalControls: GlobalAudioControls;
}
