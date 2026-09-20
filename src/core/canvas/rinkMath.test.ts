import { RinkMath, DEFAULT_RINK_DIMENSIONS } from './RinkMath';
import { ChoreographyPathPoint, isMainNode } from '../../types/choreography';

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

  // 6. Direct Drag-to-Curve (Manipulación directa del trazo sin tiradores visuales)
  const pA = { id: 'a', x: 10, y: 10, time_ms: 0 };
  const pB = { id: 'b', x: 30, y: 10, time_ms: 5000 };
  const { cp1: defCp1, cp2: defCp2 } = RinkMath.computeControlPointsFromThroughPoint(pA, pB, 20, 20, 0.5);
  const deformedMid = RinkMath.evaluateCubicBezier(pA, defCp1, defCp2, pB, 0.5);
  assert(Math.abs(deformedMid.x - 20) < 1.0 && Math.abs(deformedMid.y - 20) < 1.0, 'Curva se deforma directamente hacia la coordenada de toque del dedo');

  // 7. Discriminación estricta de Nodos Principales (isMainNode)
  const testPoints: ChoreographyPathPoint[] = [
    { id: 'start', x: 5, y: 5, time_ms: 0, isMainNode: true, type: 'Step' },
    { id: 'intermediate-curve-1', x: 15, y: 8, time_ms: 1000, isMainNode: false, type: 'Curve', label: '' },
    { id: 'intermediate-curve-2', x: 20, y: 10, time_ms: 2000, isMainNode: false, type: 'Curve', label: '' },
    { id: 'middle-figure', x: 25, y: 15, time_ms: 3000, isMainNode: true, type: 'Jump', label: 'Axel' },
    { id: 'end', x: 40, y: 20, time_ms: 5000, isMainNode: true, type: 'Step' }
  ];
  assert(isMainNode(testPoints[0], 0, testPoints) === true, 'Nodo inicial es Nodo Principal');
  assert(isMainNode(testPoints[1], 1, testPoints) === false, 'Punto de curvatura intermedio NO es Nodo Principal (oculto en lienzo y timeline)');
  assert(isMainNode(testPoints[2], 2, testPoints) === false, 'Segundo punto de curvatura NO es Nodo Principal');
  assert(isMainNode(testPoints[3], 3, testPoints) === true, 'Nodo con figura técnica "Axel" es Nodo Principal');
  assert(isMainNode(testPoints[4], 4, testPoints) === true, 'Nodo final es Nodo Principal');

  // 8. Movimiento exacto milimétrico sobre curva/bucle compleja (Path Following)
  const complexLoopPath = [
    { x: 10, y: 10 },
    { x: 15, y: 15 },
    { x: 20, y: 10 },
    { x: 15, y: 5 },
    { x: 10, y: 10 }
  ];
  const loopPoints: ChoreographyPathPoint[] = [
    { id: 'loop-start', x: 10, y: 10, time_ms: 0, path: complexLoopPath },
    { id: 'loop-end', x: 10, y: 10, time_ms: 4000 }
  ];

  // A t=0.25 (1000ms), debe estar en el vértice (15, 15)
  const avatarAt1s = RinkMath.interpolateSkaterPosition(loopPoints, 1000);
  assert(avatarAt1s !== null && Math.abs(avatarAt1s.x - 15) < 0.1 && Math.abs(avatarAt1s.y - 15) < 0.1, 'Avatar sigue milimétricamente el primer vértice del bucle');

  // A t=0.5 (2000ms), debe estar en el extremo (20, 10)
  const avatarAt2s = RinkMath.interpolateSkaterPosition(loopPoints, 2000);
  assert(avatarAt2s !== null && Math.abs(avatarAt2s.x - 20) < 0.1 && Math.abs(avatarAt2s.y - 10) < 0.1, 'Avatar sigue milimétricamente el extremo del bucle');

  // A t=0.75 (3000ms), debe estar en (15, 5)
  const avatarAt3s = RinkMath.interpolateSkaterPosition(loopPoints, 3000);
  assert(avatarAt3s !== null && Math.abs(avatarAt3s.x - 15) < 0.1 && Math.abs(avatarAt3s.y - 5) < 0.1, 'Avatar sigue milimétricamente el retorno del bucle');

  // 9. Orientación cinemática exacta calculada por vector tangente
  const straightHorizontalPath = [
    { x: 10, y: 10 },
    { x: 20, y: 10 }
  ];
  const evalStraight = RinkMath.evaluateSplinePath(straightHorizontalPath, 0.5);
  assert(Math.abs(evalStraight.angleRad - 0) < 0.01, 'Orientación hacia la derecha es exactamente 0 radianes');

  const straightVerticalPath = [
    { x: 10, y: 10 },
    { x: 10, y: 20 }
  ];
  const evalVertical = RinkMath.evaluateSplinePath(straightVerticalPath, 0.5);
  assert(Math.abs(evalVertical.angleRad - Math.PI / 2) < 0.01, 'Orientación hacia abajo es exactamente PI/2 radianes');

  // 10. Segmento sin path (tap simple) avanza en línea recta exacta
  const tapPoints: ChoreographyPathPoint[] = [
    { id: 'tap-1', x: 10, y: 10, time_ms: 0 },
    { id: 'tap-2', x: 30, y: 20, time_ms: 2000 }
  ];
  const avatarTapMid = RinkMath.interpolateSkaterPosition(tapPoints, 1000);
  assert(avatarTapMid !== null && avatarTapMid.x === 20 && avatarTapMid.y === 15, 'Tap simple avanza exactamente en el punto medio de la recta (20, 15)');

  console.log(`\nResultado Módulo 2: ${passed}/${total} pruebas pasadas con éxito.\n`);
}

runRinkMathTests();

