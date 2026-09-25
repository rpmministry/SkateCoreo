/**
 * Pruebas de la lógica de orientación (OrientationGuard).
 *
 * Regla de producto:
 *  - TELÉFONO (táctil, lado corto < 600): portrait-first; en horizontal se pide
 *    girar de vuelta.
 *  - TABLET ≥7" (táctil, lado corto ≥ 600): admite horizontal (composición de
 *    escritorio) y NUNCA se bloquea.
 *  - ESCRITORIO (puntero fino) nunca se bloquea.
 */

import {
  shouldShowRotateScreen,
  getOrientationMode,
  isPortrait,
  isPhoneOrTabletViewport,
  isPhoneViewport,
  isTabletViewport,
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

console.log('--- PRUEBAS DE ORIENTACIÓN (ORIENTATION GUARD · PORTRAIT-FIRST) ---');

// Detección básica
assert(isPortrait(390, 844) === true, '390x844 detectado como vertical');
assert(isPortrait(844, 390) === false, '844x390 detectado como horizontal');
assert(isPhoneOrTabletViewport(390, 844) === true, 'viewport de teléfono es pequeño');
assert(isPhoneOrTabletViewport(1180, 820) === true, 'Tablet horizontal es dispositivo pequeño (lado corto)');
assert(isPhoneOrTabletViewport(1920, 1080) === false, 'Monitor grande no es dispositivo pequeño');

// Frontera teléfono/tabla: lado corto de 600 px (clase 7").
assert(isPhoneViewport(390, 844) === true, '390×844 es teléfono');
assert(isPhoneViewport(1024, 600) === false, '1024×600 NO es teléfono (lado corto 600)');
assert(isTabletViewport(1024, 600) === true, '1024×600 es tablet (7" horizontal)');
assert(isTabletViewport(800, 1280) === true, '800×1280 es tablet (vertical)');
assert(isTabletViewport(430, 932) === false, '430×932 no es tablet');

// TABLET ≥7" en horizontal NUNCA se bloquea (usa composición de escritorio).
assert(
  shouldShowRotateScreen({ width: 1024, height: 600, coarsePointer: true }) === false,
  'Tablet 7" horizontal (1024×600) NO se bloquea'
);
assert(
  shouldShowRotateScreen({ width: 800, height: 600, coarsePointer: true }) === false,
  'Tablet pequeña horizontal (800×600) NO se bloquea'
);

// Cuando el snapshot aporta la clasificación, el bloqueo coincide EXACTAMENTE
// con la composición visual (misma fuente de verdad que `classifyFormFactor`).
assert(
  shouldShowRotateScreen({
    width: 800,
    height: 480,
    coarsePointer: true,
    formFactor: 'tablet',
  }) === false,
  'Tablet clasificada (aunque el lado corto sea < 600) NO se bloquea'
);
assert(
  shouldShowRotateScreen({
    width: 932,
    height: 430,
    coarsePointer: true,
    formFactor: 'phone',
  }) === true,
  'Teléfono clasificado en horizontal SÍ se bloquea'
);

// Teléfonos y tablets en horizontal con táctil → girar a vertical
assert(
  shouldShowRotateScreen({ width: 844, height: 390, coarsePointer: true }) === true,
  'iPhone horizontal táctil → pantalla girar'
);
assert(
  shouldShowRotateScreen({ width: 1180, height: 820, coarsePointer: true }) === false,
  'iPad/tablet horizontal (lado corto ≥768) NO se bloquea'
);
assert(
  shouldShowRotateScreen({ width: 800, height: 360, coarsePointer: true }) === true,
  'Android horizontal táctil → pantalla girar'
);

// Vertical → app móvil (nunca se pide girar)
assert(
  shouldShowRotateScreen({ width: 390, height: 844, coarsePointer: true }) === false,
  'iPhone vertical táctil → app'
);
assert(
  shouldShowRotateScreen({ width: 820, height: 1180, coarsePointer: true }) === false,
  'iPad vertical táctil → app'
);
assert(
  shouldShowRotateScreen({ width: 360, height: 800, coarsePointer: true }) === false,
  'Android vertical táctil → app'
);

// El teclado virtual puede encoger el alto: la orientación FÍSICA manda.
// 360x300 por aspecto parecería "horizontal", pero matchMedia dice vertical.
assert(
  shouldShowRotateScreen({ width: 360, height: 300, coarsePointer: true, landscape: false }) === false,
  'Teclado virtual abierto en vertical NO bloquea aunque el alto caiga bajo el ancho'
);
assert(
  shouldShowRotateScreen({ width: 360, height: 800, coarsePointer: true, landscape: true }) === true,
  'La orientación física horizontal manda sobre el aspecto'
);

// Escritorio (puntero fino) nunca se bloquea
assert(
  shouldShowRotateScreen({ width: 800, height: 1200, coarsePointer: false }) === false,
  'Ventana de escritorio estrecha NO se bloquea'
);
assert(
  shouldShowRotateScreen({ width: 1920, height: 1080, coarsePointer: false }) === false,
  'Desktop grande → app'
);

// Modo de orientación
assert(
  getOrientationMode({ width: 390, height: 844, coarsePointer: true }) === 'portrait',
  'Modo portrait en teléfono vertical'
);
assert(
  getOrientationMode({ width: 844, height: 390, coarsePointer: true }) === 'rotate',
  'Modo rotate en teléfono horizontal'
);
assert(
  getOrientationMode({ width: 1920, height: 1080, coarsePointer: false }) === 'app',
  'Modo app en escritorio'
);
assert(
  getOrientationMode({ width: 1024, height: 600, coarsePointer: true }) === 'app',
  'Modo app en tablet horizontal (no se fuerza portrait)'
);
assert(
  getOrientationMode({ width: 1024, height: 600, coarsePointer: true, formFactor: 'tablet' }) === 'app',
  'Modo app cuando la clasificación aportada es tablet'
);
assert(
  getOrientationMode({ width: 390, height: 844, coarsePointer: true, formFactor: 'phone' }) === 'portrait',
  'Modo portrait cuando la clasificación aportada es teléfono'
);

// ── Estabilidad con el teclado virtual (BUG CRÍTICO de inputs) ──
// El teclado reduce el viewport y el CSS puede reportar "landscape" aunque el
// teléfono siga en vertical. Editar texto NUNCA debe mostrar la pantalla de giro.
assert(
  shouldShowRotateScreen({
    width: 390,
    height: 320,
    coarsePointer: true,
    landscape: true,
    editableFocused: true,
  }) === false,
  'Con un campo de texto enfocado NO se bloquea (el teclado no es un giro)'
);
assert(
  shouldShowRotateScreen({
    width: 390,
    height: 300,
    coarsePointer: true,
    landscape: false,
    keyboardOpen: true,
  }) === false,
  'Con el teclado abierto NO se bloquea'
);
assert(
  shouldShowRotateScreen({
    width: 390,
    height: 300,
    coarsePointer: true,
    landscape: true,
    keyboardOpen: true,
  }) === true,
  'Un giro REAL a landscape se bloquea aunque el teclado esté abierto'
);
assert(
  shouldShowRotateScreen({ width: 844, height: 390, coarsePointer: true, landscape: true }) === true,
  'Landscape físico real (sin edición ni teclado) SÍ bloquea'
);

// Robustez ante dimensiones inválidas
assert(
  shouldShowRotateScreen({ width: 0, height: 0, coarsePointer: true }) === false,
  'Dimensiones inválidas no bloquean la app'
);

console.log(`\nTODAS LAS PRUEBAS DE ORIENTACIÓN PASARON: ${total}/${total}`);
