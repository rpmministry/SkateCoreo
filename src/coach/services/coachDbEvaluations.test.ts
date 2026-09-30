import assert from 'node:assert';
import { coachDb } from './coachDb';
import { CoachEvaluation } from '../types';

console.log('Testing CoachDb evaluation store...');

async function run() {
  const testEval: CoachEvaluation = {
    id: 'eval_test_1',
    athleteId: 'ath_123',
    athleteName: 'Camila Morales',
    choreographyId: 'choreo_456',
    choreographyTitle: 'Programa Libre 2026',
    choreographyVersionNumber: 1,
    trainerId: 'trainer_test',
    trainerName: 'Mauricio Andrade',
    date: new Date().toISOString(),
    regulationId: 'WORLD_SKATE_ROLLART_2026',
    regulationTitle: 'World Skate RollArt 2026',
    season: '2026',
    discipline: 'Libre',
    programSegment: 'Largo',
    category: 'CADET',
    elements: [
      {
        id: 'el_1',
        code: '2A',
        name: 'Double Axel',
        type: 'Jump',
        baseValue: 3.30,
        executionTimestampMs: 70000,
        rotationsCount: 2.5,
        deductionCode: null,
        edgeIndicator: null,
        qoeScore: 1,
        isTimeBonusApplied: true,
        isValid: true,
        finalValue: 3.99,
      },
    ],
    artisticComponents: {
      skatingSkills: 6.5,
      transitions: 6.0,
      performance: 6.5,
      choreography: 6.5,
      factor: 1.0,
      totalPcs: 25.5,
    },
    deductions: {
      fallsCount: 0,
      fallsDeduction: 0,
      timeViolationSeconds: 0,
      timeDeduction: 0,
      costumeDeduction: 0,
      musicViolationDeduction: 0,
      otherDeductions: 0,
      totalDeductions: 0,
    },
    scoresSummary: {
      tes: 3.99,
      pcs: 25.5,
      deductions: 0,
      totalScore: 29.49,
      elementsCount: 1,
      bonusTCount: 1,
    },
    feedback: {
      strengths: ['Excelente velocidad de entrada en el Axel'],
      technicalCorrections: [
        { id: 'c1', item: 'Mantener rodilla libre en el aterrizaje', priority: 'urgente' },
      ],
      choreographicSuggestions: {
        spatialDistribution: 'Ocupar mejor la cabecera norte de la pista',
      },
      nextGoals: ['Consolidar combinación 2A + 2T'],
      generalObservations: 'Buen avance técnico respecto al ciclo anterior.',
    },
    isSentToAthlete: true,
    sentAt: Date.now(),
    updated_at: Date.now(),
    syncState: 'local',
  };

  await coachDb.saveEvaluation(testEval);
  const fetched = await coachDb.getEvaluationById('eval_test_1');
  assert.ok(fetched, 'Evaluation should be fetched');
  assert.strictEqual(fetched.athleteName, 'Camila Morales');
  assert.strictEqual(fetched.scoresSummary.totalScore, 29.49);

  const forAthlete = await coachDb.getEvaluationsByAthlete('ath_123');
  assert.strictEqual(forAthlete.length, 1);
  assert.strictEqual(forAthlete[0].id, 'eval_test_1');

  await coachDb.deleteEvaluation('eval_test_1');
  const deleted = await coachDb.getEvaluationById('eval_test_1');
  assert.strictEqual(deleted, null);

  console.log('✔ All CoachDb evaluation operations passed successfully!');
}

run().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
