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
assert.ok(points.length >= 2, 'Must produce at least 2 ChoreographyPoints');
assert.equal(points[0].time_ms, 1000, 'First node must start at baseStartTimeMs');
assert.ok(points[points.length - 1].time_ms > 1000, 'End node time must be greater than start');
assert.equal(points[0].label, 'Inicio Trazo', 'First node is Master Start');
assert.equal(points[points.length - 1].label, 'Fin Trazo', 'Last node is Master End');
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
assert.equal(straightPoints[0].label, 'Inicio Trazo');
assert.equal(straightPoints[1].label, 'Fin Trazo');
console.log('✓ Intelligent straight line perfection passed');

console.log('All FreehandPathEngine tests passed successfully!');

