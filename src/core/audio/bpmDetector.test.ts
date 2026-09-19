import { BpmDetector } from './BpmDetector';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${msg}`);
    process.exit(1);
  }
  console.log(`✅ PASSED: ${msg}`);
}

console.log('\n--- EJECUTANDO PRUEBAS DEL DETECTOR DSP DE BPM ---');

// Mock de AudioBuffer para pruebas en Node
function createSyntheticRhythmBuffer(sampleRate: number, durationSec: number, targetBpm: number): any {
  const numSamples = sampleRate * durationSec;
  const channelData = new Float32Array(numSamples);
  const beatIntervalSec = 60.0 / targetBpm;
  const beatIntervalSamples = Math.round(beatIntervalSec * sampleRate);

  // Sintetizar pulsos de bombo rítmicos cada `beatIntervalSamples`
  for (let b = 0; b < numSamples; b += beatIntervalSamples) {
    // Generar un golpe percusivo de 50ms con decaimiento exponencial
    const hitSamples = Math.min(Math.round(sampleRate * 0.05), numSamples - b);
    for (let i = 0; i < hitSamples; i++) {
      const t = i / sampleRate;
      const decay = Math.exp(-t * 40);
      const freq = 60 + (1 - t / 0.05) * 80; // Pitch bend hacia abajo de 140Hz a 60Hz (kick drum)
      channelData[b + i] = Math.sin(2 * Math.PI * freq * t) * decay;
    }
  }

  return {
    sampleRate,
    duration: durationSec,
    length: numSamples,
    numberOfChannels: 1,
    getChannelData: () => channelData
  };
}

// 1. Probar tempo estándar de 140 BPM (tempo de prueba RollArt)
const buf140 = createSyntheticRhythmBuffer(44100, 10, 140);
const res140 = BpmDetector.detect(buf140, 70, 180, 10);
console.log(`140 BPM detectado: ${res140.bpm} BPM (confianza: ${res140.confidence})`);
assert(Math.abs(res140.bpm - 140) <= 1, `Detecta 140 BPM dentro de ±1 BPM (obtenido: ${res140.bpm})`);
assert(res140.confidence > 0.4, 'Confianza de detección es alta');

// 2. Probar tempo de 120 BPM
const buf120 = createSyntheticRhythmBuffer(44100, 10, 120);
const res120 = BpmDetector.detect(buf120, 70, 180, 10);
console.log(`120 BPM detectado: ${res120.bpm} BPM (confianza: ${res120.confidence})`);
assert(Math.abs(res120.bpm - 120) <= 1, `Detecta 120 BPM dentro de ±1 BPM (obtenido: ${res120.bpm})`);

// 3. Probar audio muy corto (<3s)
const bufShort = createSyntheticRhythmBuffer(44100, 1, 140);
const resShort = BpmDetector.detect(bufShort);
assert(resShort.bpm === 120 && resShort.confidence === 0.0, 'Fallback seguro en audios demasiado cortos');

console.log('Resultado BpmDetector: 4/4 pruebas pasadas con éxito.\n');
