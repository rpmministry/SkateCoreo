export type SkaterCategory = 
  | 'Tots' 
  | 'Minis' 
  | 'Espoir' 
  | 'Cadet' 
  | 'Youth' 
  | 'Junior' 
  | 'Senior';

export interface Skater {
  id: string;
  name: string;
  category: SkaterCategory;
  club?: string;
  country?: string;
  created_at: number;
}

export type SkaterGender = 'female' | 'male';

export interface ControlPoint {
  x: number;
  y: number;
}

export type PointKind = 'position' | 'time';
export type TrailRenderMode = 'dynamic' | 'full' | 'guide';

export interface ChoreographyPathPoint {
  id: string;
  x: number;         // 0 to 50 meters (length)
  y: number;         // 0 to 25 meters (width)
  time_ms: number;
  timestamp?: number;
  kind?: PointKind;  // 'position' (defecto) o 'time' (nodo de tiempo musical)
  timeBeat?: number; // Contador musical dentro del segmento (1, 2, 3...)
  parentSegmentStartId?: string; // ID del nodo de posición previo
  cp1x?: number;     // Flattened control point for canvas math
  cp1y?: number;
  cp2x?: number;
  cp2y?: number;
  controlPoint1?: ControlPoint; // CP1 Salida Bézier
  controlPoint2?: ControlPoint; // CP2 Llegada Bézier
  type?: string;     // 'Jump' | 'Spin' | 'Step' | 'Choreo' | 'Marker' | etc.
  label?: string;    // Technical figure or note
  element_id?: string;
}

export interface ChoreographyPoint extends ChoreographyPathPoint {
  timestamp: number; // Exact moment in ms
  time_ms: number;   // Guaranteed alias
}

export interface SkaterAvatarState {
  x: number; // in meters (0 to 50)
  y: number; // in meters (0 to 25)
  angleRad: number; // Direction/heading in radians
  speedMps: number; // Meters per second
  activeElement: ElementLog | null;
  activePointIndex: number;
}

export interface RinkDimensions {
  lengthMeters: number; // standard 50m
  widthMeters: number;  // standard 25m
  cornerRoundsMeters: number; // standard 3-5m radius
}

export type ElementType = 'Jump' | 'Spin' | 'Dance' | 'StepSequence' | 'NJ';

export type DeductionCode = '<' | '<<' | '<<<' | null;

export type EdgeIndicator = 'Outside' | 'Inside' | 'Flat' | 'e' | null;

export interface ElementLog {
  id: string;
  program_id: string;
  element_type: ElementType;
  base_code: string; // e.g., "3Lo", "2Lz", "SSp", "StSq", "NJ"
  name: string;
  execution_timestamp: number;
  deduction_code: DeductionCode;
  is_time_bonus_applied: boolean; // 10% "T" factor
  rotations_count: number; // required >= 3 for Spins
  edge_indicator: EdgeIndicator;
  qoe_score: number; // -3 to +3
  base_value: number;
  final_value: number;
  is_valid: boolean;
  validation_error?: string;
  notes?: string;
}

export interface ArtisticComponents {
  skatingSkills: number;  // -3 to +3 raw slider
  transitions: number;   // -3 to +3 raw slider
  performance: number;   // -3 to +3 raw slider
  choreography: number;  // -3 to +3 raw slider
}

export interface ProgramScoreSummary {
  tes: number; // Total Element Score
  pcs: number; // Program Component Score
  deductions: number; // Falls, time violations, etc.
  totalScore: number; // TES + PCS - deductions
  elementsCount: number;
  bonusTAppliedCount: number;
}

export interface Program {
  id: string;
  skater_id: string;
  title: string;
  duration_ms: number;
  audio_blob?: Blob | ArrayBuffer | null;
  audio_name?: string;
  half_time_ms: number; // Point where 10% "T" factor bonus begins
  choreography_path: ChoreographyPathPoint[];
  created_at: number;
}

