/**
 * Unit Tests: voiceCueSanitizer (Filtro de Voz Guía)
 *
 * Verifica que la voz guía SOLO pueda pronunciar comandos explícitos o nombres
 * de figuras del catálogo oficial del Reglamento 2026, y que descarte
 * silenciosamente etiquetas de nodos de la plantilla A4, notas al margen,
 * metadatos de audio y texto descriptivo.
 */

import {
  sanitizeSpeechText,
  isKnownFigure,
  getAllowedFigureNames,
  formatObligatoryFigureForSpeech,
  cleanFigureNameForSpeech,
} from './voiceCueSanitizer';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${msg}`);
    process.exit(1);
  }
  console.log(`✅ PASSED: ${msg}`);
}

console.log('\n--- EJECUTANDO PRUEBAS DEL FILTRO DE VOZ GUÍA (TTS) ---');

// ── 1. Textos que SÍ deben vocalizarse ──────────────────────────
const mustSpeak = [
  'tres',
  'dos',
  'uno',
  '¡ya!',
  'Salchow',
  'Salchow, en',
  'Salchow en 3',
  'Axel',
  'Toe Loop',
  'Loop (Rittberger)',
  'Trompo',
  'Trompo Combinado',
  'Combinación de Saltos',
  'Secuencia de Pasos',
  'Biellmann',
  'Hydroblade',
  'Ina Bauer',
  'Sit Behind (Tortuga)',
  'Doble Axel',
  'Triple Lutz',
  'Figura 1 y 2, Grupo 1',
  '3S-8',
  '1A',
];

for (const text of mustSpeak) {
  assert(sanitizeSpeechText(text) !== null, `Se vocaliza la figura/comando: "${text}"`);
}

// ── 2. Textos que NO deben vocalizarse nunca ────────────────────
const mustSilence = [
  'Nodo 3 (Papel)',
  'Nodo 12',
  'Punto 4',
  'Inicio Trazo',
  'Fin Trazo',
  'Vértice',
  'Bucle',
  'Curva de transición',
  'Pose Final',
  'nota: revisar el giro al final',
  'texto al margen sobre la diagonal',
  'Pista_Musical.mp3',
  '/ruta/al/archivo.wav',
  'mezcla final master',
  'BPM 120 tempo',
  'sin figura',
  '--- elegir ---',
  'Figuras obligatorias del Grupo 1 para esta categoría según el reglamento',
  'Salchow nota revisar',
  'plantilla A4 escaneada',
  '',
];

for (const text of mustSilence) {
  const out = sanitizeSpeechText(text);
  assert(out === null, `Se descarta el texto no técnico: "${text}" (obtenido: ${JSON.stringify(out)})`);
}

// ── 3. Formato de códigos obligatorios ─────────────────────────
assert(
  formatObligatoryFigureForSpeech('1-2') === 'Figura 1 y 2',
  `Código "1-2" se formatea como "Figura 1 y 2" (obtenido: "${formatObligatoryFigureForSpeech('1-2')}")`
);
assert(
  formatObligatoryFigureForSpeech('18-10-14') === 'Figura 18, 10 y 14',
  `Código "18-10-14" se formatea como "Figura 18, 10 y 14" (obtenido: "${formatObligatoryFigureForSpeech('18-10-14')}")`
);
assert(
  cleanFigureNameForSpeech('1-2 (Grupo 1)') === 'Figura 1 y 2, Grupo 1',
  `Etiqueta de grupo se normaliza (obtenido: "${cleanFigureNameForSpeech('1-2 (Grupo 1)')}")`
);

// ── 4. El catálogo oficial está construido ─────────────────────
const catalog = getAllowedFigureNames();
assert(catalog.size >= 50, `Catálogo normalizado no vacío (${catalog.size} figuras)`);
assert(catalog.has('salchow'), 'El catálogo incluye Salchow');
assert(catalog.has('lunge'), 'El catálogo incluye Lunge (elemento artístico)');
assert(!isKnownFigure('Nodo 3 (Papel)'), 'La etiqueta de la plantilla A4 no es una figura conocida');
assert(!isKnownFigure('Salchow nota revisar'), 'Una figura con nota añadida se considera inválida');

// ── 5. Modo MANUAL: la Voz Guía también lee figuras del usuario ──
// Antes se descartaban por no pertenecer al catálogo, y por eso el aviso leía
// solo "3, 2, 1" sin el nombre de la figura.
assert(
  sanitizeSpeechText('Mi Combo Especial') === null,
  'Modo estricto (por defecto) sigue descartando texto fuera del catálogo'
);
assert(
  sanitizeSpeechText('Mi Combo Especial', { allowManual: true }) === 'Mi Combo Especial',
  'Modo manual vocaliza una figura escrita por el usuario'
);
assert(
  sanitizeSpeechText('Salto', { allowManual: true }) === 'Salto',
  'Modo manual vocaliza "Salto" (figura manual del usuario)'
);
assert(
  sanitizeSpeechText('Nodo 3 (Papel)', { allowManual: true }) === null,
  'Modo manual SIGUE descartando etiquetas estructurales de la plantilla'
);
assert(
  sanitizeSpeechText('Pista_Musical.mp3', { allowManual: true }) === null,
  'Modo manual SIGUE descartando metadatos de archivo'
);
assert(
  sanitizeSpeechText('Step 3', { allowManual: true }) === null,
  'Modo manual SIGUE descartando placeholders numerados'
);

console.log('\n✅ TODAS LAS PRUEBAS DEL FILTRO DE VOZ GUÍA PASARON\n');
