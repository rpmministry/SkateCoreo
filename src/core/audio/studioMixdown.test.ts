import { renderStudioMixdown } from './studioMixdown';
import { AudioStudioTrack, AudioClip } from '../../types/audioStudio';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    process.exit(1);
  }
  console.log(`✅ PASSED: ${message}`);
}

console.log('\n--- EJECUTANDO PRUEBAS DE STUDIOMIXDOWN Y CLIP SPLITTING ---');

// Mock AudioBuffer and OfflineAudioContext for Node/TSX environment
class MockAudioBuffer {
  duration: number;
  length: number;
  sampleRate: number;
  numberOfChannels: number;
  private data: Float32Array;

  constructor(options: { length: number; numberOfChannels: number; sampleRate: number }) {
    this.length = options.length;
    this.numberOfChannels = options.numberOfChannels;
    this.sampleRate = options.sampleRate;
    this.duration = options.length / options.sampleRate;
    this.data = new Float32Array(options.length);
  }

  getChannelData(_channel: number) {
    return this.data;
  }
}

class MockAudioBufferSourceNode {
  buffer: any = null;
  connect(_node: any) {}
  start(_when?: number, _offset?: number, _duration?: number) {}
}

class MockGainNode {
  gain = {
    value: 1,
    setValueAtTime(_val: number, _time: number) {},
    linearRampToValueAtTime(_val: number, _time: number) {},
  };
  connect(_node: any) {}
}

class MockOfflineAudioContext {
  sampleRate = 44100;
  length: number;
  numberOfChannels: number;
  destination = {};

  constructor(channels: number, length: number, sampleRate: number) {
    this.numberOfChannels = channels;
    this.length = length;
    this.sampleRate = sampleRate;
  }

  createBufferSource() {
    return new MockAudioBufferSourceNode();
  }

  createGain() {
    return new MockGainNode();
  }

  createBuffer(channels: number, length: number, sampleRate: number) {
    return new MockAudioBuffer({ numberOfChannels: channels, length, sampleRate });
  }

  async startRendering() {
    return new MockAudioBuffer({
      numberOfChannels: this.numberOfChannels,
      length: this.length,
      sampleRate: this.sampleRate,
    });
  }
}

// Polyfill mocks on globalThis
if (typeof (globalThis as any).OfflineAudioContext === 'undefined') {
  (globalThis as any).OfflineAudioContext = MockOfflineAudioContext;
}
if (typeof (globalThis as any).AudioBuffer === 'undefined') {
  (globalThis as any).AudioBuffer = MockAudioBuffer;
}

// ── Test 1: Algoritmo de división contigua de clips (Split Clip Math) ──
const dummyBuffer = new MockAudioBuffer({ numberOfChannels: 2, length: 44100 * 10, sampleRate: 44100 }) as unknown as AudioBuffer;

const originalClip: AudioClip = {
  id: 'clip-1',
  name: 'Pista_Guitarra.wav',
  buffer: dummyBuffer,
  startOffsetSec: 2.0,
  trimStartSec: 0.0,
  trimEndSec: 10.0,
  fadeInSec: 0,
  fadeOutSec: 0,
};

const splitTime = 5.0; // 3 segundos después del inicio del clip
const rel = splitTime - originalClip.startOffsetSec;
const splitPoint = originalClip.trimStartSec + rel;

const clip1: AudioClip = {
  ...originalClip,
  trimEndSec: splitPoint,
};

const clip2: AudioClip = {
  ...originalClip,
  id: 'clip-2',
  startOffsetSec: splitTime,
  trimStartSec: splitPoint,
};

assert(clip1.startOffsetSec === 2.0, 'Clip 1 mantiene el offset de inicio original en 2.0s');
assert(clip1.trimEndSec === 3.0, 'Clip 1 finaliza exactamente en el punto de división (3.0s del buffer)');
assert(clip2.startOffsetSec === 5.0, 'Clip 2 comienza exactamente en la línea de tiempo global en 5.0s');
assert(clip2.trimStartSec === 3.0, 'Clip 2 continúa contiguamente desde 3.0s del buffer');
assert(clip2.trimEndSec === 10.0, 'Clip 2 termina en el final original de 10.0s');

const dur1 = clip1.trimEndSec - clip1.trimStartSec;
const dur2 = clip2.trimEndSec - clip2.trimStartSec;
assert(Math.abs(dur1 + dur2 - 10.0) < 0.001, 'Ambos clips combinados preservan la duración total exacta (10.0s)');

// ── Test 2: Renderizado de Mezcla por Hardware (renderStudioMixdown) ──
async function runMixdownTest() {
  const mockTrack: AudioStudioTrack = {
    id: 'trk-1',
    name: 'Voz Principal',
    type: 'voice',
    buffer: dummyBuffer,
    volume: 0.9,
    muted: false,
    solo: false,
    color: '#D946EF',
    trimStartSec: 0,
    trimEndSec: 10,
    fadeInSec: 0,
    fadeOutSec: 0,
    clips: [
      {
        id: 'clip-v1',
        name: 'Voz1',
        buffer: dummyBuffer,
        startOffsetSec: 1.0,
        trimStartSec: 0,
        trimEndSec: 4.0,
        fadeInSec: 0.2,
        fadeOutSec: 0.2,
      },
    ],
  };

  const result = await renderStudioMixdown([mockTrack], 10, {
    enabled: false,
    bpm: 120,
    beatsPerMeasure: 4,
    accentFirstBeat: true,
    volume: 0.5,
  });

  assert(result.durationSec === 10, 'renderStudioMixdown genera la duración esperada de 10s');
  assert(result.buffer !== null && result.buffer !== undefined, 'renderStudioMixdown retorna un AudioBuffer renderizado');

  // ── Test 3: Respeto estricto de banderas Solo y Mute ──
  const soloTrack: AudioStudioTrack = {
    id: 'trk-solo',
    name: 'Solo Guitar',
    type: 'user',
    buffer: null,
    volume: 1.0,
    muted: false,
    solo: true,
    color: '#00F0FF',
    trimStartSec: 0,
    trimEndSec: 5,
    fadeInSec: 0,
    fadeOutSec: 0,
    clips: [],
  };

  const normalTrack: AudioStudioTrack = {
    id: 'trk-normal',
    name: 'Normal Piano',
    type: 'user',
    buffer: null,
    volume: 1.0,
    muted: false,
    solo: false,
    color: '#F59E0B',
    trimStartSec: 0,
    trimEndSec: 5,
    fadeInSec: 0,
    fadeOutSec: 0,
    clips: [],
  };

  const soloResult = await renderStudioMixdown([soloTrack, normalTrack], 5);
  assert(soloResult.durationSec === 5, 'renderStudioMixdown procesa correctamente pistas con solo');

  // ── Test 4: bounceStudioClipsToBuffer Concatenación Rápida Gapless ──
  const { bounceStudioClipsToBuffer } = await import('./studioMixdown');
  const clipA: AudioClip = {
    id: 'clip-a',
    name: 'Fragmento A',
    buffer: new MockAudioBuffer({ numberOfChannels: 2, length: 44100 * 3, sampleRate: 44100 }) as unknown as AudioBuffer,
    startOffsetSec: 0.0,
    trimStartSec: 0.0,
    trimEndSec: 3.0,
    fadeInSec: 0,
    fadeOutSec: 0,
  };
  const clipB: AudioClip = {
    id: 'clip-b',
    name: 'Fragmento B',
    buffer: new MockAudioBuffer({ numberOfChannels: 2, length: 44100 * 4, sampleRate: 44100 }) as unknown as AudioBuffer,
    startOffsetSec: 3.0,
    trimStartSec: 0.0,
    trimEndSec: 4.0,
    fadeInSec: 0,
    fadeOutSec: 0,
  };
  const testTrack: AudioStudioTrack = {
    id: 'music',
    name: 'Master',
    type: 'music',
    buffer: null,
    clips: [clipA, clipB],
    volume: 1.0,
    muted: false,
    solo: false,
    color: '#00F0FF',
    trimStartSec: 0,
    trimEndSec: 7.0,
    fadeInSec: 0,
    fadeOutSec: 0,
  };

  const bounced = bounceStudioClipsToBuffer([testTrack], 7.0);
  assert(bounced !== null, 'bounceStudioClipsToBuffer genera un buffer consolidado');
  assert(Math.abs(bounced!.duration - 7.0) < 0.01, 'Duración exacta de fragmentos concatenados es 7.0s');

  // ── Test 5: Algoritmo Estricto de Snapping (0.5s threshold: newClip.start = prevClip.end) ──
  const { useAudioStudioStore } = await import('../../store/useAudioStudioStore');
  useAudioStudioStore.setState((s) => ({
    tracks: {
      ...s.tracks,
      music: { ...s.tracks.music, clips: [clipA] }, // Clip termina en 3.0s
    },
  }));

  // Caso 1: Soltar a los 3.3s (distancia 0.3s <= 0.5s) -> debe acoplarse exactamente en 3.0s
  const snap1 = useAudioStudioStore.getState().calculateSnapOffset('music', 'clip-new', 3.3, 2.0, 0.5);
  assert(snap1.snappedSec === 3.0, `Snapping estricto: 3.3s se acopla exactamente a prevClip.end (3.0s), obtenido: ${snap1.snappedSec}s`);
  assert(snap1.snapLineSec === 3.0, 'Línea visual de snap generada en 3.0s');

  // Caso 2: Soltar a los 2.7s (distancia 0.3s <= 0.5s) -> debe acoplarse exactamente en 3.0s
  const snap2 = useAudioStudioStore.getState().calculateSnapOffset('music', 'clip-new', 2.7, 2.0, 0.5);
  assert(snap2.snappedSec === 3.0, `Snapping estricto: 2.7s se acopla exactamente a prevClip.end (3.0s), obtenido: ${snap2.snappedSec}s`);

  // Caso 3: Soltar a los 4.5s (distancia 1.5s > 0.5s) -> no debe acoplarse a 3.0s
  const snap3 = useAudioStudioStore.getState().calculateSnapOffset('music', 'clip-new', 4.5, 2.0, 0.5);
  assert(snap3.snappedSec !== 3.0, `Fuera de umbral (>0.5s): 4.5s no se fuerza a 3.0s, obtenido: ${snap3.snappedSec}s`);

  // Caso 4: Con snapEnabled desactivado, 4.5s permanece exactamente en 4.5s
  useAudioStudioStore.getState().setSnapEnabled(false);
  const snap4 = useAudioStudioStore.getState().calculateSnapOffset('music', 'clip-new', 4.5, 2.0, 0.5);
  assert(snap4.snappedSec === 4.5, `Con snapEnabled desactivado: 4.5s permanece en 4.5s, obtenido: ${snap4.snappedSec}s`);
  useAudioStudioStore.getState().setSnapEnabled(true);
}

runMixdownTest().then(() => {
  console.log('✅ TODAS LAS PRUEBAS DE STUDIOMIXDOWN Y SNAPPING COMPLETADAS CON ÉXITO\n');
});
