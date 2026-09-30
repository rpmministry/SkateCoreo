export type { CategoriaReglamento, EficienciaReglamento } from '../constants/reglamento';
import type { Skater } from '../types/choreography';

export type SyncState = 'local' | 'synced' | 'pending_upload' | 'pending_download' | 'conflict' | 'error';
export type CloudProviderId = 'local' | 'google_drive' | 'onedrive' | 'dropbox';

/**
 * Atleta del Panel de Entrenadores.
 * Totalmente compatible con la interfaz Skater existente de SkateCoreo.
 */
export interface CoachAthlete extends Skater {
  firstName: string;
  lastName: string;
  birthDate: string; // ISO YYYY-MM-DD
  age: number; // Edad calculada a partir de birthDate
  categoryAuto: boolean; // Si la categoría se computa automáticamente
  gender?: 'female' | 'male' | 'other';
  trainerName?: string;
  specialty?: string; // 'Libre' | 'Danza' | 'Solo Dance' | 'Figuras Obligatorias' | 'Parejas'
  level?: string; // 'Iniciación' | 'Nacional' | 'Internacional'
  technicalNotes?: string;
  contactInfo?: {
    guardianName?: string;
    phone?: string;
    email?: string;
    emergencyContact?: string;
  };
  photoDataUrl?: string; // Avatar en formato base64/data URI
  updated_at: number;
  syncState: SyncState;
  cloudFolderId?: string;
  cloudProfileId?: string;
}

/**
 * Versión individual de un archivo .coreo para una coreografía.
 */
export interface CoachChoreographyVersion {
  versionNumber: number;
  versionLabel: string; // 'v1', 'v2', 'v3'
  fileName: string; // e.g. "Maria_Andrade_Programa_Libre_2026_v01.coreo"
  coreoBlobId: string; // Referencia a IndexedDB coach_files
  coreoBlobSize: number;
  savedAt: number;
  notes?: string;
  device?: string;
  cloudFileId?: string;
  syncState: SyncState;
}

/**
 * Registro de Coreografía en el expediente de la atleta.
 */
export interface CoachChoreography {
  id: string;
  athleteId: string;
  title: string;
  programType: string; // 'Libre' | 'Corto' | 'Danza' | 'Style Dance' | 'Exhibición'
  year: number;
  suggestedFileName: string;
  category: string; // Categoría histórica con la que se creó
  durationMs: number;
  pointsCount: number;
  hasAudio: boolean;
  audioFileName?: string;
  versions: CoachChoreographyVersion[];
  currentVersion: number;
  created_at: number;
  updated_at: number;
  syncState: SyncState;
}

/**
 * Perfil y configuración del entrenador.
 */
export interface CoachProfile {
  trainerId: string;
  name: string;
  email: string;
  club: string;
  phone?: string;
  connectedStorage: CloudProviderId;
  storageConfig: {
    googleDrive?: {
      connected: boolean;
      userEmail?: string;
      accessToken?: string;
      expiresAt?: number;
      rootFolderId?: string;
      clientId?: string;
    };
    oneDrive?: {
      connected: boolean;
      userEmail?: string;
      accessToken?: string;
      expiresAt?: number;
      rootFolderId?: string;
      clientId?: string;
    };
    dropbox?: {
      connected: boolean;
      userEmail?: string;
      accessToken?: string;
      expiresAt?: number;
      rootFolderId?: string;
      clientId?: string;
    };
  };
  lastBackupDate?: number;
  autoSync: boolean;
}

/**
 * Elemento de almacenamiento (archivo o carpeta).
 */
export interface StorageItem {
  id: string;
  name: string;
  path: string;
  isFolder: boolean;
  size?: number;
  updatedAt?: number;
  mimeType?: string;
}

/**
 * Estado general de sincronización y almacenamiento.
 */
export interface StorageSummary {
  activeProvider: CloudProviderId;
  isOnline: boolean;
  totalAthletes: number;
  totalChoreographies: number;
  totalFiles: number;
  totalStorageBytes: number;
  syncState: SyncState;
  lastSyncTimestamp?: number;
  pendingSyncCount: number;
  conflictCount: number;
  errorMessage?: string;
}

/**
 * Manifiesto de exportación / respaldo completo (.zip).
 */
export interface CoachBackupManifest {
  version: '1.0.0';
  system: 'SkateCoreo Coach Portal';
  exportedAt: number;
  trainer: {
    id: string;
    name: string;
    email: string;
    club: string;
  };
  summary: {
    athletesCount: number;
    choreographiesCount: number;
    filesCount: number;
  };
}

// ── TIPOS DEL PANEL TÉCNICO Y EVALUACIONES (2026) ─────────────

export type RegulationSystemId =
  | 'WORLD_SKATE_ROLLART_2026'
  | 'FEP_ECUADOR_2026'
  | 'WHITE_FIGURES_2026';

export type EvaluationDiscipline =
  | 'Libre'
  | 'Solo Danza'
  | 'Figuras'
  | 'Parejas'
  | 'Show';

export type EvaluationSegment =
  | 'Corto'
  | 'Largo'
  | 'Único'
  | 'Danza Obligatoria'
  | 'Style Dance'
  | 'Free Dance'
  | 'Figuras';

export type EvaluationCorrectionPriority = 'urgente' | 'importante' | 'recomendacion';

export interface EvaluationElementRecord {
  id: string;
  code: string;
  name: string;
  type: 'Jump' | 'Spin' | 'StepSequence' | 'Choreographic' | 'DanceFootwork' | 'Travelling' | 'DanceSpin' | 'Figure' | 'NJ';
  baseValue: number;
  executionTimestampMs: number;
  rotationsCount: number;
  deductionCode: '<' | '<<' | '<<<' | null;
  edgeIndicator: 'Outside' | 'Inside' | 'Flat' | 'e' | null;
  qoeScore: number; // -3 a +3
  isTimeBonusApplied: boolean;
  isValid: boolean;
  validationError?: string;
  finalValue: number;
  notes?: string;
}

export interface EvaluationArtisticComponents {
  skatingSkills: number; // 0.25 a 10.0
  transitions: number;
  performance: number;
  choreography: number;
  factor: number;
  totalPcs: number;
}

export interface EvaluationFigureMarks {
  tracing: number; // 0.0 a 10.0
  movement: number;
  carriage: number;
  average: number;
}

export interface EvaluationDeductions {
  fallsCount: number;
  fallsDeduction: number;
  timeViolationSeconds: number;
  timeDeduction: number;
  costumeDeduction: number;
  musicViolationDeduction: number;
  otherDeductions: number;
  totalDeductions: number;
}

export interface EvaluationScoreSummary {
  tes: number;
  pcs: number;
  deductions: number;
  totalScore: number;
  elementsCount: number;
  bonusTCount: number;
}

export interface TechnicalCorrectionItem {
  id: string;
  item: string;
  priority: EvaluationCorrectionPriority;
}

export interface EvaluationPedagogicalFeedback {
  strengths: string[];
  technicalCorrections: TechnicalCorrectionItem[];
  choreographicSuggestions: {
    spatialDistribution?: string;
    musicality?: string;
    transitions?: string;
    interpretation?: string;
  };
  nextGoals: string[];
  generalObservations: string;
}

/**
 * Evaluación Técnica Profesional de Entrenamiento.
 * Registra fielmente el cálculo oficial reglamentario y la retroalimentación
 * pedagógica del entrenador.
 */
export interface CoachEvaluation {
  id: string;
  athleteId: string;
  athleteName: string;
  choreographyId?: string;
  choreographyTitle?: string;
  choreographyVersionNumber?: number;
  trainerId: string;
  trainerName: string;
  date: string; // ISO 8601 YYYY-MM-DDTHH:mm:ss.sssZ
  regulationId: RegulationSystemId;
  regulationTitle: string;
  season: '2026';
  discipline: EvaluationDiscipline;
  programSegment: EvaluationSegment;
  category: string;
  eficiencia?: string;
  elements: EvaluationElementRecord[];
  artisticComponents?: EvaluationArtisticComponents;
  figureMarks?: EvaluationFigureMarks;
  deductions: EvaluationDeductions;
  scoresSummary: EvaluationScoreSummary;
  feedback: EvaluationPedagogicalFeedback;
  isSentToAthlete: boolean;
  sentAt?: number;
  updated_at: number;
  syncState: SyncState;
}

