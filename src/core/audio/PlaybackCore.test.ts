/**
 * PlaybackCore.test.ts — Verificación del núcleo determinista de reproducción.
 *
 * Cubre los invariantes que impiden "fuentes fantasma":
 *  · ninguna fuente sin registro;
 *  · una sesión nueva NO hereda fuentes de la anterior;
 *  · stopAll/disposeAll detienen TODO y son idempotentes;
 *  · un error en un cleanup no bloquea los demás ni deja el registro sucio;
 *  · la máquina de estados rechaza transiciones imposibles sin corromper nada;
 *  · el snapshot refleja la verdad operativa (base del HUD).
 */

import { PlaybackCore } from './PlaybackCore';

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

function makeHandle(log: string[], name: string, throwOnStop = false) {
  let stops = 0;
  return {
    handle: {
      stop: () => {
        stops++;
        log.push(`stop:${name}`);
        if (throwOnStop) throw new Error(`boom:${name}`);
      },
      disconnect: () => log.push(`disconnect:${name}`)
    },
    getStops: () => stops
  };
}

console.log('\n--- PLAYBACK CORE ---');

// 1. Estado inicial absolutamente limpio.
{
  const core = new PlaybackCore();
  const snap = core.snapshot();
  assert(snap.activeCount === 0, 'Nace con 0 fuentes activas');
  assert(core.getPhase() === 'idle', 'Nace en fase idle');
  assert(core.getSessionId() === 'none', 'Nace sin sesión');
  assert(core.isAnythingAudible() === false, 'Nada audible en el arranque');
}

// 2. Registro y liberación de fuentes.
{
  const core = new PlaybackCore();
  const log: string[] = [];
  const a = makeHandle(log, 'music');
  const b = makeHandle(log, 'preroll');
  const idA = core.registerSource('music', a.handle, 'pista');
  const idB = core.registerSource('preroll-voice', b.handle);
  assert(core.getActiveSourceCount() === 2, 'Dos fuentes registradas');
  assert(core.getActiveSourceCount('music') === 1, 'Filtro por tipo music');
  assert(core.getActiveSourceCount('preroll-voice') === 1, 'Filtro por tipo preroll');

  core.releaseSource(idA);
  assert(core.getActiveSourceCount() === 1, 'Liberar música deja 1 fuente');
  assert(a.getStops() === 1, 'Liberar detiene la fuente exactamente una vez');
  assert(log.includes('disconnect:music'), 'Liberar también desconecta');

  // Idempotencia: liberar de nuevo no repite stop.
  core.releaseSource(idA);
  assert(a.getStops() === 1, 'releaseSource es idempotente');

  core.releaseSource(idB);
  assert(core.getActiveSourceCount() === 0, 'Cero fuentes tras liberar todo');
  assert(core.isAnythingAudible() === false, 'Silencio tras liberar todo');
}

// 3. stopAll por tipo y total.
{
  const core = new PlaybackCore();
  const log: string[] = [];
  const pre1 = makeHandle(log, 'pre1');
  const pre2 = makeHandle(log, 'pre2');
  const music = makeHandle(log, 'music');
  core.registerSource('preroll-voice', pre1.handle);
  core.registerSource('preroll-voice', pre2.handle);
  core.registerSource('music', music.handle);

  core.stopAll(['preroll-voice']);
  assert(core.getActiveSourceCount() === 1, 'stopAll por tipo deja solo la música');
  assert(pre1.getStops() === 1 && pre2.getStops() === 1, 'Detiene las fuentes del tipo pedido');
  assert(music.getStops() === 0, 'NO detiene fuentes de otros tipos');

  core.stopAll();
  assert(core.getActiveSourceCount() === 0, 'stopAll total deja 0 fuentes');
  assert(music.getStops() === 1, 'stopAll total detiene también la música');
  core.stopAll();
  assert(music.getStops() === 1, 'stopAll repetido es idempotente');
}

// 4. Subsistemas (metrónomo / voz / tts) y snapshot.
{
  const core = new PlaybackCore();
  let metroActive = true;
  let metroStops = 0;
  core.registerSubsystem(
    'metronome',
    () => metroActive,
    () => {
      metroStops++;
      metroActive = false;
    }
  );
  let voiceActive = false;
  core.registerSubsystem('voice-cue', () => voiceActive, () => {});
  core.registerSubsystem('tts', () => false, () => {});

  assert(core.isSubsystemActive('metronome') === true, 'Metrónomo reportado activo');
  assert(core.isAnythingAudible() === true, 'Un subsistema activo = algo audible');
  const snap = core.snapshot();
  assert(
    snap.subsystems.find((s) => s.name === 'metronome')?.active === true,
    'El snapshot refleja el metrónomo activo'
  );

  core.stopAll();
  assert(metroStops === 1, 'stopAll detiene el metrónomo');
  assert(
    core.snapshot().subsystems.find((s) => s.name === 'metronome')?.active === false,
    'El snapshot confirma que el metrónomo quedó parado'
  );
  core.stopAll();
  assert(metroStops === 1, 'Subsistema ya parado no se re-detiene');
  assert(core.isAnythingAudible() === false, 'Silencio total tras parar subsistemas');
}

// 5. AISLAMIENTO DE SESIÓN: una sesión nueva jamás hereda fuentes.
{
  const core = new PlaybackCore();
  const log: string[] = [];
  const s1Music = makeHandle(log, 's1-music');
  core.beginSession('session-A');
  const genA = core.getGeneration();
  core.registerSource('music', s1Music.handle);
  assert(core.getActiveSourceCount() === 1, 'Sesión A tiene su fuente');

  const genB = core.beginSession('session-B');
  assert(genB > genA, 'Cambiar de sesión incrementa la generación');
  assert(core.getSessionId() === 'session-B', 'El id de sesión es el nuevo');
  assert(
    s1Music.getStops() === 1,
    'La fuente de la sesión A fue DESTRUIDA al abrir B (no se hereda)'
  );
  assert(core.getActiveSourceCount() === 0, 'Sesión B arranca con 0 fuentes');
  assert(core.isAnythingAudible() === false, 'Sesión B arranca en silencio');

  const snap = core.snapshot();
  assert(snap.counters.sessionsBegun === 2, 'Contador de sesiones iniciadas correcto');

  core.endSession();
  assert(core.getSessionId() === 'none', 'endSession deja sin sesión');
  assert(core.getActiveSourceCount() === 0, 'endSession deja 0 fuentes');
  assert(snap.counters && core.snapshot().counters.sessionsEnded === 1, 'Contador de sesiones cerradas');
}

// 6. Fuentes etiquetadas con sesión/generación (trazabilidad exigida).
{
  const core = new PlaybackCore();
  const log: string[] = [];
  core.beginSession('session-trace');
  const gen = core.getGeneration();
  core.registerSource('music', makeHandle(log, 'm').handle, 'Pista Master');
  const snap = core.snapshot();
  const source = snap.active[0];
  assert(source.sessionId === 'session-trace', 'La fuente registra su sessionId');
  assert(source.generation === gen, 'La fuente registra su generación');
  assert(source.label === 'Pista Master', 'La fuente conserva su etiqueta legible');
  assert(snap.activeByKind.music === 1, 'Conteo por tipo en el snapshot');
}

// 7. Resiliencia: un cleanup que lanza no rompe la parada del resto.
{
  const core = new PlaybackCore();
  const log: string[] = [];
  const bad = makeHandle(log, 'bad', true);
  const good = makeHandle(log, 'good');
  core.registerSource('music', bad.handle);
  core.registerSource('preroll-voice', good.handle);

  core.stopAll();
  assert(core.getActiveSourceCount() === 0, 'stopAll limpia el registro aunque un cleanup falle');
  assert(good.getStops() === 1, 'El resto de fuentes sí se detiene');
  assert(core.snapshot().counters.releaseErrors >= 1, 'El error de cleanup queda contabilizado');
}

// 8. Máquina de estados del transporte.
{
  const core = new PlaybackCore();
  assert(core.setPhase('playing') === true, 'idle→playing permitido (pista corta)');
  assert(core.setPhase('paused') === true, 'playing→paused permitido');
  assert(core.setPhase('playing') === true, 'paused→playing permitido');
  assert(core.setPhase('idle') === true, 'playing→idle permitido');
  assert(core.setPhase('paused') === false, 'idle→paused RECHAZADO (transición inválida)');
  assert(core.getPhase() === 'idle', 'La fase no se corrompe con una transición inválida');
  assert(core.snapshot().counters.invalidTransitions === 1, 'Transición inválida contabilizada');

  core.setPhase('preroll');
  assert(core.getPhase() === 'preroll', 'idle→preroll permitido');
  core.setPhase('playing');
  assert(core.getPhase() === 'playing', 'preroll→playing permitido');
}

// 9. disposeAll (reset del motor) deja TODO a cero, incluyendo fase.
{
  const core = new PlaybackCore();
  const log: string[] = [];
  core.beginSession('s');
  core.setPhase('playing');
  core.registerSource('music', makeHandle(log, 'm').handle);
  let ttsActive = true;
  core.registerSubsystem(
    'tts',
    () => ttsActive,
    () => {
      ttsActive = false;
    }
  );
  core.disposeAll('manual-reset');
  const snap = core.snapshot();
  assert(snap.activeCount === 0, 'disposeAll deja 0 fuentes');
  assert(snap.phase === 'idle', 'disposeAll devuelve la fase a idle');
  assert(core.isAnythingAudible() === false, 'disposeAll deja silencio absoluto');
}

if (failures > 0) {
  console.error(`\n[PlaybackCore] ${failures}/${total} aserciones fallidas.`);
  process.exit(1);
}
console.log(`\n[PlaybackCore] OK — ${total}/${total} aserciones correctas.`);
