/**
 * Unit Tests: Género de Voz Guía y proyección del Playhead.
 *
 * Cubre los dos bugs reportados:
 *  1. La guía femenina y la masculina sonaban IDÉNTICAS.
 *  2. El playhead perdía sincronía con la música.
 */

import { VoiceCueEngine, GOOGLE_TTS_VOICES, DEFAULT_LATIN_FEMALE_VOICE, DEFAULT_LATIN_MALE_VOICE } from './VoiceCueEngine';
import { detectGoogleVoiceGender, voiceMatchesGender } from './voiceGender';
import { timeToPlayheadPx } from './PlaybackClock';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${msg}`);
    process.exit(1);
  }
  console.log(`✅ PASSED: ${msg}`);
}

console.log('\n--- EJECUTANDO PRUEBAS DE VOZ GUÍA (GÉNERO) Y PLAYHEAD ---');

// ── 1. Convención de género de las voces Google Cloud ───────────
assert(detectGoogleVoiceGender('es-US-Neural2-A') === 'female', 'Neural2-A se detecta como FEMENINA');
assert(detectGoogleVoiceGender('es-US-Neural2-B') === 'male', 'Neural2-B se detecta como MASCULINA');
assert(detectGoogleVoiceGender('es-US-Neural2-C') === 'female', 'Neural2-C se detecta como FEMENINA');
assert(detectGoogleVoiceGender('es-US-Wavenet-D') === 'male', 'Wavenet-D se detecta como MASCULINA');
assert(detectGoogleVoiceGender('es-US-Journey-F') === 'female', 'Journey-F se detecta como FEMENINA');
assert(detectGoogleVoiceGender('es-US-Journey-O') === 'male', 'Journey-O se detecta como MASCULINA');

// ── 2. Coincidencia de género ───────────────────────────────────
assert(voiceMatchesGender('es-US-Neural2-C', 'female') === true, 'Neural2-C coincide con género femenino');
assert(voiceMatchesGender('es-US-Neural2-C', 'male') === false, 'Neural2-C NO coincide con género masculino');
assert(voiceMatchesGender('Microsoft Monica', 'female') === true, 'Voz del navegador "Monica" se detecta femenina');
assert(voiceMatchesGender('Microsoft Jorge', 'male') === true, 'Voz del navegador "Jorge" se detecta masculina');
assert(voiceMatchesGender('Voice 42', 'male') === null, 'Voz sin género en el nombre devuelve null (indeterminado)');

// ── 3. El catálogo latino ofrece voces distintas por género ─────
const femaleLatin = GOOGLE_TTS_VOICES.filter((v) => v.lang === 'es-US' && v.gender === 'female');
const maleLatin = GOOGLE_TTS_VOICES.filter((v) => v.lang === 'es-US' && v.gender === 'male');
assert(femaleLatin.length >= 2, `Hay al menos 2 voces latinas femeninas (${femaleLatin.length})`);
assert(maleLatin.length >= 2, `Hay al menos 2 voces latinas masculinas (${maleLatin.length})`);
// Se ensancha el tipo para poder comparar en tiempo de ejecución (TS conoce los
// literales y consideraría la comparación siempre verdadera).
const femaleDefault: string = DEFAULT_LATIN_FEMALE_VOICE;
const maleDefault: string = DEFAULT_LATIN_MALE_VOICE;
assert(
  femaleDefault !== maleDefault,
  'La voz latina por defecto femenina y masculina son nombres DISTINTOS'
);
assert(
  femaleLatin.some((v) => v.name === DEFAULT_LATIN_FEMALE_VOICE) &&
    detectGoogleVoiceGender(DEFAULT_LATIN_FEMALE_VOICE) === 'female',
  `Voz femenina por defecto válida (${DEFAULT_LATIN_FEMALE_VOICE})`
);
assert(
  maleLatin.some((v) => v.name === DEFAULT_LATIN_MALE_VOICE) &&
    detectGoogleVoiceGender(DEFAULT_LATIN_MALE_VOICE) === 'male',
  `Voz masculina por defecto válida (${DEFAULT_LATIN_MALE_VOICE})`
);

// ── 4. setVoiceGender cambia realmente la voz seleccionada ──────
const engine = new VoiceCueEngine({ enabled: true, language: 'es' });

engine.setVoiceGender('female');
const femaleVoice = engine.getConfig().googleVoiceName;
assert(engine.getVoiceGender() === 'female', 'getVoiceGender() devuelve female');
assert(
  detectGoogleVoiceGender(femaleVoice) === 'female',
  `setVoiceGender('female') selecciona una voz femenina (${femaleVoice})`
);

engine.setVoiceGender('male');
const maleVoice = engine.getConfig().googleVoiceName;
assert(engine.getVoiceGender() === 'male', 'getVoiceGender() devuelve male');
assert(
  detectGoogleVoiceGender(maleVoice) === 'male',
  `setVoiceGender('male') selecciona una voz masculina (${maleVoice})`
);

assert(
  femaleVoice !== maleVoice,
  `La voz femenina y la masculina son DIFERENTES (${femaleVoice} ≠ ${maleVoice})`
);

// Conserva la familia (tier) al alternar género
engine.setGoogleVoiceName('es-US-Wavenet-C');
engine.setVoiceGender('male');
assert(
  engine.getConfig().googleVoiceName.includes('Wavenet'),
  `Alternar género conserva la familia Wavenet (${engine.getConfig().googleVoiceName})`
);

// ── 5. Proyección del playhead (coma flotante, sin redondeo) ────
assert(timeToPlayheadPx(0, 10000, 40, 1000) === 40, 'Playhead en t=0 cae en el origen (40px)');
assert(timeToPlayheadPx(5000, 10000, 40, 1000) === 540, 'Playhead a mitad cae en el centro exacto');
assert(timeToPlayheadPx(10000, 10000, 40, 1000) === 1040, 'Playhead al final cae en el borde derecho');
assert(timeToPlayheadPx(15000, 10000, 40, 1000) === 1040, 'Tiempo fuera de rango se satura al final');
assert(timeToPlayheadPx(-500, 10000, 40, 1000) === 40, 'Tiempo negativo se satura al origen');
assert(timeToPlayheadPx(1000, 0, 40, 1000) === 40, 'Duración 0 no produce NaN ni infinito');

const fractional = timeToPlayheadPx(1234.567, 10000, 0, 1000);
assert(
  Math.abs(fractional - 123.4567) < 1e-9,
  `La proyección conserva precisión de coma flotante (${fractional})`
);
assert(!Number.isInteger(fractional), 'El resultado NO se redondea a píxeles enteros (evita micro-saltos)');

console.log('\n✅ TODAS LAS PRUEBAS DE VOZ GUÍA Y PLAYHEAD PASARON\n');
