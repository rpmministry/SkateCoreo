import assert from 'node:assert';
import { EvaluationPdfService } from './evaluationPdfService';
import { CoachEvaluation, CoachAthlete } from '../types';

console.log('Testing EvaluationPdfService (A4 Editorial Generation)...');

const testAthlete: CoachAthlete = {
  id: 'ath_test',
  firstName: 'Valeria',
  lastName: 'Gómez',
  name: 'Valeria Gómez',
  birthDate: '2012-05-14',
  age: 13,
  category: 'ESPOIR',
  categoryAuto: true,
  club: 'Club Guayas Patín',
  eficiencia: 'INTERMEDIA',
  created_at: Date.now(),
  updated_at: Date.now(),
  syncState: 'local',
};

const testEval: CoachEvaluation = {
  id: 'eval_pdf_test',
  athleteId: 'ath_test',
  athleteName: 'Valeria Gómez',
  choreographyId: 'choreo_test',
  choreographyTitle: 'Programa Libre Espoir 2026',
  trainerId: 'trainer_1',
  trainerName: 'Mauricio Andrade',
  date: new Date().toISOString(),
  regulationId: 'WORLD_SKATE_ROLLART_2026',
  regulationTitle: 'World Skate RollArt 2026',
  season: '2026',
  discipline: 'Libre',
  programSegment: 'Largo',
  category: 'ESPOIR',
  eficiencia: 'INTERMEDIA',
  elements: [
    {
      id: 'e1',
      code: '2S',
      name: 'Double Salchow',
      type: 'Jump',
      baseValue: 1.30,
      executionTimestampMs: 15000,
      rotationsCount: 2,
      deductionCode: null,
      edgeIndicator: null,
      qoeScore: 1,
      isTimeBonusApplied: false,
      isValid: true,
      finalValue: 1.43,
    },
    {
      id: 'e2',
      code: 'USp1',
      name: 'Upright Spin Nivel 1',
      type: 'Spin',
      baseValue: 1.40,
      executionTimestampMs: 45000,
      rotationsCount: 3,
      deductionCode: null,
      edgeIndicator: null,
      qoeScore: 0,
      isTimeBonusApplied: false,
      isValid: true,
      finalValue: 1.40,
    },
  ],
  artisticComponents: {
    skatingSkills: 6.0,
    transitions: 5.5,
    performance: 6.0,
    choreography: 6.0,
    factor: 1.0,
    totalPcs: 23.5,
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
    tes: 2.83,
    pcs: 23.5,
    deductions: 0,
    totalScore: 26.33,
    elementsCount: 2,
    bonusTCount: 0,
  },
  feedback: {
    strengths: ['Entrada fluida y buena rotación en el 2S'],
    technicalCorrections: [
      { id: 'c1', item: 'Aumentar velocidad en el upright spin', priority: 'importante' },
    ],
    choreographicSuggestions: {
      spatialDistribution: 'Utilizar mejor los bordes perimetrales',
    },
    nextGoals: ['Comenzar preparación del doble Toe Loop (2T)'],
    generalObservations: 'Excelente actitud durante la ejecución del programa.',
  },
  isSentToAthlete: true,
  updated_at: Date.now(),
  syncState: 'local',
};

// 1. Probar generación de ficha individual
const singleDoc = EvaluationPdfService.generateSingleEvaluationPdf(testEval, testAthlete);
assert.ok(singleDoc, 'Document must be defined');
assert.strictEqual(singleDoc.getNumberOfPages(), 1);
const pdfBytes = singleDoc.output('arraybuffer');
assert.ok(pdfBytes.byteLength > 1000, 'PDF size must be realistic');
console.log('✔ Single evaluation PDF generated successfully (bytes:', pdfBytes.byteLength, ')');

// 2. Probar generación de historial
const historyDoc = EvaluationPdfService.generateAthleteHistoryPdf([testEval], testAthlete);
assert.ok(historyDoc);
assert.strictEqual(historyDoc.getNumberOfPages(), 1);
console.log('✔ Athlete history PDF generated successfully');

console.log('All EvaluationPdfService tests passed successfully!');
