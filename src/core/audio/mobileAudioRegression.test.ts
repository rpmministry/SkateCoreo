/**
 * mobileAudioRegression.test.ts — Regresión de la "fuente fantasma" de metrónomo
 * y del estado inicial OFF en móvil/tablet.
 *
 * Fija tres invariantes de arquitectura que ya se rompieron una vez:
 *
 *  1. `setEnabled(true)` NUNCA desmutea por sí solo: un metrónomo silenciado no
 *     puede sonar aunque alguna ruta reconstruya el grafo (mosca que producía
 *     clicks con la UI en OFF en móvil al recrearse el AudioContext).
 *  2. Solo puede existir UN scheduler de metrónomo en toda la app: si una
 *     segunda instancia intenta armarse, la intrusa es DESTRUIDA (no muteada).
 *  3. Toda sesión nueva termina con METRÓNOMO = OFF (store + motor) incluso si
 *     una sesión anterior lo había encendido.
 */

import { audioEngine } from './AudioEngine';
import { Metronome } from './Metronome';
import { useAudioStudioStore } from '../../store/useAudioStudioStore';

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

class MockGainNode {
  public gain = {
    value: 1,
    setValueAtTime: (val: number) => {
      this.gain.value = val;
    },
    exponentialRampToValueAtTime: () => {},
    cancelScheduledValues: () => {},
  };
  public connect() {}
  public disconnect() {}
}

class MockOscillator {
  public type = 'sine';
  public frequency = { setValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} };
  public onended: (() => void) | null = null;
  public connect() {}
  public disconnect() {}
  public start() {}
  public stop() {}
}

class MockAudioContext {
  public currentTime = 0;
  public state = 'running';
  public createGain() {
    return new MockGainNode();
  }
  public createOscillator() {
    return new MockOscillator();
  }
}

console.log('\n--- REGRESIÓN MÓVIL/TABLET: FUENTE ÚNICA Y ESTADO INICIAL OFF ---');

// ── 1. Un metrónomo silenciado NUNCA puede sonar por un setEnabled(true) ──
console.log('\n1. Guardia anti "fuente fantasma" (enabled ≠ unmute)');
{
  const fog = new Metronome();
  fog.init(new MockAudioContext() as any, new MockGainNode() as any);
  assert(fog.getConfig().enabled === false, 'Arranca con enabled=false');
  assert(fog.isHardMuted() === true, 'Arranca con hardMuted=true (silencio absoluto)');

  // Ruta hostil: alguien "enciende" el metrónomo sin pasar por el mute real.
  fog.setEnabled(true);
  fog.start(0);
  assert(fog.getConfig().enabled === true, 'setEnabled(true) actualiza el estado lógico');
  assert(
    fog.isHardMuted() === true,
    'setEnabled(true) NO desmutea: el silenciador solo lo quita setMuted(false)'
  );
  assert(
    fog.hasActiveScheduler() === false,
    'Con hardMuted=true, start() NO arma scheduler (imposible fuente fantasma)'
  );

  const clicksBefore = Metronome.getTotalClicksCreated();
  fog.scheduleAccentClick(0);
  assert(
    Metronome.getTotalClicksCreated() === clicksBefore,
    'emitClick bloqueado por hardMuted: no se crea ningún oscilador'
  );

  // Ruta legítima: el motor desmutea explícitamente y entonces sí suena.
  fog.setMuted(false);
  assert(fog.isHardMuted() === false, 'setMuted(false) es la ÚNICA vía de desmuteo');
  fog.scheduleAccentClick(0);
  assert(
    Metronome.getTotalClicksCreated() > clicksBefore,
    'Desmuteado explícitamente, el click se crea (una sola fuente)'
  );

  fog.stop();
  fog.destroy();
}

// ── 2. Imposible coexistir dos schedulers: la intrusa se destruye ──
console.log('\n2. Garantía global de scheduler único');
{
  const a = new Metronome({ enabled: true, bpm: 120 });
  const b = new Metronome({ enabled: true, bpm: 120 });
  a.init(new MockAudioContext() as any, new MockGainNode() as any);
  b.init(new MockAudioContext() as any, new MockGainNode() as any);

  a.start(0);
  assert(a.hasActiveScheduler() === true, 'Metrónomo A arma su scheduler');
  assert(Metronome.getArmedSchedulerCount() === 1, 'Exactamente 1 scheduler armado tras A');

  const killsBefore = Metronome.getDuplicateKillCount();
  b.start(0);
  assert(
    b.hasActiveScheduler() === true,
    'Metrónomo B queda como fuente activa (dueño del scheduler)'
  );
  assert(
    a.hasActiveScheduler() === false,
    'Metrónomo A (intruso) queda SIN scheduler: no hay dos bucles'
  );
  assert(
    Metronome.getArmedSchedulerCount() === 1,
    'Solo 1 scheduler armado en toda la app tras armar B'
  );
  assert(
    Metronome.getSchedulerOwnerInstanceId() === b.getInstanceId(),
    'El dueño del scheduler global es B'
  );
  assert(
    Metronome.getDuplicateKillCount() === killsBefore + 1,
    'La duplicación fue registrada y destruida (no solo muteada)'
  );

  // La intrusa queda estructuralmente muerta: no puede volver a sonar sola.
  const clicksAfterKill = Metronome.getTotalClicksCreated();
  a.scheduleAccentClick(0);
  assert(
    Metronome.getTotalClicksCreated() === clicksAfterKill,
    'La fuente intrusa destruida ya no puede crear clicks'
  );

  b.stop();
  b.destroy();
  a.destroy();
  assert(Metronome.getArmedSchedulerCount() === 0, 'Tras destruir todo: 0 schedulers armados');
}

// ── 3. Estado inicial OFF en el motor y en el store ──
console.log('\n3. Toda sesión nueva arranca con metrónomo OFF');
{
  // Sesión previa "sucia": el usuario había encendido el metrónomo.
  audioEngine.setMetronomeAudible(true);
  assert(audioEngine.metronome.getConfig().enabled === true, 'Precondición: metrónomo encendido');

  // Reset absoluto de sesión.
  audioEngine.resetAudioSession();
  const healthAfterReset = audioEngine.getAudioHealth();
  assert(healthAfterReset.metronomeEnabled === false, 'resetAudioSession deja enabled=false');
  assert(healthAfterReset.metronomeMuted === true, 'resetAudioSession deja muted=true');
  assert(healthAfterReset.armedSchedulers === 0, 'resetAudioSession deja 0 schedulers');
  assert(
    healthAfterReset.metronomeInstances === 1,
    `Sigue existiendo UNA sola instancia (${healthAfterReset.metronomeInstances})`
  );
  assert(
    healthAfterReset.duplicateKills === 0 || healthAfterReset.duplicateKills > 0,
    `Contador de duplicados disponible para el HUD (${healthAfterReset.duplicateKills})`
  );

  // Divergencia hostil entre motor y store: el motor queda encendido…
  audioEngine.setMetronomeAudible(true);
  // …y el reset de control del store debe converger ambos a OFF.
  useAudioStudioStore.getState().resetMetronomeControl();
  const globalControls = useAudioStudioStore.getState().globalControls;
  assert(globalControls.metronome.enabled === false, 'resetMetronomeControl: store enabled=false');
  assert(globalControls.metronome.muted === true, 'resetMetronomeControl: store muted=true');
  assert(
    useAudioStudioStore.getState().metronomeConfig.enabled === false,
    'resetMetronomeControl: metronomeConfig.enabled=false'
  );
  assert(audioEngine.metronome.getConfig().enabled === false, 'resetMetronomeControl: motor enabled=false');
  assert(audioEngine.isMetronomeMuted() === true, 'resetMetronomeControl: motor muted=true');

  // clearAllStudioTracks (reset de sesión) también fuerza OFF.
  audioEngine.setMetronomeAudible(true);
  useAudioStudioStore.setState((s) => ({
    globalControls: {
      ...s.globalControls,
      metronome: { ...s.globalControls.metronome, enabled: true, muted: false },
    },
  }));
  useAudioStudioStore.getState().clearAllStudioTracks();
  assert(
    useAudioStudioStore.getState().globalControls.metronome.enabled === false &&
      useAudioStudioStore.getState().globalControls.metronome.muted === true,
    'clearAllStudioTracks devuelve el metrónomo a OFF en el store'
  );
  assert(audioEngine.isMetronomeMuted() === true, 'clearAllStudioTracks deja el motor silenciado');

  // Encender y apagar repetidamente sigue sin duplicar instancias ni schedulers.
  for (let i = 0; i < 3; i++) {
    audioEngine.setMetronomeAudible(true);
    audioEngine.setMetronomeAudible(false);
  }
  const finalHealth = audioEngine.getAudioHealth();
  assert(finalHealth.metronomeInstances === 1, 'Ciclos ON/OFF no crean instancias');
  assert(finalHealth.armedSchedulers === 0, 'Ciclos ON/OFF no dejan schedulers');
}

if (failures > 0) {
  console.error(`\n[REGRESIÓN MÓVIL] ${failures}/${total} aserciones fallidas.`);
  process.exit(1);
}
console.log(`\n[REGRESIÓN MÓVIL] OK — ${total}/${total} aserciones correctas.`);
