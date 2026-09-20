/**
 * BpmDetector.ts — DSP-based Tempo & Transient Detection Engine.
 * Uses Low-Pass Filtering, Half-Wave Rectified Energy Flux (ODF),
 * and Autocorrelation to estimate music BPM and first-beat phase offset.
 */

export interface BpmDetectionResult {
  bpm: number;
  confidence: number;       // 0.0 to 1.0
  phaseOffsetSec: number;   // Timestamp in seconds of the first rhythmic downbeat
}

export class BpmDetector {
  /**
   * Analiza un AudioBuffer y detecta automáticamente el tempo (BPM)
   * y el desfase del primer compás con precisión milimétrica.
   */
  public static detect(
    buffer: AudioBuffer,
    minBpm: number = 70,
    maxBpm: number = 190,
    maxAnalysisSec: number = 40
  ): BpmDetectionResult {
    const sampleRate = buffer.sampleRate;
    const durationSec = Math.min(buffer.duration, maxAnalysisSec);
    const numSamples = Math.floor(durationSec * sampleRate);

    if (numSamples < sampleRate * 3) {
      // Audio demasiado corto para análisis fiable
      return { bpm: 120, confidence: 0.0, phaseOffsetSec: 0 };
    }

    // 1. Downmix a mono
    const mono = new Float32Array(numSamples);
    const numChannels = buffer.numberOfChannels;
    const ch0 = buffer.getChannelData(0);
    const ch1 = numChannels > 1 ? buffer.getChannelData(1) : ch0;

    for (let i = 0; i < numSamples; i++) {
      mono[i] = (ch0[i] + ch1[i]) * 0.5;
    }

    // 2. Filtro Pasa-Bajos Digital (Biquad IIR a 160Hz) para aislar transitorios del bombo y bajo
    const filtered = this.applyLowPassFilter(mono, sampleRate, 160.0);

    // 3. Ventaneo y Cálculo de la Función de Detección de Onsets (ODF - Energy Flux)
    const hopSize = 256;
    const numHops = Math.floor(numSamples / hopSize);
    const fps = sampleRate / hopSize;

    const env = new Float32Array(numHops);
    for (let h = 0; h < numHops; h++) {
      let sumSq = 0;
      const base = h * hopSize;
      for (let i = 0; i < hopSize; i++) {
        const val = filtered[base + i];
        sumSq += val * val;
      }
      env[h] = Math.sqrt(sumSq / hopSize);
    }

    // Flujo rectificado de media onda (Half-wave rectification)
    const odf = new Float32Array(numHops);
    for (let h = 1; h < numHops; h++) {
      const diff = env[h] - env[h - 1];
      odf[h] = diff > 0 ? diff : 0;
    }

    // 4. Autocorrelación sobre el rango de tempos candidatos
    let bestBpm = 120;
    let maxScore = -1;
    let totalScoreSum = 0;
    let validTests = 0;

    const scores: { bpm: number; score: number }[] = [];

    for (let b = minBpm; b <= maxBpm; b += 1) {
      const beatHops = (60.0 / b) * fps;
      let score = 0;
      let count = 0;

      for (let h = 0; h < numHops - beatHops * 3; h += 2) {
        if (odf[h] > 0.01) {
          const lag1 = Math.round(h + beatHops);
          const lag2 = Math.round(h + 2 * beatHops);
          const lag3 = Math.round(h + 3 * beatHops);

          score += odf[h] * odf[lag1];
          if (lag2 < numHops) score += 0.5 * odf[h] * odf[lag2];
          if (lag3 < numHops) score += 0.25 * odf[h] * odf[lag3];
          count++;
        }
      }

      if (count > 0) {
        score = score / count;
      }

      scores.push({ bpm: b, score });
      totalScoreSum += score;
      validTests++;

      if (score > maxScore) {
        maxScore = score;
        bestBpm = b;
      }
    }

    // 5. Verificación de Octavas de Tempo (Armónicos 0.5x y 2x)
    // En patinaje artístico sobre ruedas (RollArt), el rango estándar más común es 115 - 150 BPM
    const halfBpm = Math.round(bestBpm / 2);
    const doubleBpm = Math.round(bestBpm * 2);

    if (bestBpm < 90 && doubleBpm <= maxBpm) {
      const doubleScore = scores.find((s) => s.bpm === doubleBpm)?.score || 0;
      if (doubleScore >= maxScore * 0.75) {
        bestBpm = doubleBpm;
      }
    } else if (bestBpm > 170 && halfBpm >= minBpm) {
      const halfScore = scores.find((s) => s.bpm === halfBpm)?.score || 0;
      if (halfScore >= maxScore * 0.75) {
        bestBpm = halfBpm;
      }
    }

    // Cálculo de confianza normalizada (SNR del pico frente al promedio)
    const avgScore = validTests > 0 ? totalScoreSum / validTests : 1;
    const confidence = maxScore > 0 ? Math.min(1.0, Math.max(0.1, (maxScore - avgScore) / (maxScore + 0.0001))) : 0.0;

    // 6. Detección de la fase del primer golpe (Downbeat Phase Offset)
    const beatIntervalHops = Math.round((60.0 / bestBpm) * fps);
    let bestPhaseHop = 0;
    let maxPhaseEnergy = -1;

    for (let phase = 0; phase < beatIntervalHops; phase++) {
      let energy = 0;
      for (let h = phase; h < numHops; h += beatIntervalHops) {
        energy += odf[h];
      }
      if (energy > maxPhaseEnergy) {
        maxPhaseEnergy = energy;
        bestPhaseHop = phase;
      }
    }

    const phaseOffsetSec = (bestPhaseHop * hopSize) / sampleRate;

    return {
      bpm: bestBpm,
      confidence: Math.round(confidence * 100) / 100,
      phaseOffsetSec: Math.round(phaseOffsetSec * 1000) / 1000
    };
  }

  /**
   * Filtro Biquad Pasa-Bajos IIR simple de 2do orden
   */
  private static applyLowPassFilter(
    input: Float32Array,
    sampleRate: number,
    cutoffFreq: number
  ): Float32Array {
    const output = new Float32Array(input.length);
    const w0 = (2 * Math.PI * cutoffFreq) / sampleRate;
    const cosw0 = Math.cos(w0);
    const sinw0 = Math.sin(w0);
    const alpha = sinw0 / (2 * 0.7071); // Q = 0.7071 (Butterworth)

    const b0 = (1 - cosw0) / 2;
    const b1 = 1 - cosw0;
    const b2 = (1 - cosw0) / 2;
    const a0 = 1 + alpha;
    const a1 = -2 * cosw0;
    const a2 = 1 - alpha;

    const nb0 = b0 / a0;
    const nb1 = b1 / a0;
    const nb2 = b2 / a0;
    const na1 = a1 / a0;
    const na2 = a2 / a0;

    let x1 = 0;
    let x2 = 0;
    let y1 = 0;
    let y2 = 0;

    for (let i = 0; i < input.length; i++) {
      const x0 = input[i];
      const y0 = nb0 * x0 + nb1 * x1 + nb2 * x2 - na1 * y1 - na2 * y2;
      output[i] = y0;

      x2 = x1;
      x1 = x0;
      y2 = y1;
      y1 = y0;
    }

    return output;
  }
}

