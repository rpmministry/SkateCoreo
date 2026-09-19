import { useChoreographyStore, DEFAULT_CHOREOGRAPHY_POINTS } from './useChoreographyStore';

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
assert(state0.points.length === DEFAULT_CHOREOGRAPHY_POINTS.length, 'Inicializa con puntos por defecto');
assert(state0.skaterGender === 'female', 'Inicializa con género femenino por defecto');
assert(state0.phase === 'curve', 'Inicializa en fase curve con ruta conectada');

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

console.log('\nResultado: 14/14 pruebas del Store Audio-First pasadas con éxito.\n');

