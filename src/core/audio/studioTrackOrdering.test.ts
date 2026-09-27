/**
 * studioTrackOrdering.test.ts — Regresión del off-by-one al reordenar pistas.
 *
 * Reproduce el arreglo real del Estudio:
 *   índice 0 = Pista Master, índice 1 = Grabación, índice 2..n = adicionales.
 *
 * El bug original usaba `addIdx = index - 1`, de modo que pulsar «Subir Pista»
 * en la PRIMERA pista adicional movía la SEGUNDA (y la primera nunca podía
 * subir/bajar correctamente). Estos asserts fijan el comportamiento correcto.
 */

import {
  ARRANGEMENT_PREFIX_TRACKS,
  additionalIndexFromArrangementIndex,
  canMoveAdditionalTrack,
  moveAdditionalTrack,
} from './studioTrackOrdering';

let failures = 0;
function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  ✓ ${message}`);
  } else {
    failures++;
    console.error(`  ✗ ${message}`);
  }
}

console.log('\n[studioTrackOrdering] Reordenación de pistas adicionales (regresión móvil/tablet)');

const tracks = ['A', 'B', 'C'];

console.log('\n1. Conversión índice visual → índice adicional');
assert(ARRANGEMENT_PREFIX_TRACKS === 2, 'El arreglo reserva Master (0) y Grabación (1)');
assert(additionalIndexFromArrangementIndex(0) === null, 'Master no es una pista adicional');
assert(additionalIndexFromArrangementIndex(1) === null, 'Grabación no es una pista adicional');
assert(additionalIndexFromArrangementIndex(2) === 0, 'La primera pista adicional es la 2ª fila del arreglo');
assert(additionalIndexFromArrangementIndex(4) === 2, 'La tercera pista adicional es la 4ª fila del arreglo');
assert(additionalIndexFromArrangementIndex(99) === 97, 'Índices altos se convierten con el mismo criterio');

console.log('\n2. La pista correcta se mueve (el off-by-one ya no existe)');
const upFirst = moveAdditionalTrack(tracks, 2, 'up');
assert(upFirst === tracks, 'Subir la PRIMERA pista adicional es no-op (misma referencia)');
const downFirst = moveAdditionalTrack(tracks, 2, 'down');
assert(
  downFirst[0] === 'B' && downFirst[1] === 'A' && downFirst[2] === 'C',
  'Bajar la primera pista adicional intercambia A↔B (antes movía B↔C)'
);

const upLast = moveAdditionalTrack(tracks, 4, 'up');
assert(
  upLast[0] === 'A' && upLast[1] === 'C' && upLast[2] === 'B',
  'Subir la última pista adicional intercambia B↔C'
);
const downLast = moveAdditionalTrack(tracks, 4, 'down');
assert(downLast === tracks, 'Bajar la última pista adicional es no-op');

const upMiddle = moveAdditionalTrack(tracks, 3, 'up');
assert(
  upMiddle[0] === 'B' && upMiddle[1] === 'A' && upMiddle[2] === 'C',
  'Subir la pista central intercambia A↔B'
);

console.log('\n3. Casos límite sin efectos colaterales');
assert(moveAdditionalTrack(tracks, 0, 'up') === tracks, 'Master nunca se mueve');
assert(moveAdditionalTrack(tracks, 1, 'down') === tracks, 'Grabación nunca se mueve');
assert(moveAdditionalTrack(tracks, 99, 'up') === tracks, 'Índice fuera de rango no rompe');
const emptyList: string[] = [];
assert(moveAdditionalTrack(emptyList, 2, 'down') === emptyList, 'Lista vacía no rompe');
assert(tracks.join(',') === 'A,B,C', 'La lista original NO se muta');

console.log('\n4. Estado de los botones Subir/Bajar');
assert(canMoveAdditionalTrack(tracks, 2, 'up') === false, 'Subir deshabilitado en la primera');
assert(canMoveAdditionalTrack(tracks, 2, 'down') === true, 'Bajar habilitado en la primera');
assert(canMoveAdditionalTrack(tracks, 4, 'up') === true, 'Subir habilitado en la última');
assert(canMoveAdditionalTrack(tracks, 4, 'down') === false, 'Bajar deshabilitado en la última');
assert(canMoveAdditionalTrack(tracks, 0, 'down') === false, 'Master sin botones');

console.log('\n5. Reordenación repetida = permutación estable');
let order = [...tracks];
order = moveAdditionalTrack(order, 2, 'down'); // B A C
order = moveAdditionalTrack(order, 3, 'down'); // B C A
order = moveAdditionalTrack(order, 4, 'up'); // B A C
assert(order.join(',') === 'B,A,C', `Permutación esperada B,A,C (obtenido ${order.join(',')})`);
assert([...order].sort().join(',') === 'A,B,C', 'No se pierde ni duplica ninguna pista');

if (failures > 0) {
  console.error(`\n[studioTrackOrdering] ${failures} aserción(es) fallidas.`);
  process.exit(1);
}
console.log('\n[studioTrackOrdering] OK — reordenación correcta en todas las posiciones.');
