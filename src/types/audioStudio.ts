/**
 * audioStudio.ts — Tipos de datos para el Estudio de Audio Multitrack (DAW Lite)
 */

export interface AudioTimeNode {
  id: string;
  numeroSecuencial: number; // 1, 2, 3...
  timestampSec: number;     // Tiempo exacto en segundos
  label?: string;
}

export type TrackType = 'music' | 'voice' | 'metronome';

export interface AudioStudioTrack {
  id: string;
  name: string;
  type: TrackType;
  buffer: AudioBuffer | null;
  volume: number;           // 0.0 a 1.0 (0% a 100%)
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

