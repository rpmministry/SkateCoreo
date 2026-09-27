/**
 * ttsNoSecondContext.test.ts — Regresión: el TTS JAMÁS abre un segundo
 * AudioContext "en vivo" ni reproduce por `destination`.
 *
 * Causa raíz de la "segunda fuente de audio" reportada en móvil/tablet:
 * `TTSService.ensureAudioContext()` creaba un `new AudioContext()` propio
 * conectado a `ctx.destination` cuando el motor aún no lo había entregado. Ese
 * contexto no pasaba por el bus del Coach ni por el mezclador, así que ningún
 * control (MUTE/volumen) podía silenciarlo.
 *
 * Este test verifica con dobles:
 *  1. Sin motor conectado, la decodificación usa un OfflineAudioContext (sin
 *     salida audible) y NO se construye ningún AudioContext en vivo.
 *  2. Sin bus del Coach, `playAudioBuffer` no reproduce por destination.
 *  3. Con motor conectado, la reproducción va EXCLUSIVAMENTE al bus del Coach.
 */

import { ttsService } from '../../services/ttsService';

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

console.log('\n--- REGRESIÓN TTS: SIN SEGUNDO AUDIOCONTEXT ---');

// ── Dobles de navegador: contabiliza CUALQUIER AudioContext en vivo ──
let liveContextsCreated = 0;
class CountingLiveAudioContext {
  public state = 'running';
  constructor() {
    liveContextsCreated++;
  }
}
class FakeOfflineAudioContext {
  public type = 'offline';
  constructor(
    public numberOfChannels: number,
    public length: number,
    public sampleRate: number
  ) {}
  public decodeAudioData(_bytes: ArrayBuffer) {
    return Promise.resolve({} as AudioBuffer);
  }
}

const fakeWindow: any = {
  AudioContext: CountingLiveAudioContext,
  webkitAudioContext: undefined,
  OfflineAudioContext: FakeOfflineAudioContext,
  webkitOfflineAudioContext: undefined,
  localStorage: {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
  },
  indexedDB: undefined,
};

(globalThis as any).window = fakeWindow;
(globalThis as any).localStorage = fakeWindow.localStorage;

// 1. Contexto de decodificación: offline, nunca en vivo.
const decodeCtx = (ttsService as any).ensureDecodeContext();
assert(decodeCtx !== null, 'ensureDecodeContext devuelve un contexto de decodificación');
assert(
  decodeCtx instanceof FakeOfflineAudioContext,
  'Sin motor conectado se usa OfflineAudioContext (sin salida audible)'
);
assert(
  liveContextsCreated === 0,
  `No se ha creado NINGÚN AudioContext en vivo (creados=${liveContextsCreated})`
);

// 2. Sin bus del Coach: silencio, jamás `destination`.
let destinationConnects = 0;
const destinationNode = { __isDestination: true };
const fakeLiveCtx = {
  state: 'running',
  destination: destinationNode,
  resume: () => Promise.resolve(),
  createBufferSource: () => ({
    buffer: null,
    connect: (target: any) => {
      if (target === destinationNode) destinationConnects++;
    },
    start: () => {},
    stop: () => {},
    disconnect: () => {},
    onended: null,
  }),
};

(ttsService as any).playAudioBuffer({ duration: 0.5 } as AudioBuffer);
assert(
  destinationConnects === 0 && liveContextsCreated === 0,
  'Sin motor: playAudioBuffer no crea contextos ni conecta a destination'
);

// 3. Con motor conectado: la salida va SOLO al bus del Coach.
const coachBus = { __isCoachBus: true };
let coachConnects = 0;
const sourceFactory = () => ({
  buffer: null,
  connect: (target: any) => {
    if (target === coachBus) coachConnects++;
    if (target === destinationNode) destinationConnects++;
  },
  start: () => {},
  stop: () => {},
  disconnect: () => {},
  onended: null,
});
(ttsService as any).audioContext = fakeLiveCtx;
(ttsService as any).coachOutputNode = coachBus;
fakeLiveCtx.createBufferSource = sourceFactory as any;

(ttsService as any).playAudioBuffer({ duration: 0.5 } as AudioBuffer);
assert(coachConnects === 1, 'La locución se conecta EXACTAMENTE al bus del Coach');
assert(destinationConnects === 0, 'La locución NUNCA se conecta a destination');
assert(ttsService.isAttachedToEngine() === true, 'isAttachedToEngine refleja el estado real');

// 4. `stop()` no deja la fuente activa (el bus sigue siendo la única salida).
ttsService.stop();
assert((ttsService as any).activeSourceNode === null, 'stop() libera la fuente activa');

if (failures > 0) {
  console.error(`\n[TTS] ${failures}/${total} aserciones fallidas.`);
  process.exit(1);
}
console.log(`\n[TTS] OK — ${total}/${total} aserciones correctas.`);
