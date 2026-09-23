/**
 * Pruebas de la lógica de orientación (OrientationGuard).
 */

import {
  shouldShowRotateScreen,
  getOrientationMode,
  isPortrait,
  isSmallViewport,
} from './orientation';

let total = 0;

function assert(condition: boolean, msg: string) {
  total++;
  if (!condition) {
    console.error(`FAILED: ${msg}`);
    process.exit(1);
  }
  console.log(`PASSED: ${msg}`);
}

console.log('--- PRUEBAS DE ORIENTACIÓN (ORIENTATION GUARD) ---');

// Detección básica
assert(isPortrait(390, 844) === true, '390x844 detectado como vertical');
assert(isPortrait(844, 390) === false, '844x390 detectado como horizontal');
assert(isSmallViewport(390, 844) === true, 'viewport de teléfono es pequeño');
assert(isSmallViewport(844, 390) === true, 'Teléfono horizontal sigue siendo viewport pequeño');
assert(isSmallViewport(1180, 820) === false, 'Tablet grande (ancho ≥1024) no es pequeño');
assert(isSmallViewport(1440, 900) === false, 'Desktop 1440x900 no es pequeño');

// Teléfonos y tablets en vertical con táctil → girar
assert(
  shouldShowRotateScreen({ width: 390, height: 844, coarsePointer: true }) === true,
  'iPhone vertical táctil → pantalla girar'
);
assert(
  shouldShowRotateScreen({ width: 820, height: 1180, coarsePointer: true }) === true,
  'iPad vertical táctil → pantalla girar'
);
assert(
  shouldShowRotateScreen({ width: 360, height: 800, coarsePointer: true }) === true,
  'Android vertical táctil → pantalla girar'
);

// Horizontal → app
assert(
  shouldShowRotateScreen({ width: 844, height: 390, coarsePointer: true }) === false,
  'iPhone horizontal → app'
);
assert(
  shouldShowRotateScreen({ width: 1180, height: 820, coarsePointer: true }) === false,
  'iPad horizontal → app'
);

// Escritorio (puntero fino) nunca se bloquea
assert(
  shouldShowRotateScreen({ width: 800, height: 1200, coarsePointer: false }) === false,
  'Ventana de escritorio estrecha en vertical NO se bloquea'
);
assert(
  shouldShowRotateScreen({ width: 1920, height: 1080, coarsePointer: false }) === false,
  'Desktop grande → app'
);

// Modo de orientación
assert(
  getOrientationMode({ width: 390, height: 844, coarsePointer: true }) === 'rotate',
  'Modo rotate en teléfono vertical'
);
assert(
  getOrientationMode({ width: 844, height: 390, coarsePointer: true }) === 'landscape',
  'Modo landscape en teléfono horizontal'
);
assert(
  getOrientationMode({ width: 1920, height: 1080, coarsePointer: false }) === 'app',
  'Modo app en escritorio'
);

// Robustez ante dimensiones inválidas
assert(
  shouldShowRotateScreen({ width: 0, height: 0, coarsePointer: true }) === false,
  'Dimensiones inválidas no bloquean la app'
);

console.log(`\nTODAS LAS PRUEBAS DE ORIENTACIÓN PASARON: ${total}/${total}`);
