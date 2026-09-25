/**
 * Unit Tests: snap (Fase 6 — imán temporal con tolerancia en píxeles)
 *
 * Verifica que la tolerancia se derive de la escala visual, que la prioridad de
 * referencias sea estricta (clip → playhead → origen → grid) y que el beat snap
 * use una tolerancia más fina y respete el interruptor.
 */

import {
  computeSnapOffset,
  snapToleranceSec,
  SNAP_PX,
  BEAT_SNAP_PX,
  type ComputeSnapInput,
} from './snap';

let total = 0;
function assert(condition: boolean, msg: string) {
  total++;
  if (!condition) {
    console.error(`FAILED: ${msg}`);
    process.exit(1);
  }
  console.log(`PASSED: ${msg}`);
}

function input(overrides: Partial<ComputeSnapInput> & { pixelsPerSecond: number }): ComputeSnapInput {
  return {
    rawTimeSec: 0,
    clipDurationSec: 1,
    snapToleranceSec: snapToleranceSec(overrides.pixelsPerSecond, SNAP_PX),
    beatToleranceSec: snapToleranceSec(overrides.pixelsPerSecond, BEAT_SNAP_PX),
    clipEdges: [],
    playheadSec: null,
    originSec: 0,
    bpm: 120,
    gridEnabled: false,
    ...overrides,
  };
}

console.log('\n--- PRUEBAS DE SNAPPING EN PÍXELES (FASE 6) ---');

// ── 1. La tolerancia escala con el zoom ──
{
  const at1x = snapToleranceSec(10, SNAP_PX);
  const at10x = snapToleranceSec(100, SNAP_PX);
  assert(Math.abs(at1x - 0.9) < 1e-9, 'A 1x, 9px equivalen a 0.9s');
  assert(Math.abs(at10x - 0.09) < 1e-9, 'A 10x, 9px equivalen a 0.09s (10x más preciso)');
  assert(
    Math.abs(snapToleranceSec(100, BEAT_SNAP_PX) - 0.04) < 1e-9,
    'La tolerancia del beat snap es más fina que la de las referencias'
  );

  // Un borde a 0.5s se engancha de lejos pero no de cerca.
  const far = computeSnapOffset(
    input({ pixelsPerSecond: 10, rawTimeSec: 0.5, clipEdges: [{ startSec: 0, endSec: 0 }] })
  );
  assert(far.kind === 'clip', 'A 1x, un borde a 0.5s sí se engancha');
  const near = computeSnapOffset(
    input({ pixelsPerSecond: 100, rawTimeSec: 0.5, clipEdges: [{ startSec: 0, endSec: 0 }] })
  );
  assert(near.kind === null, 'A 10x, ese mismo borde a 0.5s NO se engancha (más preciso)');
}

// ── 2. Prioridad: borde de clip gana al playhead ──
{
  const r = computeSnapOffset(
    input({
      pixelsPerSecond: 100,
      rawTimeSec: 5.05,
      clipDurationSec: 1,
      clipEdges: [{ startSec: 5, endSec: 9 }],
      playheadSec: 5.02,
    })
  );
  assert(r.kind === 'clip', 'El borde de clip tiene prioridad sobre el playhead');
  assert(r.snappedSec === 5, 'Se engancha al inicio del clip (5s)');
  assert(r.snapLineSec === 5, 'La guía de snap se dibuja en el borde del clip');
}

// ── 3. Prioridad: playhead gana al origen ──
{
  const r = computeSnapOffset(
    input({ pixelsPerSecond: 100, rawTimeSec: 0.05, playheadSec: 0.05 })
  );
  assert(r.kind === 'playhead', 'El playhead tiene prioridad sobre el origen');
  assert(r.snappedSec === 0.05, 'Se engancha al playhead (0.05s)');
}

// ── 4. Prioridad: origen gana a la cuadrícula ──
{
  const r = computeSnapOffset(
    input({ pixelsPerSecond: 100, rawTimeSec: 0.03, gridEnabled: true, bpm: 120 })
  );
  assert(r.kind === 'origin', 'El origen tiene prioridad sobre la cuadrícula BPM');
  assert(r.snappedSec === 0, 'Se engancha al origen (0s)');
}

// ── 5. Beat snap: solo con la cuadrícula activada y dentro de su tolerancia ──
{
  const on = computeSnapOffset(
    input({ pixelsPerSecond: 100, rawTimeSec: 0.52, gridEnabled: true, bpm: 120, playheadSec: 30 })
  );
  assert(on.kind === 'grid', 'Beat snap: engancha a la cuadrícula BPM cuando está activada');
  assert(on.snappedSec === 0.5, 'Beat snap: cae en 0.5s (negra a 120 BPM)');

  const off = computeSnapOffset(
    input({ pixelsPerSecond: 100, rawTimeSec: 0.52, gridEnabled: false, bpm: 120, playheadSec: 30 })
  );
  assert(off.kind === null && off.snapLineSec === null, 'Con el snap desactivado no engancha a la cuadrícula');

  const tooFar = computeSnapOffset(
    input({ pixelsPerSecond: 100, rawTimeSec: 0.55, gridEnabled: true, bpm: 120, playheadSec: 30 })
  );
  assert(tooFar.kind === null, 'Fuera de la tolerancia fina del beat snap, no engancha');
}

// ── 6. Acoplamientos fin-a-inicio (B) e inicio-a-inicio (C) ──
{
  const b = computeSnapOffset(
    input({
      pixelsPerSecond: 100,
      rawTimeSec: 7.95,
      clipDurationSec: 2,
      clipEdges: [{ startSec: 10, endSec: 12 }],
      playheadSec: 30,
    })
  );
  assert(b.kind === 'clip' && Math.abs(b.snappedSec - 8) < 1e-6, 'Acople B: el fin del clip cae en el inicio del vecino');

  const c = computeSnapOffset(
    input({
      pixelsPerSecond: 100,
      rawTimeSec: 5.03,
      clipDurationSec: 2,
      clipEdges: [{ startSec: 5, endSec: 9 }],
      playheadSec: 30,
    })
  );
  assert(c.kind === 'clip' && c.snappedSec === 5, 'Acople C: inicios alineados');
}

// ── 7. Sin referencia cercana → valor crudo, sin guía ──
{
  const r = computeSnapOffset(
    input({
      pixelsPerSecond: 100,
      rawTimeSec: 3.11111,
      gridEnabled: true,
      bpm: 120,
      playheadSec: 30,
      originSec: 0,
    })
  );
  assert(r.kind === null, 'Sin referencia en rango no hay snap');
  assert(r.snapLineSec === null, 'Sin snap no se dibuja guía');
  assert(
    r.snappedSec === 3.11111,
    'El valor crudo conserva la precisión completa (sin redondeo a milisegundos)'
  );
}

// ── 8. Robustez: tiempo negativo y tolerancias degeneradas ──
{
  const neg = computeSnapOffset(
    input({ pixelsPerSecond: 100, rawTimeSec: -3, playheadSec: null })
  );
  assert(neg.snappedSec === 0 && neg.kind === 'origin', 'Tiempo negativo se satura al origen');

  const noScale = computeSnapOffset(
    input({ pixelsPerSecond: 0, rawTimeSec: 4.2, playheadSec: null })
  );
  assert(Number.isFinite(noScale.snappedSec) && noScale.kind === null, 'Escala 0 no rompe: devuelve el valor sin NaN');
}

console.log(`\nTODAS LAS PRUEBAS DE SNAPPING PASARON: ${total}/${total}`);
