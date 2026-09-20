/**
 * audioStudio.ts — Tipos de datos para el Estudio de Audio Multitrack (DAW Lite)
 */

export interface AudioTimeNode {
  id: string;
  numeroSecuencial: number; // 1, 2, 3...
  timestampSec: number;     // Tiempo exacto en segundos
  label?: string;
}

export type TrackType = 'music' | 'voice' | 'metronome' | 'user';

export type StudioTool = 'select' | 'split' | 'delete';

export const CARBON_TRACK_COLORS = [
  '#00F0FF', // Cyan Eléctrico (Pista 1 - Música)
  '#D946EF', // Magenta Neón (Pista 2 - Voz)
  '#10F49C', // Verde Menta Neón (Pista 3 - Libre 1)
  '#F59E0B', // Ámbar Cálido (Metrónomo / Pista 4)
  '#8B5CF6', // Púrpura Eléctrico (Pista 5)
  '#38BDF8', // Azul Cielo (Pista 6)
  '#F43F5E', // Coral Neón (Pista 7)
  '#A3E635', // Lima Neón (Pista 8)
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
  beatsPerMeasure: 1 | 2 | 3 | 4 | 6;
  accentFirstBeat: boolean;
  volume: number;
}

