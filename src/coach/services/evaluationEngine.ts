/**
 * evaluationEngine.ts — Motor de Evaluación Técnica Reglamentaria (RollArt & FEP 2026)
 *
 * Implementa matemáticamente las reglas de World Skate y la FEP sin inventar escalas:
 *  - Degradaciones de rotación (<, <<, <<<)
 *  - Bono de tiempo (Factor "T" del 10%)
 *  - Penalizaciones de filo (e)
 *  - Validación de trompos (mínimo 3 rotaciones)
 *  - Calidad de ejecución (QOE -3 a +3)
 *  - Ponderación de componentes (PCS) con factores oficiales
 *  - Deducciones por caídas, tiempo, música y vestuario
 *  - Evaluación de Figuras Obligatorias (Sistema White 0 a 10)
 */

import {
  ROLLART_ALL_ELEMENTS_2026,
  ROLLART_JUMPS_2026,
  getRollArtPcsFactor,
} from '../../constants/regulations/rollartCatalog2026';
import {
  EvaluationElementRecord,
  EvaluationArtisticComponents,
  EvaluationFigureMarks,
  EvaluationDeductions,
  EvaluationScoreSummary,
  CoachEvaluation,
} from '../types';

export class EvaluationEngine {
  /**
   * Resuelve el código de un salto con degradación total '<<<' (una rotación menos).
   * Ejemplo: 3Lo <<< -> 2Lo; 2A <<< -> 1A.
   */
  public static getDowngradedJumpCode(code: string): string {
    if (code === 'NJ' || code === 'Waltz' || code === '1Eu') return code;
    const match = code.match(/^(\d)([A-Za-z]+)$/);
    if (!match) return code;

    const rot = parseInt(match[1], 10);
    const jumpType = match[2];

    if (rot > 1) {
      const lowerCode = `${rot - 1}${jumpType}`;
      if (ROLLART_JUMPS_2026[lowerCode]) {
        return lowerCode;
      }
    }
    return code;
  }

  /**
   * Calcula el puntaje de un elemento técnico individual bajo RollArt 2026
   */
  public static calculateElement(params: {
    code: string;
    executionTimestampMs: number;
    halfTimeMs: number;
    rotationsCount: number;
    deductionCode: '<' | '<<' | '<<<' | null;
    edgeIndicator: 'Outside' | 'Inside' | 'Flat' | 'e' | null;
    qoeScore: number; // -3 a +3
    customBaseValue?: number;
    customName?: string;
  }): EvaluationElementRecord {
    const {
      code,
      executionTimestampMs,
      halfTimeMs,
      rotationsCount,
      deductionCode,
      edgeIndicator,
      qoeScore,
      customBaseValue,
      customName,
    } = params;

    const def = ROLLART_ALL_ELEMENTS_2026[code];
    const baseValue = customBaseValue !== undefined ? customBaseValue : def?.baseValue ?? 0;
    const name = customName || def?.name || code;
    const type = def?.type || 'Jump';

    // 1. VALIDACIÓN ESTRICTA DE TROMPOS (SPINS)
    if (type === 'Spin' || type === 'DanceSpin') {
      const minRot = def?.minRotations ?? 3;
      if (rotationsCount < minRot) {
        return {
          id: `elem_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          code,
          name,
          type,
          baseValue,
          executionTimestampMs,
          rotationsCount,
          deductionCode,
          edgeIndicator,
          qoeScore: 0,
          isTimeBonusApplied: false,
          isValid: false,
          validationError: `Requiere mínimo ${minRot} rotaciones completas en posición (registradas: ${rotationsCount})`,
          finalValue: 0.0,
        };
      }
    }

    let effectiveBV = baseValue;
    let adjustedCode = code;

    // 2. DEGRADACIONES DE ROTACIÓN EN SALTOS
    if (type === 'Jump' && code !== 'NJ') {
      const originalRotations = def?.rotations ? Math.floor(def.rotations) : 1;

      if (deductionCode === '<<<') {
        // Downgraded: Recibe el valor base del salto con una rotación menos
        adjustedCode = this.getDowngradedJumpCode(code);
        const downgradedDef = ROLLART_JUMPS_2026[adjustedCode];
        effectiveBV = downgradedDef ? downgradedDef.baseValue : effectiveBV * 0.4;
      } else if (deductionCode === '<<') {
        // Half-rotated:
        // - Simples y Dobles: -50% (valor * 0.50)
        // - Triples: -40% (valor * 0.60)
        // - Quads: -30% (valor * 0.70)
        if (originalRotations <= 2) {
          effectiveBV *= 0.50;
        } else if (originalRotations === 3) {
          effectiveBV *= 0.60;
        } else {
          effectiveBV *= 0.70;
        }
      } else if (deductionCode === '<') {
        // Under-rotated:
        // - Simples y Dobles: -30% (valor * 0.70)
        // - Triples y Quads: -20% (valor * 0.80)
        if (originalRotations <= 2) {
          effectiveBV *= 0.70;
        } else {
          effectiveBV *= 0.80;
        }
      }

      // Penalización por Filo Incorrecto 'e'
      const hasEdgeError =
        edgeIndicator === 'e' ||
        (def?.requiresEdge === 'Outside' && edgeIndicator === 'Inside') ||
        (def?.requiresEdge === 'Inside' && edgeIndicator === 'Outside');

      if (hasEdgeError) {
        effectiveBV *= 0.80; // Reducción del 20%
      }
    }

    // 3. FACTOR DE TIEMPO (Bono 'T' del 10%)
    const isTimeBonusApplied =
      halfTimeMs > 0 &&
      executionTimestampMs >= halfTimeMs &&
      type === 'Jump' &&
      code !== 'NJ';

    if (isTimeBonusApplied) {
      effectiveBV *= 1.10;
    }

    // 4. QUALITY OF ELEMENT (QOE: -3 a +3)
    const clampedQOE = Math.max(-3, Math.min(3, qoeScore));
    const qoeFactor = clampedQOE * 0.10; // Cada nivel añade o sustrae 10%
    let finalValue = effectiveBV * (1 + qoeFactor);

    finalValue = Math.max(0, Math.round(finalValue * 100) / 100);
    const roundedEffectiveBV = Math.round(effectiveBV * 100) / 100;

    return {
      id: `elem_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      code: adjustedCode,
      name,
      type,
      baseValue: roundedEffectiveBV,
      executionTimestampMs,
      rotationsCount,
      deductionCode,
      edgeIndicator,
      qoeScore: clampedQOE,
      isTimeBonusApplied,
      isValid: true,
      finalValue,
    };
  }

  /**
   * Calcula el puntaje de Componentes Artísticos (PCS)
   */
  public static calculatePCS(
    components: {
      skatingSkills: number;
      transitions: number;
      performance: number;
      choreography: number;
    },
    category: string,
    isShortProgram: boolean = false
  ): EvaluationArtisticComponents {
    const clampMark = (v: number) => Math.max(0.25, Math.min(10.0, Math.round(v * 4) / 4)); // Malla de 0.25

    const ss = clampMark(components.skatingSkills || 5.0);
    const tr = clampMark(components.transitions || 5.0);
    const pe = clampMark(components.performance || 5.0);
    const ch = clampMark(components.choreography || 5.0);

    const factor = getRollArtPcsFactor(category, isShortProgram);
    const rawSum = ss + tr + pe + ch;
    const totalPcs = Math.round(rawSum * factor * 100) / 100;

    return {
      skatingSkills: ss,
      transitions: tr,
      performance: pe,
      choreography: ch,
      factor,
      totalPcs,
    };
  }

  /**
   * Calcula el puntaje de Figuras Obligatorias (Sistema White 0 a 10)
   */
  public static calculateWhiteFigures(
    marks: { tracing: number; movement: number; carriage: number },
    deductions: number = 0
  ): { marks: EvaluationFigureMarks; totalScore: number } {
    const clampMark = (v: number) => Math.max(0, Math.min(10.0, Math.round(v * 4) / 4));

    const tr = clampMark(marks.tracing);
    const mv = clampMark(marks.movement);
    const cr = clampMark(marks.carriage);

    const average = Math.round(((tr + mv + cr) / 3) * 100) / 100;
    const totalScore = Math.max(0, Math.round((average - deductions) * 100) / 100);

    return {
      marks: {
        tracing: tr,
        movement: mv,
        carriage: cr,
        average,
      },
      totalScore,
    };
  }

  /**
   * Calcula el Total Segment Score (TSS) oficial
   */
  public static calculateTotalSegmentScore(params: {
    elements: EvaluationElementRecord[];
    artisticComponents?: EvaluationArtisticComponents;
    figureMarks?: EvaluationFigureMarks;
    deductions: EvaluationDeductions;
  }): EvaluationScoreSummary {
    const { elements, artisticComponents, figureMarks, deductions } = params;

    let tes = 0;
    let validElementsCount = 0;
    let bonusTCount = 0;

    for (const el of elements) {
      if (el.isValid) {
        tes += el.finalValue;
        validElementsCount++;
        if (el.isTimeBonusApplied) {
          bonusTCount++;
        }
      }
    }
    tes = Math.round(tes * 100) / 100;

    const pcs = artisticComponents?.totalPcs ?? figureMarks?.average ?? 0;
    const totalDeductions = Math.round(deductions.totalDeductions * 100) / 100;
    const totalScore = Math.max(0, Math.round((tes + pcs - totalDeductions) * 100) / 100);

    return {
      tes,
      pcs,
      deductions: totalDeductions,
      totalScore,
      elementsCount: validElementsCount,
      bonusTCount,
    };
  }

  /**
   * Compara dos evaluaciones de la misma atleta para análisis de evolución
   */
  public static compareEvaluations(prev: CoachEvaluation, current: CoachEvaluation) {
    const diffTotal = Math.round((current.scoresSummary.totalScore - prev.scoresSummary.totalScore) * 100) / 100;
    const diffTes = Math.round((current.scoresSummary.tes - prev.scoresSummary.tes) * 100) / 100;
    const diffPcs = Math.round((current.scoresSummary.pcs - prev.scoresSummary.pcs) * 100) / 100;
    const diffDeductions = Math.round((current.scoresSummary.deductions - prev.scoresSummary.deductions) * 100) / 100;

    // Comparación de componentes artísticos
    const pcsDiff = current.artisticComponents && prev.artisticComponents
      ? {
          skatingSkills: current.artisticComponents.skatingSkills - prev.artisticComponents.skatingSkills,
          transitions: current.artisticComponents.transitions - prev.artisticComponents.transitions,
          performance: current.artisticComponents.performance - prev.artisticComponents.performance,
          choreography: current.artisticComponents.choreography - prev.artisticComponents.choreography,
        }
      : null;

    return {
      diffTotal,
      diffTes,
      diffPcs,
      diffDeductions,
      pcsDiff,
      improved: diffTotal > 0,
      prevDate: prev.date,
      currentDate: current.date,
    };
  }
}
