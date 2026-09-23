/**
 * InkSegmentation — Aislamiento ROBUSTO de la tinta manuscrita ROJA/AZUL.
 *
 * Fundamento: la plantilla impresa es acromática (negro/gris). En el espacio CIELab
 * cualquier tinta de color tiene CROMA alta (sqrt(a*²+b*²)), mientras que el blanco,
 * el negro y todos los grises tienen croma ≈ 0. Además, el SIGNO de b* separa de
 * forma natural el rojo (b* > 0) del azul (b* < 0). Esto es mucho más estable que
 * umbrales RGB fijos frente a cambios de iluminación, sombras, balance de blancos y
 * distintas tonalidades de bolígrafo.
 *
 * Antes de convertir a Lab se aplica una NORMALIZACIÓN DE ILUMINACIÓN por percentil
 * (white-patch por canal), que corrige sub/sobreexposición y dominantes de color.
 *
 * El umbral de croma se calcula de forma ADAPTATIVA con Otsu sobre el histograma de
 * croma de la propia imagen, no con una constante mágica.
 */

import { ColorMasks, RgbaImage } from './types';
import { luma } from './ImageOps';

export interface SegmentOptions {
  /** Croma mínimo (Lab) para considerar "color". Suelo de seguridad. */
  minChroma?: number;
  /** Luminancia mínima (0-255) para descartar sombras/negro. */
  minLuma?: number;
  /** Percentil de papel blanco por canal (0-1). */
  whitePercentile?: number;
  /** Separación mínima |b*| para decidir rojo vs azul. */
  bGate?: number;
}

export interface SegmentResult extends ColorMasks {
  /** Tinta de croma ALTO (trazo real de marcador), no fringe de compresión. */
  strong: Uint8Array;
  chromaThreshold: number;
  strongThreshold: number;
  bGate: number;
  white: [number, number, number];
}

const D65_X = 0.95047;
const D65_Y = 1.0;
const D65_Z = 1.08883;

function srgbChannelToLinear(c: number): number {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

/** LUT sRGB(0-255) → lineal: evita Math.pow por píxel. */
const LINEAR_LUT = (() => {
  const lut = new Float32Array(256);
  for (let i = 0; i < 256; i++) lut[i] = srgbChannelToLinear(i);
  return lut;
})();

/** sRGB (0-255) → CIELab (D65). */
export function rgbToLab(r: number, g: number, b: number): [number, number, number] {
  const rl = LINEAR_LUT[clampByte(r)];
  const gl = LINEAR_LUT[clampByte(g)];
  const bl = LINEAR_LUT[clampByte(b)];

  const x = (0.4124564 * rl + 0.3575761 * gl + 0.1804375 * bl) / D65_X;
  const y = (0.2126729 * rl + 0.7151522 * gl + 0.072175 * bl) / D65_Y;
  const z = (0.0193339 * rl + 0.119192 * gl + 0.9503041 * bl) / D65_Z;

  const fx = labF(x);
  const fy = labF(y);
  const fz = labF(z);

  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

function clampByte(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v | 0;
}

function labF(t: number): number {
  return t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
}

function computeOtsu(histogram: number[], total: number): number {
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * histogram[i];
  let sumB = 0;
  let wB = 0;
  let maxVar = -1;
  let threshold = 127;
  for (let t = 0; t < 256; t++) {
    wB += histogram[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * histogram[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > maxVar) {
      maxVar = between;
      threshold = t;
    }
  }
  return threshold;
}

/** Percentil de un canal a partir de su histograma de 256 bins. */
function percentileFromHistogram(hist: Uint32Array, total: number, p: number): number {
  const target = total * p;
  let acc = 0;
  for (let v = 0; v < 256; v++) {
    acc += hist[v];
    if (acc >= target) return v;
  }
  return 255;
}

/**
 * Segmenta la tinta de color. Devuelve máscaras binarias roja/azul y su unión.
 */
export function segmentInk(img: RgbaImage, options: SegmentOptions = {}): SegmentResult {
  const w = img.width;
  const h = img.height;
  const total = w * h;
  const minChroma = options.minChroma ?? 18;
  const minLuma = options.minLuma ?? 25;
  const whitePercentile = options.whitePercentile ?? 0.96;

  // 1. Normalización de iluminación (white-patch por canal).
  const histR = new Uint32Array(256);
  const histG = new Uint32Array(256);
  const histB = new Uint32Array(256);
  for (let i = 0; i < total; i++) {
    const idx = i * 4;
    histR[img.data[idx]]++;
    histG[img.data[idx + 1]]++;
    histB[img.data[idx + 2]]++;
  }
  const whiteR = Math.max(160, percentileFromHistogram(histR, total, whitePercentile));
  const whiteG = Math.max(160, percentileFromHistogram(histG, total, whitePercentile));
  const whiteB = Math.max(160, percentileFromHistogram(histB, total, whitePercentile));
  const gainR = 255 / whiteR;
  const gainG = 255 / whiteG;
  const gainB = 255 / whiteB;

  const red = new Uint8Array(total);
  const blue = new Uint8Array(total);
  const ink = new Uint8Array(total);
  const strong = new Uint8Array(total);
  const chromaHist = new Uint32Array(256);
  const chroma = new Float32Array(total);
  const bStar = new Float32Array(total);

  // 2. Lab por píxel + histograma de croma (LUT + matemática en línea, sin
  //    asignar arrays por píxel para evitar presión de GC a 2 MP).
  for (let i = 0; i < total; i++) {
    const idx = i * 4;
    const rl = LINEAR_LUT[clampByte(img.data[idx] * gainR)];
    const gl = LINEAR_LUT[clampByte(img.data[idx + 1] * gainG)];
    const bl = LINEAR_LUT[clampByte(img.data[idx + 2] * gainB)];

    const x = (0.4124564 * rl + 0.3575761 * gl + 0.1804375 * bl) / D65_X;
    const y = (0.2126729 * rl + 0.7151522 * gl + 0.072175 * bl) / D65_Y;
    const z = (0.0193339 * rl + 0.119192 * gl + 0.9503041 * bl) / D65_Z;

    const fx = labF(x);
    const fy = labF(y);
    const fz = labF(z);
    const aa = 500 * (fx - fy);
    const bb = 200 * (fy - fz);

    const c = Math.sqrt(aa * aa + bb * bb);
    chroma[i] = c;
    bStar[i] = bb;
    chromaHist[Math.min(255, Math.round(c))]++;
  }

  // 3. Umbral adaptativo de croma (Otsu sobre el histograma de croma).
  const otsu = computeOtsu(Array.from(chromaHist), total);
  const chromaThreshold = Math.max(minChroma, otsu * 0.55);
  const strongThreshold = Math.max(30, chromaThreshold * 1.8);
  const bGate = Math.max(8, options.bGate ?? chromaThreshold * 0.3);

  // 4. Clasificación rojo/azul por signo de b*.
  for (let i = 0; i < total; i++) {
    if (chroma[i] < chromaThreshold) continue;
    const idx = i * 4;
    const lum = luma(img.data[idx], img.data[idx + 1], img.data[idx + 2]);
    if (lum < minLuma) continue;
    if (bStar[i] > bGate) {
      red[i] = 1;
      ink[i] = 1;
    } else if (bStar[i] < -bGate) {
      blue[i] = 1;
      ink[i] = 1;
    }
    if (chroma[i] >= strongThreshold) strong[i] = 1;
  }

  return { red, blue, ink, strong, chromaThreshold, strongThreshold, bGate, white: [whiteR, whiteG, whiteB] };
}
