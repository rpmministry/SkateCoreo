/**
 * Pruebas de los arreglos de las incidencias de prueba móvil.
 *  - Normalización de nivel de la voz grabada.
 *  - Pista de VOZ exclusiva: rechaza clips de otras pistas.
 *  - Split/move funcionan en la pista de grabación (resolución id↔clave).
 *  - Handoff al Estudio deja el dominio en 'studio'.
 */

import { useAudioStudioStore } from '../../store/useAudioStudioStore';
import { audioEngine } from '../../services/audioEngine';
import { normalizeAudioBufferPeak } from './VoiceRecorder';
import type { AudioClip } from '../../types/audioStudio';

let total = 0;
function assert(condition: boolean, msg: string) {
  total++;
  if (!condition) {
    console.error(`FAILED: ${msg}`);
    process.exit(1);
  }
  console.log(`PASSED: ${msg}`);
}

function fakeBuffer(peak: number): AudioBuffer {
  const data = new Float32Array([peak, -peak, peak / 2]);
  return {
    numberOfChannels: 1,
    length: data.length,
    sampleRate: 48000,
    duration: data.length / 48000,
    getChannelData: () => data,
    copyFromChannel: () => undefined,
    copyToChannel: () => undefined,
  } as unknown as AudioBuffer;
}

function makeClip(id: string, start = 0, duration = 4): AudioClip {
  return {
    id,
    name: id,
    // Sin buffer: `splitClip` omite el ajuste a cruce por cero (irrelevante aquí).
    buffer: null as unknown as AudioBuffer,
    startOffsetSec: start,
    trimStartSec: 0,
    trimEndSec: duration,
    fadeInSec: 0,
    fadeOutSec: 0,
  };
}

console.log('--- PRUEBAS DE ARREGLOS DE PRUEBAS MÓVIL ---');

// 1. Normalización de nivel
{
  const buffer = fakeBuffer(0.1);
  normalizeAudioBufferPeak(buffer, 0.97);
  const data = buffer.getChannelData(0);
  let peak = 0;
  for (const v of data) peak = Math.max(peak, Math.abs(v));
  assert(peak > 0.9 && peak <= 0.98, `Normalización sube el pico a ~0.97 (${peak.toFixed(3)})`);

  const loud = fakeBuffer(0.99);
  const before = loud.getChannelData(0)[0];
  normalizeAudioBufferPeak(loud, 0.97);
  assert(
    Math.abs(loud.getChannelData(0)[0] - before) < 1e-6,
    'La normalización no toca una toma ya con nivel suficiente'
  );
}

// 2. Pista de VOZ exclusiva: mover un clip de música a 'track-recording' se rechaza.
{
  const store = useAudioStudioStore;
  const musicClip = makeClip('music-clip-1');
  store.setState((s) => ({
    tracks: { ...s.tracks, music: { ...s.tracks.music, clips: [musicClip] } },
    additionalTracks: [],
  }));

  store.getState().moveClipToTrack('music', 'track-recording', 'music-clip-1', 3);
  const after = store.getState();
  assert(
    after.tracks.music.clips.some((c) => c.id === 'music-clip-1'),
    'La pista de VOZ RECHAZA un clip de música (permanece en Master)'
  );
  assert(
    after.tracks.recording.clips.every((c) => c.id !== 'music-clip-1'),
    'El clip rechazado no aparece en la pista de grabación'
  );
}

// 3. Split real en la pista de grabación (resolución id↔clave).
{
  const store = useAudioStudioStore;
  const take = makeClip('voice-take-1', 2, 4);
  store.setState((s) => ({
    tracks: { ...s.tracks, recording: { ...s.tracks.recording, clips: [take] } },
  }));

  const didSplit = store.getState().splitClip('track-recording', 'voice-take-1', 4);
  assert(didSplit === true, 'El split funciona en la pista de grabación (id de UI)');
  assert(
    store.getState().tracks.recording.clips.length === 2,
    'La toma queda dividida en dos fragmentos'
  );
}

// 4. Handoff al Estudio: dominio 'studio'.
{
  audioEngine.handoffToStudio();
  assert(
    audioEngine.getPlaybackDomain() === 'studio',
    "handoffToStudio deja el dominio en 'studio'"
  );
  audioEngine.setPlaybackDomain('rink');
}

console.log(`\nTODAS LAS PRUEBAS DE ARREGLOS MÓVILES PASARON: ${total}/${total}`);
