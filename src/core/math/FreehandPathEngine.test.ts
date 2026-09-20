import assert from 'node:assert/strict';
import { FreehandPathEngine, Point2D } from './FreehandPathEngine';

console.log('Testing FreehandPathEngine...');

// 1. Test RDP collinear
const collinearPoints: Point2D[] = [
  { x: 0, y: 0 },
  { x: 1, y: 1 },
  { x: 2, y: 2 },
  { x: 3, y: 3 },
  { x: 4, y: 4 },
  { x: 5, y: 5 },
];
const simplifiedCollinear = FreehandPathEngine.simplifyRDP(collinearPoints, 0.1);
assert.equal(simplifiedCollinear.length, 2, 'Collinear points must simplify to 2 points');
assert.deepEqual(simplifiedCollinear[0], { x: 0, y: 0 });
assert.deepEqual(simplifiedCollinear[1], { x: 5, y: 5 });
console.log('✓ RDP collinear simplification passed');

// 2. Test S-curve preservation
const sCurve: Point2D[] = [
  { x: 0, y: 0 },
  { x: 2, y: 5 },
  { x: 4, y: 0 },
  { x: 6, y: 5 },
];
const simplifiedSCurve = FreehandPathEngine.simplifyRDP(sCurve, 0.2);
assert.ok(simplifiedSCurve.length >= 4, 'S-curve inflections must be preserved');
console.log('✓ RDP shape preservation passed');

// 3. Test Stroke conversion to Master Nodes
const stroke: Point2D[] = [];
for (let i = 0; i <= 50; i++) {
  const angle = (i / 50) * Math.PI;
  stroke.push({
    x: 20 + 10 * Math.cos(angle),
    y: 12.5 + 5 * Math.sin(angle),
  });
}
const points = FreehandPathEngine.convertStrokeToChoreographyPoints(stroke, 1000, 3.5);
assert.equal(points.length, 2, 'Must produce strictly 2 Master Nodes: start and end (Zero Node Spam)');
assert.equal(points[0].time_ms, 1000, 'First node must start at baseStartTimeMs');
assert.ok(points[points.length - 1].time_ms > 1000, 'End node time must be greater than start');
assert.equal(points[0].label, '', 'First node has empty label by default (no figure selected)');
assert.equal(points[points.length - 1].label, '', 'Last node has empty label by default (no figure selected)');
assert.ok(typeof points[0].cp1x === 'number', 'Control points must be calculated');
console.log('✓ Stroke conversion to Master Nodes passed');

// 4. Test Intelligent Straight Line Correction (wobbly straight stroke -> exactly 2 master nodes)
const wobblyLine: Point2D[] = [];
for (let i = 0; i <= 30; i++) {
  // Line from (5, 5) to (25, 5) with slight micro-wobble (0.1m)
  const wobble = (i % 2 === 0 ? 0.08 : -0.08);
  wobblyLine.push({ x: 5 + (20 * i) / 30, y: 5 + wobble });
}
const straightPoints = FreehandPathEngine.convertStrokeToChoreographyPoints(wobblyLine, 0, 3.5);
assert.equal(straightPoints.length, 2, 'Intelligent straight line detection must produce exactly 2 master nodes');
assert.equal(straightPoints[0].label, '', 'Straight start node has empty label');
assert.equal(straightPoints[1].label, '', 'Straight end node has empty label');
console.log('✓ Intelligent straight line perfection passed');

// 5. Test Flujo 2: Trazo anclado a un Nodo Existente (Nodo 1 -> Trazo -> Nodo 2) sin duplicados
const existingNode1 = {
  id: 'node-1-unique',
  x: 10.0,
  y: 12.0,
  time_ms: 0,
  timestamp: 0,
  type: 'Step' as const,
  label: '',
  isMainNode: true,
};

// Usuario arrastra desde Node 1 (10, 12) hasta (20, 15)
const strokeFromNode1: Point2D[] = [
  { x: existingNode1.x, y: existingNode1.y },
  { x: 12, y: 13 },
  { x: 15, y: 14 },
  { x: 18, y: 14.5 },
  { x: 20, y: 15 },
];

const generatedFlow2 = FreehandPathEngine.convertStrokeToChoreographyPoints(
  strokeFromNode1,
  existingNode1.time_ms,
  3.5
);

assert.equal(generatedFlow2.length, 2, 'Debe generar exactamente 2 puntos (pStart y pEnd)');
assert.equal(generatedFlow2[0].x, existingNode1.x, 'El inicio del trazo coincide exactamente con Nodo 1 en X');
assert.equal(generatedFlow2[0].y, existingNode1.y, 'El inicio del trazo coincide exactamente con Nodo 1 en Y');
assert.equal(generatedFlow2[0].time_ms, existingNode1.time_ms, 'Tiempo de inicio es idéntico a Nodo 1');

// Simular el ensamblado en RinkCanvas sin duplicados
const updatedExisting = [{
  ...existingNode1,
  cp1x: generatedFlow2[0].controlPoint1?.x,
  cp1y: generatedFlow2[0].controlPoint1?.y,
  cp2x: generatedFlow2[0].controlPoint2?.x,
  cp2y: generatedFlow2[0].controlPoint2?.y,
  controlPoint1: generatedFlow2[0].controlPoint1,
  controlPoint2: generatedFlow2[0].controlPoint2,
}];

const extensionPoints = generatedFlow2.slice(1).map((pt, idx) => ({
  ...pt,
  id: `node-2-created-${idx}`,
  type: 'Step' as const,
  label: '',
  isMainNode: true,
}));

assert.equal(extensionPoints.length, 1, 'Extensión desde Nodo 1 debe crear exactamente 1 nuevo nodo');
const finalChoreography = [...updatedExisting, ...extensionPoints];
assert.equal(finalChoreography.length, 2, 'Total de nodos debe ser exactamente 2 (Nodo 1 original + 1 nuevo Nodo 2)');
assert.equal(finalChoreography[0].id, 'node-1-unique', 'Nodo 1 conserva su ID original sin reemplazo');
assert.equal(finalChoreography[1].isMainNode, true, 'Nodo 2 final debe ser Nodo Maestro');
assert.ok(finalChoreography[1].time_ms > 0, 'Nodo 2 tiene timestamp posterior al Nodo 1');
console.log('✓ Flujo 2: Enlace Nodo 1 -> Nodo 2 verificado con éxito: exactamente 1 nuevo nodo y cero duplicados');

console.log('All FreehandPathEngine tests passed successfully!');
