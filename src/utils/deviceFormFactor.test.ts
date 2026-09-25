/**
 * Pruebas de la clasificación de factor de forma (deviceFormFactor).
 *
 * Escenarios de referencia (tests obligatorios 28/29):
 *  - Smartphone pequeño / grande      → phone  → Mobile UI
 *  - Tablet 7" / 8" / 10" / 11–13"    → tablet → Desktop UI
 *  - Escritorio y portátiles táctiles → desktop
 *
 * La clave: NO se confunde una tablet con un teléfono por tener touch ni por
 * usar un breakpoint de ancho aislado.
 */

import {
  classifyFormFactor,
  getLayoutMode,
  getPreferredOrientation,
  hasDesktopWorkspace,
  type DeviceCapabilities,
} from './deviceFormFactor';

let total = 0;

function assert(condition: boolean, msg: string) {
  total++;
  if (!condition) {
    console.error(`FAILED: ${msg}`);
    process.exit(1);
  }
  console.log(`PASSED: ${msg}`);
}

console.log('--- PRUEBAS DE FACTOR DE FORMA (PHONE · TABLET · DESKTOP) ---');

const base: DeviceCapabilities = {
  width: 0,
  height: 0,
  hasTouch: true,
  coarsePointer: true,
  noHover: true,
  userAgentIsTablet: false,
  userAgentIsPhone: false,
  userAgentIsDesktop: false,
};

function caps(partial: Partial<DeviceCapabilities>): DeviceCapabilities {
  return { ...base, ...partial };
}

// ── Test 1: smartphone pequeño → mobile UI ──
assert(
  classifyFormFactor(caps({ width: 360, height: 640, userAgentIsPhone: true })) === 'phone',
  'Smartphone pequeño (360×640) → phone (Mobile UI)'
);

// ── Test 2: smartphone grande → sigue siendo mobile UI ──
assert(
  classifyFormFactor(caps({ width: 430, height: 932, userAgentIsPhone: true })) === 'phone',
  'Smartphone grande (430×932) → phone (Mobile UI), no se convierte en desktop'
);

// Un teléfono grande en horizontal (si llegara a verse) sigue siendo teléfono.
assert(
  classifyFormFactor(caps({ width: 932, height: 430, userAgentIsPhone: true })) === 'phone',
  'Smartphone grande en horizontal (932×430) → phone (lado corto < 600)'
);

// ── Test 3: tablet 7" en horizontal (1024×600) → desktop UI ──
assert(
  classifyFormFactor(caps({ width: 1024, height: 600, userAgentIsTablet: true })) === 'tablet',
  'Tablet 7" horizontal (1024×600) → tablet (Desktop UI), NO mobile'
);
assert(
  classifyFormFactor(caps({ width: 1024, height: 600 })) === 'tablet',
  'Tablet 7" horizontal sin pista de UA → tablet por espacio/capacidad'
);

// ── Test 4/5/6: tablets 8", 10" y 11–13" → desktop UI ──
assert(
  classifyFormFactor(caps({ width: 1280, height: 800, userAgentIsTablet: true })) === 'tablet',
  'Tablet 8" horizontal (1280×800) → tablet'
);
assert(
  classifyFormFactor(caps({ width: 1200, height: 800, userAgentIsTablet: true })) === 'tablet',
  'Tablet 10" horizontal (1200×800) → tablet'
);
assert(
  classifyFormFactor(caps({ width: 1366, height: 1024, userAgentIsTablet: true })) === 'tablet',
  'Tablet 11–13" horizontal (1366×1024) → tablet'
);

// Tablet en vertical NO se convierte en teléfono.
assert(
  classifyFormFactor(caps({ width: 800, height: 1280, userAgentIsTablet: true })) === 'tablet',
  'Tablet en vertical (800×1280) → tablet (variante compacta de escritorio)'
);

// iPad con teclado/trackpad: el puntero puede reportarse fino, pero sigue tablet.
assert(
  classifyFormFactor(
    caps({ width: 1180, height: 820, userAgentIsTablet: true, coarsePointer: false, noHover: false })
  ) === 'tablet',
  'iPad con trackpad (puntero fino) → tablet por capacidades/UA'
);

// ── Escritorio ──
assert(
  classifyFormFactor(
    caps({ width: 1920, height: 1080, hasTouch: false, coarsePointer: false, noHover: false })
  ) === 'desktop',
  'Monitor de escritorio sin touch → desktop'
);

// Portátil táctil con ratón: NO es tablet.
assert(
  classifyFormFactor(
    caps({
      width: 1366,
      height: 768,
      userAgentIsDesktop: true,
      coarsePointer: false,
      noHover: false,
    })
  ) === 'desktop',
  'Portátil táctil 1366×768 con ratón → desktop (no se trata como tablet)'
);

// 2-en-1 en modo tablet (puntero grueso y sin hover): sí es tablet.
assert(
  classifyFormFactor(
    caps({ width: 1280, height: 800, userAgentIsDesktop: true, coarsePointer: true, noHover: true })
  ) === 'tablet',
  '2-en-1 en modo tablet (coarse + sin hover) → tablet'
);

// Touch desconocido sin UA: manda el espacio real.
assert(
  classifyFormFactor(caps({ width: 500, height: 900 })) === 'phone',
  'Dispositivo táctil desconocido y estrecho (500×900) → phone'
);
assert(
  classifyFormFactor(caps({ width: 1024, height: 768 })) === 'tablet',
  'Dispositivo táctil desconocido con espacio de tablet (1024×768) → tablet'
);

// El UA manda aunque la capacidad táctil no se exponga correctamente.
assert(
  classifyFormFactor(
    caps({ width: 430, height: 932, hasTouch: false, coarsePointer: false, noHover: false, userAgentIsPhone: true })
  ) === 'phone',
  'UA de teléfono sin detección táctil → phone (no se degrada a desktop)'
);
assert(
  classifyFormFactor(
    caps({ width: 1024, height: 600, hasTouch: false, coarsePointer: false, noHover: false, userAgentIsTablet: true })
  ) === 'tablet',
  'UA de tablet sin detección táctil → tablet'
);

// Robustez
assert(
  classifyFormFactor(caps({ width: 0, height: 0 })) === 'desktop',
  'Dimensiones inválidas (0×0) → desktop (no rompe)'
);

// ── Derivados ──
assert(getLayoutMode('phone') === 'mobile', 'phone → layout mobile');
assert(getLayoutMode('tablet') === 'desktop', 'tablet → layout desktop');
assert(getLayoutMode('desktop') === 'desktop', 'desktop → layout desktop');
assert(getPreferredOrientation('phone') === 'portrait', 'phone → portrait-first');
assert(getPreferredOrientation('tablet') === 'landscape', 'tablet → landscape-first');
assert(hasDesktopWorkspace(1024, 600) === true, '1024×600 admite espacio de escritorio');
assert(hasDesktopWorkspace(430, 932) === false, '430×932 no admite espacio de escritorio');

console.log(`\nTODAS LAS PRUEBAS DE FACTOR DE FORMA PASARON: ${total}/${total}`);
