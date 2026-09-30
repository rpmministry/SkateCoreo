/**
 * figuresWhiteCatalog2026.ts — Reglamento Oficial de Figuras Obligatorias (Sistema White 2026)
 *
 * Fuente: World Skate Artistic Technical Commission — Compulsory Figures Regulations
 * y Federación Ecuatoriana de Patinaje (FEP).
 *
 * En Figuras Obligatorias NO se utiliza RollArt; el sistema oficial vigente es el
 * Sistema White sobre una escala canónica de 0.0 a 10.0 en incrementos de 0.25.
 */

export interface FigureEvaluationCriteria {
  id: 'tracing' | 'movement' | 'carriage';
  name: string;
  nameEn: string;
  description: string;
  maxScore: 10.0;
  minScore: 0.0;
  step: 0.25;
}

export const WHITE_FIGURE_CRITERIA: FigureEvaluationCriteria[] = [
  {
    id: 'tracing',
    name: 'Trazado y Filo',
    nameEn: 'Tracing & Edge',
    description: 'Adherencia estricta del patín a la línea trazada, pureza de bordes interiores/exteriores y ausencia de planos (flats).',
    maxScore: 10.0,
    minScore: 0.0,
    step: 0.25,
  },
  {
    id: 'movement',
    name: 'Movimiento y Ritmo',
    nameEn: 'Movement & Pace',
    description: 'Cadencia, continuidad, velocidad controlada y ritmo del desplazamiento sin brusquedad ni vacilaciones.',
    maxScore: 10.0,
    minScore: 0.0,
    step: 0.25,
  },
  {
    id: 'carriage',
    name: 'Porte y Posición Corporal',
    nameEn: 'Carriage & Body Posture',
    description: 'Alineación de columna, cabeza erguida, extensión suave de brazos y control anatómico de la pierna libre.',
    maxScore: 10.0,
    minScore: 0.0,
    step: 0.25,
  },
];

export const WHITE_FIGURE_DEDUCTIONS = {
  FALL_OR_STOP: 1.0,           // Caída o detención completa en el trazado
  INCORRECT_TURN: 1.0,         // Giro deformado o mal ejecutado (Three, Bracket, Rocker, Loop)
  FREE_FOOT_TOUCH_MAJOR: 1.0,  // Apoyo de pie libre en zona crítica (despegue o giro)
  FREE_FOOT_TOUCH_MINOR: 0.5,  // Apoyo o raspón leve de pie libre en arco menor
  DRESS_CODE_VIOLATION: 1.0,   // Incumplimiento de vestuario reglamentario
};
