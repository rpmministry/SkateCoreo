/**
 * audioStudioTrackDeletion.test.ts
 *
 * Pruebas unitarias para:
 * 1. Eliminación completa de contenedores de pista del DOM (Master, Grabación, Adicionales).
 * 2. Estado de visibilidad y presencia en el arreglo.
 * 3. Restauración de la pista Master al añadir audio tras haberla eliminado.
 * 4. Undo/redo de la visibilidad y canales del Estudio.
 * 5. Borrado exclusivo de audio en la Pista 2D sin tocar nodos de coreografía.
 */

import { useAudioStudioStore } from './useAudioStudioStore';
import { useChoreographyStore } from './useChoreographyStore';
import { useRinkAudioStore } from './useRinkAudioStore';
import { audioEngine } from '../core/audio/AudioEngine';

let failures = 0;
function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  ✓ ${message}`);
  } else {
    failures++;
    console.error(`  ✗ ${message}`);
  }
}

console.log('\n[audioStudioTrackDeletion] Verificando eliminación de pistas y protección de coreografía');

// Mock mínimo de AudioBuffer para entorno Node.js / test
function createMockBuffer(durationSec: number = 3): AudioBuffer {
  return {
    duration: durationSec,
    length: durationSec * 44100,
    numberOfChannels: 2,
    sampleRate: 44100,
    getChannelData: () => new Float32Array(durationSec * 44100),
    copyFromChannel: () => {},
    copyToChannel: () => {},
  } as unknown as AudioBuffer;
}

// 1. Estado inicial
const store = useAudioStudioStore.getState;
store().resetStudio();

assert(store().isMusicTrackVisible === true, 'Inicialmente la pista Master está visible');
assert(store().isRecordingTrackVisible === false, 'Inicialmente la pista de Grabación está oculta si no tiene tomas');
assert(store().additionalTracks.length === 0, 'Inicialmente no hay pistas adicionales');

// 2. Añadir pistas adicionales
const track1 = store().addAudioTrack('Pista 2 Guitarra');
const track2 = store().addAudioTrack('Pista 3 Teclado');
assert(store().additionalTracks.length === 2, 'Se añadieron 2 pistas adicionales');

// 3. Eliminar una pista adicional
store().removeAudioTrack(track1.id);
assert(store().additionalTracks.length === 1, 'Pista adicional 1 eliminada de additionalTracks');
assert(store().additionalTracks[0]?.id === track2.id, 'Solo queda la Pista 3');

// 4. Activar pista de grabación simulando una toma
useAudioStudioStore.setState({ isRecordingTrackVisible: true });
assert(store().isRecordingTrackVisible === true, 'Pista de grabación visible al activarse');

// 5. Eliminar pista de grabación
store().removeAudioTrack('track-recording');
assert(store().isRecordingTrackVisible === false, 'Pista de grabación eliminada y marcada no visible');

// 6. Eliminar pista Master
store().removeAudioTrack('track-music');
assert(store().isMusicTrackVisible === false, 'Pista Master eliminada y marcada no visible');
assert(store().tracks.music.buffer === null, 'Buffer de pista Master liberado');
assert(store().tracks.music.clips.length === 0, 'Clips de pista Master vaciados');

// 7. Eliminar la última pista adicional restante -> Arreglo completamente limpio
store().removeAudioTrack(track2.id);
assert(store().additionalTracks.length === 0, 'Todas las pistas adicionales eliminadas');

// 8. Restaurar Master al añadir nueva pista cuando Master fue eliminada
const restoredMaster = store().addAudioTrack('Nueva Canción Principal', createMockBuffer(10), 'cancion.mp3');
assert(store().isMusicTrackVisible === true, 'Pista Master reactivada al añadir pista');
assert(restoredMaster.name === 'Nueva Canción Principal', 'Nombre asignado a la Master');
assert(store().additionalTracks.length === 0, 'No se creó una pista adicional redundante; se restauró Master');

// 9. Deshacer (Undo) restaura estado previo
store().undoStudio();
// El estado previo a añadir la canción principal era isMusicTrackVisible: false
assert(store().isMusicTrackVisible === false, 'Undo restaura isMusicTrackVisible previo');

// Rehacer (Redo) vuelve a reactivar
store().redoStudio();
assert(store().isMusicTrackVisible === true, 'Redo restaura isMusicTrackVisible');

// 10. Verificación de "Borrar pista" en Pista 2D: nunca borra nodos ni coreografía
console.log('\n[rinkAudioClear] Verificando protección absoluta de coreografía al borrar audio de Pista 2D');
const choreoState = useChoreographyStore.getState();
choreoState.clearAllPoints();

// Sembrar puntos y líneas de coreografía
useChoreographyStore.setState({
  points: [
    {
      id: 'pt-1',
      x: 100,
      y: 150,
      time_ms: 2500,
      timestamp: 2500,
      type: 'Jump',
      label: 'Axel Doble',
    },
    {
      id: 'pt-2',
      x: 200,
      y: 250,
      time_ms: 5000,
      timestamp: 5000,
      type: 'Spin',
      label: 'Trompo Bajo',
    },
  ],
});

assert(useChoreographyStore.getState().points.length === 2, 'Coreografía tiene 2 puntos sembrados');

// Cargar audio en Rink
const rinkBuf = createMockBuffer(60);
audioEngine.setAudioBuffer(rinkBuf, 'Rutina_Competicion.mp3', false, 'file', 'rink');
useRinkAudioStore.getState().syncFromEngine();

assert(Boolean(useRinkAudioStore.getState().publishedAudio) === true, 'Audio publicado en Rink');
assert(audioEngine.getState().hasAudioLoaded === true, 'AudioEngine tiene audio cargado');

// Ejecutar borrado de audio en Rink
audioEngine.clearRinkAudio();
useRinkAudioStore.getState().clear();

assert(audioEngine.getState().hasAudioLoaded === false, 'Audio descargado de AudioEngine');
assert(useRinkAudioStore.getState().publishedAudio === null, 'RinkAudioStore limpio');
assert(useChoreographyStore.getState().points.length === 2, 'CRÍTICO: Los puntos de coreografía siguen 100% intactos');
assert(useChoreographyStore.getState().points[0]?.label === 'Axel Doble', 'Datos de nodos intactos');
assert(useChoreographyStore.getState().points[1]?.label === 'Trompo Bajo', 'Datos de nodos intactos');

if (failures > 0) {
  console.error(`\n❌ ${failures} pruebas fallaron.`);
  process.exit(1);
} else {
  console.log('\n🎉 TODAS LAS PRUEBAS DE ELIMINACIÓN DE PISTAS Y BORRADO DE AUDIO PASARON EXITOSAMENTE.\n');
}
