/**
 * sessionLifecycle.test.ts — Pruebas unitarias de Session Lifecycle Manager & Reset Absoluto.
 */

// Simular entorno de almacenamiento para pruebas en Node
const memorySessionStorage: Record<string, string> = {};
const memoryLocalStorage: Record<string, string> = {};

(globalThis as any).sessionStorage = {
  getItem: (key: string) => memorySessionStorage[key] ?? null,
  setItem: (key: string, val: string) => { memorySessionStorage[key] = String(val); },
  removeItem: (key: string) => { delete memorySessionStorage[key]; },
  clear: () => { Object.keys(memorySessionStorage).forEach(k => delete memorySessionStorage[k]); },
};

(globalThis as any).localStorage = {
  getItem: (key: string) => memoryLocalStorage[key] ?? null,
  setItem: (key: string, val: string) => { memoryLocalStorage[key] = String(val); },
  removeItem: (key: string) => { delete memoryLocalStorage[key]; },
  clear: () => { Object.keys(memoryLocalStorage).forEach(k => delete memoryLocalStorage[k]); },
};

// Polyfill básico para AudioContext / Web Audio si es requerido por AudioEngine
if (typeof (globalThis as any).AudioContext === 'undefined') {
  (globalThis as any).AudioContext = class MockAudioContext {
    createGain() { return { connect() {}, gain: { value: 1, setValueAtTime() {} } }; }
    createChannelSplitter() { return { connect() {} }; }
    createChannelMerger() { return { connect() {} }; }
    createBufferSource() { return { connect() {}, start() {}, stop() {} }; }
    close() { return Promise.resolve(); }
  };
}

import {
  generateSessionId,
  getActiveSessionId,
  setActiveSessionId,
  clearActiveSessionId,
  getSessionSnapshot,
  saveSessionSnapshot,
  clearSessionSnapshot,
  resetAbsoluteSession,
  initSessionLifecycle,
  terminateSession,
  SessionSnapshot,
} from './sessionLifecycle';

import { useChoreographyStore } from '../store/useChoreographyStore';
import { useAudioStudioStore } from '../store/useAudioStudioStore';
import { useRinkAudioStore } from '../store/useRinkAudioStore';
import { audioEngine } from '../core/audio/AudioEngine';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${msg}`);
    process.exit(1);
  }
  console.log(`✅ PASSED: ${msg}`);
}

async function runTests() {
  console.log('\n--- EJECUTANDO PRUEBAS DE SESSION LIFECYCLE & RESET ABSOLUTO ---');

  // Test 1: Generación de identificador de sesión
  const sid = generateSessionId();
  assert(sid.startsWith('sess_'), 'El sessionId generado tiene el prefijo sess_');
  assert(sid.length > 10, 'El sessionId tiene longitud suficiente');

  // Test 2: Manejo de ActiveSessionId en sessionStorage
  clearActiveSessionId();
  assert(getActiveSessionId() === null, 'Inicialmente no hay activeSessionId');
  setActiveSessionId('sess_test_123');
  assert(getActiveSessionId() === 'sess_test_123', 'Recupera activeSessionId correctamente');
  clearActiveSessionId();
  assert(getActiveSessionId() === null, 'clearActiveSessionId borra el identificador');

  // Test 3: Snapshot de sesión
  clearSessionSnapshot();
  assert(getSessionSnapshot() === null, 'Inicialmente no hay snapshot');
  const dummySnapshot: SessionSnapshot = {
    sessionId: 'sess_recovery_1',
    userId: 'user_a',
    savedAt: Date.now(),
    pointsCount: 5,
    audioFileName: 'musica.mp3',
    hasAudio: true,
  };
  saveSessionSnapshot(dummySnapshot);
  const loadedSnapshot = getSessionSnapshot();
  assert(loadedSnapshot !== null, 'Se recupera el snapshot guardado');
  assert(loadedSnapshot?.pointsCount === 5, 'El snapshot retiene pointsCount = 5');
  assert(loadedSnapshot?.audioFileName === 'musica.mp3', 'El snapshot retiene audioFileName');
  clearSessionSnapshot();
  assert(getSessionSnapshot() === null, 'clearSessionSnapshot elimina el snapshot');

  // Test 4: RESET ABSOLUTO de todas las fuentes de estado
  console.log('\n--- Probando resetAbsoluteSession() ---');
  // Sembrar datos temporales en ChoreographyStore
  useChoreographyStore.getState().addPointFromAudio(1000);
  useChoreographyStore.getState().addPointFromAudio(2000);
  assert(useChoreographyStore.getState().points.length >= 2, 'Se sembraron puntos de prueba');

  // Sembrar estado en AudioStudioStore
  useAudioStudioStore.getState().addTimeNode(10, 'Test Node');
  assert(useAudioStudioStore.getState().audioNodes.length > 0, 'Se sembró nodo temporal en el estudio');

  // Sembrar activo de sesión y snapshot
  setActiveSessionId('sess_dirty');
  saveSessionSnapshot(dummySnapshot);

  // Ejecutar RESET ABSOLUTO
  await resetAbsoluteSession();

  // Verificaciones de limpieza total
  assert(useChoreographyStore.getState().points.length === 0, 'RESET: Pista 2D no tiene nodos residuales (points = [])');
  assert(useChoreographyStore.getState().selectedPointId === null, 'RESET: selectedPointId es null');
  assert(useAudioStudioStore.getState().audioNodes.length === 0, 'RESET: Estudio de audio no tiene nodos temporales residuales');
  assert(useAudioStudioStore.getState().additionalTracks.length === 0, 'RESET: Estudio de audio no tiene pistas adicionales');
  assert(useRinkAudioStore.getState().publishedAudio === null, 'RESET: RinkAudioStore no tiene audio publicado residual');
  assert(getActiveSessionId() === null, 'RESET: activeSessionId fue eliminado');
  assert(getSessionSnapshot() === null, 'RESET: snapshot fue eliminado');
  assert(!audioEngine.getState().hasAudioLoaded, 'RESET: AudioEngine no tiene audio cargado');
  assert(!audioEngine.getState().isPlaying, 'RESET: AudioEngine no está reproduciendo');

  // Test 5: initSessionLifecycle — Recarga en el mismo tab (existing-active)
  console.log('\n--- Probando initSessionLifecycle: existing-active ---');
  setActiveSessionId('sess_active_tab');
  const resActive = await initSessionLifecycle('user_test');
  assert(resActive.type === 'existing-active', 'Detecta recarga en la misma pestaña como existing-active');
  assert(resActive.sessionId === 'sess_active_tab', 'Mantiene el mismo sessionId para no interrumpir trabajo');

  // Test 6: initSessionLifecycle — Detección de sesión no cerrada (unclosed-detected)
  console.log('\n--- Probando initSessionLifecycle: unclosed-detected ---');
  clearActiveSessionId();
  saveSessionSnapshot({
    sessionId: 'sess_unclosed_999',
    userId: 'user_test',
    savedAt: Date.now(),
    pointsCount: 3,
    audioFileName: 'pista_anterior.mp3',
    hasAudio: true,
  });
  const resUnclosed = await initSessionLifecycle('user_test');
  assert(resUnclosed.type === 'unclosed-detected', 'Detecta sesión previa no cerrada como unclosed-detected');
  if (resUnclosed.type === 'unclosed-detected') {
    assert(resUnclosed.snapshot.pointsCount === 3, 'Provee snapshot con los datos encontrados');
  }

  // Test 7: initSessionLifecycle — Si el snapshot pertenecía a otro usuario, se purga e inicia limpio
  console.log('\n--- Probando initSessionLifecycle: cambio de cuenta (ownership purge) ---');
  clearActiveSessionId();
  saveSessionSnapshot({
    sessionId: 'sess_other_user',
    userId: 'user_other',
    savedAt: Date.now(),
    pointsCount: 7,
    audioFileName: 'other.mp3',
    hasAudio: true,
  });
  const resDiffUser = await initSessionLifecycle('user_new');
  assert(resDiffUser.type === 'clean-new', 'Snapshot de otra cuenta resulta en clean-new');
  assert(getSessionSnapshot() === null, 'El snapshot de la cuenta anterior fue purgado');

  // Test 8: initSessionLifecycle — Arranque nuevo sin sesiones previas (clean-new)
  console.log('\n--- Probando initSessionLifecycle: clean-new ---');
  clearActiveSessionId();
  clearSessionSnapshot();
  const resClean = await initSessionLifecycle('user_test');
  assert(resClean.type === 'clean-new', 'Arranque limpio genera clean-new');
  assert(getActiveSessionId() === resClean.sessionId, 'Registra nuevo activeSessionId');

  // Test 9: terminateSession — Destrucción inmediata
  console.log('\n--- Probando terminateSession() ---');
  useChoreographyStore.getState().addPointFromAudio(3000);
  assert(useChoreographyStore.getState().points.length > 0, 'Se agrega punto antes de logout');
  await terminateSession();
  assert(useChoreographyStore.getState().points.length === 0, 'terminateSession deja points en []');
  assert(getActiveSessionId() === null, 'terminateSession elimina activeSessionId');

  console.log('\n🎉 TODAS LAS PRUEBAS DE SESSION LIFECYCLE PASARON EXITOSAMENTE.\n');
}

runTests().catch(err => {
  console.error('Error no capturado:', err);
  process.exit(1);
});
