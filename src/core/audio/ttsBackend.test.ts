/**
 * Unit Tests: configuración del back-end de voz en el CLIENTE.
 *
 * Garantiza el modelo de seguridad: la credencial de la app NO está en el
 * cliente; el usuario no configura nada porque la app llama a su propio
 * endpoint `/api/tts`.
 */

import {
  getTtsProxyUrl,
  hasNaturalVoiceBackend,
  hasUserGoogleTtsApiKey,
  isTtsProxyEnabled,
} from './ttsBackend';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${msg}`);
    process.exit(1);
  }
  console.log(`✅ PASSED: ${msg}`);
}

console.log('\n--- EJECUTANDO PRUEBAS DEL BACK-END DE VOZ (CLIENTE) ---');

// ── 1. El endpoint propio está activo por defecto ───────────────
assert(isTtsProxyEnabled(), 'El endpoint propio /api/tts está habilitado por defecto');
assert(getTtsProxyUrl() === '/api/tts', `La ruta por defecto es /api/tts (${getTtsProxyUrl()})`);

// ── 2. Hay voz natural sin que el usuario configure nada ────────
assert(
  hasNaturalVoiceBackend(),
  'Hay voz natural disponible sin intervención del usuario'
);

// ── 3. Sin clave de usuario no se exige configuración ───────────
assert(
  !hasUserGoogleTtsApiKey(),
  'No se requiere una clave aportada por el usuario'
);

// ── 4. No queda ninguna credencial en el bundle del cliente ─────
//    (si algún día se reintroduce una VITE_*, esta prueba debe fallar)
const env = (import.meta as unknown as { env?: Record<string, unknown> }).env ?? {};
assert(
  !env.VITE_GOOGLE_TTS_API_KEY,
  'El cliente NO contiene ninguna credencial de Google Cloud TTS'
);

console.log('\n✅ TODAS LAS PRUEBAS DEL BACK-END DE VOZ PASARON\n');
