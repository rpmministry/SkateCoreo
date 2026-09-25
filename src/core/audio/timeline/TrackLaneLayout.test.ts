/**
 * Unit Tests: TrackLaneLayout (Fase 5 — altura de carril adaptativa)
 *
 * Verifica que la altura se derive del alto disponible respetando los topes
 * min/max, que móvil priorice el toque y que, sin medida de viewport, se conserve
 * el comportamiento anterior.
 */

import {
  computeTrackLaneHeight,
  computeTrackHeaderWidth,
  fallbackTrackLaneHeight,
  TRACK_LANE_BOUNDS,
  TRACK_HEADER_WIDTHS,
} from './TrackLaneLayout';

let total = 0;
function assert(condition: boolean, msg: string) {
  total++;
  if (!condition) {
    console.error(`FAILED: ${msg}`);
    process.exit(1);
  }
  console.log(`PASSED: ${msg}`);
}

console.log('\n--- PRUEBAS DE ALTURA DE CARRIL ADAPTATIVA (FASE 5) ---');

// ── 1. Sin medida de viewport → respaldo por número de pistas ──
{
  assert(fallbackTrackLaneHeight(2) === 84, 'Respaldo: 2 pistas → 84px');
  assert(fallbackTrackLaneHeight(3) === 72, 'Respaldo: 3 pistas → 72px');
  assert(fallbackTrackLaneHeight(4) === 64, 'Respaldo: 4 pistas → 64px');
  assert(fallbackTrackLaneHeight(5) === 56, 'Respaldo: 5 pistas → 56px');

  assert(
    computeTrackLaneHeight(0, 3, { isMobile: true }) === fallbackTrackLaneHeight(3),
    'Alto disponible 0 conserva el respaldo (sin romper el primer render)'
  );
  assert(
    computeTrackLaneHeight(Number.NaN, 2, { isMobile: false }) === fallbackTrackLaneHeight(2),
    'Alto NaN conserva el respaldo'
  );
}

// ── 2. Móvil: nunca por debajo del mínimo táctil ni por encima del máximo ──
{
  const mobile = { isMobile: true };
  // Pantalla muy baja (320x568) con 5 pistas: el reparto puro daría ~45px.
  const cramped = computeTrackLaneHeight(280, 5, mobile);
  assert(
    cramped === TRACK_LANE_BOUNDS.mobile.min,
    `Móvil 5 pistas y poco alto → se eleva al mínimo táctil (${TRACK_LANE_BOUNDS.mobile.min}px), no filas diminutas`
  );
  // Con algo más de espacio el reparto proporcional queda por encima del mínimo.
  const proportional = computeTrackLaneHeight(420, 5, mobile);
  assert(
    proportional > TRACK_LANE_BOUNDS.mobile.min && proportional < TRACK_LANE_BOUNDS.mobile.max,
    `Móvil 5 pistas con espacio medio → valor proporcional (${proportional}px)`
  );

  // Pantalla alta con 1 pista → no debe crecer sin límite.
  const roomy = computeTrackLaneHeight(900, 1, mobile);
  assert(
    roomy === TRACK_LANE_BOUNDS.mobile.max,
    `Móvil con mucho espacio → máximo (${TRACK_LANE_BOUNDS.mobile.max}px), sin fila gigante`
  );
}

// ── 3. Escritorio: más compacto y también acotado ──
{
  const desktop = { isMobile: false };
  const many = computeTrackLaneHeight(500, 5, desktop);
  assert(many >= TRACK_LANE_BOUNDS.desktop.min, 'Escritorio 5 pistas respeta el mínimo');
  assert(
    computeTrackLaneHeight(1200, 1, desktop) === TRACK_LANE_BOUNDS.desktop.max,
    'Escritorio con mucho espacio se compacta al máximo'
  );
  assert(
    TRACK_LANE_BOUNDS.desktop.max < TRACK_LANE_BOUNDS.mobile.max,
    'El máximo de escritorio es más compacto que el de móvil'
  );
}

// ── 4. Distribución proporcional dentro de los límites ──
{
  const desktop = { isMobile: false };
  // 600px útiles (656 - 56) repartidos en 4 pistas = 150 → se topa a 96.
  const four = computeTrackLaneHeight(656, 4, desktop);
  assert(four === TRACK_LANE_BOUNDS.desktop.max, '4 pistas holgadas se topan al máximo');

  // 296px útiles en 4 pistas = 74 → valor intermedio, no topado.
  const tight = computeTrackLaneHeight(352, 4, desktop);
  assert(tight === 74, `4 pistas en espacio medio → 74px (obtenido ${tight})`);
  assert(tight > TRACK_LANE_BOUNDS.desktop.min && tight < TRACK_LANE_BOUNDS.desktop.max, 'Valor intermedio dentro del rango');
}

// ── 5. Nunca devuelve valores absurdos ──
{
  const values = [0, 56, 200, 800, 2000];
  const counts = [1, 2, 3, 4, 5];
  let ok = true;
  for (const h of values) {
    for (const c of counts) {
      for (const isMobile of [true, false]) {
        const v = computeTrackLaneHeight(h, c, { isMobile });
        if (!Number.isFinite(v) || v <= 0 || v > 240) ok = false;
      }
    }
  }
  assert(ok, 'Todas las combinaciones producen alturas finitas y razonables');
}

// ── 6. Ancho de cabecera de pista: el nombre SIEMPRE tiene espacio real ──
{
  const phone = computeTrackHeaderWidth(390);
  const tablet = computeTrackHeaderWidth(768);
  const desktop = computeTrackHeaderWidth(1440);
  assert(phone === TRACK_HEADER_WIDTHS.compact, 'Móvil recibe cabecera compacta');
  assert(tablet === TRACK_HEADER_WIDTHS.medium, 'Tablet recibe cabecera media');
  assert(desktop === TRACK_HEADER_WIDTHS.wide, 'Desktop recibe cabecera ancha');
  assert(phone < tablet && tablet < desktop, 'La cabecera crece con el espacio disponible');
  assert(
    computeTrackHeaderWidth(0) === TRACK_HEADER_WIDTHS.compact &&
      computeTrackHeaderWidth(Number.NaN) === TRACK_HEADER_WIDTHS.compact,
    'Sin medida fiable la cabecera usa el tramo compacto'
  );
  assert(phone >= 120, `Ni en el móvil más pequeño la cabecera baja de 120px (${phone}px)`);
}

console.log(`\nTODAS LAS PRUEBAS DE ALTURA DE CARRIL PASARON: ${total}/${total}`);
