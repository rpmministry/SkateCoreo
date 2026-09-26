/**
 * Regresión arquitectónica: separación Rink (PUBLICADO) ↔ Studio (BORRADOR).
 *
 * Verifica el principio DRAFT → PUBLISH:
 *   - editar/cargar en el Studio NO cambia el audio publicado del Rink;
 *   - solo `publishRinkAudio` reemplaza el audio publicado;
 *   - cada sesión tiene su propio buffer y su propio waveform;
 *   - la publicación incrementa la revisión.
 *
 * No usa AudioContext real: los buffers son dobles ligeros.
 */

import { audioEngine } from './AudioEngine';
import { useRinkAudioStore, getPublishedRinkBuffer } from '../../store/useRinkAudioStore';
import { useAudioStudioStore } from '../../store/useAudioStudioStore';

let total = 0;
function assert(condition: boolean, msg: string) {
  total++;
  if (!condition) {
    console.error(`❌ FAILED: ${msg}`);
    process.exit(1);
  }
  console.log(`✅ PASSED: ${msg}`);
}

function fakeBuffer(peak: number, seconds = 1, sampleRate = 1000): AudioBuffer {
  const length = Math.max(1, Math.floor(seconds * sampleRate));
  const data = new Float32Array(length);
  for (let i = 0; i < length; i++) data[i] = i % 2 === 0 ? peak : -peak;
  return {
    sampleRate,
    length,
    duration: length / sampleRate,
    numberOfChannels: 1,
    getChannelData: () => data,
  } as unknown as AudioBuffer;
}

console.log('\n--- PRUEBAS DE SEPARACIÓN RINK (PUBLICADO) ↔ STUDIO (BORRADOR) ---');

// Estado limpio.
audioEngine.setPlaybackDomain('rink');
audioEngine.clearAudioBuffer();
useRinkAudioStore.getState().clear();
assert(useRinkAudioStore.getState().publishedAudio === null, 'Sin audio no hay nada publicado');

// PUBLICAR la primera mezcla del Studio al Rink.
const rinkMix = fakeBuffer(0.5);
const revision1 = audioEngine.publishRinkAudio(rinkMix, 'mezcla_studio.wav', 'studio-mix');
useRinkAudioStore.getState().syncFromEngine();
assert(revision1 === 1, 'La primera publicación crea la revisión 1');
assert(
  useRinkAudioStore.getState().publishedAudio?.kind === 'studio-mix',
  'El audio publicado se marca como mezcla del Studio'
);
const rinkPublishedRef = audioEngine.getPublishedAudio().buffer;
assert(rinkPublishedRef === rinkMix, 'El Rink publica exactamente el buffer renderizado');

// EDITAR el Studio: cargar otro buffer en su sesión NO debe tocar el Rink.
audioEngine.setPlaybackDomain('studio');
const studioDraft = fakeBuffer(0.9);
audioEngine.setAudioBuffer(studioDraft, 'borrador_studio.wav', false, 'studio-mix');
assert(
  audioEngine.getPublishedAudio().buffer === rinkPublishedRef,
  'Cargar/editar en el Studio NO cambia el audio publicado del Rink'
);
assert(
  audioEngine.getPublishedAudio().revision === 1,
  'La revisión publicada NO cambia al editar el Studio'
);
assert(
  audioEngine.getWaveformData(4, 'studio').length === 4 &&
    audioEngine.getWaveformData(4, 'rink').length === 4,
  'Cada sesión tiene su propio waveform (no comparten buffer)'
);

// CONSOLIDAR el borrador (preview) tampoco publica.
audioEngine.swapAudioBuffer(fakeBuffer(0.8), 'consolidado.wav', 'studio-mix');
assert(
  audioEngine.getPublishedAudio().buffer === rinkPublishedRef,
  'La preview/consolidación del Studio NO publica en el Rink'
);

// VOLVER al Rink: sigue el audio publicado anterior.
audioEngine.setPlaybackDomain('rink');
assert(
  audioEngine.getPublishedAudio().buffer === rinkPublishedRef,
  'Volver a la Pista 2D conserva el audio publicado (no publica el borrador)'
);

// PUBLICAR una segunda mezcla → nueva revisión.
const revision2 = audioEngine.publishRinkAudio(fakeBuffer(0.7), 'mezcla_v2.wav', 'studio-mix');
useRinkAudioStore.getState().syncFromEngine();
assert(revision2 === 2, 'Una nueva publicación incrementa la revisión (2)');
assert(
  useRinkAudioStore.getState().publishedAudio?.revision === 2 &&
    useRinkAudioStore.getState().publishedAudio?.name === 'mezcla_v2.wav',
  'El store reactivo refleja la nueva publicación'
);

// La importación DIRECTA publica como archivo del Rink.
audioEngine.setPlaybackDomain('rink');
audioEngine.setAudioBuffer(fakeBuffer(0.3), 'cancion_directa.mp3', false, 'file');
useRinkAudioStore.getState().syncFromEngine();
assert(
  useRinkAudioStore.getState().publishedAudio?.kind === 'direct-file',
  'El audio cargado directamente en el Rink se publica como direct-file'
);

// ── REGRESIÓN "Enviar al Estudio" (una sola operación, fuente autoritativa) ──
// La disponibilidad del audio publicado debe poder leerse del MOTOR incluso si
// el espejo reactivo va por detrás: antes, gatear el botón solo por el espejo lo
// dejaba deshabilitado en móvil y el toque "no hacía nada".
audioEngine.setPlaybackDomain('rink');
const enginePublished = audioEngine.publishRinkAudio(fakeBuffer(0.6), 'entrada_estudio.wav', 'studio-mix');
assert(
  getPublishedRinkBuffer() === audioEngine.getPublishedAudio().buffer,
  'getPublishedRinkBuffer() refleja el audio publicado del motor (fuente autoritativa)'
);

// `syncFromEngine` es idempotente: no crea estado nuevo si la publicación no cambió.
useRinkAudioStore.getState().syncFromEngine();
const afterFirstSync = useRinkAudioStore.getState();
useRinkAudioStore.getState().syncFromEngine();
assert(
  useRinkAudioStore.getState() === afterFirstSync,
  'syncFromEngine no notifica si la publicación no cambió (sin re-render en bucle)'
);
assert(
  useRinkAudioStore.getState().publishedAudio?.name === 'entrada_estudio.wav',
  'El espejo reactivo refleja la publicación del motor'
);
assert(enginePublished === useRinkAudioStore.getState().publishedAudio?.revision, 'La revisión publicada coincide');

// El puente ÚNICO Rink → Studio siembra el borrador con el audio publicado.
useAudioStudioStore.setState((s) => ({
  tracks: { ...s.tracks, music: { ...s.tracks.music, buffer: null, clips: [], fileName: null } },
}));
const didSeed = useAudioStudioStore.getState().syncRinkSnapshotIntoStudio();
assert(didSeed === true, 'syncRinkSnapshotIntoStudio siembra el Estudio desde el audio publicado');
assert(
  useAudioStudioStore.getState().tracks.music.buffer === audioEngine.getPublishedAudio().buffer,
  'El Estudio recibe EXACTAMENTE el buffer publicado (misma referencia, sin duplicar PCM)'
);

// ── REGRESIÓN DE BORRADO INDEPENDIENTE (clearRinkAudio vs clearStudioAudio) ──
// 1. Cargar buffers en ambos dominios
audioEngine.setPlaybackDomain('studio');
const persistentStudioBuffer = fakeBuffer(0.95);
audioEngine.setAudioBuffer(persistentStudioBuffer, 'studio_work.wav', false, 'studio-mix');
assert(audioEngine.getAudioBuffer('studio') === persistentStudioBuffer, 'Buffer de studio cargado');

audioEngine.setPlaybackDomain('rink');
const persistentRinkBuffer = fakeBuffer(0.45);
audioEngine.publishRinkAudio(persistentRinkBuffer, 'rink_show.wav', 'file');
useRinkAudioStore.getState().syncFromEngine();
assert(audioEngine.getAudioBuffer('rink') === persistentRinkBuffer, 'Buffer de rink publicado');

// 2. clearRinkAudio(): borra Rink sin tocar Studio
audioEngine.clearRinkAudio();
useRinkAudioStore.getState().syncFromEngine();
assert(audioEngine.getAudioBuffer('rink') === null, 'clearRinkAudio elimina el buffer del Rink');
assert(audioEngine.getPublishedAudio().buffer === null, 'clearRinkAudio elimina la publicación del Rink');
assert(useRinkAudioStore.getState().publishedAudio === null, 'clearRinkAudio limpia el store reactivo de Rink');
assert(
  audioEngine.getAudioBuffer('studio') === persistentStudioBuffer,
  'clearRinkAudio NO toca el buffer ni la sesión del Studio'
);

// 3. Restaurar Rink y verificar clearStudioAudio(): borra Studio sin tocar Rink
audioEngine.publishRinkAudio(persistentRinkBuffer, 'rink_restored.wav', 'file');
useRinkAudioStore.getState().syncFromEngine();
assert(audioEngine.getAudioBuffer('rink') === persistentRinkBuffer, 'Rink restaurado');

audioEngine.clearStudioAudio();
assert(audioEngine.getAudioBuffer('studio') === null, 'clearStudioAudio elimina el buffer del Studio');
assert(
  audioEngine.getAudioBuffer('rink') === persistentRinkBuffer,
  'clearStudioAudio NO toca el buffer del Rink'
);
assert(
  audioEngine.getPublishedAudio().buffer === persistentRinkBuffer,
  'clearStudioAudio NO toca la publicación del Rink'
);

// 4. clearAllStudioTracks(): limpia pistas y clips del Studio sin afectar el Rink
const dummyClip = {
  id: 'c1',
  name: 'Clip',
  buffer: persistentStudioBuffer,
  startOffsetSec: 0,
  trimStartSec: 0,
  trimEndSec: 1,
  fadeInSec: 0,
  fadeOutSec: 0,
  gain: 1,
};
useAudioStudioStore.setState((s) => ({
  tracks: {
    ...s.tracks,
    music: { ...s.tracks.music, buffer: persistentStudioBuffer, clips: [dummyClip], fileName: 'm.wav' },
    voice: { ...s.tracks.voice, clips: [dummyClip] },
  },
  additionalTracks: [{ id: 't2', name: 'Extra', volume: 1, pan: 0, mute: false, solo: false, clips: [] }] as any,
}));
useRinkAudioStore.getState().markStudioDirty(true);

useAudioStudioStore.getState().clearAllStudioTracks();
const studioStateAfterClear = useAudioStudioStore.getState();
assert(studioStateAfterClear.tracks.music.buffer === null, 'clearAllStudioTracks limpia el buffer de música');
assert(studioStateAfterClear.tracks.music.clips.length === 0, 'clearAllStudioTracks limpia clips de música');
assert(studioStateAfterClear.tracks.voice.clips.length === 0, 'clearAllStudioTracks limpia clips de voz');
assert(studioStateAfterClear.additionalTracks.length === 0, 'clearAllStudioTracks limpia additionalTracks');
assert(useRinkAudioStore.getState().studioDirty === false, 'clearAllStudioTracks restablece studioDirty a false');
assert(
  audioEngine.getPublishedAudio().buffer === persistentRinkBuffer,
  'clearAllStudioTracks deja intacto el audio publicado en la Pista 2D'
);

console.log(`\nTODAS LAS PRUEBAS DE SEPARACIÓN PASARON: ${total}/${total}`);
