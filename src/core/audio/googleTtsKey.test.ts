/**
 * Unit Tests: credencial propia de la app para Google Cloud TTS.
 *
 * Garantiza que el USUARIO FINAL NUNCA tenga que introducir una API Key:
 * la credencial viaja inyectada en el build (`.env` / variables de Vercel) y el
 * motor de voz debe quedar configurado en modo natural automáticamente.
 *
 * Nota: la variable de entorno se define ANTES de importar los módulos, por eso
 * se usan importaciones dinámicas (el valor se resuelve una sola vez al cargar).
 */

// Marca el archivo como módulo: permite top-level await y aísla `assert` del
// ámbito global (evita colisión con otros archivos de prueba).
export {};

const TEST_KEY = 'AIzaSyTEST_APP_OWNED_KEY_0000000000000';
(process.env as Record<string, string>).VITE_GOOGLE_TTS_API_KEY = TEST_KEY;

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${msg}`);
    process.exit(1);
  }
  console.log(`✅ PASSED: ${msg}`);
}

console.log('\n--- EJECUTANDO PRUEBAS DE CREDENCIAL INCLUIDA (TTS) ---');

const keyModule = await import('./googleTtsKey');
const { ttsService } = await import('../../services/ttsService');
const { VoiceCueEngine } = await import('./VoiceCueEngine');

// ── 1. La credencial de la app se detecta ──────────────────────
assert(
  keyModule.hasBuiltInGoogleTtsApiKey(),
  'La app detecta su credencial incluida (hasBuiltInGoogleTtsApiKey)'
);
assert(
  keyModule.getBuiltInGoogleTtsApiKey() === TEST_KEY,
  'La credencial incluida es exactamente la inyectada en el build'
);
assert(
  keyModule.resolveGoogleTtsApiKey() === TEST_KEY,
  'resolveGoogleTtsApiKey prioriza la credencial de la app'
);

// ── 2. El servicio TTS queda operativo sin intervención del usuario ──
assert(ttsService.hasGoogleApiKey(), 'ttsService detecta la credencial incluida');
assert(ttsService.isUsingBuiltInApiKey(), 'ttsService informa que usa la credencial de la app');

// ── 3. El motor de voz se configura solo, en modo natural ──────
const engine = new VoiceCueEngine();
assert(
  engine.getConfig().ttsEngine === 'google-cloud',
  `Sin preferencia previa, el motor por defecto es Google Cloud (${engine.getConfig().ttsEngine})`
);
assert(
  engine.getConfig().googleApiKey === TEST_KEY,
  'El motor de voz usa la credencial incluida'
);
assert(engine.hasBuiltInApiKey(), 'El motor de voz informa credencial incluida');

// ── 4. La credencial de la app es autoritativa (no sobrescribible) ──
engine.setGoogleApiKey('CLAVE_MANUAL_QUE_NO_DEBE_GANAR');
assert(
  engine.getConfig().googleApiKey === TEST_KEY,
  'Una clave manual NO puede sobrescribir la credencial de la app'
);

// ── 5. Un usuario sin credencial previa NO necesita configurar nada ──
const freshEngine = new VoiceCueEngine({ ttsEngine: 'browser', googleApiKey: null });
assert(
  freshEngine.hasBuiltInApiKey(),
  'Incluso forzando configuración manual, la credencial de la app sigue disponible'
);

console.log('\n✅ TODAS LAS PRUEBAS DE CREDENCIAL INCLUIDA PASARON\n');
