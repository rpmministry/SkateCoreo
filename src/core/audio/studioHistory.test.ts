/**
 * Pruebas de undo/redo del Audio Studio (Fase 5.3).
 *
 * Valida el historial de edición: deshacer/rehacer nodos temporales, límites del
 * historial y que una nueva edición invalida el "futuro" (redo).
 */

import { useAudioStudioStore } from '../../store/useAudioStudioStore';
import type { AudioClip } from '../../types/audioStudio';

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

// ── Fase 9: integridad del PCM en undo/redo ──
// Borrar un clip NO debe anular su `buffer`: el historial referencia ESE MISMO
// objeto de clip, así que anularlo dejaba el deshacer sin audio. Este test falla
// si se reintroduce la liberación prematura en `deleteClip`.
const clipBuffer = {
  duration: 1,
  length: 8000,
  sampleRate: 8000,
  numberOfChannels: 1,
  getChannelData: () => new Float32Array(8000),
} as unknown as AudioBuffer;

const bufferTestClip: AudioClip = {
  id: 'clip-buffer-integrity',
  name: 'Buffer Test',
  buffer: clipBuffer,
  startOffsetSec: 0,
  trimStartSec: 0,
  trimEndSec: 1,
  fadeInSec: 0,
  fadeOutSec: 0,
};

const musicBeforeBufferTest = store.getState().tracks.music;
store.setState((s) => ({
  tracks: { ...s.tracks, music: { ...s.tracks.music, clips: [bufferTestClip] } },
  studioHistory: [],
  studioFuture: [],
}));

store.getState().deleteClip('music', bufferTestClip.id);
assert(
  !store.getState().tracks.music.clips.some((c) => c.id === bufferTestClip.id),
  'El clip se elimina del arreglo'
);

store.getState().undoStudio();
const restoredClip = store.getState().tracks.music.clips.find((c) => c.id === bufferTestClip.id);
assert(!!restoredClip, 'Undo restaura el clip eliminado');
assert(
  restoredClip?.buffer != null,
  'Undo restaura el clip CON su PCM (borrar no anula el buffer que el historial necesita)'
);

// La memoria del historial está acotada: nunca retiene más de 50 instantáneas.
store.setState({ studioHistory: [], studioFuture: [] });
for (let i = 0; i < 60; i++) store.getState().pushStudioEdit();
assert(
  store.getState().studioHistory.length <= 50,
  `El historial no supera 50 instantáneas (memoria acotada); tiene ${store.getState().studioHistory.length}`
);

// Limpieza.
store.setState((s) => ({
  tracks: { ...s.tracks, music: musicBeforeBufferTest },
  studioHistory: [],
  studioFuture: [],
}));

console.log(`\nTODAS LAS PRUEBAS DE UNDO/REDO PASARON: ${total}/${total}`);
