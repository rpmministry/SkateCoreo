/**
 * rollartCatalog2026.ts — Catálogo Oficial de Elementos Técnicos y Factores RollArt 2026
 *
 * Fuente: World Skate Artistic Technical Commission — Regulations & Value Tables 2026.
 * Incluye valores base (BV), niveles, requisitos de rotaciones mínimas,
 * factores de componentes artísticos (PCS) por categoría y deducciones estándar.
 */

export interface RollArtElementDefinition {
  code: string;
  name: string;
  discipline: 'Libre' | 'Solo Danza' | 'Parejas' | 'Show';
  type: 'Jump' | 'Spin' | 'StepSequence' | 'Choreographic' | 'DanceFootwork' | 'Travelling' | 'DanceSpin' | 'NJ';
  baseValue: number;
  rotations?: number;
  level?: string;
  minRotations?: number; // Requiere min 3 rotaciones completas en trompos
  requiresEdge?: 'Outside' | 'Inside';
  description?: string;
}

// ── 1. SALTOS OFICIALES (WORLD SKATE 2026) ──────────────────────────────────
export const ROLLART_JUMPS_2026: Record<string, RollArtElementDefinition> = {
  // Axel
  '1A': { code: '1A', name: 'Single Axel', discipline: 'Libre', type: 'Jump', rotations: 1.5, baseValue: 1.10, description: 'Salto con entrada hacia adelante de 1.5 rotaciones' },
  '2A': { code: '2A', name: 'Double Axel', discipline: 'Libre', type: 'Jump', rotations: 2.5, baseValue: 3.30, description: 'Salto hacia adelante de 2.5 rotaciones (Obligatorio FEP Junior/Senior)' },
  '3A': { code: '3A', name: 'Triple Axel', discipline: 'Libre', type: 'Jump', rotations: 3.5, baseValue: 8.00, description: 'Salto hacia adelante de 3.5 rotaciones' },

  // Toe Loop
  '1T': { code: '1T', name: 'Single Toe Loop', discipline: 'Libre', type: 'Jump', rotations: 1, baseValue: 0.40 },
  '2T': { code: '2T', name: 'Double Toe Loop', discipline: 'Libre', type: 'Jump', rotations: 2, baseValue: 1.30 },
  '3T': { code: '3T', name: 'Triple Toe Loop', discipline: 'Libre', type: 'Jump', rotations: 3, baseValue: 4.20 },
  '4T': { code: '4T', name: 'Quad Toe Loop', discipline: 'Libre', type: 'Jump', rotations: 4, baseValue: 9.50 },

  // Salchow
  '1S': { code: '1S', name: 'Single Salchow', discipline: 'Libre', type: 'Jump', rotations: 1, baseValue: 0.40 },
  '2S': { code: '2S', name: 'Double Salchow', discipline: 'Libre', type: 'Jump', rotations: 2, baseValue: 1.30 },
  '3S': { code: '3S', name: 'Triple Salchow', discipline: 'Libre', type: 'Jump', rotations: 3, baseValue: 4.20 },
  '4S': { code: '4S', name: 'Quad Salchow', discipline: 'Libre', type: 'Jump', rotations: 4, baseValue: 9.70 },

  // Loop (Rittberger)
  '1Lo': { code: '1Lo', name: 'Single Loop', discipline: 'Libre', type: 'Jump', rotations: 1, baseValue: 0.50 },
  '2Lo': { code: '2Lo', name: 'Double Loop', discipline: 'Libre', type: 'Jump', rotations: 2, baseValue: 1.70 },
  '3Lo': { code: '3Lo', name: 'Triple Loop', discipline: 'Libre', type: 'Jump', rotations: 3, baseValue: 4.90 },
  '4Lo': { code: '4Lo', name: 'Quad Loop', discipline: 'Libre', type: 'Jump', rotations: 4, baseValue: 10.50 },

  // Flip
  '1F': { code: '1F', name: 'Single Flip', discipline: 'Libre', type: 'Jump', rotations: 1, baseValue: 0.60, requiresEdge: 'Inside' },
  '2F': { code: '2F', name: 'Double Flip', discipline: 'Libre', type: 'Jump', rotations: 2, baseValue: 2.00, requiresEdge: 'Inside' },
  '3F': { code: '3F', name: 'Triple Flip', discipline: 'Libre', type: 'Jump', rotations: 3, baseValue: 5.30, requiresEdge: 'Inside' },
  '4F': { code: '4F', name: 'Quad Flip', discipline: 'Libre', type: 'Jump', rotations: 4, baseValue: 11.00, requiresEdge: 'Inside' },

  // Lutz
  '1Lz': { code: '1Lz', name: 'Single Lutz', discipline: 'Libre', type: 'Jump', rotations: 1, baseValue: 0.60, requiresEdge: 'Outside' },
  '2Lz': { code: '2Lz', name: 'Double Lutz', discipline: 'Libre', type: 'Jump', rotations: 2, baseValue: 2.10, requiresEdge: 'Outside' },
  '3Lz': { code: '3Lz', name: 'Triple Lutz', discipline: 'Libre', type: 'Jump', rotations: 3, baseValue: 5.90, requiresEdge: 'Outside' },
  '4Lz': { code: '4Lz', name: 'Quad Lutz', discipline: 'Libre', type: 'Jump', rotations: 4, baseValue: 11.50, requiresEdge: 'Outside' },

  // Conectores y saltos de transición
  '1Eu': { code: '1Eu', name: 'Euler (Half Loop conector)', discipline: 'Libre', type: 'Jump', rotations: 1, baseValue: 0.50 },
  'Waltz': { code: 'Waltz', name: 'Waltz Jump (Salto Inglés)', discipline: 'Libre', type: 'Jump', rotations: 0.5, baseValue: 0.20 },
  'NJ': { code: 'NJ', name: 'No Jump (Conector en combinaciones)', discipline: 'Libre', type: 'NJ', rotations: 0, baseValue: 0.00 },
};

// ── 2. TROMPOS / SPINS OFICIALES (WORLD SKATE 2026) ─────────────────────────
export const ROLLART_SPINS_2026: Record<string, RollArtElementDefinition> = {
  // Upright Spin
  'USpB': { code: 'USpB', name: 'Upright Spin Base', discipline: 'Libre', type: 'Spin', level: 'B', baseValue: 1.00, minRotations: 3 },
  'USp1': { code: 'USp1', name: 'Upright Spin Nivel 1', discipline: 'Libre', type: 'Spin', level: '1', baseValue: 1.40, minRotations: 3 },
  'USp2': { code: 'USp2', name: 'Upright Spin Nivel 2', discipline: 'Libre', type: 'Spin', level: '2', baseValue: 1.80, minRotations: 3 },
  'USp3': { code: 'USp3', name: 'Upright Spin Nivel 3', discipline: 'Libre', type: 'Spin', level: '3', baseValue: 2.20, minRotations: 3 },

  // Sit Spin
  'SSpB': { code: 'SSpB', name: 'Sit Spin Base', discipline: 'Libre', type: 'Spin', level: 'B', baseValue: 1.20, minRotations: 3 },
  'SSp1': { code: 'SSp1', name: 'Sit Spin Nivel 1', discipline: 'Libre', type: 'Spin', level: '1', baseValue: 1.70, minRotations: 3 },
  'SSp2': { code: 'SSp2', name: 'Sit Spin Nivel 2', discipline: 'Libre', type: 'Spin', level: '2', baseValue: 2.30, minRotations: 3 },
  'SSp3': { code: 'SSp3', name: 'Sit Spin Nivel 3', discipline: 'Libre', type: 'Spin', level: '3', baseValue: 2.90, minRotations: 3 },

  // Camel Spin
  'CSpB': { code: 'CSpB', name: 'Camel Spin Base', discipline: 'Libre', type: 'Spin', level: 'B', baseValue: 1.40, minRotations: 3 },
  'CSp1': { code: 'CSp1', name: 'Camel Spin Nivel 1', discipline: 'Libre', type: 'Spin', level: '1', baseValue: 2.00, minRotations: 3 },
  'CSp2': { code: 'CSp2', name: 'Camel Spin Nivel 2', discipline: 'Libre', type: 'Spin', level: '2', baseValue: 2.60, minRotations: 3 },
  'CSp3': { code: 'CSp3', name: 'Camel Spin Nivel 3', discipline: 'Libre', type: 'Spin', level: '3', baseValue: 3.30, minRotations: 3 },

  // Heel Spin
  'HSp1': { code: 'HSp1', name: 'Heel Spin Nivel 1 (Trompo de Talón)', discipline: 'Libre', type: 'Spin', level: '1', baseValue: 2.40, minRotations: 3 },
  'HSp2': { code: 'HSp2', name: 'Heel Spin Nivel 2 (Trompo de Talón)', discipline: 'Libre', type: 'Spin', level: '2', baseValue: 3.20, minRotations: 3 },
  'HSp3': { code: 'HSp3', name: 'Heel Spin Nivel 3 (Trompo de Talón)', discipline: 'Libre', type: 'Spin', level: '3', baseValue: 4.00, minRotations: 3 },

  // Broken Ankle Spin
  'BSp1': { code: 'BSp1', name: 'Broken Ankle Spin Nivel 1', discipline: 'Libre', type: 'Spin', level: '1', baseValue: 2.20, minRotations: 3 },
  'BSp2': { code: 'BSp2', name: 'Broken Ankle Spin Nivel 2', discipline: 'Libre', type: 'Spin', level: '2', baseValue: 3.00, minRotations: 3 },
  'BSp3': { code: 'BSp3', name: 'Broken Ankle Spin Nivel 3', discipline: 'Libre', type: 'Spin', level: '3', baseValue: 3.70, minRotations: 3 },

  // Inverted Spin
  'ISp1': { code: 'ISp1', name: 'Inverted Spin Nivel 1', discipline: 'Libre', type: 'Spin', level: '1', baseValue: 3.00, minRotations: 3 },
  'ISp2': { code: 'ISp2', name: 'Inverted Spin Nivel 2', discipline: 'Libre', type: 'Spin', level: '2', baseValue: 3.80, minRotations: 3 },
  'ISp3': { code: 'ISp3', name: 'Inverted Spin Nivel 3', discipline: 'Libre', type: 'Spin', level: '3', baseValue: 4.60, minRotations: 3 },

  // Combinaciones de Trompos
  'NLCombSp': { code: 'NLCombSp', name: 'Combination Spin No Level', discipline: 'Libre', type: 'Spin', level: 'B', baseValue: 2.00, minRotations: 3 },
  'CombSp1': { code: 'CombSp1', name: 'Combination Spin Nivel 1', discipline: 'Libre', type: 'Spin', level: '1', baseValue: 3.20, minRotations: 3 },
  'CombSp2': { code: 'CombSp2', name: 'Combination Spin Nivel 2', discipline: 'Libre', type: 'Spin', level: '2', baseValue: 4.40, minRotations: 3 },
  'CombSp3': { code: 'CombSp3', name: 'Combination Spin Nivel 3', discipline: 'Libre', type: 'Spin', level: '3', baseValue: 5.60, minRotations: 3 },
};

// ── 3. PASOS Y COREOGRAFÍAS (WORLD SKATE 2026) ──────────────────────────────
export const ROLLART_STEPS_2026: Record<string, RollArtElementDefinition> = {
  'StSqB': { code: 'StSqB', name: 'Step Sequence Base', discipline: 'Libre', type: 'StepSequence', level: 'B', baseValue: 1.50 },
  'StSq1': { code: 'StSq1', name: 'Step Sequence Nivel 1', discipline: 'Libre', type: 'StepSequence', level: '1', baseValue: 2.40 },
  'StSq2': { code: 'StSq2', name: 'Step Sequence Nivel 2', discipline: 'Libre', type: 'StepSequence', level: '2', baseValue: 3.30 },
  'StSq3': { code: 'StSq3', name: 'Step Sequence Nivel 3', discipline: 'Libre', type: 'StepSequence', level: '3', baseValue: 4.20 },
  'ChSq1': { code: 'ChSq1', name: 'Choreographic Sequence', discipline: 'Libre', type: 'Choreographic', level: '1', baseValue: 2.00 },
};

// ── 4. ELEMENTOS DE SOLO DANZA (WORLD SKATE 2026) ────────────────────────────
export const ROLLART_DANCE_2026: Record<string, RollArtElementDefinition> = {
  // Travelling Sequences
  'TrSqB': { code: 'TrSqB', name: 'Travelling Sequence Base', discipline: 'Solo Danza', type: 'Travelling', level: 'B', baseValue: 1.80 },
  'TrSq1': { code: 'TrSq1', name: 'Travelling Sequence Nivel 1', discipline: 'Solo Danza', type: 'Travelling', level: '1', baseValue: 2.80 },
  'TrSq2': { code: 'TrSq2', name: 'Travelling Sequence Nivel 2', discipline: 'Solo Danza', type: 'Travelling', level: '2', baseValue: 3.80 },
  'TrSq3': { code: 'TrSq3', name: 'Travelling Sequence Nivel 3', discipline: 'Solo Danza', type: 'Travelling', level: '3', baseValue: 4.80 },

  // Dance Footwork Sequence
  'DStSqB': { code: 'DStSqB', name: 'Dance Step Sequence Base', discipline: 'Solo Danza', type: 'DanceFootwork', level: 'B', baseValue: 2.00 },
  'DStSq1': { code: 'DStSq1', name: 'Dance Step Sequence Nivel 1', discipline: 'Solo Danza', type: 'DanceFootwork', level: '1', baseValue: 3.10 },
  'DStSq2': { code: 'DStSq2', name: 'Dance Step Sequence Nivel 2', discipline: 'Solo Danza', type: 'DanceFootwork', level: '2', baseValue: 4.20 },
  'DStSq3': { code: 'DStSq3', name: 'Dance Step Sequence Nivel 3', discipline: 'Solo Danza', type: 'DanceFootwork', level: '3', baseValue: 5.30 },

  // Solo Dance Spins
  'DSpB': { code: 'DSpB', name: 'Solo Dance Spin Base', discipline: 'Solo Danza', type: 'DanceSpin', level: 'B', baseValue: 1.60, minRotations: 3 },
  'DSp1': { code: 'DSp1', name: 'Solo Dance Spin Nivel 1', discipline: 'Solo Danza', type: 'DanceSpin', level: '1', baseValue: 2.50, minRotations: 3 },
  'DSp2': { code: 'DSp2', name: 'Solo Dance Spin Nivel 2', discipline: 'Solo Danza', type: 'DanceSpin', level: '2', baseValue: 3.40, minRotations: 3 },

  // Danzas obligatorias reconocidas
  'CT_R3': { code: 'CT_R3', name: 'Carlos Tango - R3 Tap Down', discipline: 'Solo Danza', type: 'DanceFootwork', baseValue: 2.50 },
};

// ── CATÁLOGO UNIFICADO ───────────────────────────────────────────────────────
export const ROLLART_ALL_ELEMENTS_2026: Record<string, RollArtElementDefinition> = {
  ...ROLLART_JUMPS_2026,
  ...ROLLART_SPINS_2026,
  ...ROLLART_STEPS_2026,
  ...ROLLART_DANCE_2026,
};

// ── FACTORES DE COMPONENTES DEL PROGRAMA (PCS) 2026 ──────────────────────────
export const ROLLART_PCS_FACTORS_2026: Record<string, { shortProgram: number; longProgram: number }> = {
  'TOTS': { shortProgram: 0.8, longProgram: 0.8 },
  'MINIS': { shortProgram: 0.8, longProgram: 0.9 },
  'ESPOIR': { shortProgram: 0.8, longProgram: 1.0 },
  'CADET': { shortProgram: 0.8, longProgram: 1.0 },
  'YOUTH': { shortProgram: 0.9, longProgram: 1.1 },
  'JUNIOR': { shortProgram: 1.0, longProgram: 1.2 },
  'SENIOR': { shortProgram: 1.0, longProgram: 1.3 },
  // Mapeo normalizado mayúsculas
  'TOT': { shortProgram: 0.8, longProgram: 0.8 },
  'MINI': { shortProgram: 0.8, longProgram: 0.9 },
  'MAYOR': { shortProgram: 1.0, longProgram: 1.3 },
};

export const getRollArtPcsFactor = (category: string, isShortProgram: boolean = false): number => {
  const norm = category.toUpperCase().trim();
  const found = ROLLART_PCS_FACTORS_2026[norm];
  if (!found) return 1.0;
  return isShortProgram ? found.shortProgram : found.longProgram;
};

// ── DEDUCCIONES OFICIALES WORLD SKATE ROLLART 2026 ───────────────────────────
export const ROLLART_STANDARD_DEDUCTIONS = {
  FALL_SENIOR_JUNIOR_CADET: 1.0, // Caída en Junior, Senior, Youth, Cadete
  FALL_ESPOIR_MINIS_TOTS: 0.5,   // Caída en Espoir, Minis, Tots
  FALL_SOLO_DANCE: 0.5,          // Caída en Solo Danza
  TIME_VIOLATION_PER_10S: 0.5,   // Cada 10s fuera del margen reglamentario
  LATE_START_MUSIC: 0.5,         // Inicio con más de 10s tras sonar música
  COSTUME_ACCESSORY_DROP: 1.0,   // Caída de accesorio o vestuario antirreglamentario
  MUSIC_LYRICS_VIOLATION: 1.0,   // Letra con lenguaje explícito o inapropiado
  ILLEGAL_ELEMENT: 1.0,          // Elemento prohibido según reglamento
};
