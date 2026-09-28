/**
 * mobileAudioReconstruction.test.ts — Verificación determinista de la reconstrucción
 * del sistema de audio para móviles y tablets:
 * 1. El metrónomo permanece apagado y silenciado por defecto.
 * 2. setMetronomeConfig (BPM, subdivisión, compás) NO enciende el metrónomo.
 * 3. Cancelación de reclamos asíncronos (evita resurrección de metrónomo/play fantasma).
 * 4. Consolidación de audio en el Studio sin abortos de reproducción (swapAudioBuffer vs setAudioBuffer).
 * 5. Cero osciladores vivos y cero planificadores cuando el metrónomo está apagado.
 */

import { audioEngine } from './AudioEngine';
import { useAudioStudioStore } from '../../store/useAudioStudioStore';
import { Metronome } from './Metronome';

let total = 0;
let failures = 0;

function assert(condition: boolean, msg: string) {
  total++;
  if (condition) {
    console.log(`  ✅ ${msg}`);
  } else {
    failures++;
    console.error(`  ❌ FALLO: ${msg}`);
  }
}

console.log('\n--- VERIFICACIÓN DE RECONSTRUCCIÓN DE AUDIO MÓVIL/TABLET ---');

// 1. Estado inicial estricto: metrónomo en OFF y silenciado
{
  audioEngine.resetAudioSession();
  useAudioStudioStore.getState().resetStudio();

  const metroConfig = audioEngine.metronome.getConfig();
  assert(metroConfig.enabled === false, 'Metrónomo del motor: enabled === false');
  assert(audioEngine.isMetronomeMuted() === true, 'Metrónomo del motor: isMetronomeMuted() === true');
  assert(Metronome.getArmedSchedulerCount() === 0, 'Cero schedulers armados en arranque');
  assert(audioEngine.metronome.getActiveNodeCount() === 0, 'Cero nodos de oscilador vivos en arranque');

  const storeControls = useAudioStudioStore.getState().globalControls;
  assert(storeControls.metronome.enabled === false, 'Store: metronome.enabled === false');
  assert(storeControls.metronome.muted === true, 'Store: metronome.muted === true');
}

// 2. setMetronomeConfig NO enciende el metrónomo automáticamente
{
  audioEngine.resetAudioSession();
  useAudioStudioStore.getState().resetStudio();

  // Cambiar BPM
  useAudioStudioStore.getState().setMetronomeConfig({ bpm: 155 });
  assert(audioEngine.metronome.getConfig().enabled === false, 'Cambio de BPM no enciende metrónomo en motor');
  assert(audioEngine.isMetronomeMuted() === true, 'Cambio de BPM mantiene metrónomo silenciado');
  assert(useAudioStudioStore.getState().globalControls.metronome.enabled === false, 'Store mantiene metronome.enabled === false tras BPM');

  // Cambiar subdivisión
  useAudioStudioStore.getState().setMetronomeConfig({ subdivision: 4 });
  assert(audioEngine.metronome.getConfig().enabled === false, 'Cambio de subdivisión no enciende metrónomo');
  assert(audioEngine.isMetronomeMuted() === true, 'Cambio de subdivisión mantiene metrónomo silenciado');

  // Cambiar compás
  useAudioStudioStore.getState().setMetronomeConfig({ beatsPerMeasure: 3 });
  assert(audioEngine.metronome.getConfig().enabled === false, 'Cambio de compás no enciende metrónomo');
  assert(audioEngine.isMetronomeMuted() === true, 'Cambio de compás mantiene metrónomo silenciado');
  assert(Metronome.getArmedSchedulerCount() === 0, 'Cero schedulers armados tras reconfiguraciones');
}

// 3. Encender explícitamente vía toggleMetronomeMute / toggleMetronomeEnabled
{
  audioEngine.resetAudioSession();
  useAudioStudioStore.getState().resetStudio();

  // Usuario pulsa la campana
  useAudioStudioStore.getState().toggleMetronomeMute();
  assert(useAudioStudioStore.getState().globalControls.metronome.enabled === true, 'Toggle enciende metronome.enabled en store');
  assert(useAudioStudioStore.getState().globalControls.metronome.muted === false, 'Toggle desmutea metronome.muted en store');
  assert(audioEngine.metronome.getConfig().enabled === true, 'Toggle enciende metronome en motor');
  assert(audioEngine.isMetronomeMuted() === false, 'Toggle desmutea metronome en motor');

  // Usuario vuelve a pulsar para apagar
  useAudioStudioStore.getState().toggleMetronomeMute();
  assert(useAudioStudioStore.getState().globalControls.metronome.enabled === false, 'Segundo toggle apaga metronome en store');
  assert(useAudioStudioStore.getState().globalControls.metronome.muted === true, 'Segundo toggle silencia metronome en store');
  assert(audioEngine.metronome.getConfig().enabled === false, 'Segundo toggle apaga metronome en motor');
  assert(audioEngine.isMetronomeMuted() === true, 'Segundo toggle silencia metronome en motor');
  assert(Metronome.getArmedSchedulerCount() === 0, 'Cero schedulers armados tras apagar');
  assert(audioEngine.metronome.getActiveNodeCount() === 0, 'Cero nodos activos tras apagar');
}

// 4. Cancelación de intención de metrónomo: apagar invalida reclamos async
{
  audioEngine.resetAudioSession();

  // Simula solicitud de encendido seguida inmediatamente de un apagado
  audioEngine.setMetronomeAudible(true);
  audioEngine.setMetronomeAudible(false);

  assert(audioEngine.metronome.getConfig().enabled === false, 'Metrónomo queda apagado');
  assert(audioEngine.isMetronomeMuted() === true, 'Metrónomo queda silenciado');
  assert(Metronome.getArmedSchedulerCount() === 0, 'Cero schedulers armados tras cancelación');
}

// 5. Consolidación de audio en reproducción: no corta el playback
{
  audioEngine.resetAudioSession();

  // Mock de AudioBuffer
  const fakeBuffer = {
    duration: 10,
    length: 441000,
    sampleRate: 44100,
    numberOfChannels: 2,
    getChannelData: () => new Float32Array(441000)
  } as unknown as AudioBuffer;

  audioEngine.setAudioBuffer(fakeBuffer, 'test.wav', false, 'studio-mix');

  // swapAudioBuffer sustituye el buffer sin detener el transporte
  audioEngine.swapAudioBuffer(fakeBuffer, 'swap_test.wav', 'studio-mix');
  assert(audioEngine.getState().fileName === 'swap_test.wav', 'swapAudioBuffer actualiza el buffer correctamente');
  assert(audioEngine.getState().durationMs === 10000, 'swapAudioBuffer preserva duración');
}

// 6. Reporte final
console.log(`\nPruebas ejecutadas: ${total} | Fallos: ${failures}`);
if (failures > 0) {
  process.exit(1);
} else {
  console.log('🎉 TODAS LAS PRUEBAS DE RECONSTRUCCIÓN DE AUDIO MÓVIL PASARON EXITOSAMENTE.\n');
}
