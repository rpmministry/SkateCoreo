import { RinkMath, DEFAULT_RINK_DIMENSIONS } from './RinkMath';
import { ChoreographyPathPoint } from '../../types/choreography';

function runRinkMathTests() {
  console.log('--- EJECUTANDO PRUEBAS DEL MÓDULO 2: MATEMÁTICA DE PISTA Y CURVAS BÉZIER ---');
  let passed = 0;
  let total = 0;

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

  // 1. Viewport metrics calculation for 1000x500 canvas
  const metrics = RinkMath.calculateViewportMetrics(1000, 500, DEFAULT_RINK_DIMENSIONS, 0);
  assert(metrics.scale === 20, 'Escala calculada para 1000x500 es exactamente 20 px/metro');
  assert(metrics.renderedW === 1000 && metrics.renderedH === 500, 'Dimensiones renderizadas coinciden con 50x25m');

  // 2. Meters to Pixels
  const centerPx = RinkMath.metersToPixels(25, 12.5, metrics);
  assert(centerPx.px === 500 && centerPx.py === 250, 'Centro de pista (25m, 12.5m) se proyecta en (500px, 250px)');

  // 3. Pixels to Meters
  const metersFromCenter = RinkMath.pixelsToMeters(500, 250, metrics, DEFAULT_RINK_DIMENSIONS);
  assert(metersFromCenter.mX === 25 && metersFromCenter.mY === 12.5, 'Pixel inverso (500px, 250px) vuelve exactamente a (25m, 12.5m)');

  // 4. Cubic Bézier Evaluation
  const p0 = { x: 0, y: 0 };
  const cp1 = { x: 10, y: 0 };
  const cp2 = { x: 20, y: 10 };
  const p1 = { x: 30, y: 10 };

  const startPt = RinkMath.evaluateCubicBezier(p0, cp1, cp2, p1, 0);
  assert(startPt.x === 0 && startPt.y === 0, 'Curva en t=0 coincide con p0');

  const endPt = RinkMath.evaluateCubicBezier(p0, cp1, cp2, p1, 1);
  assert(endPt.x === 30 && endPt.y === 10, 'Curva en t=1 coincide con p1');

  const midPt = RinkMath.evaluateCubicBezier(p0, cp1, cp2, p1, 0.5);
  assert(midPt.x > 0 && midPt.x < 30, 'Curva en t=0.5 interpola suavemente');

  // 5. Skater position interpolation along points
  const points: ChoreographyPathPoint[] = [
    { id: '1', x: 5, y: 5, time_ms: 0 },
    { id: '2', x: 25, y: 12.5, time_ms: 10000 },
    { id: '3', x: 45, y: 20, time_ms: 20000 }
  ];

  const avatarAt0 = RinkMath.interpolateSkaterPosition(points, 0);
  assert(avatarAt0 !== null && avatarAt0.x === 5 && avatarAt0.y === 5, 'Patinador en t=0s está en el punto 1');

  const avatarAt10s = RinkMath.interpolateSkaterPosition(points, 10000);
  assert(avatarAt10s !== null && Math.abs(avatarAt10s.x - 25) < 0.1, 'Patinador en t=10s alcanza el punto 2');

  const avatarAt5s = RinkMath.interpolateSkaterPosition(points, 5000);
  assert(avatarAt5s !== null && avatarAt5s.x > 5 && avatarAt5s.x < 25, 'Patinador en t=5s viaja fluidamente entre punto 1 y 2');

  console.log(`\nResultado Módulo 2: ${passed}/${total} pruebas pasadas con éxito.\n`);
}

runRinkMathTests();

