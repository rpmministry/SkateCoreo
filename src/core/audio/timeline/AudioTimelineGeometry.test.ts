/**
 * Unit Tests: AudioTimelineGeometry (Fase 2 — geometría temporal compartida)
 *
 * Verifica que la única transformación tiempo ↔ píxeles reproduce EXACTAMENTE las
 * fórmulas que antes estaban duplicadas en la regla, los clips, los nodos de la
 * Pista 2D, el playhead y la guía de snapping. Si estas pruebas pasan, la
 * migración no puede desalinear la onda respecto a los nodos.
 */

import {
  computeRulerStep,
  computeRulerTicks,
  createTimelineGeometry,
  decimalsForStep,
  formatTimelineTime,
  RULER_MIN_MAJOR_PX,
} from './AudioTimelineGeometry';

let total = 0;
function assert(condition: boolean, msg: string) {
  total++;
  if (!condition) {
    console.error(`FAILED: ${msg}`);
    process.exit(1);
  }
  console.log(`PASSED: ${msg}`);
}

console.log('\n--- PRUEBAS DE GEOMETRÍA TEMPORAL COMPARTIDA (FASE 2) ---');

// ── 1. Paridad con la fórmula de la regla / clips (origin 0, inset 0) ──
{
  const contentWidth = 1000;
  const duration = 120;
  const g = createTimelineGeometry({ contentWidth, durationSec: duration });

  const legacy = (t: number) => (t / duration) * contentWidth;

  assert(g.timeToPx(0) === legacy(0), 'timeToPx(0) = 0 px');
  assert(g.timeToPx(60) === legacy(60), 'timeToPx(60) = 500 px (punto medio exacto)');
  assert(g.timeToPx(120) === legacy(120), 'timeToPx(120) = 1000 px (borde derecho)');
  assert(
    Math.abs(g.pixelsPerSecond - contentWidth / duration) < 1e-9,
    'pixelsPerSecond = contentWidth / duración'
  );
  assert(
    Math.abs(g.durationToPx(30) - legacy(30)) < 1e-9,
    'durationToPx(30s) = 250 px (ancho de un clip)'
  );
  assert(
    Math.abs(g.pxToTime(250) - 30) < 1e-9,
    'pxToTime(250px) = 30 s (inverso exacto)'
  );
  assert(
    Math.abs(g.pxToDuration(250) - 30) < 1e-9,
    'pxToDuration(250px) = 30 s (equivalente para arrastre)'
  );
}

// ── 2. Paridad con el playhead del Studio (origin = cabecera de pista) ──
{
  const headerWidth = 90;
  const contentWidth = 1200;
  const durationMs = 60000;
  const g = createTimelineGeometry({
    contentWidth,
    durationSec: durationMs / 1000,
    originPx: headerWidth,
  });

  // Fórmula previa: timeToPlayheadPx(timeMs, durationMs, originPx, spanPx)
  const legacy = (timeMs: number) => {
    const ratio = Math.max(0, Math.min(1, timeMs / durationMs));
    return headerWidth + ratio * contentWidth;
  };

  assert(g.timeToPx(0, true) === legacy(0), 'Playhead t=0 cae en el origen (90px)');
  assert(g.timeToPx(30, true) === legacy(30000), 'Playhead a mitad cae en el centro');
  assert(g.timeToPx(60, true) === legacy(60000), 'Playhead al final cae en el borde derecho');
  assert(
    g.timeToPx(99, true) === legacy(99000),
    'Tiempo fuera de rango se satura al final (clamp)'
  );
  assert(g.timeToPx(-5, true) === legacy(-5000), 'Tiempo negativo se satura al origen (clamp)');
}

// ── 3. Paridad con el visor de la Pista 2D (inset = radio de nodo, ms) ──
{
  const PIN_RADIUS = 18;
  const contentWidth = 1000;
  const durationMs = 120000;
  const g = createTimelineGeometry({
    contentWidth,
    durationSec: durationMs / 1000,
    insetPx: PIN_RADIUS,
  });

  const usableW = Math.max(1, contentWidth - PIN_RADIUS * 2);
  const legacy = (timeMs: number) =>
    PIN_RADIUS + Math.max(0, Math.min(1, timeMs / durationMs)) * usableW;

  assert(g.timeToPx(0, true) === legacy(0), 'Pista 2D: t=0 respeta el padding (18px)');
  assert(
    g.timeToPx(0, true) === PIN_RADIUS,
    `Pista 2D: borde izquierdo exacto en ${PIN_RADIUS}px`
  );
  assert(
    g.timeToPx(120, true) === contentWidth - PIN_RADIUS,
    'Pista 2D: borde derecho exacto (982px)'
  );
  assert(g.timeToPx(60, true) === legacy(60000), 'Pista 2D: punto medio sin deformación');
  assert(
    Math.abs(g.pxToTime(g.timeToPx(45, true), true) - 45) < 1e-6,
    'Pista 2D: roundtrip tiempo → px → tiempo es exacto'
  );
}

// ── 4. Paridad con la utilidad del hook (padding y duración mínima de 1) ──
{
  const contentWidth = 1000;
  const pad = 18;
  const duration = 120;
  const g = createTimelineGeometry({
    contentWidth,
    durationSec: Math.max(1, duration),
    insetPx: pad,
  });
  const availableW = Math.max(1, contentWidth - pad * 2);

  const legacyTimeToPx = (t: number) =>
    pad + Math.max(0, Math.min(1, t / duration)) * availableW;
  const legacyPxToTime = (px: number) => {
    const clampedPx = Math.max(0, Math.min(availableW, px - pad));
    return (clampedPx / availableW) * duration;
  };

  assert(g.timeToPx(60, true) === legacyTimeToPx(60), 'Hook: timeToPx coincide');
  assert(
    Math.abs(g.pxToTime(500, true) - legacyPxToTime(500)) < 1e-9,
    'Hook: pxToTime coincide (incluye recorte de píxel)'
  );
}

// ── 5. La tolerancia de snapping derivada de píxeles es estable ──
{
  const at1x = createTimelineGeometry({ contentWidth: 1000, durationSec: 100 });
  const at10x = createTimelineGeometry({ contentWidth: 10000, durationSec: 100 });
  const SNAP_PX = 9;

  const toleranceAt1x = SNAP_PX / at1x.pixelsPerSecond;
  const toleranceAt10x = SNAP_PX / at10x.pixelsPerSecond;

  assert(
    Math.abs(toleranceAt1x - 0.9) < 1e-9,
    'A 1x, 9px de tolerancia equivalen a 0.9 s'
  );
  assert(
    Math.abs(toleranceAt10x - 0.09) < 1e-9,
    'A 10x, la misma tolerancia es 10x más precisa en tiempo'
  );
}

// ── 6. Casos degenerados: no produce NaN ni infinito ──
{
  const bad = createTimelineGeometry({ contentWidth: 0, durationSec: 0 });
  assert(Number.isFinite(bad.timeToPx(10)), 'contentWidth/duración 0 no produce NaN');
  assert(Number.isFinite(bad.pxToTime(NaN)), 'px inválido no produce NaN');
  assert(bad.durationSec > 0, 'La duración se protege con un epsilon positivo');

  const nanTime = createTimelineGeometry({ contentWidth: 800, durationSec: 60 });
  assert(
    nanTime.timeToPx(Number.NaN) === 0,
    'Tiempo NaN devuelve el origen (evita translateX(NaN))'
  );
}

// ── 7. Regla adaptativa: la resolución nace de pixelsPerSecond ──
{
  const at1x = createTimelineGeometry({ contentWidth: 1000, durationSec: 120 }); // 8.33 px/s
  const at20x = createTimelineGeometry({ contentWidth: 20000, durationSec: 120 }); // 166 px/s
  const atExtreme = createTimelineGeometry({ contentWidth: 80000, durationSec: 1 }); // 80.000 px/s

  assert(at1x.rulerStep().majorStepSec === 10, 'A 1x la regla marca cada 10 s (audio de 2 min)');
  assert(at20x.rulerStep().majorStepSec === 0.5, 'A 20x la regla baja a 0.5 s');
  assert(
    atExtreme.rulerStep().majorStepSec <= 0.001,
    'A zoom extremo sobre 1 s la regla alcanza 1 ms'
  );
  assert(
    atExtreme.rulerStep().labelDecimals === 3,
    'El paso de 1 ms etiqueta con 3 decimales'
  );
  assert(
    at1x.rulerStep().majorStepSec > at20x.rulerStep().majorStepSec,
    'Más zoom ⇒ menor intervalo temporal (resolución creciente)'
  );

  for (const pps of [8.33, 41.6, 166, 291, 1000, 10000]) {
    const step = computeRulerStep(pps);
    const gapPx = step.majorStepSec * pps;
    assert(
      gapPx >= RULER_MIN_MAJOR_PX && gapPx <= 160,
      `Separación visual entre marcas en rango profesional (${pps} px/s ⇒ ${gapPx.toFixed(1)} px)`
    );
  }
}

// ── 8. Ticks mayores y menores cubren el rango visible ──
{
  const g = createTimelineGeometry({ contentWidth: 1000, durationSec: 120 });
  const step = g.rulerStep();
  const ticks = computeRulerTicks(0, 60, step);
  const majors = ticks.filter((t) => t.isMajor);
  const minors = ticks.filter((t) => !t.isMajor);

  assert(majors.length >= 6, 'Se generan marcas mayores en el rango visible');
  assert(minors.length > 0, 'La regla incluye subdivisiones menores');
  assert(
    ticks.every((t, i) => i === 0 || ticks[i - 1].timeSec <= t.timeSec),
    'Las marcas están ordenadas temporalmente'
  );
  assert(
    majors.every((t) => Math.abs(t.timeSec / step.majorStepSec - Math.round(t.timeSec / step.majorStepSec)) < 1e-6),
    'Las marcas mayores caen exactamente en múltiplos del paso'
  );
}

// ── 9. Formato adaptativo: solo presentación, nunca cálculo ──
{
  assert(formatTimelineTime(60, decimalsForStep(60)) === '01:00', 'Paso de 60 s ⇒ "01:00"');
  assert(formatTimelineTime(1.5, decimalsForStep(0.5)) === '00:01.5', 'Paso de 0.5 s ⇒ "00:01.5"');
  assert(formatTimelineTime(1.12, decimalsForStep(0.01)) === '00:01.12', 'Paso de 10 ms ⇒ "00:01.12"');
  assert(formatTimelineTime(1.12, decimalsForStep(0.001)) === '00:01.120', 'Paso de 1 ms ⇒ "00:01.120"');
  assert(
    formatTimelineTime(59.9997, 3) === '01:00.000',
    'El acarreo de segundos no produce "00:60.000" (redondea a 01:00.000)'
  );
  assert(formatTimelineTime(119.6, 0) === '02:00', 'Acarreo de 59.6s sin decimales ⇒ "02:00"');
}

// ── 10. visibleRange y aliases canónicos ──
{
  const g = createTimelineGeometry({ contentWidth: 1000, durationSec: 100 });
  const range = g.visibleRange(250, 500);
  assert(Math.abs(range.startSec - 25) < 1e-9 && Math.abs(range.endSec - 75) < 1e-9,
    'visibleRange devuelve el tramo [25s, 75s] para scroll 250px y viewport 500px');
  assert(
    g.timeToPixel(30) === g.timeToPx(30) && g.pixelToTime(300) === g.pxToTime(300),
    'timeToPixel/pixelToTime son la MISMA implementación que timeToPx/pxToTime'
  );
  assert(Math.abs(g.snapToleranceSec(9) - 0.9) < 1e-9, 'snapToleranceSec(9px) = 0.9 s con esta escala (10 px/s)');
}

// ── 11. Precisión continua: el píxel no se limita a milisegundos ──
{
  const g = createTimelineGeometry({ contentWidth: 997, durationSec: 13 });
  const t = g.pixelToTime(1);
  assert(
    Math.abs(t - Math.round(t * 1000) / 1000) > 1e-9,
    'El tiempo devuelto NO está forzado a milisegundos enteros'
  );
  assert(
    Math.abs(g.pixelToTime(g.timeToPixel(t)) - t) < 1e-9,
    'Roundtrip tiempo ⇒ px ⇒ tiempo conserva el valor exacto'
  );
  assert(Number.isFinite(t) && Number.isFinite(g.rulerStep().majorStepSec), 'Sin NaN/Infinity en la geometría');
}

// ── 12. duration = 0 se protege; timestamp = 0 es válido ──
{
  const g = createTimelineGeometry({ contentWidth: 0, durationSec: 0 });
  assert(Number.isFinite(g.pixelToTime(0)) && g.pixelToTime(0) === 0, 'pxToTime(0) = 0 con duración 0');
  assert(Number.isFinite(g.rulerStep().majorStepSec) && g.rulerStep().majorStepSec > 0, 'La regla sigue siendo finita con duración 0');
  assert(g.timeToPixel(0) === 0 && Number.isFinite(g.timeToPixel(0)), 'timestamp 0 es un tiempo válido (0 px)');
}

console.log(`\nTODAS LAS PRUEBAS DE GEOMETRÍA PASARON: ${total}/${total}`);