/**
 * Unit Tests: Voz Guía (voz única femenina latina) y proyección del Playhead.
 *
 * Cubre las decisiones de producto actuales:
 *  1. La Voz Guía es SIEMPRE femenina, con acento latinoamericano nativo.
 *  2. El selector de voz masculina se eliminó de la UI y de la lógica: cualquier
 *     ruta que intente fijarla se normaliza al catálogo femenino latino.
 *  3. El playhead conserva precisión de coma flotante (sin micro-saltos).
 */

import { VoiceCueEngine, GOOGLE_TTS_VOICES, DEFAULT_LATIN_FEMALE_VOICE, PREMIUM_LATIN_FEMALE_VOICES } from './VoiceCueEngine';
import { detectGoogleVoiceGender, voiceMatchesGender, isAcceptableFemaleVoice } from './voiceGender';
import { createTimelineGeometry } from './timeline/AudioTimelineGeometry';

/**
 * Proyección del playhead sobre la geometría temporal COMPARTIDA (la misma que
 * usan el Audio Studio y el visor de la Pista 2D). Se conserva aquí el guardia de
 * duración no positiva para no proyectar sobre una escala degenerada.
 */
const timeToPlayheadPx = (
  timeMs: number,
  durationMs: number,
  originPx: number,
  spanPx: number
): number => {
  if (!Number.isFinite(durationMs) || durationMs <= 0) return originPx;
  return createTimelineGeometry({
    contentWidth: spanPx,
    durationSec: durationMs / 1000,
    originPx,
  }).timeToPx(timeMs / 1000, true);
};

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${msg}`);
    process.exit(1);
  }
  console.log(`✅ PASSED: ${msg}`);
}

console.log('\n--- EJECUTANDO PRUEBAS DE VOZ GUÍA (VOZ ÚNICA FEMENINA) Y PLAYHEAD ---');

// ── 1. Convención de género de las voces Google Cloud (VERIFICADA) ───
// ⚠️ es-US NO sigue la paridad A-B/C-D: A es femenina, B y C son masculinas.
assert(detectGoogleVoiceGender('es-US-Neural2-A') === 'female', 'es-US-Neural2-A es FEMENINA (oficial)');
assert(detectGoogleVoiceGender('es-US-Neural2-B') === 'male', 'es-US-Neural2-B es MASCULINA');
assert(detectGoogleVoiceGender('es-US-Neural2-C') === 'male', 'es-US-Neural2-C es MASCULINA (no femenina)');
assert(detectGoogleVoiceGender('es-US-Wavenet-A') === 'female', 'es-US-Wavenet-A es FEMENINA');
assert(detectGoogleVoiceGender('es-US-Wavenet-C') === 'male', 'es-US-Wavenet-C es MASCULINA');
assert(detectGoogleVoiceGender('en-US-Neural2-A') === 'male', 'en-US-Neural2-A es MASCULINA (otra convención)');
assert(detectGoogleVoiceGender('en-US-Neural2-C') === 'female', 'en-US-Neural2-C es FEMENINA');

// ── 2. Coincidencia de género (detección pura) ──────────────────
assert(voiceMatchesGender('es-US-Neural2-C', 'female') === false, 'Neural2-C NO es femenina');
assert(voiceMatchesGender('es-US-Neural2-C', 'male') === true, 'Neural2-C SÍ es masculina');
assert(voiceMatchesGender('es-US-Neural2-A', 'female') === true, 'Neural2-A es femenina');
assert(voiceMatchesGender('Microsoft Monica', 'female') === true, 'Voz del navegador "Monica" se detecta femenina');
assert(voiceMatchesGender('Voice 42', 'male') === null, 'Voz sin género en el nombre devuelve null (indeterminado)');

// ── 3. El catálogo es EXCLUSIVAMENTE femenino latino (es-US) ────
const latinVoices = GOOGLE_TTS_VOICES.filter((v) => v.lang === 'es-US');
const nonFemale = GOOGLE_TTS_VOICES.filter((v) => (v.gender as string) !== 'female');

assert(nonFemale.length === 0, 'El catálogo no contiene ninguna voz masculina (eliminada)');
assert(
  GOOGLE_TTS_VOICES.every((v) => detectGoogleVoiceGender(v.name) === 'female'),
  'Todas las voces del catálogo están VERIFICADAS como femeninas'
);
assert(
  !GOOGLE_TTS_VOICES.some((v) => /-(B|C|D|E)$/.test(v.name)),
  'El catálogo no incluye las letras masculinas de es-US (B/C/D/E)'
);
assert(
  !GOOGLE_TTS_VOICES.some((v) => v.name.includes('Journey')),
  'El catálogo no incluye Journey (no existe para es-US)'
);
assert(latinVoices.length >= 3, `Hay al menos 3 voces latinas femeninas (${latinVoices.length})`);
assert(
  latinVoices.every((v) => v.name.startsWith('es-US-')),
  'Todas las voces del catálogo son de acento latinoamericano (es-US)'
);
assert(
  PREMIUM_LATIN_FEMALE_VOICES.some((n) => n.includes('Neural2')),
  'El catálogo prioriza voces premium Neural2'
);
assert(
  latinVoices.some((v) => v.name === DEFAULT_LATIN_FEMALE_VOICE) &&
    detectGoogleVoiceGender(DEFAULT_LATIN_FEMALE_VOICE) === 'female',
  `Voz femenina por defecto válida (${DEFAULT_LATIN_FEMALE_VOICE})`
);

// ── 4. El motor fuerza SIEMPRE la voz femenina latina ───────────
const engine = new VoiceCueEngine({ enabled: true, language: 'es' });

engine.setVoiceGender('female');
const femaleVoice = engine.getConfig().googleVoiceName;
assert(engine.getVoiceGender() === 'female', 'getVoiceGender() devuelve siempre female');
assert(
  detectGoogleVoiceGender(femaleVoice) === 'female',
  `La voz activa es femenina (${femaleVoice})`
);

// Aunque se solicite explícitamente la voz masculina por la API heredada, el
// motor la ignora: se eliminó de la interfaz y de la lógica.
engine.setVoiceGender('male');
assert(
  engine.getVoiceGender() === 'female',
  'setVoiceGender("male") se ignora: la guía sigue siendo femenina'
);
assert(
  detectGoogleVoiceGender(engine.getConfig().googleVoiceName) === 'female',
  `Tras solicitar la masculina, la voz sigue siendo femenina (${engine.getConfig().googleVoiceName})`
);

// Una voz castellana (es-ES) fuera de catálogo se normaliza a la latina.
engine.setGoogleVoiceName('es-ES-Neural2-A');
assert(
  engine.getConfig().googleVoiceName === DEFAULT_LATIN_FEMALE_VOICE,
  'Una voz castellana se normaliza a la voz latina femenina por defecto'
);

// Una voz masculina del catálogo histórico también se rechaza.
engine.setGoogleVoiceName('es-US-Neural2-B');
assert(
  engine.getConfig().googleVoiceName !== 'es-US-Neural2-B',
  'Una voz masculina se rechaza y se sustituye por una femenina'
);

// La voz es-US-Neural2-C es MASCULINA en Google: nunca debe seleccionarse.
engine.setGoogleVoiceName('es-US-Neural2-C');
assert(
  engine.getConfig().googleVoiceName === DEFAULT_LATIN_FEMALE_VOICE,
  'es-US-Neural2-C (masculina) se normaliza a la A femenina'
);

// es-US-Wavenet-C también es masculina y es-US-Journey-F no existe.
engine.setGoogleVoiceName('es-US-Wavenet-C');
assert(
  engine.getConfig().googleVoiceName === DEFAULT_LATIN_FEMALE_VOICE,
  'es-US-Wavenet-C (masculina) se normaliza a la A femenina'
);
engine.setGoogleVoiceName('es-US-Journey-F');
assert(
  engine.getConfig().googleVoiceName === DEFAULT_LATIN_FEMALE_VOICE,
  'es-US-Journey-F (inexistente) se normaliza a la A femenina'
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

// ── 6. Política de VOZ ÚNICA en el fallback del navegador ───────
// Nunca masculina, nunca de género desconocido, nunca es-ES.
const mk = (name: string, lang: string) => ({ name, lang, voiceURI: `${lang}:${name}` } as unknown as SpeechSynthesisVoice);

assert(isAcceptableFemaleVoice(mk('Microsoft Monica', 'es-MX'), 'es') === true, 'Monica (es-MX) es voz femenina latina válida');
assert(isAcceptableFemaleVoice(mk('Voice 42', 'es-MX'), 'es') === false, 'Género desconocido se rechaza (no se asume femenina)');
assert(isAcceptableFemaleVoice(mk('Microsoft Pablo', 'es-MX'), 'es') === false, 'Voz masculina (Pablo) se rechaza');
assert(isAcceptableFemaleVoice(mk('Microsoft Monica', 'es-ES'), 'es') === false, 'es-ES se rechaza por acento castellano');
assert(isAcceptableFemaleVoice(mk('Google español', 'es-US'), 'es') === false, 'Sin género explícito en el nombre se rechaza');

const onlyBad = [mk('Microsoft Pablo', 'es-MX'), mk('Voice 42', 'es-MX'), mk('Microsoft Monica', 'es-ES')];
assert(
  engine.pickBestBrowserVoice(onlyBad, 'es') === null,
  'Sin voz femenina latina válida → null: silencio, NUNCA una voz masculina'
);

const mixed = [mk('Microsoft Pablo', 'es-MX'), mk('Voice 42', 'es-US'), mk('Microsoft Monica', 'es-US')];
const picked = engine.pickBestBrowserVoice(mixed, 'es');
assert(
  picked !== null && picked.name === 'Microsoft Monica',
  'Entre voces mixtas elige la única femenina latina validada'
);

console.log('\n✅ TODAS LAS PRUEBAS DE VOZ GUÍA Y PLAYHEAD PASARON\n');
