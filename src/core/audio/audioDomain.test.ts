/**
 * Pruebas de aislamiento de dominio de audio (Fase 2).
 *
 * Verifica que el motor distingue el dominio 'rink' (Pista 2D: música + voces guía
 * de nodos + metrónomo) del dominio 'studio' (Audio Studio: solo su mezcla). El
 * comportamiento audible (silencio de cues en Studio) se valida en el dispositivo;
 * aquí se comprueba la API que lo gobierna y que no rompe el estado del motor.
 */

import { audioEngine } from '../../services/audioEngine';

let total = 0;
function assert(condition: boolean, msg: string) {
  total++;
  if (!condition) {
    console.error(`FAILED: ${msg}`);
    process.exit(1);
  }
  console.log(`PASSED: ${msg}`);
}

console.log('--- PRUEBAS DE AISLAMIENTO DE DOMINIO DE AUDIO (STUDIO vs RINK) ---');

// Dominio por defecto: Pista 2D.
assert(audioEngine.getPlaybackDomain() === 'rink', "Dominio por defecto = 'rink' (Pista 2D)");

// Entrar en Studio desactiva metrónomo y voces guía (no debe lanzar sin contexto).
audioEngine.setPlaybackDomain('studio');
assert(
  audioEngine.getPlaybackDomain() === 'studio',
  "setPlaybackDomain('studio') cambia el dominio"
);

// Idempotente.
audioEngine.setPlaybackDomain('studio');
assert(audioEngine.getPlaybackDomain() === 'studio', 'Cambiar al mismo dominio es idempotente');

// Volver a Rink.
audioEngine.setPlaybackDomain('rink');
assert(audioEngine.getPlaybackDomain() === 'rink', "setPlaybackDomain('rink') restaura el dominio");

// El estado del motor sigue siendo coherente tras los cambios de dominio.
const state = audioEngine.getState();
assert(typeof state.isPlaying === 'boolean', 'getState().isPlaying sigue siendo booleano');
assert(typeof state.hasAudioLoaded === 'boolean', 'getState().hasAudioLoaded sigue siendo booleano');

// Identidad de la fuente musical del Rink (req. 30).
assert(
  state.sourceKind === 'file',
  "El origen por defecto de la pista del Rink es 'file'"
);

console.log(`\nTODAS LAS PRUEBAS DE DOMINIO DE AUDIO PASARON: ${total}/${total}`);
