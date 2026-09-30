/**
 * fepCatalog2026.ts — Reglamento Nacional de Patinaje Artístico del Ecuador 2026
 *
 * Fuente Oficial: Federación Ecuatoriana de Patinaje (FEP)
 *  - Reglamento Nacional de Artístico 2026
 *  - Resolución No. 013-2026 (Puntajes Técnicos Mínimos para Ascenso de Eficiencia)
 *  - Resoluciones Técnicas de Competencia (Requisitos de Doble Axel y valores mínimos)
 */

import { EficienciaReglamento, CategoriaReglamento } from '../reglamento';

export interface FepEfficiencyRule {
  eficiencia: EficienciaReglamento;
  description: string;
  allowedJumps: string[];
  prohibitedJumps: string[];
  allowedSpins: string[];
  stepSequencesAllowed: string[];
  maxJumpsInCombination: number;
  minimumTesForPromotion: Record<CategoriaReglamento, number>;
  programDurationSeconds: number; // Duración recomendada
  toleranceSeconds: number;
}

export const FEP_EFFICIENCY_RULES_2026: Record<EficienciaReglamento, FepEfficiencyRule> = {
  'PRE PROMO': {
    eficiencia: 'PRE PROMO',
    description: 'Nivel Formativo Inicial / Novatos. Enfoque en saltos simples básicos y trompos upright de una posición.',
    allowedJumps: ['Waltz', '1T', '1S', 'NJ'],
    prohibitedJumps: ['1Lo', '1F', '1Lz', '1A', '2T', '2S', '2Lo', '2F', '2Lz', '2A'],
    allowedSpins: ['USpB', 'USp1'],
    stepSequencesAllowed: ['StSqB'],
    maxJumpsInCombination: 2,
    minimumTesForPromotion: {
      TOT: 10.0,
      MINI: 12.0,
      ESPOIR: 12.0,
      CADET: 14.0,
      MAYOR: 14.0,
    },
    programDurationSeconds: 105, // 1:45 min
    toleranceSeconds: 10,
  },
  'BÁSICA': {
    eficiencia: 'BÁSICA',
    description: 'Nivel Promocional Básico. Incorpora giros de borde (Flip, Loop) y trompos bajos (Sit).',
    allowedJumps: ['Waltz', '1T', '1S', '1Lo', '1F', '1Eu', 'NJ'],
    prohibitedJumps: ['1Lz', '1A', '2T', '2S', '2Lo', '2F', '2Lz', '2A'],
    allowedSpins: ['USpB', 'USp1', 'USp2', 'SSpB', 'SSp1'],
    stepSequencesAllowed: ['StSqB', 'StSq1'],
    maxJumpsInCombination: 2,
    minimumTesForPromotion: {
      TOT: 12.0,
      MINI: 12.0,
      ESPOIR: 16.0,
      CADET: 18.0,
      MAYOR: 18.0,
    },
    programDurationSeconds: 120, // 2:00 min
    toleranceSeconds: 10,
  },
  'INTERMEDIA': {
    eficiencia: 'INTERMEDIA',
    description: 'Nivel Promocional Intermedio. Transición hacia saltos dobles iniciales y trompos combinados.',
    allowedJumps: ['Waltz', '1T', '1S', '1Lo', '1F', '1Lz', '1A', '2S', '2T', '1Eu', 'NJ'],
    prohibitedJumps: ['2Lo', '2F', '2Lz', '2A', '3T', '3S'],
    allowedSpins: ['USp1', 'USp2', 'USp3', 'SSp1', 'SSp2', 'CSpB', 'CSp1', 'NLCombSp', 'CombSp1'],
    stepSequencesAllowed: ['StSq1', 'StSq2', 'ChSq1'],
    maxJumpsInCombination: 3,
    minimumTesForPromotion: {
      TOT: 16.0,
      MINI: 18.0,
      ESPOIR: 22.0,
      CADET: 25.0,
      MAYOR: 25.0,
    },
    programDurationSeconds: 150, // 2:30 min
    toleranceSeconds: 10,
  },
};

/**
 * Requisitos técnicos obligatorios FEP 2026 para Alta Competencia (World Skate Nacional)
 */
export const FEP_HIGH_PERFORMANCE_REQUIREMENTS_2026 = {
  // Doble Axel (2A) obligatorio en Short Program Junior y Senior
  MANDATORY_DOUBLE_AXEL_CATEGORIES: ['JUNIOR', 'SENIOR', 'MAYOR'],
  // Valor base mínimo de 2.0 en salto solo para Cadete a Senior
  MIN_SOLO_JUMP_BV_CADET_TO_SENIOR: 2.0,
};

/**
 * Duración oficial por categoría competitiva (FEP / World Skate)
 */
export const OFFICIAL_PROGRAM_DURATIONS: Record<
  string,
  { shortMs?: number; longMs: number; toleranceMs: number }
> = {
  TOT: { longMs: 120000, toleranceMs: 10000 },
  TOTS: { longMs: 120000, toleranceMs: 10000 },
  MINI: { longMs: 150000, toleranceMs: 10000 },
  MINIS: { longMs: 150000, toleranceMs: 10000 },
  ESPOIR: { longMs: 180000, toleranceMs: 10000 },
  CADET: { shortMs: 135000, longMs: 210000, toleranceMs: 10000 },
  YOUTH: { shortMs: 135000, longMs: 225000, toleranceMs: 10000 },
  JUNIOR: { shortMs: 150000, longMs: 240000, toleranceMs: 10000 },
  SENIOR: { shortMs: 150000, longMs: 255000, toleranceMs: 10000 },
  MAYOR: { shortMs: 150000, longMs: 240000, toleranceMs: 10000 },
};
