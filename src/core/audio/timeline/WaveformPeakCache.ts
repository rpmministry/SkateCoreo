/**
 * WaveformPeakCache — Caché de picos (min/max) por `AudioBuffer`.
 *
 * PROBLEMA QUE RESUELVE
 * --------------------
 * Antes, cada vez que cambiaba el zoom se recalculaba la forma de onda recorriendo
 * TODO el PCM del buffer (`AudioEngine.getWaveformData` y el canvas de cada clip).
 * En archivos largos (5/10/30 min) eso es un barrido de millones de muestras por
 * cada paso de zoom o de scroll, con su coste de CPU y de recolector de basura.
 *
 * SOLUCIÓN (inspirada en AudioMass, `wave_peak_step` + `WeakMap`, MIT)
 * -------------------------------------------------------------------
 * Los picos min/max se calculan UNA vez por buffer con un paso fijo de 128
 * muestras y se guardan en una `WeakMap` con clave el propio `AudioBuffer`. Así:
 *  - el buffer es la clave: cuando se libera, su caché se libera con él (sin fugas);
 *  - cualquier número de "buckets" se deriva luego agregando los picos cacheados,
 *    en O(buckets + picos) en lugar de O(muestras).
 *
 * Los picos min/max por bloque son exactamente los máximos/mínimos reales, de modo
 * que agregarlos reproduce la onda real (a diferencia del muestreo con salto que
 * se usaba antes). No cambia el modelo de datos ni el motor de audio: es una capa
 * pura de lectura sobre el `AudioBuffer`.
 */

/** Muestras por pico. Paso fijo: una sola malla de picos sirve para todos los zoom. */
export const DEFAULT_WAVE_PEAK_STEP = 128;

export interface WaveformPeakData {
  /** Número de muestras del canal analizado. */
  sampleCount: number;
  /** Muestras por pico. */
  step: number;
  /** Mínimo real por bloque (≤ 0 normalmente). */
  min: Float32Array;
  /** Máximo real por bloque (≥ 0 normalmente). */
  max: Float32Array;
}

const CACHE = new WeakMap<AudioBuffer, Map<number, WaveformPeakData>>();

/**
 * Devuelve los picos de un `AudioBuffer`, calculándolos una sola vez y
 * memorizándolos por (buffer, paso, canal). Llamadas repetidas son O(1).
 * Si `channel === -1` (por defecto), analiza la envolvente compuesta de TODOS
 * los canales disponibles del buffer (L+R), evitando que canales silenciosos o
 * pistas divididas (split-coach) oculten la forma de onda real.
 */
export function getWaveformPeaks(
  buffer: AudioBuffer,
  step: number = DEFAULT_WAVE_PEAK_STEP,
  channel: number = -1
): WaveformPeakData {
  const safeStep = Math.max(1, Math.floor(step));
  const numChannels = buffer.numberOfChannels || 1;

  // Determinar qué canales se analizan (canal único o compuesto de todos)
  const targetChannels: number[] = [];
  if (channel >= 0 && channel < numChannels) {
    targetChannels.push(channel);
  } else {
    for (let c = 0; c < numChannels; c++) {
      targetChannels.push(c);
    }
  }

  let byKey = CACHE.get(buffer);
  if (!byKey) {
    byKey = new Map<number, WaveformPeakData>();
    CACHE.set(buffer, byKey);
  }

  // Clave de caché única por (canal, paso)
  const cacheKey = (channel << 16) ^ safeStep;
  const cached = byKey.get(cacheKey);
  if (cached) return cached;

  const channelArrays: Float32Array[] = [];
  for (const c of targetChannels) {
    try {
      channelArrays.push(buffer.getChannelData(c));
    } catch {
      /* Canal fuera de rango en mock */
    }
  }

  const sampleCount = channelArrays[0]?.length || 0;
  const peakCount = Math.max(1, Math.ceil(sampleCount / safeStep));
  const min = new Float32Array(peakCount);
  const max = new Float32Array(peakCount);

  for (let i = 0; i < peakCount; i++) {
    const from = i * safeStep;
    const to = Math.min(sampleCount, from + safeStep);
    let mn = 0;
    let mx = 0;
    for (let j = from; j < to; j++) {
      for (let c = 0; c < channelArrays.length; c++) {
        const value = channelArrays[c][j];
        if (value > mx) mx = value;
        else if (value < mn) mn = value;
      }
    }
    min[i] = mn;
    max[i] = mx;
  }

  const result: WaveformPeakData = { sampleCount, step: safeStep, min, max };
  byKey.set(cacheKey, result);
  return result;
}

/**
 * Reduce los picos cacheados a `numBuckets` valores de máximo ABSOLUTO, sin
 * volver a tocar el PCM. Es lo que necesita el visor de la Pista 2D.
 * Por defecto (`channel = -1`) analiza todos los canales combinados.
 */
export function readWaveformPeaks(
  buffer: AudioBuffer,
  numBuckets: number,
  step: number = DEFAULT_WAVE_PEAK_STEP,
  channel: number = -1
): Float32Array {
  const buckets = Math.max(1, Math.floor(numBuckets));
  const out = new Float32Array(buckets);

  const { sampleCount, step: peakStep, min, max } = getWaveformPeaks(buffer, step, channel);
  if (sampleCount <= 0) return out;

  const blockSize = sampleCount / buckets;
  const peakLast = max.length - 1;

  for (let i = 0; i < buckets; i++) {
    const start = i * blockSize;
    const end = Math.min(sampleCount, (i + 1) * blockSize);
    const p0 = Math.min(peakLast, Math.floor(start / peakStep));
    const p1 = Math.min(peakLast, Math.floor(Math.max(start, end - 1) / peakStep));

    let peak = 0;
    for (let p = p0; p <= p1; p++) {
      const a = Math.abs(min[p]);
      if (a > peak) peak = a;
      const b = Math.abs(max[p]);
      if (b > peak) peak = b;
    }
    out[i] = peak;
  }

  return out;
}

/**
 * Invalida la caché de un buffer concreto. Normalmente NO hace falta: los edits
 * de SkateCoreo (`trimAudio`, `applyFades`, `studioMixdown`) siempre crean un
 * `AudioBuffer` nuevo, que es una clave nueva. Se expone por robustez y tests.
 */
export function clearWaveformPeakCache(buffer: AudioBuffer): void {
  CACHE.delete(buffer);
}
