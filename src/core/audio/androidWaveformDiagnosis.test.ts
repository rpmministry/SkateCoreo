/**
 * androidWaveformDiagnosis.test.ts
 *
 * Verificación técnica de las correcciones para Android/Mobile:
 * 1. Publicación autoritativa en Pista 2D (rinkRevision, rinkAudioId, getPublishedAudio).
 * 2. Invariante: Cargar audio NUNCA activa el metrónomo (metronomeMuted=true, enabled=false).
 * 3. Consolidación de estudio en dominio 'studio' NUNCA sobreescribe el buffer publicado de 'rink'.
 * 4. Extracción de picos de onda (getWaveformData) devuelve datos reales sin dummy bars parásitas.
 * 5. Aislamiento de metrónomo frente a BpmDetector y recargas de sesión.
 */

import { audioEngine } from './AudioEngine';
import { useRinkAudioStore } from '../../store/useRinkAudioStore';
import { useAudioStudioStore } from '../../store/useAudioStudioStore';
import { Metronome } from './Metronome';

let total = 0;
let failures = 0;
function assert(condition: boolean, msg: string) {
  total++;
  if (condition) {
    console.log(`  ✓ ${msg}`);
  } else {
    failures++;
    console.error(`  ✗ ${msg}`);
  }
}

function createFakeBuffer(sampleRate = 44100, durationSec = 2): AudioBuffer {
  const length = Math.floor(sampleRate * durationSec);
  const left = new Float32Array(length);
  const right = new Float32Array(length);

  for (let i = 0; i < length; i++) {
    // Señal sinusoidal audible
    left[i] = Math.sin((2 * Math.PI * 440 * i) / sampleRate) * 0.5;
    right[i] = Math.sin((2 * Math.PI * 440 * i) / sampleRate) * 0.5;
  }

  return {
    sampleRate,
    length,
    duration: durationSec,
    numberOfChannels: 2,
    getChannelData: (ch: number) => (ch === 0 ? left : right),
    copyFromChannel: () => {},
    copyToChannel: () => {},
  } as unknown as AudioBuffer;
}

console.log('\n=== TEST SUITE: Diagnóstico Waveform y Metrónomo Android/Mobile ===\n');

// ── 1. Publicación de Audio en Rink incrementa revisión e id estable ──
console.log('1. Publicación en Pista 2D');
const initialPub = audioEngine.getPublishedAudio();
const prevRev = initialPub.revision;

const testBuffer = createFakeBuffer(44100, 3.5);
audioEngine.publishRinkAudio(testBuffer, 'pista_prueba_android.mp3', 'file');
useRinkAudioStore.getState().syncFromEngine();

const updatedPub = audioEngine.getPublishedAudio();
const storePub = useRinkAudioStore.getState().publishedAudio;

assert(updatedPub.revision === prevRev + 1, `Revisión incrementada correctamente (${prevRev} -> ${updatedPub.revision})`);
assert(updatedPub.id === `rink-audio-${updatedPub.revision}`, `Id publicado generado correctamente: ${updatedPub.id}`);
assert(updatedPub.name === 'pista_prueba_android.mp3', `Nombre de pista coincide: ${updatedPub.name}`);
assert(Math.abs(updatedPub.durationSec - 3.5) < 0.01, `Duración publicada coincide: ${updatedPub.durationSec}s`);
assert(storePub?.id === updatedPub.id, `useRinkAudioStore sincronizado con id del motor: ${storePub?.id}`);
assert(storePub?.revision === updatedPub.revision, `useRinkAudioStore sincronizado con revisión: ${storePub?.revision}`);

// ── 2. Invariante: Metrónomo queda estrictamente en OFF ──
console.log('\n2. Invariante Metrónomo OFF tras carga de audio');
assert(audioEngine.metronome.getConfig().enabled === false, 'Metrónomo enabled = false');
assert(audioEngine.isMetronomeMuted() === true, 'Metrónomo muted = true en AudioEngine');
assert(audioEngine.metronome.isHardMuted() === true, 'Metrónomo hardMuted = true');
assert(audioEngine.metronome.hasActiveScheduler() === false, 'Metrónomo no tiene scheduler activo');

// ── 3. Waveform Peaks: getWaveformData produce datos normalizados ──
console.log('\n3. Extracción de Picos de Onda Sonora');
const peaks = audioEngine.getWaveformData(100, 'rink');
assert(peaks.length === 100, `getWaveformData genera exactamente los buckets solicitados (100 vs ${peaks.length})`);
assert(peaks.some((p) => p > 0), 'Los picos contienen amplitud real > 0');
assert(peaks.every((p) => p >= 0 && p <= 1.0), 'Todos los picos están acotados en [0.0, 1.0]');

// ── 4. Consolidación de Estudio NO sobreescribe el buffer del Rink ──
console.log('\n4. Aislamiento de Dominio Studio vs Rink');
const studioBuffer = createFakeBuffer(44100, 10.0);
audioEngine.setAudioBuffer(studioBuffer, 'Mezcla_Estudio_Consolidada.wav', true, 'studio-mix', 'studio');

const rinkAfterStudio = audioEngine.getPublishedAudio();
assert(rinkAfterStudio.buffer === testBuffer, 'El buffer de la Pista 2D sigue siendo el original publicado');
assert(rinkAfterStudio.name === 'pista_prueba_android.mp3', 'El nombre en la Pista 2D no fue sobreescrito por la mezcla de estudio');
assert(Math.abs(rinkAfterStudio.durationSec - 3.5) < 0.01, 'La duración del Rink se preserva intacta (3.5s vs 10s de estudio)');

// ── 5. Swap de Audio en Studio respeta Rink ──
console.log('\n5. swapAudioBuffer con targetDomain=studio');
const studioSwap = createFakeBuffer(44100, 12.0);
audioEngine.swapAudioBuffer(studioSwap, 'Swap_Estudio.wav', 'studio-mix', 'studio');

const rinkAfterSwap = audioEngine.getPublishedAudio();
assert(rinkAfterSwap.buffer === testBuffer, 'El buffer de la Pista 2D NO fue alterado por swapAudioBuffer en studio');
assert(audioEngine.getAudioBuffer('studio') === studioSwap, 'El buffer de studio se actualizó correctamente con el swap');

// ── 6. Detección de BPM no enciende el metrónomo ──
console.log('\n6. BpmDetector no debe encender el metrónomo');
audioEngine.detectAndApplyBpm(testBuffer);
assert(audioEngine.metronome.getConfig().enabled === false, 'Metrónomo sigue enabled = false tras detectAndApplyBpm');
assert(audioEngine.isMetronomeMuted() === true, 'Metrónomo sigue muted = true tras detectAndApplyBpm');
assert(audioEngine.metronome.hasActiveScheduler() === false, 'Scheduler sigue inactivo tras detectAndApplyBpm');

// ── 7. Reset absoluto limpia ambos dominios limpiamente ──
console.log('\n7. resetAudioSession limpia estado');
audioEngine.resetAudioSession();
const cleanPub = audioEngine.getPublishedAudio();
assert(cleanPub.buffer === null, 'Buffer de Rink limpiado a null');
assert(cleanPub.durationSec === 0, 'Duración de Rink reseteada a 0');
assert(audioEngine.getAudioBuffer('studio') === null, 'Buffer de Studio limpiado a null');
assert(audioEngine.metronome.getConfig().enabled === false, 'Metrónomo disabled tras reset');
assert(audioEngine.isMetronomeMuted() === true, 'Metrónomo muted tras reset');

console.log(`\n========================================`);
console.log(`RESULTADO FINAL: ${total - failures}/${total} aserciones pasadas.`);
if (failures > 0) {
  console.error(`¡ATENCIÓN! Hubo ${failures} fallos.`);
  process.exit(1);
} else {
  console.log(`TODAS LAS PRUEBAS PASARON EXITOSAMENTE.`);
  process.exit(0);
}
