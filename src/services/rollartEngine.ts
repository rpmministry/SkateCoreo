import { DeductionCode, EdgeIndicator, ElementType, ArtisticComponents, ProgramScoreSummary } from '../types';

export interface RollArtElementDef {
  code: string;
  name: string;
  type: ElementType;
  rotations?: number;
  baseValue: number;
  level?: string;
  requiresEdge?: 'Outside' | 'Inside';
  minRotations?: number;
}

// 1. Catálogo Oficial RollArt de Saltos (World Skate)
export const JUMP_DEFINITIONS: Record<string, RollArtElementDef> = {
  // Axel
  '1A': { code: '1A', name: 'Single Axel', type: 'Jump', rotations: 1.5, baseValue: 1.10 },
  '2A': { code: '2A', name: 'Double Axel', type: 'Jump', rotations: 2.5, baseValue: 3.30 },
  '3A': { code: '3A', name: 'Triple Axel', type: 'Jump', rotations: 3.5, baseValue: 8.00 },
  
  // Toe Loop
  '1T': { code: '1T', name: 'Single Toe Loop', type: 'Jump', rotations: 1, baseValue: 0.40 },
  '2T': { code: '2T', name: 'Double Toe Loop', type: 'Jump', rotations: 2, baseValue: 1.30 },
  '3T': { code: '3T', name: 'Triple Toe Loop', type: 'Jump', rotations: 3, baseValue: 4.20 },
  '4T': { code: '4T', name: 'Quad Toe Loop', type: 'Jump', rotations: 4, baseValue: 9.50 },

  // Salchow
  '1S': { code: '1S', name: 'Single Salchow', type: 'Jump', rotations: 1, baseValue: 0.40 },
  '2S': { code: '2S', name: 'Double Salchow', type: 'Jump', rotations: 2, baseValue: 1.30 },
  '3S': { code: '3S', name: 'Triple Salchow', type: 'Jump', rotations: 3, baseValue: 4.20 },
  '4S': { code: '4S', name: 'Quad Salchow', type: 'Jump', rotations: 4, baseValue: 9.70 },

  // Loop (Rittberger)
  '1Lo': { code: '1Lo', name: 'Single Loop', type: 'Jump', rotations: 1, baseValue: 0.50 },
  '2Lo': { code: '2Lo', name: 'Double Loop', type: 'Jump', rotations: 2, baseValue: 1.70 },
  '3Lo': { code: '3Lo', name: 'Triple Loop', type: 'Jump', rotations: 3, baseValue: 4.90 },
  '4Lo': { code: '4Lo', name: 'Quad Loop', type: 'Jump', rotations: 4, baseValue: 10.50 },

  // Flip (Inside edge)
  '1F': { code: '1F', name: 'Single Flip', type: 'Jump', rotations: 1, baseValue: 0.60, requiresEdge: 'Inside' },
  '2F': { code: '2F', name: 'Double Flip', type: 'Jump', rotations: 2, baseValue: 2.00, requiresEdge: 'Inside' },
  '3F': { code: '3F', name: 'Triple Flip', type: 'Jump', rotations: 3, baseValue: 5.30, requiresEdge: 'Inside' },
  '4F': { code: '4F', name: 'Quad Flip', type: 'Jump', rotations: 4, baseValue: 11.00, requiresEdge: 'Inside' },

  // Lutz (Outside edge - Pre-check critical)
  '1Lz': { code: '1Lz', name: 'Single Lutz', type: 'Jump', rotations: 1, baseValue: 0.60, requiresEdge: 'Outside' },
  '2Lz': { code: '2Lz', name: 'Double Lutz', type: 'Jump', rotations: 2, baseValue: 2.10, requiresEdge: 'Outside' },
  '3Lz': { code: '3Lz', name: 'Triple Lutz', type: 'Jump', rotations: 3, baseValue: 5.90, requiresEdge: 'Outside' },
  '4Lz': { code: '4Lz', name: 'Quad Lutz', type: 'Jump', rotations: 4, baseValue: 11.50, requiresEdge: 'Outside' },

  // No Jump (Connector in combos)
  'NJ': { code: 'NJ', name: 'No Jump (Conector)', type: 'NJ', rotations: 1, baseValue: 0.00 }
};

// 2. Catálogo Oficial RollArt de Trompos (Spins)
export const SPIN_DEFINITIONS: Record<string, RollArtElementDef> = {
  'USpB': { code: 'USpB', name: 'Upright Spin Base', type: 'Spin', baseValue: 1.00, level: 'B', minRotations: 3 },
  'USp1': { code: 'USp1', name: 'Upright Spin Nivel 1', type: 'Spin', baseValue: 1.40, level: '1', minRotations: 3 },
  'USp2': { code: 'USp2', name: 'Upright Spin Nivel 2', type: 'Spin', baseValue: 1.80, level: '2', minRotations: 3 },
  
  'SSpB': { code: 'SSpB', name: 'Sit Spin Base', type: 'Spin', baseValue: 1.20, level: 'B', minRotations: 3 },
  'SSp1': { code: 'SSp1', name: 'Sit Spin Nivel 1', type: 'Spin', baseValue: 1.70, level: '1', minRotations: 3 },
  'SSp2': { code: 'SSp2', name: 'Sit Spin Nivel 2', type: 'Spin', baseValue: 2.30, level: '2', minRotations: 3 },
  'SSp3': { code: 'SSp3', name: 'Sit Spin Nivel 3', type: 'Spin', baseValue: 2.90, level: '3', minRotations: 3 },

  'CSpB': { code: 'CSpB', name: 'Camel Spin Base', type: 'Spin', baseValue: 1.40, level: 'B', minRotations: 3 },
  'CSp1': { code: 'CSp1', name: 'Camel Spin Nivel 1', type: 'Spin', baseValue: 2.00, level: '1', minRotations: 3 },
  'CSp2': { code: 'CSp2', name: 'Camel Spin Nivel 2', type: 'Spin', baseValue: 2.60, level: '2', minRotations: 3 },
  'CSp3': { code: 'CSp3', name: 'Camel Spin Nivel 3', type: 'Spin', baseValue: 3.30, level: '3', minRotations: 3 },

  'HSp1': { code: 'HSp1', name: 'Heel Spin Nivel 1', type: 'Spin', baseValue: 2.40, level: '1', minRotations: 3 },
  'HSp2': { code: 'HSp2', name: 'Heel Spin Nivel 2', type: 'Spin', baseValue: 3.20, level: '2', minRotations: 3 },

  'BSp1': { code: 'BSp1', name: 'Broken Ankle Spin Nivel 1', type: 'Spin', baseValue: 2.20, level: '1', minRotations: 3 },
  'BSp2': { code: 'BSp2', name: 'Broken Ankle Spin Nivel 2', type: 'Spin', baseValue: 3.00, level: '2', minRotations: 3 },

  'ISp1': { code: 'ISp1', name: 'Inverted Spin Nivel 1', type: 'Spin', baseValue: 3.00, level: '1', minRotations: 3 },
  'ISp2': { code: 'ISp2', name: 'Inverted Spin Nivel 2', type: 'Spin', baseValue: 3.80, level: '2', minRotations: 3 }
};

// 3. Secuencias de Pasos y Danza
export const DANCE_STEP_DEFINITIONS: Record<string, RollArtElementDef> = {
  'StSqB': { code: 'StSqB', name: 'Step Sequence Base', type: 'StepSequence', baseValue: 1.50, level: 'B' },
  'StSq1': { code: 'StSq1', name: 'Step Sequence Nivel 1', type: 'StepSequence', baseValue: 2.40, level: '1' },
  'StSq2': { code: 'StSq2', name: 'Step Sequence Nivel 2', type: 'StepSequence', baseValue: 3.30, level: '2' },
  'StSq3': { code: 'StSq3', name: 'Step Sequence Nivel 3', type: 'StepSequence', baseValue: 4.20, level: '3' },
  'CT_R3': { code: 'CT_R3', name: 'Carlos Tango - Tap Down (Beat 3)', type: 'Dance', baseValue: 2.50 }
};

export class RollArtEngine {
  /**
   * Obtiene la definición de un elemento por su código base
   */
  public static getElementDef(code: string): RollArtElementDef | undefined {
    return JUMP_DEFINITIONS[code] || SPIN_DEFINITIONS[code] || DANCE_STEP_DEFINITIONS[code];
  }

  /**
   * Resuelve el código de un salto con degradación total '<<<' (una rotación menos)
   * Ejemplo: 3Lo <<< -> 2Lo
   */
  public static getDowngradedJumpCode(code: string): string {
    if (code === 'NJ') return 'NJ';
    const match = code.match(/^(\d)([A-Za-z]+)$/);
    if (!match) return code;

    const rot = parseInt(match[1], 10);
    const jumpType = match[2];

    if (rot > 1) {
      const lowerCode = `${rot - 1}${jumpType}`;
      if (JUMP_DEFINITIONS[lowerCode]) {
        return lowerCode;
      }
    }
    // Si ya es simple y se degrada, queda como 1T o valor mínimo
    return code;
  }

  /**
   * Valida trompos: Exige mínimo 3 rotaciones completas según el PRD
   */
  public static validateSpinRotations(rotations: number): { isValid: boolean; errorMessage?: string } {
    if (rotations < 3) {
      return {
        isValid: false,
        errorMessage: 'Requiere 3 vueltas completas para validación'
      };
    }
    return { isValid: true };
  }

  /**
   * Aplica el motor de cálculo RollArt a un elemento técnico individual
   */
  public static calculateElementScore(params: {
    baseCode: string;
    executionTimestamp: number;
    halfTimeMs: number;
    deductionCode: DeductionCode;
    rotationsCount: number;
    edgeIndicator: EdgeIndicator;
    qoeScore: number; // -3 a +3
  }): {
    baseValue: number;
    finalValue: number;
    isTimeBonusApplied: boolean;
    isValid: boolean;
    validationError?: string;
    adjustedCode: string;
  } {
    const { baseCode, executionTimestamp, halfTimeMs, deductionCode, rotationsCount, edgeIndicator, qoeScore } = params;
    
    let elementDef = this.getElementDef(baseCode);
    if (!elementDef) {
      // Elemento desconocido o personalizado
      return {
        baseValue: 0,
        finalValue: 0,
        isTimeBonusApplied: false,
        isValid: false,
        validationError: `Elemento desconocido: ${baseCode}`,
        adjustedCode: baseCode
      };
    }

    let adjustedCode = baseCode;

    // VALIDACIÓN CRÍTICA DE TROMPOS (SPINS)
    if (elementDef.type === 'Spin') {
      const spinValidation = this.validateSpinRotations(rotationsCount);
      if (!spinValidation.isValid) {
        return {
          baseValue: elementDef.baseValue,
          finalValue: 0.00,
          isTimeBonusApplied: false,
          isValid: false,
          validationError: spinValidation.errorMessage,
          adjustedCode
        };
      }
    }

    let effectiveBaseValue = elementDef.baseValue;

    // APLICACIÓN DE REGLAS DE DEGRADACIÓN DE SALTOS (JUMPS)
    if (elementDef.type === 'Jump' && baseCode !== 'NJ') {
      const originalRotations = elementDef.rotations ? Math.floor(elementDef.rotations) : 1;

      if (deductionCode === '<<<') {
        // Downgraded: Recibe el valor de un salto con una rotación menos
        adjustedCode = this.getDowngradedJumpCode(baseCode);
        const downgradedDef = JUMP_DEFINITIONS[adjustedCode];
        effectiveBaseValue = downgradedDef ? downgradedDef.baseValue : effectiveBaseValue * 0.4;
      } else if (deductionCode === '<<') {
        // Half-rotated:
        // - Simples y Dobles: -50% (valor * 0.50)
        // - Triples: -40% (valor * 0.60)
        // - Quads: -30% (valor * 0.70)
        if (originalRotations <= 2) {
          effectiveBaseValue = effectiveBaseValue * 0.50;
        } else if (originalRotations === 3) {
          effectiveBaseValue = effectiveBaseValue * 0.60;
        } else {
          effectiveBaseValue = effectiveBaseValue * 0.70;
        }
      } else if (deductionCode === '<') {
        // Under-rotated:
        // - Simples y Dobles: -30% (valor * 0.70)
        // - Triples: -20% (valor * 0.80)
        // - Quads: -20% (valor * 0.80)
        if (originalRotations <= 2) {
          effectiveBaseValue = effectiveBaseValue * 0.70;
        } else {
          effectiveBaseValue = effectiveBaseValue * 0.80;
        }
      }

      // Deducción adicional por Borde Incorrecto 'e'
      if (edgeIndicator === 'e' || (elementDef.requiresEdge === 'Outside' && edgeIndicator === 'Inside')) {
        effectiveBaseValue = effectiveBaseValue * 0.80; // Penalización de filo
      }
    }

    // FACTOR DE TIEMPO (Bono 'T' del 10%)
    // Se otorga a saltos/elementos en la segunda mitad del programa
    const isTimeBonusApplied = executionTimestamp >= halfTimeMs && elementDef.type === 'Jump' && baseCode !== 'NJ';
    if (isTimeBonusApplied) {
      effectiveBaseValue = effectiveBaseValue * 1.10;
    }

    // QUALITY OF ELEMENT (QOE)
    // Rango de -3 a +3, cada punto de QOE añade o sustrae un porcentaje proporcional
    // QOE 0: 0% cambio. +1: +10%, +2: +20%, +3: +30%. -1: -10%, -2: -20%, -3: -30%
    const qoePercentage = (Math.max(-3, Math.min(3, qoeScore)) * 0.10);
    let finalValue = effectiveBaseValue * (1 + qoePercentage);

    // Asegurar 2 decimales y no negativo
    finalValue = Math.max(0, Math.round(finalValue * 100) / 100);
    const roundedBase = Math.round(effectiveBaseValue * 100) / 100;

    return {
      baseValue: roundedBase,
      finalValue,
      isTimeBonusApplied,
      isValid: true,
      adjustedCode
    };
  }

  /**
   * Convierte los sliders artísticos (-3 a +3) a puntuación decimal oficial RollArt
   * Escala: 0 a 10 con base centrada en 5.0 (un slider de 0 da 5.0, +3 da 9.5, -3 da 1.5)
   */
  public static calculatePCS(components: ArtisticComponents, categoryFactor: number = 1.0): {
    skatingSkillsScore: number;
    transitionsScore: number;
    performanceScore: number;
    choreographyScore: number;
    totalPCS: number;
  } {
    const mapSliderToScore = (sliderValue: number): number => {
      // sliderValue is -3 to +3
      const normalized = 5.0 + (sliderValue * 1.5);
      return Math.max(0.5, Math.min(10.0, Math.round(normalized * 100) / 100));
    };

    const ss = mapSliderToScore(components.skatingSkills);
    const tr = mapSliderToScore(components.transitions);
    const pe = mapSliderToScore(components.performance);
    const ch = mapSliderToScore(components.choreography);

    const rawTotal = (ss + tr + pe + ch);
    const totalPCS = Math.round((rawTotal * categoryFactor) * 100) / 100;

    return {
      skatingSkillsScore: ss,
      transitionsScore: tr,
      performanceScore: pe,
      choreographyScore: ch,
      totalPCS
    };
  }

  /**
   * Calcula el Total Segment Score (TSS)
   */
  public static calculateTotalSegmentScore(params: {
    elements: { final_value: number; is_valid: boolean; is_time_bonus_applied: boolean }[];
    artisticComponents: ArtisticComponents;
    categoryFactor?: number;
    penaltyDeductions?: number;
  }): ProgramScoreSummary {
    const { elements, artisticComponents, categoryFactor = 1.0, penaltyDeductions = 0 } = params;

    let tes = 0;
    let validElementsCount = 0;
    let bonusTCount = 0;

    for (const el of elements) {
      if (el.is_valid) {
        tes += el.final_value;
        validElementsCount++;
        if (el.is_time_bonus_applied) {
          bonusTCount++;
        }
      }
    }

    tes = Math.round(tes * 100) / 100;
    const pcsData = this.calculatePCS(artisticComponents, categoryFactor);
    const totalScore = Math.max(0, Math.round((tes + pcsData.totalPCS - penaltyDeductions) * 100) / 100);

    return {
      tes,
      pcs: pcsData.totalPCS,
      deductions: penaltyDeductions,
      totalScore,
      elementsCount: validElementsCount,
      bonusTAppliedCount: bonusTCount
    };
  }
}

