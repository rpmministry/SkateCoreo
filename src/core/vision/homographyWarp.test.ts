import { HomographyWarp, Point2D } from './HomographyWarp';
import { PaperOcrEngine } from './PaperOcrEngine';

function runHomographyTests() {
  console.log('--- EJECUTANDO PRUEBAS DEL MOTOR DE VISIÓN: HOMOGRAFÍA Y PERSPECTIVA ---');
  let total = 0;
  let passed = 0;

  function assert(condition: boolean, msg: string) {
    total++;
    if (!condition) {
      console.error(`❌ FAILED: ${msg}`);
      process.exit(1);
    } else {
      console.log(`✅ PASSED: ${msg}`);
      passed++;
    }
  }

  // 1. Matriz Identidad
  // Mapear un cuadrado [0,0]->[100,0]->[100,100]->[0,100] sobre sí mismo
  const srcSquare: [Point2D, Point2D, Point2D, Point2D] = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
    { x: 0, y: 100 },
  ];

  const identityH = HomographyWarp.findHomography(srcSquare, srcSquare);
  assert(identityH !== null && identityH.length === 9, 'findHomography calcula matriz 3x3 de 9 coeficientes');

  const ptCenter: Point2D = { x: 50, y: 50 };
  const mappedCenter = HomographyWarp.transformPoint(ptCenter, identityH);
  assert(
    Math.abs(mappedCenter.x - 50) < 1e-4 && Math.abs(mappedCenter.y - 50) < 1e-4,
    `Punto central (50, 50) mapea idénticamente a (${mappedCenter.x.toFixed(2)}, ${mappedCenter.y.toFixed(2)})`
  );

  const ptCorner: Point2D = { x: 100, y: 100 };
  const mappedCorner = HomographyWarp.transformPoint(ptCorner, identityH);
  assert(
    Math.abs(mappedCorner.x - 100) < 1e-4 && Math.abs(mappedCorner.y - 100) < 1e-4,
    'Esquina (100, 100) mapea idénticamente con transformación de identidad'
  );

  // 2. Mapeo de Escala 2:1 Rectangular
  // Simular foto con deformación trapezoidal hacia destino 2000x1000 (2:1 exacto)
  const trapezoidSrc: [Point2D, Point2D, Point2D, Point2D] = [
    { x: 200, y: 100 },
    { x: 1800, y: 120 },
    { x: 1950, y: 950 },
    { x: 50, y: 920 },
  ];

  const rectDst: [Point2D, Point2D, Point2D, Point2D] = [
    { x: 0, y: 0 },
    { x: 2000, y: 0 },
    { x: 2000, y: 1000 },
    { x: 0, y: 1000 },
  ];

  const trapH = HomographyWarp.findHomography(trapezoidSrc, rectDst);
  assert(trapH !== null && trapH.length === 9, 'Solver resuelve matriz proyectiva para trapecio inclinado');

  // Las 4 esquinas deben proyectarse exactamente a las 4 esquinas del destino rectificado
  const mappedTL = HomographyWarp.transformPoint(trapezoidSrc[0], trapH);
  assert(
    Math.abs(mappedTL.x - 0) < 0.5 && Math.abs(mappedTL.y - 0) < 0.5,
    `Esquina superior izquierda mapea a (0, 0): (${mappedTL.x.toFixed(1)}, ${mappedTL.y.toFixed(1)})`
  );

  const mappedTR = HomographyWarp.transformPoint(trapezoidSrc[1], trapH);
  assert(
    Math.abs(mappedTR.x - 2000) < 0.5 && Math.abs(mappedTR.y - 0) < 0.5,
    `Esquina superior derecha mapea a (2000, 0): (${mappedTR.x.toFixed(1)}, ${mappedTR.y.toFixed(1)})`
  );

  const mappedBR = HomographyWarp.transformPoint(trapezoidSrc[2], trapH);
  assert(
    Math.abs(mappedBR.x - 2000) < 0.5 && Math.abs(mappedBR.y - 1000) < 0.5,
    `Esquina inferior derecha mapea a (2000, 1000): (${mappedBR.x.toFixed(1)}, ${mappedBR.y.toFixed(1)})`
  );

  const mappedBL = HomographyWarp.transformPoint(trapezoidSrc[3], trapH);
  assert(
    Math.abs(mappedBL.x - 0) < 0.5 && Math.abs(mappedBL.y - 1000) < 0.5,
    `Esquina inferior izquierda mapea a (0, 1000): (${mappedBL.x.toFixed(1)}, ${mappedBL.y.toFixed(1)})`
  );

  // 3. Mapeo Inverso (dst -> src)
  const invH = HomographyWarp.findHomography(rectDst, trapezoidSrc);
  const backTL = HomographyWarp.transformPoint({ x: 0, y: 0 }, invH);
  assert(
    Math.abs(backTL.x - trapezoidSrc[0].x) < 0.5 && Math.abs(backTL.y - trapezoidSrc[0].y) < 0.5,
    `Mapeo inverso mapea (0, 0) de vuelta a origen (${backTL.x.toFixed(1)}, ${backTL.y.toFixed(1)})`
  );

  const backCenter = HomographyWarp.transformPoint({ x: 1000, y: 500 }, invH);
  assert(
    backCenter.x > trapezoidSrc[3].x && backCenter.x < trapezoidSrc[2].x &&
    backCenter.y > trapezoidSrc[0].y && backCenter.y < trapezoidSrc[3].y,
    `Centro del lienzo rectificado cae dentro de los límites del trapecio original (${backCenter.x.toFixed(1)}, ${backCenter.y.toFixed(1)})`
  );

  console.log(`\n🎉 TODAS LAS PRUEBAS DE HOMOGRAFÍA PASARON: ${passed}/${total}`);
}

runHomographyTests();

/* ── Extras: mapeo estricto de coordenadas y filtro de círculos (OCR) ── */
function runOcrMapperTests() {
  let t = 0;
  let ok = 0;
  const check = (cond: boolean, msg: string) => {
    t++;
    if (!cond) {
      console.error(`FAILED: ${msg}`);
      process.exit(1);
    }
    ok++;
  };

  // Centroide del lienzo alineado (2000x1000 px = 50x25 m) -> 25, 12.5 m
  const center = PaperOcrEngine.pixelsToMeters(1000, 500, 2000, 1000);
  check(
    Math.abs(center.x - 25) < 0.11 && Math.abs(center.y - 12.5) < 0.11,
    'pixelsToMeters mapea el centro del lienzo a 25 x 12.5 m'
  );

  // Esquina superior izquierda -> (0, 0)
  const tl = PaperOcrEngine.pixelsToMeters(0, 0, 2000, 1000);
  check(tl.x === 0 && tl.y === 0, 'pixelsToMeters mapea (0,0) a (0,0)');

  // Filtro de círculos: disco válido; línea y mancha pequeña se descartan.
  check(
    PaperOcrEngine.isCircleCandidate(40, 40, 1256, 60, 5000) === true,
    'isCircleCandidate acepta un disco (área y extensión correctas)'
  );
  check(
    PaperOcrEngine.isCircleCandidate(40, 10, 400, 60, 5000) === false,
    'isCircleCandidate descarta una línea (relación de aspecto)'
  );
  check(
    PaperOcrEngine.isCircleCandidate(40, 40, 50, 60, 5000) === false,
    'isCircleCandidate descarta una mancha por debajo del área mínima'
  );

  console.log(`\nOK PRUEBAS DEL MAPEO OCR PASARON: ${ok}/${t}`);
}
runOcrMapperTests();

