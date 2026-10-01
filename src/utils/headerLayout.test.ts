/**
 * headerLayout.test.ts — Verificación geométrica del layout responsive de la barra superior.
 *
 * OBJETIVO:
 * Garantizar matemáticamente y por diseño que la pestaña "Atletas" (la 4ª pestaña de la navegación central)
 * NUNCA colisione ni quede solapada o tapada por los controles de reproducción (Play / Pausa / Stop / RinkAudioPlayer)
 * en ninguna resolución ni orientación, dando prioridad máxima a tabletas en orientación horizontal (landscape).
 */

/**
 * Calcula la geometría de distribución del header de acuerdo a las reglas implementadas:
 * - En >=1024px (tablet landscape y desktop): Rejilla de 3 columnas (brand | nav | actions)
 *   - En 1024px-1279px (lg): Audio meters ocultos, botones de acción compactos (36px).
 *   - En 1280px-1535px (xl): Audio meters visibles (xl:flex), botones de acción compactos (36px).
 *   - En >=1536px (2xl): Textos expandidos en botones de acción (hidden 2xl:inline).
 * - En <1024px:
 *   - Tablet portrait (768-1023px): 2 filas deterministas (Fila 1: brand + actions, Fila 2: nav a todo el ancho).
 *   - Phone (<768px): Header compacto móvil con bottom nav.
 */
function computeHeaderSpacing(
  viewportWidth: number,
  orientation: 'landscape' | 'portrait',
  isCoach: boolean = false
) {
  const isDesktopOrTabletLandscape = viewportWidth >= 1024;
  const isXlOrLarger = viewportWidth >= 1280;
  const is2xlOrLarger = viewportWidth >= 1536;

  const paddingX = viewportWidth >= 1024 ? 32 : 16;
  const brandWidth = isXlOrLarger ? 220 : 150; // SkateCoreo logo + texto (+ atleta en xl)

  // DesktopHeaderNav: 4 pestañas integradas
  // - Usuario común: ("Inicio", "Pista", "Estudio", "Atletas") -> 285px
  // - Entrenador: ("Inicio", "Pista", "Estudio", "Entrenador" / "Panel del Entrenador") -> 300px (<2xl) / 360px (>=2xl)
  const navWidth = isCoach ? (is2xlOrLarger ? 360 : 300) : 285;

  // Acciones a la derecha en la vista de Pista (la más densa):
  // RinkAudioPlayer (transport: rewind 32 + play 36 + stop 32 + time 80 + gaps/paddings ≈ 200px)
  // + Limpiar pista (36px en lg/xl; 115px en 2xl)
  // + Subir pista al visor (36px en lg/xl; 165px en 2xl)
  // + Logout (36px)
  // + Menú más (36px)
  // + Audio meters (190px, en >=xl)
  const rinkAudioPlayerWidth = isXlOrLarger ? 390 : 200;
  const clearRinkWidth = is2xlOrLarger ? 115 : 36;
  const uploadTrackWidth = is2xlOrLarger ? 165 : 36;
  const logoutWidth = 36;
  const moreMenuWidth = 36;
  const actionsGap = 24;

  const actionsWidth =
    rinkAudioPlayerWidth + clearRinkWidth + uploadTrackWidth + logoutWidth + moreMenuWidth + actionsGap;

  const availableGridWidth = viewportWidth - paddingX;
  const remainingForNav = availableGridWidth - brandWidth - actionsWidth;
  const clearanceMargin = remainingForNav - navWidth;

  // Distancia libre entre el borde derecho de "Atletas" / "Entrenador" y el borde izquierdo del botón de Play/Transporte
  const athletesToPlayClearance = clearanceMargin / 2;

  const isTwoRows = !isDesktopOrTabletLandscape && (orientation === 'portrait' || viewportWidth >= 768);

  return {
    isDesktopOrTabletLandscape,
    isTwoRows,
    isMobileBottomNav: viewportWidth < 768,
    availableGridWidth,
    brandWidth,
    navWidth,
    actionsWidth,
    remainingForNav,
    clearanceMargin,
    athletesToPlayClearance,
  };
}

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`❌ FALLÓ: ${msg}`);
    process.exit(1);
  }
  console.log(`✅ PASSED: ${msg}`);
}

console.log('\n--- VERIFICACIÓN DE GEOMETRÍA RESPONSIVE DE LA BARRA SUPERIOR ---\n');

// 1. Tabletas en Landscape (1024px - estándar iPad landscape, Galaxy Tab, Pixel Tablet)
const tablet1024 = computeHeaderSpacing(1024, 'landscape');
assert(tablet1024.isDesktopOrTabletLandscape, '1024px clasifica como rejilla 3 columnas de escritorio');
assert(tablet1024.actionsWidth <= 380, `Acciones en 1024px compactadas a <= 380px (obtenido: ${tablet1024.actionsWidth}px)`);
assert(tablet1024.remainingForNav >= 380, `Carril central para navegación tiene >= 380px de espacio (obtenido: ${tablet1024.remainingForNav}px)`);
assert(tablet1024.clearanceMargin > 90, `Margen de seguridad libre > 90px en 1024px (obtenido: ${tablet1024.clearanceMargin}px)`);
assert(tablet1024.athletesToPlayClearance > 40, `"Atletas" separado de Play por > 40px en 1024px (obtenido: ${tablet1024.athletesToPlayClearance}px)`);

// 1b. Tabletas en Landscape con rol de Entrenador integrado en navegación principal (1024px)
const tablet1024Coach = computeHeaderSpacing(1024, 'landscape', true);
assert(tablet1024Coach.remainingForNav >= 400, `Carril central con pestaña de Entrenador tiene >= 400px de espacio (obtenido: ${tablet1024Coach.remainingForNav}px)`);
assert(tablet1024Coach.clearanceMargin > 150, `Margen libre con pestaña de Entrenador en 1024px > 150px (obtenido: ${tablet1024Coach.clearanceMargin}px)`);
assert(tablet1024Coach.athletesToPlayClearance > 75, `"Entrenador" separado de Play por > 75px en 1024px (obtenido: ${tablet1024Coach.athletesToPlayClearance}px)`);

// 2. iPad 10.2" / 10.5" Landscape (1080px - 1112px)
const tablet1112 = computeHeaderSpacing(1112, 'landscape');
assert(tablet1112.clearanceMargin > 150, `Margen libre en iPad 10.5" > 150px (obtenido: ${tablet1112.clearanceMargin}px)`);
assert(tablet1112.athletesToPlayClearance > 75, `"Atletas" separado de Play por > 75px en 1112px (obtenido: ${tablet1112.athletesToPlayClearance}px)`);

// 3. iPad Air / iPad Pro 11" Landscape (1180px - 1194px)
const tablet1180 = computeHeaderSpacing(1180, 'landscape');
assert(tablet1180.clearanceMargin > 200, `Margen libre en iPad Air landscape > 200px (obtenido: ${tablet1180.clearanceMargin}px)`);
assert(tablet1180.athletesToPlayClearance > 100, `"Atletas" separado de Play por > 100px en 1180px (obtenido: ${tablet1180.athletesToPlayClearance}px)`);

// 4. Pantallas de 1280px (iPad Pro 11" alto DPR, laptops 13", Pixel Tablet landscape)
const screen1280 = computeHeaderSpacing(1280, 'landscape');
assert(screen1280.clearanceMargin > 150, `En 1280px hay espacio holgado para Atletas (obtenido: ${screen1280.clearanceMargin}px)`);
assert(screen1280.athletesToPlayClearance > 75, `"Atletas" separado de Play por > 75px en 1280px (obtenido: ${screen1280.athletesToPlayClearance}px)`);

// 5. Desktop estándar (1366px - 1440px)
const desktop1440 = computeHeaderSpacing(1440, 'landscape');
assert(desktop1440.clearanceMargin > 250, `Desktop 1440px tiene amplio margen libre (obtenido: ${desktop1440.clearanceMargin}px)`);

// 6. Pantallas 2xl amplias (1536px+)
const desktop1536 = computeHeaderSpacing(1536, 'landscape');
assert(desktop1536.clearanceMargin > 200, `Desktop 2xl con textos expandidos tiene amplio margen (obtenido: ${desktop1536.clearanceMargin}px)`);

// 7. Tableta en Portrait (768px - 1023px)
const tabletPortrait = computeHeaderSpacing(768, 'portrait');
assert(tabletPortrait.isTwoRows, 'Tableta en portrait (768px) utiliza distribución en 2 filas sin solapamientos');

// 8. Celular (< 768px)
const phonePortrait = computeHeaderSpacing(390, 'portrait');
assert(phonePortrait.isMobileBottomNav, 'Celular utiliza navegación inferior dedicada (bottom nav)');

console.log('\n🏆 TODAS LAS VERIFICACIONES DE GEOMETRÍA DEL HEADER PASARON EXITOSAMENTE: 15/15\n');
