import { useChoreographyStore } from './useChoreographyStore';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${msg}`);
    process.exit(1);
  }
  console.log(`✅ PASSED: ${msg}`);
}

console.log('\n--- EJECUTANDO PRUEBAS DEL GESTOR DE ESTADO AUDIO-FIRST (ZUSTAND) ---');

// 1. Inicialización
const state0 = useChoreographyStore.getState();
assert(state0.points.length === 0, 'Inicializa con pista limpia sin puntos residuales');
assert(state0.skaterGender === 'female', 'Inicializa con género femenino por defecto');
assert(state0.phase === 'plot', 'Inicializa en fase plot para dibujo libre');

// 1.b Recentrado de cámara solicitado desde fuera del canvas (botón «Vista»).
assert(state0.cameraResetNonce === 0, 'El nonce de recentrado arranca en 0');
useChoreographyStore.getState().requestCameraReset();
assert(useChoreographyStore.getState().cameraResetNonce === 1, 'requestCameraReset incrementa el nonce');

// 2. Dinámica Audio-First: Generación de nodo desde la onda sonora
const newPt = state0.addPointFromAudio(5500);
const stateAfterAdd = useChoreographyStore.getState();
assert(newPt.timestamp === 5500, 'Nodo creado desde audio tiene timestamp exacto');
assert(newPt.x >= 0 && newPt.x <= 50, 'Coordenada X del nuevo nodo está dentro de la pista (0-50m)');
assert(newPt.y >= 0 && newPt.y <= 25, 'Coordenada Y del nuevo nodo está dentro de la pista (0-25m)');
assert(stateAfterAdd.selectedPointId === newPt.id, 'Nuevo nodo creado desde audio se selecciona automáticamente');
assert(stateAfterAdd.points.some(p => p.id === newPt.id), 'Nuevo nodo existe en el listado de puntos del store');

// 3. Edición Espacial en Canvas (Arrastre de nodo)
stateAfterAdd.updatePointPosition(newPt.id, 28.5, 14.2);
const stateAfterMove = useChoreographyStore.getState();
const movedPt = stateAfterMove.points.find(p => p.id === newPt.id);
assert(movedPt?.x === 28.5, 'Coordenada X actualizada a 28.5m tras arrastre');
assert(movedPt?.y === 14.2, 'Coordenada Y actualizada a 14.2m tras arrastre');
assert(movedPt?.controlPoint1 !== undefined, 'Tirador CP1 se mantiene consistente');

// 4. Edición de Tiradores Bézier CP1 y CP2
stateAfterMove.updateControlPoint1(newPt.id, 30.0, 16.0);
stateAfterMove.updateControlPoint2(newPt.id, 32.0, 18.0);
const stateAfterCP = useChoreographyStore.getState();
const curvedPt = stateAfterCP.points.find(p => p.id === newPt.id);
assert(curvedPt?.controlPoint1?.x === 30.0 && curvedPt?.controlPoint1?.y === 16.0, 'Tirador Bézier CP1 modificado con éxito');
assert(curvedPt?.controlPoint2?.x === 32.0 && curvedPt?.controlPoint2?.y === 18.0, 'Tirador Bézier CP2 modificado con éxito');

// 5. Eliminación Sincronizada (Canvas y Waveform al unísono)
const countBeforeDelete = stateAfterCP.points.length;
stateAfterCP.deletePoint(newPt.id);
const stateAfterDelete = useChoreographyStore.getState();
assert(stateAfterDelete.points.length === countBeforeDelete - 1, 'Punto eliminado decrementa longitud de nodos');
assert(!stateAfterDelete.points.some(p => p.id === newPt.id), 'Punto ya no existe en la fuente única de verdad');

// 6. Selector de Avatar (Playhead Físico)
stateAfterDelete.setSkaterGender('male');
assert(useChoreographyStore.getState().skaterGender === 'male', 'Cambio a avatar masculino (♂)');
stateAfterDelete.setSkaterGender('female');
assert(useChoreographyStore.getState().skaterGender === 'female', 'Cambio a avatar femenino (♀)');

// 7. Deshacer (Undo)
const countBeforeClear = useChoreographyStore.getState().points.length;
useChoreographyStore.getState().clearAllPoints();
assert(useChoreographyStore.getState().points.length === 0, 'Pista limpiada a 0 puntos');
useChoreographyStore.getState().undo();
assert(useChoreographyStore.getState().points.length === countBeforeClear, 'Deshacer restaura puntos previos');

// 8. setPoints PRESERVA los metadatos del escáner (regresión: antes se perdían)
useChoreographyStore.getState().clearAllPoints();
useChoreographyStore.getState().setPoints([
  {
    id: 'scan-a',
    x: 10,
    y: 5,
    time_ms: 1000,
    timestamp: 1000,
    nodeNumber: 3,
    unrecognized: false,
    unlinked: true,
    colorConfidence: 0.98,
    digitConfidence: 0.9,
  },
  {
    id: 'scan-b',
    x: 20,
    y: 8,
    time_ms: 2000,
    timestamp: 2000,
    unrecognized: true,
    digitConfidence: 0,
  },
]);
const persisted = useChoreographyStore.getState().points;
const scanA = persisted.find((p) => p.id === 'scan-a');
const scanB = persisted.find((p) => p.id === 'scan-b');
assert(scanA?.nodeNumber === 3, 'setPoints conserva el número del nodo digitalizado');
assert(scanA?.unlinked === true, 'setPoints conserva el estado unlinked del escáner');
assert(scanA?.colorConfidence === 0.98, 'setPoints conserva las confidencias del escáner');
assert(scanB?.unrecognized === true, 'setPoints conserva el nodo sin número como pendiente');

// 9. Renumeración inteligente: 1,2,3,4 → cambiar el 4 por el 1 INTERCAMBIA
useChoreographyStore.getState().clearAllPoints();
const s0 = useChoreographyStore.getState();
const nA = s0.addPointAtCanvas(10, 5, 1000);
const nB = useChoreographyStore.getState().addPointAtCanvas(20, 10, 2000);
const nC = useChoreographyStore.getState().addPointAtCanvas(30, 15, 3000);
const nD = useChoreographyStore.getState().addPointAtCanvas(40, 20, 4000);
const store = useChoreographyStore.getState();
store.setPointNumber(nA.id, 1);
store.setPointNumber(nB.id, 2);
store.setPointNumber(nC.id, 3);
store.setPointNumber(nD.id, 4);

const posDBefore = useChoreographyStore.getState().points.find((p) => p.id === nD.id)!;
store.swapPointNumber(nD.id, 1);
const afterSwap = useChoreographyStore.getState().points;
const byId = (id: string) => useChoreographyStore.getState().points.find((p) => p.id === id)!;
assert(byId(nD.id).nodeNumber === 1, 'Intercambio: el Nodo D pasa a 1');
assert(byId(nA.id).nodeNumber === 4, 'Intercambio: el Nodo A pasa a 4');
assert(byId(nB.id).nodeNumber === 2 && byId(nC.id).nodeNumber === 3, 'Intercambio: B y C conservan 2 y 3');
assert(
  byId(nD.id).x === posDBefore.x && byId(nD.id).y === posDBefore.y,
  'Intercambio: la posición física del Nodo D NO cambia'
);
const numsAfterSwap = afterSwap.map((p) => p.nodeNumber).filter((n) => n != null);
assert(new Set(numsAfterSwap).size === numsAfterSwap.length, 'Intercambio: nunca quedan números duplicados');

// 10. Número libre: se asigna sin colisión; borrar deja el nodo pendiente («?»)
store.swapPointNumber(nB.id, 8);
assert(byId(nB.id).nodeNumber === 8, 'Número libre: se asigna 8 sin colisión');
const numsAfterFree = useChoreographyStore.getState().points.map((p) => p.nodeNumber).filter((n) => n != null);
assert(new Set(numsAfterFree).size === numsAfterFree.length, 'Número libre: sin duplicados tras asignar');

store.swapPointNumber(nC.id, null);
const clearedC = useChoreographyStore.getState().points.find((p) => p.id === nC.id)!;
assert(clearedC.nodeNumber === undefined, 'Borrar número: el nodo queda sin número');
assert(clearedC.unrecognized === true, 'Borrar número: el nodo se marca como pendiente (?)');

console.log('\nResultado: todas las pruebas del Store Audio-First pasaron con éxito.\n');

