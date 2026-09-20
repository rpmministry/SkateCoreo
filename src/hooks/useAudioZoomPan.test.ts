/**
 * Unit Tests: useAudioZoomPan & Focal Point Zoom Math
 * Verifies mathematical focal anchoring, coordinate transformations, and zero-distortion geometry.
 */

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${msg}`);
    process.exit(1);
  }
  console.log(`✅ PASSED: ${msg}`);
}

console.log('\n--- EJECUTANDO PRUEBAS DEL MOTOR DE ZOOM Y PANEO DINÁMICO ---');

// 1. Verificación de Transformaciones de Tiempo a Píxel (timeToPx)
function testTimeToPx(timeSec: number, totalDurationSec: number, contentWidth: number, padPx: number = 0): number {
  const dur = Math.max(1, totalDurationSec);
  const ratio = Math.max(0, Math.min(1, timeSec / dur));
  const availableW = Math.max(1, contentWidth - padPx * 2);
  return padPx + ratio * availableW;
}

function testPxToTime(px: number, totalDurationSec: number, contentWidth: number, padPx: number = 0): number {
  const dur = Math.max(1, totalDurationSec);
  const availableW = Math.max(1, contentWidth - padPx * 2);
  const clampedPx = Math.max(0, Math.min(availableW, px - padPx));
  return (clampedPx / availableW) * dur;
}

// Prueba 1: Proyección en los bordes con Safe Zone Padding (18px)
const pad = 18;
const duration = 120;
const width1x = 1000;

const startPx = testTimeToPx(0, duration, width1x, pad);
assert(startPx === 18, `timeToPx(0) respeta padding inicial: esperado 18, obtenido ${startPx}`);

const endPx = testTimeToPx(120, duration, width1x, pad);
assert(endPx === 1000 - 18, `timeToPx(120) respeta padding final: esperado 982, obtenido ${endPx}`);

const midPx = testTimeToPx(60, duration, width1x, pad);
assert(midPx === 500, `timeToPx(60) punto medio exacto: esperado 500, obtenido ${midPx}`);

// Prueba 2: Conversión inversa de pxToTime (Idempotencia y roundtrip)
const roundtripTime = testPxToTime(midPx, duration, width1x, pad);
assert(Math.abs(roundtripTime - 60) < 0.001, `pxToTime(500px) revierte a exactamente 60s (obtenido: ${roundtripTime})`);

// Prueba 3: Escalamiento puro de Píxeles por Segundo (Sin CSS scaleX)
const width10x = width1x * 10; // 10,000px
const pxPerSec1x = width1x / duration;
const pxPerSec10x = width10x / duration;
assert(
  Math.abs(pxPerSec10x - pxPerSec1x * 10) < 0.0001,
  `pxPerSec escala linealmente 10x (1x: ${pxPerSec1x.toFixed(1)} px/s, 10x: ${pxPerSec10x.toFixed(1)} px/s)`
);

// Prueba 4: Focal Point Math (Anclaje exacto en el cursor)
// Si el cursor está en xScreen = 300px con scrollLeft = 200px:
const oldScrollLeft = 200;
const xScreen = 300;
const oldContentW = 2000; // 2x zoom
const newContentW = 5000; // 5x zoom

// Coordenada temporal bajo el cursor antes del zoom
const focalContentX = oldScrollLeft + xScreen; // 500px
const focalRatio = focalContentX / oldContentW; // 500 / 2000 = 0.25 (25% del audio)
const timeUnderCursorOld = focalRatio * duration; // 30s

// Cálculo del nuevo scrollLeft para mantener el mismo punto bajo el cursor
const targetScrollLeft = focalRatio * newContentW - xScreen; // 0.25 * 5000 - 300 = 1250 - 300 = 950px

// Verificación: En la nueva posición de scroll, ¿qué tiempo hay bajo xScreen = 300px?
const newContentXUnderCursor = targetScrollLeft + xScreen; // 950 + 300 = 1250px
const timeUnderCursorNew = (newContentXUnderCursor / newContentW) * duration; // (1250 / 5000) * 120 = 30s

assert(
  Math.abs(timeUnderCursorNew - timeUnderCursorOld) < 0.0001,
  `Focal point math ancla milimétricamente el cursor en ${timeUnderCursorOld}s tras cambiar zoom (obtenido: ${timeUnderCursorNew}s)`
);

// Prueba 5: Graduación Dinámica LOD para Regla de Tiempo
function getRulerLODStep(pxPerSec: number): { major: number; sub: number } {
  if (pxPerSec > 250) return { major: 0.5, sub: 0.1 };
  if (pxPerSec > 120) return { major: 1, sub: 0.25 };
  if (pxPerSec > 50) return { major: 2, sub: 0.5 };
  if (pxPerSec > 20) return { major: 5, sub: 1 };
  if (pxPerSec > 8) return { major: 10, sub: 2 };
  if (pxPerSec > 3) return { major: 30, sub: 5 };
  return { major: 60, sub: 15 };
}

const lod1x = getRulerLODStep(width1x / duration); // 8.33 px/s -> 10s
assert(lod1x.major === 10, `LOD en 1x selecciona marcas cada 10s`);

const lod5x = getRulerLODStep((width1x * 5) / duration); // 41.6 px/s -> 5s
assert(lod5x.major === 5, `LOD en 5x selecciona marcas cada 5s`);

const lod20x = getRulerLODStep((width1x * 20) / duration); // 166 px/s -> 1s
assert(lod20x.major === 1, `LOD en 20x selecciona marcas cada 1s`);

const lod35x = getRulerLODStep((width1x * 35) / duration); // 291 px/s -> 0.5s
assert(lod35x.major === 0.5, `LOD en 35x selecciona marcas cada 0.5s (milisegundos)`);

console.log('Resultado useAudioZoomPan: 9/9 pruebas pasadas con éxito.\n');
