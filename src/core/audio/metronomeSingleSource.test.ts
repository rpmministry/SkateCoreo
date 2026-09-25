/**
 * Regresión de arquitectura: el metrónomo es UNA SOLA fuente en toda la app.
 *
 * Desktop, tablet y móvil comparten el mismo `audioEngine` singleton y el mismo
 * `Metronome`. La interfaz puede cambiar (responsive), pero no puede existir un
 * segundo scheduler ni una segunda fuente rítmica (cue ticks + metrónomo).
 *
 * No usa AudioContext real: los contextos son dobles ligeros.
 */

import { audioEngine } from './AudioEngine';
import { Metronome } from './Metronome';
import { VoiceCueEngine } from './VoiceCueEngine';

let total = 0;
function assert(condition: boolean, msg: string) {
  total++;
  if (!condition) {
    console.error(`FAILED: ${msg}`);
    process.exit(1);
  }
  console.log(`PASSED: ${msg}`);
}

class MockGainNode {
  public gain = {
    value: 1,
    setValueAtTime: (val: number) => {
      this.gain.value = val;
    },
    exponentialRampToValueAtTime: () => {},
  };
  public connect() {}
  public disconnect() {}
}

class MockAudioContext {
  public currentTime = 0;
  public createGain() {
    return new MockGainNode();
  }
  public createOscillator() {
    return {
      type: 'sine',
      frequency: { setValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} },
      connect: () => {},
      disconnect: () => {},
      start: () => {},
      stop: () => {},
      onended: null,
    };
  }
}

console.log('\n--- PRUEBAS DE FUENTE ÚNICA DE METRÓNOMO (DESKTOP · TABLET · MÓVIL) ---');

const baselineInstances = audioEngine.getMetronomeInstanceCount();

// 1. Una sola instancia de metrónomo en toda la app.
assert(
  baselineInstances === 1,
  `El motor central expone exactamente 1 metrónomo (instancias=${baselineInstances})`
);

// 2. Default seguro de los cue ticks: desactivados hasta que el motor los habilite.
assert(
  new VoiceCueEngine().getCueTicksEnabled() === false,
  'La Voz Guía arranca con cue ticks DESACTIVADOS (sin segunda fuente rítmica)'
);

// 3. Repetir encendido/apagado del metrónomo NO crea instancias nuevas y NUNCA
//    deja los cue ticks activos mientras el metrónomo está audible.
for (let i = 0; i < 5; i++) {
  audioEngine.setMetronomeAudible(true);
  assert(
    audioEngine.voiceCueEngine.getCueTicksEnabled() === false,
    `Metrónomo audible (ciclo ${i + 1}): cue ticks OFF (una sola fuente rítmica)`
  );
  audioEngine.setMetronomeAudible(false);
}
assert(
  audioEngine.getMetronomeInstanceCount() === baselineInstances,
  `Encender/apagar repetidamente NO duplica instancias (${audioEngine.getMetronomeInstanceCount()})`
);

// 4. Aunque los cue ticks se hubieran activado por cualquier ruta, encender el
//    metrónomo los desactiva (arbitraje central `syncRhythmSources`).
audioEngine.voiceCueEngine.setCueTicksEnabled(true);
audioEngine.setMetronomeAudible(true);
assert(
  audioEngine.voiceCueEngine.getCueTicksEnabled() === false,
  'Encender el metrónomo desactiva cue ticks previamente activos'
);

// 5. MUTE = silencio total: además del estado lógico, no queda scheduler vivo.
audioEngine.setMetronomeAudible(false);
assert(audioEngine.isMetronomeMuted() === true, 'MUTE deja el metrónomo silenciado');
assert(
  audioEngine.metronome.isHardMuted() === true,
  'MUTE es absoluto (bloquea la creación de nuevos clicks)'
);
assert(
  audioEngine.metronome.hasActiveScheduler() === false,
  'MUTE detiene el scheduler (0 bucles vivos)'
);

// 6. `start()` repetido es idempotente: nunca dos schedulers a la vez.
const metro = new Metronome({ bpm: 120, beatsPerMeasure: 4 });
metro.init(new MockAudioContext() as any, new MockGainNode() as any);
metro.start(0);
metro.start(0);
assert(metro.hasActiveScheduler() === true, 'start() repetido mantiene un solo scheduler');
metro.stop();
metro.stop();
assert(metro.hasActiveScheduler() === false, 'stop() repetido deja 0 schedulers');

console.log(`\nTODAS LAS PRUEBAS DE FUENTE ÚNICA DE METRÓNOMO PASARON: ${total}/${total}`);
