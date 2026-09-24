/**
 * Unit Tests: función serverless REAL de Vercel (`api/tts.ts`).
 *
 * Se prueba el archivo que efectivamente se despliega, no una copia, para que
 * ninguna diferencia entre el código probado y el código en producción pueda
 * pasar desapercibida. Todo se ejecuta sin red: `fetch` se inyecta como doble.
 */

import {
  ALLOWED_FIGURES,
  handleTtsProxyRequest,
  readNodeRequestBody,
  resetTtsProxyRateLimit,
  sanitizeSpeechText as sanitizeServerSpeech,
} from '../../../api/tts';
import { sanitizeSpeechText as sanitizeClientSpeech, getAllowedFigureNames } from './voiceCueSanitizer';

/** Mismo valor que usa la función desplegada (no se exporta a propósito). */
const TTS_PROXY_RATE_LIMIT = 60;

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${msg}`);
    process.exit(1);
  }
  console.log(`✅ PASSED: ${msg}`);
}

const APP_KEY = 'AIzaSySERVER_ONLY_KEY_000000000000';
const MP3_BYTES = new Uint8Array([0x49, 0x44, 0x33, 0x04, 0x00, 0xff, 0xfb, 0x90, 0x00]);
const MP3_BASE64 = Buffer.from(MP3_BYTES).toString('base64');

const baseHeaders = {
  host: 'skatecoreo.vercel.app',
  origin: 'https://skatecoreo.vercel.app',
};

/** Doble de `fetch` que simula una síntesis correcta de Google Cloud. */
function okFetch(capture?: (body: any) => void): typeof fetch {
  return (async (_url: string, init: any) => {
    if (capture) capture(JSON.parse(init.body));
    return {
      ok: true,
      status: 200,
      json: async () => ({ audioContent: MP3_BASE64 }),
      text: async () => '',
    };
  }) as unknown as typeof fetch;
}

/** Doble de `fetch` que siempre falla (para probar errores y respaldos). */
function failingFetch(status: number): typeof fetch {
  return (async () => ({
    ok: false,
    status,
    json: async () => ({}),
    text: async () => 'voice not enabled',
  })) as unknown as typeof fetch;
}

console.log('\n--- EJECUTANDO PRUEBAS DEL NÚCLEO DEL PROXY DE VOZ ---');

// ── 1. Camino feliz: devuelve bytes MP3 ────────────────────────
resetTtsProxyRateLimit();
let sentPayload: any = null;
const happy = await handleTtsProxyRequest(
  {
    method: 'POST',
    headers: baseHeaders,
    body: { text: 'Salchow', voiceName: 'es-US-Neural2-A', speed: 1.05 },
    clientIp: '10.0.0.1',
  },
  { apiKey: APP_KEY, fetchImpl: okFetch((p) => (sentPayload = p)) }
);

assert(happy.status === 200, `Sintetiza correctamente (${happy.status})`);
assert(
  happy.headers['Content-Type'] === 'audio/mpeg',
  'Responde con Content-Type audio/mpeg'
);
assert(
  happy.body instanceof Uint8Array && (happy.body as Uint8Array).length === MP3_BYTES.length,
  'Devuelve los bytes MP3 completos'
);
assert(
  sentPayload?.voice?.name === 'es-US-Neural2-A' && sentPayload?.input?.text === 'Salchow',
  'Envía a Google la voz y el texto validados'
);

// ── 2. Sin credencial en el servidor ────────────────────────────
const noKey = await handleTtsProxyRequest(
  { method: 'POST', headers: baseHeaders, body: { text: 'Salchow' }, clientIp: '10.0.0.2' },
  { apiKey: null, fetchImpl: okFetch() }
);
assert(noKey.status === 503, `Sin credencial de servidor responde 503 (${noKey.status})`);

// ── 3. Origen no autorizado ─────────────────────────────────────
const badOrigin = await handleTtsProxyRequest(
  {
    method: 'POST',
    headers: { host: 'skatecoreo.vercel.app', origin: 'https://atacante.com' },
    body: { text: 'Salchow' },
    clientIp: '10.0.0.3',
  },
  { apiKey: APP_KEY, fetchImpl: okFetch() }
);
assert(badOrigin.status === 403, `Bloquea orígenes de terceros (${badOrigin.status})`);

// ── 4. Texto no vocalizable (anti-abuso) ────────────────────────
const junk = await handleTtsProxyRequest(
  {
    method: 'POST',
    headers: baseHeaders,
    body: { text: 'Nodo 3 (Papel)', voiceName: 'es-US-Neural2-A' },
    clientIp: '10.0.0.4',
  },
  { apiKey: APP_KEY, fetchImpl: okFetch() }
);
assert(junk.status === 422, `Rechaza texto no vocalizable (${junk.status})`);

// ── 5. Voz no permitida ─────────────────────────────────────────
const badVoice = await handleTtsProxyRequest(
  {
    method: 'POST',
    headers: baseHeaders,
    body: { text: 'Salchow', voiceName: 'en-GB-Studio-O' },
    clientIp: '10.0.0.5',
  },
  { apiKey: APP_KEY, fetchImpl: okFetch() }
);
assert(badVoice.status === 422, `Rechaza voces fuera del catálogo (${badVoice.status})`);

// ── 5b. Voces es-US masculinas (C) rechazadas por el catálogo ───
for (const maleVoiceName of ['es-US-Neural2-C', 'es-US-Wavenet-C', 'es-US-Journey-F']) {
  const maleVoice = await handleTtsProxyRequest(
    {
      method: 'POST',
      headers: baseHeaders,
      body: { text: 'Salchow', voiceName: maleVoiceName },
      clientIp: '10.0.0.55',
    },
    { apiKey: APP_KEY, fetchImpl: okFetch() }
  );
  assert(
    maleVoice.status === 422,
    `Rechaza la voz no femenina/inexistente ${maleVoiceName} (${maleVoice.status})`
  );
}

// ── 6. Método no permitido ──────────────────────────────────────
const wrongMethod = await handleTtsProxyRequest(
  { method: 'GET', headers: baseHeaders, body: null, clientIp: '10.0.0.6' },
  { apiKey: APP_KEY, fetchImpl: okFetch() }
);
assert(wrongMethod.status === 405, `Rechaza métodos distintos de POST (${wrongMethod.status})`);

// ── 7. Cuerpo excesivo ──────────────────────────────────────────
const tooBig = await handleTtsProxyRequest(
  {
    method: 'POST',
    headers: baseHeaders,
    body: { text: 'x'.repeat(4000) },
    clientIp: '10.0.0.7',
  },
  { apiKey: APP_KEY, fetchImpl: okFetch() }
);
assert(tooBig.status === 413, `Rechaza cuerpos demasiado grandes (${tooBig.status})`);

// ── 8. Respaldo Wavenet cuando la voz primaria no está habilitada ──
resetTtsProxyRateLimit();
const attempts: string[] = [];
const fallbackFetch = (async (_url: string, init: any) => {
  const body = JSON.parse(init.body);
  attempts.push(body.voice.name);
  if (body.voice.name === 'es-US-Neural2-A') {
    return { ok: false, status: 400, json: async () => ({}), text: async () => 'not enabled' };
  }
  return { ok: true, status: 200, json: async () => ({ audioContent: MP3_BASE64 }), text: async () => '' };
}) as unknown as typeof fetch;

const fallbackResult = await handleTtsProxyRequest(
  {
    method: 'POST',
    headers: baseHeaders,
    body: { text: 'Salchow', voiceName: 'es-US-Neural2-A' },
    clientIp: '10.0.0.8',
  },
  { apiKey: APP_KEY, fetchImpl: fallbackFetch }
);
assert(fallbackResult.status === 200, 'Reintenta con el respaldo Wavenet y responde 200');
assert(
  attempts.join(' → ') === 'es-US-Neural2-A → es-US-Wavenet-A',
  `Orden de intentos correcto (${attempts.join(' → ')})`
);

// ── 9. Google caído: error controlado, sin filtrar detalles ─────
const upstreamDown = await handleTtsProxyRequest(
  {
    method: 'POST',
    headers: baseHeaders,
    body: { text: 'Salchow', voiceName: 'es-US-Neural2-A' },
    clientIp: '10.0.0.9',
  },
  { apiKey: APP_KEY, fetchImpl: failingFetch(500) }
);
assert(upstreamDown.status === 502, `Devuelve 502 si Google falla (${upstreamDown.status})`);
assert(
  typeof upstreamDown.body === 'string' && !upstreamDown.body.includes(APP_KEY),
  'El error nunca expone la credencial'
);

// ── 10. Límite de tasa ──────────────────────────────────────────
resetTtsProxyRateLimit();
let lastStatus = 0;
for (let i = 0; i < TTS_PROXY_RATE_LIMIT + 3; i++) {
  const result = await handleTtsProxyRequest(
    {
      method: 'POST',
      headers: baseHeaders,
      body: { text: 'Salchow', voiceName: 'es-US-Neural2-A' },
      clientIp: '10.0.0.99',
    },
    { apiKey: APP_KEY, fetchImpl: okFetch() }
  );
  lastStatus = result.status;
}
assert(lastStatus === 429, `Aplica límite de tasa por IP (${lastStatus})`);

// ── 11. Lector de cuerpo a prueba de cuelgues ────────────────────
//  Regresión del bug de producción: en Vercel el stream llega YA consumido. Si
//  se intentaba leer, `'end'` no disparaba nunca y la invocación se colgaba
//  (500 FUNCTION_INVOCATION_FAILED). Abrir `GET /api/tts` era el disparador.
resetTtsProxyRateLimit();

const endedStream = {
  readableEnded: true,
  on: () => {
    throw new Error('no debe suscribirse a un stream terminado');
  },
};
assert(
  (await readNodeRequestBody(endedStream as never)) === '',
  'Stream ya consumido → resuelve vacío sin suscribirse (no cuelga)'
);

assert(
  (await readNodeRequestBody({ complete: true } as never)) === '',
  'Request completo sin consumir → resuelve vacío'
);

assert(
  (await readNodeRequestBody({ destroyed: true } as never)) === '',
  'Request destruido → resuelve vacío'
);

assert(
  (await readNodeRequestBody({} as never)) === '',
  'Request sin método on → resuelve vacío'
);

const liveStream = {
  on(event: string, listener: (chunk?: unknown) => void) {
    if (event === 'data') queueMicrotask(() => listener('{"text":"Salchow"}'));
    if (event === 'end') queueMicrotask(() => listener());
    return this;
  },
};
assert(
  (await readNodeRequestBody(liveStream as never)) === '{"text":"Salchow"}',
  'Stream vivo → concatena el cuerpo correctamente'
);

const started = Date.now();
const stuckStream = { on: () => {} };
const stuckBody = await readNodeRequestBody(stuckStream as never, 30);
assert(
  stuckBody === '' && Date.now() - started < 1000,
  'Stream que nunca termina → cierra por temporizador de seguridad'
);

// El GET debe responder 405 SIEMPRE (aunque el cuerpo nunca se lea)
const getWithoutBody = await handleTtsProxyRequest(
  { method: 'GET', headers: baseHeaders, body: undefined, clientIp: '10.0.0.50' },
  { apiKey: APP_KEY, fetchImpl: okFetch() }
);
assert(
  getWithoutBody.status === 405,
  `GET sin cuerpo responde 405 de inmediato (${getWithoutBody.status})`
);

// ── 12. Paridad función desplegada ↔ filtro del cliente ─────────
//  La lista blanca está inlineada en `api/tts.ts` (el archivo debe ser
//  autocontenido). Estas comprobaciones impiden que el catálogo evolucione en el
//  cliente y la función desplegada se quede atrás en silencio.
const clientFigures = getAllowedFigureNames();
const serverFigures = new Set(ALLOWED_FIGURES);

const missingOnServer = [...clientFigures].filter((name) => !serverFigures.has(name));
assert(
  missingOnServer.length === 0,
  `La lista blanca desplegada cubre todo el catálogo del cliente${
    missingOnServer.length ? ` (faltan: ${missingOnServer.join(', ')})` : ''
  }`
);

const unknownOnClient = ALLOWED_FIGURES.filter((name) => !clientFigures.has(name));
assert(
  unknownOnClient.length === 0,
  `No hay figuras desplegadas fuera del catálogo${
    unknownOnClient.length ? ` (sobran: ${unknownOnClient.join(', ')})` : ''
  }`
);

const paritySamples = [
  'Salchow',
  'Doble Axel',
  'Figura 1 y 2, Grupo 1',
  'tres',
  'Nodo 3 (Papel)',
  'nota: revisar',
  'Pista_Musical.mp3',
  'sit behind tortuga',
  'curva de transición',
  'Salchow en 3',
];
for (const sample of paritySamples) {
  const client = sanitizeClientSpeech(sample);
  const server = sanitizeServerSpeech(sample);
  assert(
    (client === null) === (server === null),
    `Mismo veredicto cliente/servidor para "${sample}" (cliente: ${JSON.stringify(
      client
    )} · servidor: ${JSON.stringify(server)})`
  );
}

// ── 13. Etiquetas MANUALES (guía vocal escrita por el usuario) ──
//  Con `allowManual` el cliente y el servidor aceptan figuras no catalogadas,
//  pero siguen rechazando estructura/metadatos.
const manualAccepted = 'Trompo casero';
assert(
  sanitizeClientSpeech(manualAccepted, { allowManual: true }) === manualAccepted,
  'Cliente acepta una etiqueta manual ("Trompo casero") en modo manual'
);
assert(
  sanitizeServerSpeech(manualAccepted, { allowManual: true }) === manualAccepted,
  'Servidor acepta la MISMA etiqueta manual (paridad cliente/servidor)'
);
assert(
  sanitizeServerSpeech(manualAccepted) === null && sanitizeClientSpeech(manualAccepted) === null,
  'Sin modo manual, la etiqueta no catalogada se descarta en cliente y servidor'
);
assert(
  sanitizeClientSpeech('Nodo 3', { allowManual: true }) === null &&
    sanitizeServerSpeech('Nodo 3', { allowManual: true }) === null,
  'El modo manual sigue bloqueando etiquetas estructurales ("Nodo 3")'
);
assert(
  sanitizeClientSpeech('Pista_Musical.mp3', { allowManual: true }) === null &&
    sanitizeServerSpeech('Pista_Musical.mp3', { allowManual: true }) === null,
  'El modo manual sigue bloqueando nombres de archivo'
);

console.log('\n✅ TODAS LAS PRUEBAS DEL NÚCLEO DEL PROXY PASARON\n');
