/**
 * Pruebas de los límites de cámara de la Pista 2D.
 */

import { clampCamera, CameraBounds } from './cameraBounds';

let total = 0;
function assert(condition: boolean, msg: string) {
  total++;
  if (!condition) {
    console.error(`FAILED: ${msg}`);
    process.exit(1);
  }
  console.log(`PASSED: ${msg}`);
}

console.log('--- PRUEBAS DE LÍMITES DE CÁMARA (PISTA 2D) ---');

const bounds: CameraBounds = {
  rectW: 1000,
  rectH: 500,
  offsetX: 0,
  offsetY: 0,
  renderedW: 1000,
  renderedH: 500,
};

// Zoom 1: la pista llena el viewport; el-centrado no debe moverse.
const atRest = clampCamera({ x: 0, y: 0, zoom: 1 }, bounds);
assert(atRest.x === 0 && atRest.y === 0, 'Zoom 1x mantiene la pista centrada en (0,0)');

// Zoom 1: un pan extremo queda acotado (no se pierde la pista).
const panned = clampCamera({ x: 5000, y: 5000, zoom: 1 }, bounds);
assert(panned.x <= bounds.rectW - 48, 'Pan horizontal extremo acotado');
assert(panned.y <= bounds.rectH - 48, 'Pan vertical extremo acotado');

// Zoom 1: pan al lado contrario también acotado.
const pannedNeg = clampCamera({ x: -5000, y: -5000, zoom: 1 }, bounds);
assert(pannedNeg.x >= 48 - 1000, 'Pan horizontal negativo acotado');
assert(pannedNeg.y >= 48 - 500, 'Pan vertical negativo acotado');

// Zoom 0.5: el contenido cabe → se centra ignorando el pan.
const zoomedOut = clampCamera({ x: 999, y: 999, zoom: 0.5 }, bounds);
assert(
  Math.abs(zoomedOut.x - (1000 - 500) / 2) < 1e-6 && Math.abs(zoomedOut.y - (500 - 250) / 2) < 1e-6,
  'Zoom 0.5x centra la pista aunque haya pan previo'
);

// Zoom 4: el contenido excede el viewport → se conserva al menos un margen visible.
const zoomedIn = clampCamera({ x: 100000, y: 100000, zoom: 4 }, bounds);
assert(zoomedIn.x <= 1000 - 48, 'Zoom 4x limita el pan derecho');
assert(zoomedIn.y <= 500 - 48, 'Zoom 4x limita el pan inferior');

// El zoom nunca se altera por el clamping.
assert(zoomedIn.zoom === 4, 'clampCamera no modifica el zoom');

console.log(`\nTODAS LAS PRUEBAS DE CÁMARA PASARON: ${total}/${total}`);
