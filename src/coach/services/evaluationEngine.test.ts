import assert from 'node:assert';
import { EvaluationEngine } from './evaluationEngine';

console.log('Testing EvaluationEngine (RollArt & FEP 2026)...');

// 1. Degradación <<<
const downgraded = EvaluationEngine.calculateElement({
  code: '3Lo',
  executionTimestampMs: 10000,
  halfTimeMs: 60000,
  rotationsCount: 2,
  deductionCode: '<<<',
  edgeIndicator: null,
  qoeScore: 0,
});
assert.strictEqual(downgraded.code, '2Lo');
assert.strictEqual(downgraded.baseValue, 1.70); // 2Lo BV
assert.strictEqual(downgraded.finalValue, 1.70);
console.log('✔ Downgrade <<< correctly converted 3Lo to 2Lo BV (1.70)');

// 2. Under-rotated < en salto doble
const underRotated = EvaluationEngine.calculateElement({
  code: '2S', // BV = 1.30
  executionTimestampMs: 10000,
  halfTimeMs: 60000,
  rotationsCount: 2,
  deductionCode: '<',
  edgeIndicator: null,
  qoeScore: 0,
});
// 1.30 * 0.70 = 0.91
assert.strictEqual(underRotated.finalValue, 0.91);
console.log('✔ Under-rotated < applied 30% reduction on 2S');

// 3. Validación de trompos (< 3 vueltas -> inválido)
const invalidSpin = EvaluationEngine.calculateElement({
  code: 'USp1', // BV = 1.40
  executionTimestampMs: 30000,
  halfTimeMs: 60000,
  rotationsCount: 2, // Menos de 3
  deductionCode: null,
  edgeIndicator: null,
  qoeScore: 1,
});
assert.strictEqual(invalidSpin.isValid, false);
assert.strictEqual(invalidSpin.finalValue, 0);
assert.ok(invalidSpin.validationError?.includes('Requiere mínimo 3'));
console.log('✔ Spin with 2 rotations rejected with 0 points');

// 4. Trompo válido con QOE +2
const validSpin = EvaluationEngine.calculateElement({
  code: 'USp1', // BV = 1.40
  executionTimestampMs: 30000,
  halfTimeMs: 60000,
  rotationsCount: 3,
  deductionCode: null,
  edgeIndicator: null,
  qoeScore: 2, // +20% -> 1.40 * 1.20 = 1.68
});
assert.strictEqual(validSpin.isValid, true);
assert.strictEqual(validSpin.finalValue, 1.68);
console.log('✔ Valid spin with QOE +2 awarded 1.68 points');

// 5. Bono de tiempo "T" (+10% en 2da mitad)
const timeBonusJump = EvaluationEngine.calculateElement({
  code: '2A', // BV = 3.30
  executionTimestampMs: 70000, // Mayor que halfTimeMs (60000)
  halfTimeMs: 60000,
  rotationsCount: 2.5,
  deductionCode: null,
  edgeIndicator: null,
  qoeScore: 0,
});
// 3.30 * 1.10 = 3.63
assert.strictEqual(timeBonusJump.isTimeBonusApplied, true);
assert.strictEqual(timeBonusJump.finalValue, 3.63);
console.log('✔ Time bonus factor T (+10%) applied in second half');

// 6. Filo incorrecto 'e' en Lutz
const flutz = EvaluationEngine.calculateElement({
  code: '2Lz', // BV = 2.10
  executionTimestampMs: 20000,
  halfTimeMs: 60000,
  rotationsCount: 2,
  deductionCode: null,
  edgeIndicator: 'Inside', // Error de filo en Lutz
  qoeScore: 0,
});
// 2.10 * 0.80 = 1.68
assert.strictEqual(flutz.finalValue, 1.68);
console.log('✔ Edge error on Lutz correctly penalized by 20%');

// 7. Componentes del Programa (PCS)
const pcs = EvaluationEngine.calculatePCS(
  {
    skatingSkills: 6.5,
    transitions: 6.0,
    performance: 7.0,
    choreography: 6.5,
  },
  'CADET',
  false // Programa largo
);
// Sum = 26.0 * 1.0 = 26.0
assert.strictEqual(pcs.totalPcs, 26.0);
console.log('✔ PCS correctly factored and calculated');

// 8. Figuras Obligatorias (White System)
const figures = EvaluationEngine.calculateWhiteFigures(
  {
    tracing: 7.5,
    movement: 8.0,
    carriage: 7.0,
  },
  0.5 // Deducción por raspón menor
);
// Average: (7.5 + 8.0 + 7.0) / 3 = 7.50 - 0.5 = 7.00
assert.strictEqual(figures.marks.average, 7.5);
assert.strictEqual(figures.totalScore, 7.0);
console.log('✔ White figures calculation exact (7.5 avg - 0.5 ded = 7.0)');

console.log('All EvaluationEngine tests passed successfully!');
