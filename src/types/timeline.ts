export interface TimelineMarker {
  id: string;
  timeMs: number;
  label: string;
  type: 'element' | 'voice-cue' | 'half-time' | 'measure' | 'custom';
  color?: string;
}

export interface AudioSelectionRange {
  startMs: number;
  endMs: number;
  isActive: boolean;
}

export interface TimelineTrackLane {
  id: 'music' | 'metronome' | 'cues';
  name: string;
  height: number;
  visible: boolean;
  muted: boolean;
  solo: boolean;
  volume: number;
}

