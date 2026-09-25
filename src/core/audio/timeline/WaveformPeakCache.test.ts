/**
 * Unit Tests: WaveformPeakCache (Fase 3 — caché de picos)
 *
 * Verifica que los picos min/max se calculan una sola vez por buffer, que su
 * agregación reproduce el máximo absoluto real (sin volver a tocar el PCM) y que
 * la `WeakMap` mantiene los buffers independientes.
 */

import {
  getWaveformPeaks,
  readWaveformPeaks,
  clearWaveformPeakCache,
  DEFAULT_WAVE_PEAK_STEP,
} from './WaveformPeakCache';

let total = 0;
function assert(condition: boolean, msg: string) {
  total++;
  if (!condition) {
    console.error(`FAILED: ${msg}`);
    process.exit(1);
  }
  console.log(`PASSED: ${msg}`);
}

function makeFakeBuffer(samples: Float32Array, sampleRate = 100) {
  let reads = 0;
  const buffer = {
    sampleRate,
    duration: samples.length / sampleRate,
    length: samples.length,
    numberOfChannels: 1,
    getChannelData: (_channel: number) => {
      reads++;
      return samples;
    },
  };
  return { buffer: buffer as unknown as AudioBuffer, reads: () => reads };
}

console.log('\n--- PRUEBAS DE CACHÉ DE PICOS DE WAVEFORM (FASE 3) ---');

// ── 1. Picos min/max correctos y cacheados ──
{
  const samples = new Float32Array(DEFAULT_WAVE_PEAK_STEP * 4);
  // Bloque 0: valores conocidos.
  samples[0] = 0.5;
  samples[10] = -0.8;
  // Bloque 1: pico máximo global.
  samples[DEFAULT_WAVE_PEAK_STEP + 3] = 1.0;
  samples[DEFAULT_WAVE_PEAK_STEP + 4] = -0.6;

  const { buffer, reads } = makeFakeBuffer(samples);

  const first = getWaveformPeaks(buffer);
  assert(first.step === DEFAULT_WAVE_PEAK_STEP, 'El paso por defecto es 128');
  assert(first.min.length === 4, 'Hay un pico por bloque (4 bloques)');
  assert(Math.abs(first.max[0] - 0.5) < 1e-6, 'max del bloque 0 = 0.5');
  assert(Math.abs(first.min[0] + 0.8) < 1e-6, 'min del bloque 0 = -0.8');
  assert(Math.abs(first.max[1] - 1.0) < 1e-6, 'max del bloque 1 = 1.0');
  assert(reads() === 1, 'El PCM se lee una sola vez al construir la caché');

  const second = getWaveformPeaks(buffer);
  assert(second === first, 'La segunda llamada devuelve la MISMA instancia cacheada');
  assert(reads() === 1, 'La segunda llamada NO vuelve a leer el PCM (caché)');
}

// ── 2. Agregación LOD idéntica al máximo absoluto real ──
{
  const n = 1024;
  const samples = new Float32Array(n);
  // Patrón determinista con picos positivos y negativos.
  for (let i = 0; i < n; i++) {
    samples[i] = Math.sin(i * 0.37) * Math.cos(i * 0.11);
  }
  samples[512] = 0.95;
  samples[777] = -0.9;

  const { buffer } = makeFakeBuffer(samples);
  const buckets = 8; // 1024/8 = 128 = paso → bordes alineados, comparación exacta
  const aggregated = readWaveformPeaks(buffer, buckets);

  assert(aggregated.length === buckets, 'La salida tiene exactamente numBuckets valores');

  let mismatches = 0;
  for (let b = 0; b < buckets; b++) {
    let brute = 0;
    for (let s = b * 128; s < (b + 1) * 128; s++) {
      const a = Math.abs(samples[s]);
      if (a > brute) brute = a;
    }
    if (Math.abs(aggregated[b] - brute) > 1e-6) mismatches++;
  }
  assert(mismatches === 0, 'La agregación cacheada reproduce el máximo absoluto real por bucket');
}

// ── 3. Más buckets que muestras no produce ceros ni NaN ──
{
  const samples = new Float32Array([0.1, -0.2, 0.3, -0.4, 0.5]);
  const { buffer } = makeFakeBuffer(samples);
  const dense = readWaveformPeaks(buffer, 32);
  assert(dense.length === 32, 'Se devuelven los 32 buckets pedidos');
  assert(Array.from(dense).every((v) => Number.isFinite(v)), 'Ningún bucket es NaN/Infinity');
  let max = 0;
  for (const v of dense) if (v > max) max = v;
  assert(Math.abs(max - 0.5) < 1e-6, 'El pico global (0.5) sobrevive al sobremuestreo');
}

// ── 4. Buffers independientes y buffer vacío ──
{
  const a = makeFakeBuffer(new Float32Array([1, -1, 1, -1]));
  const b = makeFakeBuffer(new Float32Array([0.25, 0.25, 0.25, 0.25]));

  const pa = getWaveformPeaks(a.buffer, 2);
  const pb = getWaveformPeaks(b.buffer, 2);
  assert(pa !== pb, 'Dos buffers distintos tienen cachés distintas');
  assert(Math.abs(pa.max[0] - 1) < 1e-6, 'Buffer A conserva su pico (1.0)');
  assert(Math.abs(pb.max[0] - 0.25) < 1e-6, 'Buffer B conserva su pico (0.25)');

  const empty = makeFakeBuffer(new Float32Array(0));
  const emptyPeaks = readWaveformPeaks(empty.buffer, 4);
  assert(
    Array.from(emptyPeaks).every((v) => v === 0),
    'Un buffer vacío devuelve ceros (sin errores)'
  );
}

// ── 5. La invalidación fuerza recálculo ──
{
  const { buffer, reads } = makeFakeBuffer(new Float32Array([0.5, -0.5, 0.5, -0.5]));
  getWaveformPeaks(buffer, 2);
  assert(reads() === 1, 'Primera lectura del PCM');
  clearWaveformPeakCache(buffer);
  getWaveformPeaks(buffer, 2);
  assert(reads() === 2, 'Tras invalidar, se vuelve a leer el PCM');
}

console.log(`\nTODAS LAS PRUEBAS DE CACHÉ DE PICOS PASARON: ${total}/${total}`);
