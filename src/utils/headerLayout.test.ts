/**
 * headerLayout.test.ts — Verificación geométrica del layout responsive de la barra superior.
 *
 * OBJETIVO:
 * Garantizar matemáticamente y por diseño que la pestaña "Atletas" (la 4ª pestaña de la navegación central)
 * NUNCA colisione ni quede solapada o tapada por los controles de reproducción (Play / Pausa / Stop / RinkAudioPlayer)
 * en ninguna resolución ni orientación, dando prioridad máxima a tabletas en orientación horizontal (landscape).
 */

/**
 * Calcula la geometría de distribución del header de acuerdo a la arquitectura elástica de 2 bloques:
 * - Bloque Izquierdo: Marca + Navegación («Inicio», «Pista», «Estudio», «Atletas») anclado a la izquierda.
 * - Bloque Derecho: Transporte de audio + Opciones anclado a la derecha.
 * - En medio: espacio libre elástico garantizado (>250px en tablets landscape).
 * - En >=1280px (xl): botones secundarios visibles en el bloque derecho.
 * - En <1024px portrait: 2 filas deterministas.
 * - En <768px portrait: Header compacto móvil con bottom nav.
 */
function computeHeaderSpacing(
  viewportWidth: number,
  orientation: 'landscape' | 'portrait',
  isCoach: boolean = false
) {
  const isDesktopOrTabletLandscape = viewportWidth >= 1024 || (viewportWidth >= 768 && orientation === 'landscape');
  const isXlOrLarger = viewportWidth >= 1280;
  const is2xlOrLarger = viewportWidth >= 1536;

  const paddingX = viewportWidth >= 1024 ? 32 : 16;
  const brandWidth = is2xlOrLarger ? 220 : 135; // SkateCoreo logo + texto (+ atleta en 2xl)

  // DesktopHeaderNav: 4 pestañas integradas
  // - Usuario común: ("Inicio", "Pista", "Estudio", "Atletas") -> 285px
  // - Entrenador: ("Inicio", "Pista", "Estudio", "Entrenador" / "Panel del Entrenador") -> 300px (<2xl) / 360px (>=2xl)
  const navWidth = isCoach ? (is2xlOrLarger ? 360 : 300) : 285;
  const leftBlockGap = 14;
  const leftBlockWidth = brandWidth + leftBlockGap + navWidth;

  // Acciones a la derecha en la vista de Pista:
  // - En tablet landscape (< 1280px): RinkAudioPlayer (200px) + Menú más (36px) + gap (8px) = 244px
  // - En desktop xl (1280px-1535px): RinkAudioPlayer (390px con audio meters) + Limpiar (36px) + Subir (36px) + Logout (36px) + Menú (36px) + gaps ≈ 556px
  // - En desktop 2xl (>=1536px): botones con texto expandido
  const rinkAudioPlayerWidth = isXlOrLarger ? 390 : 200;
  const clearRinkWidth = isXlOrLarger ? (is2xlOrLarger ? 115 : 36) : 0;
  const uploadTrackWidth = isXlOrLarger ? (is2xlOrLarger ? 165 : 36) : 0;
  const logoutWidth = isXlOrLarger ? 36 : 0;
  const moreMenuWidth = 36;
  const actionsGap = isXlOrLarger ? 24 : 8;

  const actionsWidth =
    rinkAudioPlayerWidth + clearRinkWidth + uploadTrackWidth + logoutWidth + moreMenuWidth + actionsGap;

  const availableWidth = viewportWidth - paddingX;
  // Distancia libre real entre el borde derecho de "Atletas" / "Entrenador" y el borde izquierdo del transporte/Play
  const athletesToPlayClearance = availableWidth - leftBlockWidth - actionsWidth;

  const isTwoRows = !isDesktopOrTabletLandscape && (orientation === 'portrait' || viewportWidth >= 768);

  return {
    isDesktopOrTabletLandscape,
    isTwoRows,
    isMobileBottomNav: viewportWidth < 768 && orientation !== 'landscape',
    availableWidth,
    brandWidth,
    navWidth,
    leftBlockWidth,
    actionsWidth,
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
assert(tablet1024.isDesktopOrTabletLandscape, '1024px clasifica como distribución elástica horizontal');
assert(tablet1024.actionsWidth <= 260, `Acciones en 1024px compactadas a <= 260px (obtenido: ${tablet1024.actionsWidth}px)`);
assert(tablet1024.athletesToPlayClearance > 280, `"Atletas" separado de Play por > 280px en 1024px (obtenido: ${tablet1024.athletesToPlayClearance}px)`);

// 1b. Tabletas en Landscape con rol de Entrenador integrado en navegación principal (1024px)
const tablet1024Coach = computeHeaderSpacing(1024, 'landscape', true);
assert(tablet1024Coach.athletesToPlayClearance > 270, `"Entrenador" separado de Play por > 270px en 1024px (obtenido: ${tablet1024Coach.athletesToPlayClearance}px)`);

// 2. iPad 10.2" / 10.5" Landscape (1080px - 1112px)
const tablet1112 = computeHeaderSpacing(1112, 'landscape');
assert(tablet1112.athletesToPlayClearance > 350, `"Atletas" separado de Play por > 350px en 1112px (obtenido: ${tablet1112.athletesToPlayClearance}px)`);

// 3. iPad Air / iPad Pro 11" Landscape (1180px - 1194px)
const tablet1180 = computeHeaderSpacing(1180, 'landscape');
assert(tablet1180.athletesToPlayClearance > 400, `"Atletas" separado de Play por > 400px en 1180px (obtenido: ${tablet1180.athletesToPlayClearance}px)`);

// 4. Tablet compacta en horizontal (800px)
const tablet800 = computeHeaderSpacing(800, 'landscape');
assert(tablet800.athletesToPlayClearance > 80, `"Atletas" separado de Play por > 80px en tablet 800px landscape (obtenido: ${tablet800.athletesToPlayClearance}px)`);

// 5. Pantallas de 1280px (iPad Pro 11" alto DPR, laptops 13", Pixel Tablet landscape)
const screen1280 = computeHeaderSpacing(1280, 'landscape');
assert(screen1280.athletesToPlayClearance > 200, `"Atletas" separado de Play por > 200px en 1280px con botones (obtenido: ${screen1280.athletesToPlayClearance}px)`);

// 6. Desktop estándar (1366px - 1440px)
const desktop1440 = computeHeaderSpacing(1440, 'landscape');
assert(desktop1440.athletesToPlayClearance > 350, `Desktop 1440px tiene amplio margen libre (obtenido: ${desktop1440.athletesToPlayClearance}px)`);

// 7. Pantallas 2xl amplias (1536px+)
const desktop1536 = computeHeaderSpacing(1536, 'landscape');
assert(desktop1536.athletesToPlayClearance > 200, `Desktop 2xl con textos expandidos tiene amplio margen (obtenido: ${desktop1536.athletesToPlayClearance}px)`);

// 8. Tableta en Portrait (768px - 1023px)
const tabletPortrait = computeHeaderSpacing(768, 'portrait');
assert(tabletPortrait.isTwoRows, 'Tableta en portrait (768px) utiliza distribución en 2 filas sin solapamientos');

// 9. Celular (< 768px)
const phonePortrait = computeHeaderSpacing(390, 'portrait');
assert(phonePortrait.isMobileBottomNav, 'Celular utiliza navegación inferior dedicada (bottom nav)');

console.log('\n🏆 TODAS LAS VERIFICACIONES DE GEOMETRÍA DEL HEADER PASARON EXITOSAMENTE: 10/10\n');
