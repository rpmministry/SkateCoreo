/**
 * Unit Tests: AudioTimelineGeometry (Fase 2 — geometría temporal compartida)
 *
 * Verifica que la única transformación tiempo ↔ píxeles reproduce EXACTAMENTE las
 * fórmulas que antes estaban duplicadas en la regla, los clips, los nodos de la
 * Pista 2D, el playhead y la guía de snapping. Si estas pruebas pasan, la
 * migración no puede desalinear la onda respecto a los nodos.
 */

import { createTimelineGeometry } from './AudioTimelineGeometry';

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

console.log(`\nTODAS LAS PRUEBAS DE GEOMETRÍA PASARON: ${total}/${total}`);
