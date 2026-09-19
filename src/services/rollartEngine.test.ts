import { RollArtEngine } from './rollartEngine';

export function runRollArtTests() {
  const results: { test: string; passed: boolean; details?: string }[] = [];

  // Helper assert
  const assert = (name: string, condition: boolean, details?: string) => {
    results.push({ test: name, passed: condition, details });
    if (!condition) {
      console.error(`❌ FAILED: ${name}`, details);
    } else {
      console.log(`✅ PASSED: ${name}`);
    }
  };

  // Test 1: Under-rotated '<'
  // 1Lo baseValue: 0.50 -> -30% = 0.35
  const res1LoUnder = RollArtEngine.calculateElementScore({
    baseCode: '1Lo',
    executionTimestamp: 10000,
    halfTimeMs: 60000,
    deductionCode: '<',
    rotationsCount: 1,
    edgeIndicator: null,
    qoeScore: 0
  });
  assert(
    'Salto simple con deducción < (-30%): 1Lo base=0.50 -> 0.35',
    res1LoUnder.finalValue === 0.35,
    `Obtenido: ${res1LoUnder.finalValue}`
  );

  // 3Lo baseValue: 4.90 -> -20% = 3.92
  const res3LoUnder = RollArtEngine.calculateElementScore({
    baseCode: '3Lo',
    executionTimestamp: 10000,
    halfTimeMs: 60000,
    deductionCode: '<',
    rotationsCount: 3,
    edgeIndicator: null,
    qoeScore: 0
  });
  assert(
    'Salto triple con deducción < (-20%): 3Lo base=4.90 -> 3.92',
    res3LoUnder.finalValue === 3.92,
    `Obtenido: ${res3LoUnder.finalValue}`
  );

  // Test 2: Half-rotated '<<'
  // 2T baseValue: 1.30 -> -50% = 0.65
  const res2THalf = RollArtEngine.calculateElementScore({
    baseCode: '2T',
    executionTimestamp: 10000,
    halfTimeMs: 60000,
    deductionCode: '<<',
    rotationsCount: 2,
    edgeIndicator: null,
    qoeScore: 0
  });
  assert(
    'Salto doble con deducción << (-50%): 2T base=1.30 -> 0.65',
    res2THalf.finalValue === 0.65,
    `Obtenido: ${res2THalf.finalValue}`
  );

  // 3T baseValue: 4.20 -> -40% = 2.52
  const res3THalf = RollArtEngine.calculateElementScore({
    baseCode: '3T',
    executionTimestamp: 10000,
    halfTimeMs: 60000,
    deductionCode: '<<',
    rotationsCount: 3,
    edgeIndicator: null,
    qoeScore: 0
  });
  assert(
    'Salto triple con deducción << (-40%): 3T base=4.20 -> 2.52',
    res3THalf.finalValue === 2.52,
    `Obtenido: ${res3THalf.finalValue}`
  );

  // Test 3: Downgraded '<<<' (receives value of 1 rotation less)
  // 3Lo <<< should receive 2Lo base value (1.70)
  const res3LoDown = RollArtEngine.calculateElementScore({
    baseCode: '3Lo',
    executionTimestamp: 10000,
    halfTimeMs: 60000,
    deductionCode: '<<<',
    rotationsCount: 3,
    edgeIndicator: null,
    qoeScore: 0
  });
  assert(
    'Salto triple degradado <<< (3Lo <<< recibe valor de 2Lo = 1.70)',
    res3LoDown.finalValue === 1.70 && res3LoDown.adjustedCode === '2Lo',
    `Obtenido valor: ${res3LoDown.finalValue}, código ajustado: ${res3LoDown.adjustedCode}`
  );

  // Test 4: Spin strict validation (minimum 3 rotations)
  const resSpin2Rot = RollArtEngine.calculateElementScore({
    baseCode: 'SSp1',
    executionTimestamp: 10000,
    halfTimeMs: 60000,
    deductionCode: null,
    rotationsCount: 2,
    edgeIndicator: null,
    qoeScore: 0
  });
  assert(
    'Trompo con 2 vueltas bloqueado con error requerido por PRD',
    !resSpin2Rot.isValid && resSpin2Rot.validationError === 'Requiere 3 vueltas completas para validación' && resSpin2Rot.finalValue === 0,
    `isValid: ${resSpin2Rot.isValid}, error: ${resSpin2Rot.validationError}`
  );

  // Test 5: Spin with 3 rotations -> Valid
  const resSpin3Rot = RollArtEngine.calculateElementScore({
    baseCode: 'SSp1',
    executionTimestamp: 10000,
    halfTimeMs: 60000,
    deductionCode: null,
    rotationsCount: 3,
    edgeIndicator: null,
    qoeScore: 0
  });
  assert(
    'Trompo con 3 vueltas es validado correctamente con valor base',
    resSpin3Rot.isValid && resSpin3Rot.finalValue === 1.70,
    `isValid: ${resSpin3Rot.isValid}, valor: ${resSpin3Rot.finalValue}`
  );

  // Test 6: Time Bonus Factor "T" (10% in second half)
  const resBonusT = RollArtEngine.calculateElementScore({
    baseCode: '3Lz',
    executionTimestamp: 130000, // > 120000 half-time
    halfTimeMs: 120000,
    deductionCode: null,
    rotationsCount: 3,
    edgeIndicator: 'Outside',
    qoeScore: 0
  });
  // 3Lz baseValue: 5.90 -> +10% = 6.49
  assert(
    'Factor T automático (+10%) tras la mitad del programa: 3Lz base=5.90 -> 6.49',
    resBonusT.isTimeBonusApplied && resBonusT.finalValue === 6.49,
    `isBonus: ${resBonusT.isTimeBonusApplied}, valor: ${resBonusT.finalValue}`
  );

  // Test 7: No Jump (NJ) connector
  const resNJ = RollArtEngine.calculateElementScore({
    baseCode: 'NJ',
    executionTimestamp: 50000,
    halfTimeMs: 120000,
    deductionCode: null,
    rotationsCount: 1,
    edgeIndicator: null,
    qoeScore: 0
  });
  assert(
    'No Jump (NJ) tiene valor base 0.00 como conector reglamentario',
    resNJ.baseValue === 0 && resNJ.finalValue === 0,
    `Valor: ${resNJ.finalValue}`
  );

  // Test 8: Total Segment Score Calculation (TES + PCS)
  const summary = RollArtEngine.calculateTotalSegmentScore({
    elements: [
      { final_value: 6.49, is_valid: true, is_time_bonus_applied: true },
      { final_value: 1.70, is_valid: true, is_time_bonus_applied: false }
    ],
    artisticComponents: {
      skatingSkills: 1, // 6.5
      transitions: 1,  // 6.5
      performance: 1,  // 6.5
      choreography: 1  // 6.5
    },
    categoryFactor: 1.0,
    penaltyDeductions: 0
  });
  // TES = 8.19, PCS = 26.00, TSS = 34.19
  assert(
    'Cálculo de Total Segment Score (TSS = TES + PCS): 8.19 + 26.00 = 34.19',
    summary.tes === 8.19 && summary.pcs === 26.00 && summary.totalScore === 34.19,
    `TES: ${summary.tes}, PCS: ${summary.pcs}, Total: ${summary.totalScore}`
  );

  return results;
}

// Auto-run if executed directly via Node
if (typeof process !== 'undefined' && process.argv && process.argv[1]?.includes('rollartEngine.test')) {
  console.log('--- EJECUTANDO PRUEBAS DEL MOTOR ROLLART ---');
  const res = runRollArtTests();
  const allPassed = res.every(r => r.passed);
  console.log(`\nResultado: ${res.filter(r => r.passed).length}/${res.length} pruebas pasadas.`);
  if (!allPassed) {
    process.exit(1);
  }
}
