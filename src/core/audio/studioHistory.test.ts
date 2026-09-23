/**
 * Pruebas de undo/redo del Audio Studio (Fase 5.3).
 *
 * Valida el historial de edición: deshacer/rehacer nodos temporales, límites del
 * historial y que una nueva edición invalida el "futuro" (redo).
 */

import { useAudioStudioStore } from '../../store/useAudioStudioStore';

let total = 0;
function assert(condition: boolean, msg: string) {
  total++;
  if (!condition) {
    console.error(`FAILED: ${msg}`);
    process.exit(1);
  }
  console.log(`PASSED: ${msg}`);
}

console.log('--- PRUEBAS DE UNDO/REDO DEL AUDIO STUDIO ---');

const store = useAudioStudioStore;
const initialCount = store.getState().audioNodes.length;

store.getState().addTimeNode(5);
store.getState().addTimeNode(10);
assert(
  store.getState().audioNodes.length === initialCount + 2,
  'Se añaden 2 nodos temporales'
);

store.getState().undoStudio();
assert(
  store.getState().audioNodes.length === initialCount + 1,
  'Undo revierte el último nodo'
);
store.getState().undoStudio();
assert(store.getState().audioNodes.length === initialCount, 'Undo revierte el segundo nodo');

store.getState().redoStudio();
assert(store.getState().audioNodes.length === initialCount + 1, 'Redo reaplica el primer nodo');
store.getState().redoStudio();
assert(store.getState().audioNodes.length === initialCount + 2, 'Redo reaplica el segundo nodo');

// Límites: deshacer de más no rompe nada.
store.getState().undoStudio();
store.getState().undoStudio();
store.getState().undoStudio();
store.getState().undoStudio();
assert(
  store.getState().audioNodes.length === initialCount,
  'Undo de más no genera estados inválidos'
);

// Una nueva edición invalida el futuro (redo ya no reaplica lo descartado).
store.getState().addTimeNode(20);
assert(
  store.getState().audioNodes.length === initialCount + 1,
  'Nueva edición tras varios undo'
);
store.getState().redoStudio();
assert(
  store.getState().audioNodes.length === initialCount + 1,
  'Redo no reaplica historial invalidado por una nueva edición'
);

// Limpieza del estado de prueba del historial de nodos.
const remaining = store.getState().audioNodes.length - initialCount;
for (let i = 0; i < remaining; i++) store.getState().deleteTimeNode(store.getState().audioNodes[0].id);

console.log(`\nTODAS LAS PRUEBAS DE UNDO/REDO PASARON: ${total}/${total}`);
