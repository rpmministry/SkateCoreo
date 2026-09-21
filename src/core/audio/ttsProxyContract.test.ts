/**
 * Unit Tests: contrato del endpoint propio `/api/tts`.
 *
 * Verifica que el proxy sea una lista blanca estricta (texto, voz y origen) y
 * que la credencial nunca dependa del cliente.
 */

import {
  buildGoogleTtsPayload,
  base64ToBytes,
  extractAudioContent,
  isTtsProxyOriginAllowed,
  validateTtsProxyBody,
} from './ttsProxyContract';
import { GOOGLE_TTS_VOICES } from '../../constants/ttsVoices';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${msg}`);
    process.exit(1);
  }
  console.log(`✅ PASSED: ${msg}`);
}

console.log('\n--- EJECUTANDO PRUEBAS DEL CONTRATO /api/tts ---');

// ── 1. Peticiones válidas ───────────────────────────────────────
const valid = validateTtsProxyBody({
  text: 'Salchow',
  voiceName: 'es-US-Neural2-C',
  speed: 1.05,
  languageCode: 'xx-XX', // intento de inyección: debe ignorarse
});
assert(valid.ok, 'Acepta texto de figura oficial con voz del catálogo');
if (valid.ok) {
  assert(valid.payload.text === 'Salchow', 'Conserva el texto validado');
  assert(valid.payload.voiceName === 'es-US-Neural2-C', 'Conserva la voz solicitada');
  assert(
    valid.payload.languageCode === 'es-US',
    `La región se deriva del catálogo e ignora al cliente (${valid.payload.languageCode})`
  );
  assert(
    valid.payload.fallbackVoiceName === 'es-US-Wavenet-C',
    `Selecciona respaldo Wavenet del mismo género (${valid.payload.fallbackVoiceName})`
  );
}

// ── 2. Filtro de la Voz Guía (anti-abuso) ───────────────────────
const junkTexts = [
  'Nodo 3 (Papel)',
  'Punto 12',
  'nota: revisar el giro',
  'Pista_Musical.mp3',
  '/etc/passwd',
  '',
];
for (const junk of junkTexts) {
  const result = validateTtsProxyBody({ text: junk, voiceName: 'es-US-Neural2-C' });
  assert(!result.ok, `Rechaza texto no vocalizable: "${junk}"`);
}

// ── 3. Lista blanca de voces ────────────────────────────────────
const badVoice = validateTtsProxyBody({ text: 'Salchow', voiceName: 'es-US-Studio-VOICE-X' });
assert(!badVoice.ok, 'Rechaza voces fuera del catálogo');
if (!badVoice.ok) {
  assert(badVoice.status === 422, `Devuelve 422 para voz no permitida (${badVoice.status})`);
}

const noVoice = validateTtsProxyBody({ text: 'Salchow' });
assert(noVoice.ok, 'Sin voz explícita aplica la voz latina por defecto');

// ── 4. Velocidad limitada y cuerpo inválido ─────────────────────
const fast = validateTtsProxyBody({ text: 'Salchow', voiceName: 'es-US-Neural2-C', speed: 99 });
assert(fast.ok && fast.payload.speed === 2, 'Limita la velocidad máxima a 2.0');

const slow = validateTtsProxyBody({ text: 'Salchow', voiceName: 'es-US-Neural2-C', speed: -5 });
assert(slow.ok && slow.payload.speed === 0.5, 'Limita la velocidad mínima a 0.5');

const notObject = validateTtsProxyBody('texto plano');
assert(!notObject.ok && notObject.status === 400, 'Rechaza cuerpos que no son objeto JSON');

// ── 5. Control de origen ────────────────────────────────────────
assert(
  isTtsProxyOriginAllowed({ origin: 'https://skatecoreo.vercel.app', host: 'skatecoreo.vercel.app' }),
  'Permite peticiones del propio dominio (Origin)'
);
assert(
  isTtsProxyOriginAllowed({ referer: 'https://skatecoreo.vercel.app/editor', host: 'skatecoreo.vercel.app' }),
  'Permite peticiones del propio dominio (Referer)'
);
assert(
  !isTtsProxyOriginAllowed({ origin: 'https://sitio-malicioso.com', host: 'skatecoreo.vercel.app' }),
  'Bloquea orígenes de terceros'
);
assert(
  !isTtsProxyOriginAllowed({ host: 'skatecoreo.vercel.app' }),
  'Bloquea peticiones sin Origin ni Referer (clientes no navegador)'
);
assert(
  isTtsProxyOriginAllowed({
    origin: 'https://midominio.com',
    host: 'skatecoreo.vercel.app',
    extraAllowedOrigins: ['midominio.com'],
  }),
  'Permite dominios extra declarados por entorno'
);
assert(
  isTtsProxyOriginAllowed({ origin: 'http://localhost:3000', host: 'localhost:3000' }),
  'Permite el dev server local (mismo host)'
);

// ── 6. Codificación / decodificación de audio ───────────────────
const original = new Uint8Array([0x49, 0x44, 0x33, 0x04, 0x00, 0xff, 0xfb, 0x90, 0x00]);
const encoded = Buffer.from(original).toString('base64');
const decoded = base64ToBytes(encoded);
assert(
  decoded.length === original.length && decoded.every((byte, i) => byte === original[i]),
  'base64ToBytes reconstruye exactamente los bytes MP3'
);
assert(base64ToBytes('').length === 0, 'base64ToBytes tolera cadena vacía');

assert(extractAudioContent({ audioContent: 'AAAA' }) === 'AAAA', 'Extrae audioContent válido');
assert(extractAudioContent({}) === null, 'Devuelve null sin audioContent');
assert(extractAudioContent(null) === null, 'Devuelve null con respuesta nula');

// ── 7. Payload hacia Google ─────────────────────────────────────
if (valid.ok) {
  const payload = buildGoogleTtsPayload(valid.payload, 'es-US-Wavenet-C');
  assert(
    payload.voice.name === 'es-US-Wavenet-C' && payload.voice.languageCode === 'es-US',
    'El payload de Google usa la voz y región indicadas'
  );
  assert(payload.audioConfig.audioEncoding === 'MP3', 'El payload solicita MP3');
}

// ── 8. Catálogo coherente con la lista blanca ───────────────────
assert(GOOGLE_TTS_VOICES.length >= 10, 'El catálogo expone las voces oficiales');

console.log('\n✅ TODAS LAS PRUEBAS DEL CONTRATO /api/tts PASARON\n');
