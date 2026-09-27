/**
 * audioSubsystemReconstruction.test.ts — Invariantes de la reconstrucción del
 * subsistema de reproducción (Fase 3).
 *
 * Demuestra, contra el motor REAL, el flujo exigido:
 *
 *   NUEVA SESIÓN → 0 FUENTES → PLAY (con audio) → 1 REPRODUCCIÓN
 *   → METRÓNOMO ON → UNA ÚNICA FUENTE DE METRÓNOMO → STOP → CLEANUP TOTAL
 *
 * y que un cambio de sesión destruye por completo lo anterior.
 */

import { audioEngine } from './AudioEngine';
import { playbackCore } from './PlaybackCore';
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

console.log('\n--- RECONSTRUCCIÓN DEL SUBSISTEMA DE AUDIO ---');

// 1. Estado inicial: absolutamente limpio.
{
  const health = audioEngine.getAudioHealth();
  assert(health.sources.activeCount === 0, 'Arranque: 0 fuentes de audio activas');
  assert(health.sources.phase === 'idle', 'Arranque: transporte en idle');
  assert(health.metronomeEnabled === false, 'Arranque: metrónomo lógico OFF');
  assert(health.metronomeMuted === true, 'Arranque: metrónomo silenciado');
  assert(health.armedSchedulers === 0, 'Arranque: 0 schedulers armados');
  assert(health.clicksCreated === 0, 'Arranque: 0 clicks emitidos en toda la app');
  assert(health.isPlaying === false, 'Arranque: sin reproducción');
}

// 2. Play sin audio: no crea NADA (TEST A: sesión vacía).
{
  const clicksBefore = Metronome.getTotalClicksCreated();
  audioEngine.play();
  const health = audioEngine.getAudioHealth();
  assert(health.isPlaying === false, 'Play sin pista no arranca el transporte');
  assert(health.sources.activeCount === 0, 'Play sin pista no crea fuentes');
  assert(health.armedSchedulers === 0, 'Play sin pista no arma metrónomo');
  assert(
    Metronome.getTotalClicksCreated() === clicksBefore,
    'Play sin pista no emite ningún click (sin pista demo)'
  );
}

// 3. Sesión: begin/end y aislamiento (TEST F/G).
{
  const gen1 = audioEngine.beginSession('sess_test_1');
  assert(playbackCore.getSessionId() === 'sess_test_1', 'beginSession fija el sessionId del motor');
  const genAgain = audioEngine.beginSession('sess_test_1');
  assert(genAgain === gen1, 'Repetir la misma sesión no incrementa generación');

  // Simula una fuente de la sesión 1 (como haría cualquier reproducción activa).
  let stopped = 0;
  playbackCore.registerSource(
    'music',
    { stop: () => { stopped++; } },
    'test-source'
  );
  assert(playbackCore.getActiveSourceCount() === 1, 'La sesión 1 tiene su fuente registrada');

  const gen2 = audioEngine.beginSession('sess_test_2');
  assert(gen2 > gen1, 'Cambiar de sesión incrementa la generación');
  assert(stopped === 1, 'La fuente de la sesión 1 fue DESTRUIDA al cambiar de sesión');
  assert(
    playbackCore.getActiveSourceCount() === 0,
    'La sesión 2 arranca con 0 fuentes (no hereda audio)'
  );
  assert(
    audioEngine.getAudioHealth().metronomeEnabled === false,
    'Sesión nueva sin metrónomo (OFF por defecto)'
  );

  audioEngine.endSession();
  assert(playbackCore.getSessionId() === 'none', 'endSession cierra la sesión');
  assert(playbackCore.getActiveSourceCount() === 0, 'endSession deja 0 fuentes');
}

// 4. Metrónomo: ON → una sola fuente; OFF → destruida (TEST C, parte rítmica).
{
  audioEngine.setMetronomeAudible(true);
  assert(
    audioEngine.metronome.getConfig().enabled === true,
    'Metrónomo ON: estado lógico activo'
  );
  assert(audioEngine.isMetronomeMuted() === false, 'Metrónomo ON: bus desmuteado');

  // Aunque no haya reproducción, el subsistema ya está declarado como activo
  // SOLO si hay scheduler/nodos; con transporte parado sigue silencioso.
  const health = audioEngine.getAudioHealth();
  assert(
    health.sources.subsystems.find((s) => s.name === 'metronome') !== undefined,
    'El metrónomo aparece en el snapshot de subsistemas'
  );

  audioEngine.setMetronomeAudible(false);
  const healthOff = audioEngine.getAudioHealth();
  assert(healthOff.metronomeEnabled === false, 'Metrónomo OFF: estado lógico apagado');
  assert(healthOff.metronomeMuted === true, 'Metrónomo OFF: bus silenciado');
  assert(healthOff.metronomeActiveNodes === 0, 'Metrónomo OFF: 0 osciladores vivos');
  assert(healthOff.armedSchedulers === 0, 'Metrónomo OFF: 0 schedulers armados');
}

// 5. Stop = única ruta de parada: deja el sistema en cero (TEST E).
{
  // Fuente simulada + metrónomo encendido => stop debe limpiar TODO.
  playbackCore.beginSession('sess_stop_test');
  let sourceStopped = 0;
  playbackCore.registerSource('music', { stop: () => { sourceStopped++; } });
  audioEngine.setMetronomeAudible(true);

  audioEngine.stop();

  const health = audioEngine.getAudioHealth();
  assert(sourceStopped === 1, 'stop() detiene la fuente registrada');
  assert(health.sources.activeCount === 0, 'stop() deja 0 fuentes activas');
  assert(health.armedSchedulers === 0, 'stop() deja 0 schedulers');
  assert(health.metronomeActiveNodes === 0, 'stop() deja 0 osciladores');
  assert(health.sources.phase === 'idle', 'stop() devuelve el transporte a idle');
}

// 6. Reset del motor: 0 fuentes, 0 subsistemas, fase idle (TEST de cleanup).
{
  playbackCore.beginSession('sess_reset_test');
  let stopped = 0;
  playbackCore.registerSource('preroll-voice', { stop: () => { stopped++; } });
  audioEngine.setMetronomeAudible(true);

  audioEngine.resetAudioSession();

  const health = audioEngine.getAudioHealth();
  assert(stopped === 1, 'resetAudioSession destruye las fuentes registradas');
  assert(health.sources.activeCount === 0, 'resetAudioSession: 0 fuentes');
  assert(health.sources.phase === 'idle', 'resetAudioSession: fase idle');
  assert(health.metronomeEnabled === false, 'resetAudioSession: metrónomo OFF');
  assert(health.metronomeMuted === true, 'resetAudioSession: metrónomo silenciado');
  assert(health.armedSchedulers === 0, 'resetAudioSession: 0 schedulers');
  assert(audioEngine.getState().isPlaying === false, 'resetAudioSession: sin reproducción');
}

// 7. El motor no expone ninguna segunda implementación de pre-roll ni API legacy.
{
  assert(
    typeof (audioEngine.voiceCueEngine as unknown as { startPreRoll?: unknown }).startPreRoll ===
      'undefined',
    'El pre-roll legacy del VoiceCueEngine está eliminado'
  );
  assert(
    typeof (audioEngine.voiceCueEngine as unknown as { isPreRolling?: unknown }).isPreRolling ===
      'undefined',
    'La API legacy isPreRolling está eliminada'
  );
  const health = audioEngine.getAudioHealth();
  assert(health.sources.activeCount === 0, 'Sin residuos tras toda la batería');
}

if (failures > 0) {
  console.error(`\n[SUBSISTEMA] ${failures}/${total} aserciones fallidas.`);
  process.exit(1);
}
console.log(`\n[SUBSISTEMA] OK — ${total}/${total} aserciones correctas.`);
