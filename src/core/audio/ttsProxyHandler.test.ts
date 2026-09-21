/**
 * Unit Tests: núcleo del proxy de voz (`handleTtsProxyRequest`).
 *
 * Todo se ejecuta sin red: `fetch` se inyecta como doble de prueba. Así se
 * valida el comportamiento real del endpoint que corre en Vercel.
 */

import {
  handleTtsProxyRequest,
  resetTtsProxyRateLimit,
} from './ttsProxyHandler';
import { TTS_PROXY_RATE_LIMIT } from './ttsProxyContract';

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
    body: { text: 'Salchow', voiceName: 'es-US-Neural2-C', speed: 1.05 },
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
  sentPayload?.voice?.name === 'es-US-Neural2-C' && sentPayload?.input?.text === 'Salchow',
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
    body: { text: 'Nodo 3 (Papel)', voiceName: 'es-US-Neural2-C' },
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
  if (body.voice.name === 'es-US-Neural2-C') {
    return { ok: false, status: 400, json: async () => ({}), text: async () => 'not enabled' };
  }
  return { ok: true, status: 200, json: async () => ({ audioContent: MP3_BASE64 }), text: async () => '' };
}) as unknown as typeof fetch;

const fallbackResult = await handleTtsProxyRequest(
  {
    method: 'POST',
    headers: baseHeaders,
    body: { text: 'Salchow', voiceName: 'es-US-Neural2-C' },
    clientIp: '10.0.0.8',
  },
  { apiKey: APP_KEY, fetchImpl: fallbackFetch }
);
assert(fallbackResult.status === 200, 'Reintenta con el respaldo Wavenet y responde 200');
assert(
  attempts.join(' → ') === 'es-US-Neural2-C → es-US-Wavenet-C',
  `Orden de intentos correcto (${attempts.join(' → ')})`
);

// ── 9. Google caído: error controlado, sin filtrar detalles ─────
const upstreamDown = await handleTtsProxyRequest(
  {
    method: 'POST',
    headers: baseHeaders,
    body: { text: 'Salchow', voiceName: 'es-US-Neural2-C' },
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
      body: { text: 'Salchow', voiceName: 'es-US-Neural2-C' },
      clientIp: '10.0.0.99',
    },
    { apiKey: APP_KEY, fetchImpl: okFetch() }
  );
  lastStatus = result.status;
}
assert(lastStatus === 429, `Aplica límite de tasa por IP (${lastStatus})`);

console.log('\n✅ TODAS LAS PRUEBAS DEL NÚCLEO DEL PROXY PASARON\n');
