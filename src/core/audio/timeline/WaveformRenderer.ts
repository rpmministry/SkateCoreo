/**
 * WaveformRenderer — Dibujo *pixels-first* de formas de onda sobre canvas.
 *
 * PROBLEMA QUE RESUELVE
 * --------------------
 * El canvas del clip recorría TODAS las muestras del fragmento por cada barra y
 * en cada zoom/render. Con clips largos eso es un barrido completo de PCM repetido
 * continuamente. Y el `devicePixelRatio` se aplicaba sin tope: en móviles Retina
 * (dpr 3) se creaban canvas 3× más grandes de lo necesario (memoria y CPU).
 *
 * SOLUCIÓN (inspirada en AudioMass `drawWave`, MIT)
 * -------------------------------------------------
 *  1. El número de barras se deriva del ancho en PÍXELES (una barra por columna),
 *     no de la cantidad de muestras.
 *  2. Cuando a cada barra le corresponden más muestras que el paso de la caché de
 *     picos, se agregan los picos YA cacheados en vez de escanear el PCM.
 *  3. El DPR se limita a 2, equilibrio entre nitidez y memoria.
 *
 * Los picos min/max de la caché son exactos, así que agregarlos produce la misma
 * onda que el barrido directo (solo cambia el coste, no el resultado).
 */

import { DEFAULT_WAVE_PEAK_STEP, getWaveformPeaks } from './WaveformPeakCache';

/** Tope de densidad. En dpr ≥ 3 el ojo no distingue y el canvas se dispara. */
export const MAX_RENDER_DPR = 2;

export function resolveRenderDpr(raw?: number): number {
  const value = Number.isFinite(raw) && (raw as number) > 1 ? (raw as number) : 1;
  return Math.min(MAX_RENDER_DPR, value);
}

export interface DrawWaveformColumnsOptions {
  ctx: CanvasRenderingContext2D;
  buffer: AudioBuffer;
  /** Ancho en px CSS del área de dibujo. */
  width: number;
  /** Alto en px CSS del área de dibujo. */
  height: number;
  /** Inicio del fragmento a dibujar, en segundos. */
  startSec: number;
  /** Fin del fragmento a dibujar, en segundos. */
  endSec: number;
  /** Color de las barras. */
  fillStyle: string;
  /** Color de la línea base central. Si se omite, no se dibuja. */
  baselineStyle?: string;
  channel?: number;
  /** Fracción del alto total que alcanza el pico (0.38 = ±38% como el clip). */
  amplitudeFraction?: number;
  /** Media altura mínima en px, para que la onda nunca desaparezca. */
  minHalfHeightPx?: number;
  /** DPR con el que se alinean las barras al grid físico. */
  devicePixelRatio?: number;
}

/**
 * Dibuja la onda dentro de un contexto YA escalado a píxeles CSS (es decir, el
 * llamador hizo `ctx.scale(dpr, dpr)`). No guarda/restaura ni limpia: el llamador
 * controla el fondo y las capas superiores (fades, cabeceras).
 */
export function drawWaveformColumns(options: DrawWaveformColumnsOptions): void {
  const {
    ctx,
    buffer,
    width,
    height,
    startSec,
    endSec,
    fillStyle,
    baselineStyle,
    channel = 0,
    amplitudeFraction = 0.38,
    minHalfHeightPx = 1.2,
    devicePixelRatio,
  } = options;

  const dpr = resolveRenderDpr(devicePixelRatio);
  const renderWidth = Math.max(1, Math.floor(width));
  const renderHeight = Math.max(1, Math.floor(height));
  const midY = renderHeight / 2;

  const sampleRate = buffer.sampleRate;
  const channelData = buffer.getChannelData(channel);
  const totalSamples = channelData.length;

  const startSample = Math.max(0, Math.min(totalSamples, Math.floor(startSec * sampleRate)));
  const endSample = Math.max(0, Math.min(totalSamples, Math.floor(endSec * sampleRate)));
  const samplesInClip = Math.max(1, endSample - startSample);

  if (baselineStyle) {
    ctx.fillStyle = baselineStyle;
    ctx.fillRect(0, midY - 0.5, renderWidth, 1);
  }

  const stepCss = Math.max(1 / dpr, Math.min(3, renderWidth / 2600));
  const barCss = Math.max(1 / dpr, stepCss - 1 / dpr);
  const numBars = Math.max(1, Math.floor(renderWidth / stepCss));
  const samplesPerBar = Math.max(1, samplesInClip / numBars);

  // A partir del paso de la caché, agregar picos es mucho más barato que escanear.
  const usePeakCache = samplesPerBar >= DEFAULT_WAVE_PEAK_STEP;
  const peaks = usePeakCache ? getWaveformPeaks(buffer, DEFAULT_WAVE_PEAK_STEP, channel) : null;
  const peakStep = peaks ? peaks.step : 0;
  const peakLast = peaks ? peaks.max.length - 1 : 0;

  ctx.fillStyle = fillStyle;

  for (let i = 0; i < numBars; i++) {
    // Alinear al grid de píxeles físicos para evitar antialiasing difuso.
    const xDev = Math.round(i * stepCss * dpr) / dpr;
    if (xDev > renderWidth) break;

    const sampleStart = startSample + Math.floor(i * samplesPerBar);
    const sampleEnd = Math.min(endSample, startSample + Math.floor((i + 1) * samplesPerBar) + 1);

    let maxPeak = 0;

    if (peaks && peakStep > 0 && sampleEnd > sampleStart) {
      const p0 = Math.min(peakLast, Math.floor(sampleStart / peakStep));
      const p1 = Math.min(peakLast, Math.floor((sampleEnd - 1) / peakStep));
      for (let p = p0; p <= p1; p++) {
        const a = Math.abs(peaks.min[p]);
        if (a > maxPeak) maxPeak = a;
        const b = peaks.max[p];
        if (b > maxPeak) maxPeak = b;
      }
    } else {
      for (let s = sampleStart; s < sampleEnd; s++) {
        const value = Math.abs(channelData[s] || 0);
        if (value > maxPeak) maxPeak = value;
      }
    }

    const halfH = Math.max(minHalfHeightPx, maxPeak * (renderHeight * amplitudeFraction));
    ctx.fillRect(xDev, midY - halfH, barCss, halfH * 2);
  }
}
