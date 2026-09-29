import { playbackClock } from './PlaybackClock';
import { audioEngine } from './AudioEngine';
import { useChoreographyStore } from '../../store/useChoreographyStore';
import { useAudioStudioStore, syncStudioNodesToRink } from '../../store/useAudioStudioStore';
import { RinkMath } from '../canvas/RinkMath';
import { ChoreographyPoint } from '../../types';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    process.exit(1);
  }
  console.log(`✅ PASSED: ${message}`);
}

console.log('\n--- EJECUTANDO PRUEBAS DE SINCRONIZACIÓN AUDIO-PISTA 2D Y SUSTITUCIÓN ESTUDIO ---');

// 1. Unified Playback Clock Tests
console.log('\n[1] Verificando PlaybackClock unificado y llamadas reactivas...');
let tickCount = 0;
let lastTickTime = -1;
const unsub = playbackClock.subscribe((timeMs) => {
  tickCount++;
  lastTickTime = timeMs;
});

// Al suscribirse o hacer tickOnce debe notificar inmediatamente
playbackClock.tickOnce(2500);
assert(tickCount >= 1, 'playbackClock.tickOnce notifica inmediatamente a suscriptores');
assert(lastTickTime === 2500, `lastTickTime esperado 2500, obtenido ${lastTickTime}`);
unsub();

// 2. Sincronización automática useChoreographyStore -> audioEngine.setNodes
console.log('\n[2] Verificando sincronización automática entre store de coreografía y AudioEngine...');
const testPoints: ChoreographyPoint[] = [
  {
    id: 'pt-1',
    x: 10,
    y: 12.5,
    time_ms: 1000,
    timestamp: 1000,
    label: 'Axel Simple',
    type: 'Jump',
    isMainNode: true
  },
  {
    id: 'pt-2',
    x: 25,
    y: 15,
    time_ms: 5000,
    timestamp: 5000,
    label: 'Trompo Bajo',
    type: 'Spin',
    isMainNode: true
  },
  {
    id: 'pt-3',
    x: 40,
    y: 10,
    time_ms: 10000,
    timestamp: 10000,
    label: 'Secuencia de Pasos',
    type: 'StepSequence',
    isMainNode: true
  }
];

useChoreographyStore.getState().setPoints(testPoints);
const engineNodes = audioEngine.getNodes();
assert(engineNodes.length === 3, `AudioEngine recibió automáticamente los 3 nodos (recibidos: ${engineNodes.length})`);
assert(engineNodes[0].label === 'Axel Simple', 'AudioEngine tiene el label del nodo 1 sincronizado');
assert(engineNodes[1].time_ms === 5000, 'AudioEngine tiene el tiempo del nodo 2 sincronizado');

// 3. Interpolación de avatar y figura activa sin requerir trazos manuales forzados
console.log('\n[3] Verificando cálculo de avatar cinemático y figura activa...');
const avatarAt0 = RinkMath.interpolateSkaterPosition(testPoints, 0);
assert(avatarAt0 !== null, 'Avatar calculado con éxito al inicio');
assert(avatarAt0?.x === 10 && avatarAt0?.y === 12.5, 'Avatar inicia en las coordenadas del nodo 1');
assert(avatarAt0?.activeFigureName === 'Axel Simple', `Figura activa al inicio es "Axel Simple" (obtenido: ${avatarAt0?.activeFigureName})`);
assert(avatarAt0?.activePointId === 'pt-1', 'ID de nodo activo al inicio es pt-1');

// En el segundo 3 (entre nodo 1 en 1s y nodo 2 en 5s -> t = 0.5)
const avatarAt3 = RinkMath.interpolateSkaterPosition(testPoints, 3000);
assert(avatarAt3 !== null, 'Avatar calculado con éxito a los 3s');
assert(Math.abs(avatarAt3!.x - 17.5) < 0.1, `Coordenada X interpolada (~17.5m), obtenido ${avatarAt3?.x}`);
assert(avatarAt3?.activeFigureName === 'Axel Simple', 'Figura activa durante el tramo corresponde al nodo de origen');
assert(avatarAt3?.activePointId === 'pt-1', 'ID del punto activo corresponde a pt-1');

// Pasado el último nodo (12s)
const avatarAt12 = RinkMath.interpolateSkaterPosition(testPoints, 12000);
assert(avatarAt12?.x === 40 && avatarAt12?.y === 10, 'Avatar se ubica en el último nodo al terminar el tiempo');
assert(avatarAt12?.activeFigureName === 'Secuencia de Pasos', 'Figura activa al final es "Secuencia de Pasos"');
assert(avatarAt12?.activePointId === 'pt-3', 'ID del punto activo es pt-3');

// 4. Puente Rink -> Studio (syncMarkersFromRink)
console.log('\n[4] Verificando transferencia Pista 2D -> Estudio de Audio...');
useAudioStudioStore.getState().clearTimeNodes();
assert(useAudioStudioStore.getState().audioNodes.length === 0, 'Estudio inicia vacío');

const syncedFromRink = useAudioStudioStore.getState().syncMarkersFromRink();
assert(syncedFromRink === true, 'syncMarkersFromRink reporta sincronización exitosa');
const studioNodes = useAudioStudioStore.getState().audioNodes;
assert(studioNodes.length === 3, `Estudio recibió los 3 nodos de la pista (recibidos: ${studioNodes.length})`);
assert(studioNodes[0].timestampSec === 1.0, 'Nodo 1 en Estudio tiene timestamp 1.0s');
assert(studioNodes[1].timestampSec === 5.0, 'Nodo 2 en Estudio tiene timestamp 5.0s');
assert(studioNodes[2].timestampSec === 10.0, 'Nodo 3 en Estudio tiene timestamp 10.0s');

// 5. Edición en Estudio y Sustitución Limpia Estudio -> Pista 2D (syncStudioNodesToRink)
console.log('\n[5] Verificando sustitución completa y limpia Estudio -> Pista 2D...');
// Simulamos cambios en el estudio:
// - Modificar tiempo del nodo 2 de 5.0s a 6.2s
// - Eliminar nodo 3
// - Añadir nodo 4 nuevo en 8.5s
const modifiedStudioNodes = [
  { ...studioNodes[0] }, // pt-1 en 1.0s
  { ...studioNodes[1], timestampSec: 6.2 }, // pt-2 movido a 6.2s
  { id: 'marker-nuevo-4', numeroSecuencial: 3, timestampSec: 8.5, label: 'Lutz Doble' } // nodo nuevo
];

const replacedRinkPoints = syncStudioNodesToRink(modifiedStudioNodes);
assert(replacedRinkPoints.length === 3, `Pista 2D tiene exactamente 3 nodos tras sustitución (obtenido: ${replacedRinkPoints.length})`);

// Comprobaciones de sustitución limpia:
// A) Nodo 1 conserva sus coordenadas espaciales originales
const p1 = replacedRinkPoints.find((p) => p.id === 'pt-1' || p.sourceStudioMarkerId === 'pt-1');
assert(p1 !== undefined, 'Nodo 1 está presente');
assert(p1?.x === 10 && p1?.y === 12.5, 'Nodo 1 preservó coordenadas (10, 12.5)');
assert(p1?.time_ms === 1000, 'Nodo 1 conserva su tiempo 1000ms');

// B) Nodo 2 adoptó el nuevo tiempo de Estudio pero conservó sus coordenadas
const p2 = replacedRinkPoints.find((p) => p.id === 'pt-2' || p.sourceStudioMarkerId === 'pt-2');
assert(p2 !== undefined, 'Nodo 2 está presente');
assert(p2?.x === 25 && p2?.y === 15, 'Nodo 2 preservó coordenadas (25, 15)');
assert(p2?.time_ms === 6200, `Nodo 2 adoptó el nuevo tiempo de 6200ms (obtenido: ${p2?.time_ms})`);

// C) Nodo 3 fue eliminado en Estudio, por lo que NO debe existir en la Pista 2D
const p3 = replacedRinkPoints.find((p) => p.id === 'pt-3' || p.sourceStudioMarkerId === 'pt-3');
assert(p3 === undefined, 'Nodo 3 (eliminado en Estudio) fue removido limpiamente de la Pista 2D');

// D) Nodo 4 nuevo fue interpolado espacialmente en la pista
const p4 = replacedRinkPoints.find((p) => p.id === 'marker-nuevo-4' || p.sourceStudioMarkerId === 'marker-nuevo-4');
assert(p4 !== undefined, 'Nodo 4 nuevo está presente en la Pista 2D');
assert(p4?.time_ms === 8500, 'Nodo 4 nuevo tiene el tiempo exacto 8500ms');
assert(p4?.label === 'Lutz Doble', 'Nodo 4 nuevo tiene el label "Lutz Doble"');
assert(Number.isFinite(p4?.x) && Number.isFinite(p4?.y), 'Nodo 4 nuevo tiene coordenadas espaciales finitas asignadas');

// E) Bandeja unplacedNodes vacía (sin residuos)
assert(useChoreographyStore.getState().unplacedNodes.length === 0, 'La bandeja unplacedNodes quedó vacía tras la sustitución');

// F) AudioEngine se actualizó con los nodos reemplazados
const updatedEngineNodes = audioEngine.getNodes();
assert(updatedEngineNodes.length === 3, `AudioEngine sincronizado con exactamente 3 nodos (obtenido: ${updatedEngineNodes.length})`);
assert(updatedEngineNodes[1].time_ms === 6200, 'AudioEngine tiene el nodo 2 en 6200ms');

// 6. Aislamiento de fuentes de audio
console.log('\n[6] Verificando aislamiento de fuentes de audio y cambio de dominio...');
audioEngine.setPlaybackDomain('studio');
assert(audioEngine.getPlaybackDomain() === 'studio', 'Dominio cambiado a studio');
assert(audioEngine.getIsPlaying() === false, 'Reproducción detenida al cambiar a studio');

audioEngine.setPlaybackDomain('rink');
assert(audioEngine.getPlaybackDomain() === 'rink', 'Dominio regresado a rink');
assert(audioEngine.getIsPlaying() === false, 'Reproducción sigue en silencio absoluto sin fuentes residuales');

console.log('\n🎉 TODAS LAS PRUEBAS DE SINCRONIZACIÓN Y SUSTITUCIÓN PASARON SATISFACTORIAMENTE.\n');
