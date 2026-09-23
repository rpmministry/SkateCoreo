/**
 * Pruebas del bucle de reproducción (Fase 5.2).
 */

import { normalizeLoop, wrapLoopPositionSec } from './playbackLoop';

let total = 0;
function assert(condition: boolean, msg: string) {
  total++;
  if (!condition) {
    console.error(`FAILED: ${msg}`);
    process.exit(1);
  }
  console.log(`PASSED: ${msg}`);
}

console.log('--- PRUEBAS DE BUCLE DE REPRODUCCIÓN ---');

assert(normalizeLoop(null, 100) === null, 'Sin bucle → null');
assert(
  normalizeLoop({ enabled: false, startSec: 0, endSec: 10 }, 100) === null,
  'Bucle desactivado → null'
);

const full = normalizeLoop({ enabled: true, startSec: 0, endSec: 0 }, 120);
assert(
  full !== null && full.startSec === 0 && full.endSec === 120,
  'endSec=0 significa "hasta el final"'
);

const region = normalizeLoop({ enabled: true, startSec: 10, endSec: 20 }, 120);
assert(region !== null && region.startSec === 10 && region.endSec === 20, 'Región de bucle respetada');

const clamped = normalizeLoop({ enabled: true, startSec: 5, endSec: 500 }, 120);
assert(clamped !== null && clamped.endSec === 120, 'El final del bucle se acota a la duración');

const degenerate = normalizeLoop({ enabled: true, startSec: 10, endSec: 10.01 }, 120);
assert(degenerate === null, 'Rango degenerado (<50 ms) se descarta');

// Envoltura de posición
assert(wrapLoopPositionSec(5, null) === 5, 'Sin bucle la posición no cambia');
assert(wrapLoopPositionSec(15, region!) === 15, 'Dentro del bucle la posición no cambia');
assert(wrapLoopPositionSec(20, region!) === 20, 'En el borde final la posición no cambia');
assert(wrapLoopPositionSec(25, region!) === 15, 'Al superar el final vuelve al rango (25 → 15)');
assert(wrapLoopPositionSec(35, region!) === 15, 'Varias vueltas mantienen el módulo (35 → 15)');
assert(wrapLoopPositionSec(21, region!) === 11, 'Posición 1 s tras el final → 1 s tras el inicio');

console.log(`\nTODAS LAS PRUEBAS DE BUCLE PASARON: ${total}/${total}`);
