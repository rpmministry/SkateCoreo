import type { CategoriaReglamento, EficienciaReglamento } from '../constants/reglamento';

/**
 * Categorías oficiales del Reglamento 2026.
 * Se reutiliza el tipo canónico del reglamento para que el formulario de atletas
 * y el panel de Reglamento no puedan divergir jamás.
 */
export type SkaterCategoryReglamento = CategoriaReglamento;

/** Taxonomía heredada (registros antiguos ya persistidos en IndexedDB). */
export type SkaterCategoryLegacy =
  | 'Tots'
  | 'Minis'
  | 'Espoir'
  | 'Cadet'
  | 'Youth'
  | 'Junior'
  | 'Senior';

export type SkaterCategory = SkaterCategoryReglamento | SkaterCategoryLegacy;

/** Eficiencias oficiales del Reglamento 2026 (tipo canónico del reglamento). */
export type SkaterEficiencia = EficienciaReglamento;

export interface Skater {
  id: string;
  name: string;
  category: SkaterCategory;
  club?: string;
  country?: string;
  /** Edad del patinador/a; determina la categoría oficial. */
  age?: number;
  /** Nivel de eficiencia (Reglamento 2026). */
  eficiencia?: SkaterEficiencia;
  created_at: number;
}

export type SkaterGender = 'female' | 'male';

export interface ControlPoint {
  x: number;
  y: number;
}

export type TrailRenderMode = 'dynamic' | 'full' | 'guide';

export interface ChoreographyPathPoint {
  id: string;
  x: number;         // 0 to 50 meters (length)
  y: number;         // 0 to 25 meters (width)
  time_ms: number;
  timestamp?: number;
  cp1x?: number;     // Flattened control point for canvas math
  cp1y?: number;
  cp2x?: number;
  cp2y?: number;
  controlPoint1?: ControlPoint; // CP1 Salida Bézier
  controlPoint2?: ControlPoint; // CP2 Llegada Bézier
  type?: string;     // 'Jump' | 'Spin' | 'Step' | 'Choreo' | 'Marker' | etc.
  label?: string;    // Technical figure or note
  element_id?: string;
  /** Figuras agregadas manualmente por el usuario (además de la obligatoria). */
  manual_figures?: string[];
  /** Alias heredado de `manual_figures` (compatibilidad de datos persistidos). */
  figures_manuales?: string[];
  /**
   * Nodo detectado en la digitalización cuyo NÚMERO no pudo leerse (OCR falló).
   * Se muestra en naranja y permite editar el número con doble clic.
   */
  unrecognized?: boolean;
  /** Número de nodo leído por el escáner (o escrito a mano). */
  nodeNumber?: number;
  /** Color de la tinta manuscrita con la que se dibujó el nodo en el papel. */
  inkColor?: 'red' | 'blue';
  /**
   * Estado de confianza por aspecto (0..1). Un nodo SIN número sigue siendo
   * válido: `digitConfidence = 0` no invalida el nodo. Procede del escáner.
   */
  colorConfidence?: number;
  geometryConfidence?: number;
  positionConfidence?: number;
  digitConfidence?: number;
  /**
   * Nodo recién digitalizado SIN conexión: el escáner solo sube coordenadas
   * sueltas. La Pista 2D no dibuja trazos hacia/desde estos nodos hasta que el
   * usuario los edite/conecte.
   */
  unlinked?: boolean;
  isMainNode?: boolean; // Indicador explícito de Nodo Principal / Maestro
  path?: Array<{ x: number; y: number }>; // Huella de alta fidelidad (Catmull-Rom Spline) conectando este nodo con el siguiente
  /**
   * El usuario ha ESCULPIDO la curva de este segmento (arrastre de curva). Solo
   * entonces se dibuja una Bézier; si no existe, la unión es una línea recta para
   * no inventar curvas que el usuario no dibujó.
   */
  curveShaped?: boolean;
}

export interface ChoreographyPoint extends ChoreographyPathPoint {
  timestamp: number; // Exact moment in ms
  time_ms: number;   // Guaranteed alias

  // ── Procedencia Studio (marcador temporal) ──────────────────────────────
  /** Id del Studio Time Marker que originó este nodo (identidad estable). */
  sourceStudioMarkerId?: string;
  /**
   * Timestamp (ms) tal como se PUBLICÓ desde el Studio. Sirve de línea base para
   * detectar si el usuario editó el tiempo manualmente en la Pista 2D: si
   * `time_ms !== studioPublishedTimestampMs`, la nueva publicación NO sobrescribe.
   */
  studioPublishedTimestampMs?: number;
  /** true si el usuario editó el tiempo y el Studio publicó un valor distinto. */
  studioTimeConflict?: boolean;
  /** Tiempo (ms) que el Studio propuso en la última publicación (para adoptarlo). */
  pendingStudioTimestampMs?: number;
}

/**
 * Determina de forma unificada si un punto es un "Nodo Principal" (Nodo Maestro),
 * excluyendo puntos secundarios de curvatura o micro-puntos de geometría.
 */
export function isMainNode(
  point: ChoreographyPathPoint,
  index?: number,
  allPoints?: ChoreographyPathPoint[]
): boolean {
  if (point.isMainNode === true) return true;
  if (point.isMainNode === false) return false;

  // Los extremos de la coreografía siempre son Nodos Maestros
  if (allPoints && index !== undefined) {
    if (index === 0 || index === allPoints.length - 1) return true;
  }

  // Nodos con elementos técnicos RollArt asignados
  if (point.element_id && point.element_id.trim() !== '') return true;

  // Nodos con figuras técnicas asignadas
  if (point.label && point.label.trim() !== '' && point.label !== 'Curve') return true;

  // Nodos con tipo estructural o de figura técnica (no curvatura pura)
  if (point.type && point.type !== 'Curve') return true;

  return false;
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

