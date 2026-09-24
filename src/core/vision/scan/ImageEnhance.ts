/**
 * ImageEnhance — PREPROCESAMIENTO de visión artificial para la digitalización.
 *
 * Este módulo NO es un filtro "decorativo" de edición fotográfica: es una etapa
 * del sistema de visión. Su único objetivo es hacer que la TINTA MANUSCRITA
 * ROJA/AZUL sea matemáticamente más separable del papel, de la plantilla impresa,
 * de las sombras y del ruido, para que los nodos se detecten con más precisión.
 *
 * Cadena aplicada (en este orden):
 *
 *   RgbaImage
 *     → normalización de iluminación (flat-field: compensa sombras/gradientes)
 *     → balance de blancos (white-patch por canal: quita dominantes de color)
 *     → exposición + brillo (con límites SEGUROS, nunca valores destructivos)
 *     → reducción ligera de ruido (mediana 3×3 mezclada, solo pasada final)
 *     → contraste adaptativo (CLAHE sobre la luminancia, preservando el croma)
 *     → saturación controlada
 *     → REALCE SELECTIVO de rojo/azul (los grises de la plantilla NO se tocan)
 *     → enfoque de bordes (unsharp mask)
 *     → RgbaImage mejorada
 *
 * Es 100% PURO (sin DOM, sin Canvas): opera sobre `RgbaImage` y es verificable en
 * Node. Nunca modifica destructivamente la imagen de entrada: devuelve una copia
 * nueva, de modo que `originalImage` y `processedImage` conviven siempre.
 *
 * Los parámetros son NORMALIZADOS en el rango [-1, 1] con 0 = neutro, pensados
 * para sliders de UI; internamente se escalan a valores seguros.
 */

import { RgbaImage } from './types';

/** Parámetros normalizados de mejora. 0 = neutro en todos. */
export interface EnhanceParams {
  /** Brillo percibido (offset). */
  brightness: number;
  /** Contraste (local adaptativo + global). */
  contrast: number;
  /** Exposición (ganancia multiplicativa). */
  exposure: number;
  /** Saturación de color. */
  saturation: number;
  /** Nitidez (enfoque de bordes). */
  sharpness: number;
}

export interface EnhanceOptions {
  /** `preview` omite las etapas caras (ruido/enfoque) para que la UI fluya. */
  quality?: 'preview' | 'final';
  /** Corrección de iluminación no uniforme (flat-field). Por defecto sí. */
  normalizeIllumination?: boolean;
  /**
   * Realce cromático extra de rojo/azul [0..1]. El preset "Optimizar para nodos"
   * usa un valor alto; el neutro conserva un realce suave, porque el propósito
   * del escáner es SIEMPRE separar la tinta del usuario.
   */
  chromaBoost?: number;
}

/** Estadísticas de la imagen que alimentan el modo "Auto Mejorar". */
export interface ImageStats {
  width: number;
  height: number;
  /** Luminancia media normalizada [0..1]. */
  meanLuma: number;
  /** Desviación estándar de la luminancia [0..1] (contraste global). */
  stdLuma: number;
  /** Saturación media HSV [0..1] (cantidad de color real). */
  meanSat: number;
  /** Fracción de píxeles oscuros (luma < 0.25): poca luz / sombras. */
  lowLumaFraction: number;
  /** Fracción de píxeles casi quemados (luma > 0.88): sobreexposición. */
  highLumaFraction: number;
  /** Percentil 96 por canal [0..1] (referencia de papel blanco). */
  white: [number, number, number];
}

export const NEUTRAL_PARAMS: EnhanceParams = {
  brightness: 0,
  contrast: 0,
  exposure: 0,
  saturation: 0,
  sharpness: 0,
};

/** Límites DUROS de seguridad: evitan el "brillo 500 % / contraste 500 %". */
export const SAFE_LIMITS = {
  brightness: 0.5,
  contrast: 0.8,
  exposure: 1,
  saturation: 1,
  sharpness: 1,
} as const;

export function clampParams(params: Partial<EnhanceParams> | undefined): EnhanceParams {
  const p = { ...NEUTRAL_PARAMS, ...(params ?? {}) };
  return {
    brightness: clamp(p.brightness, -SAFE_LIMITS.brightness, SAFE_LIMITS.brightness),
    contrast: clamp(p.contrast, -SAFE_LIMITS.contrast, SAFE_LIMITS.contrast),
    exposure: clamp(p.exposure, -SAFE_LIMITS.exposure, SAFE_LIMITS.exposure),
    saturation: clamp(p.saturation, -SAFE_LIMITS.saturation, SAFE_LIMITS.saturation),
    sharpness: clamp(p.sharpness, 0, SAFE_LIMITS.sharpness),
  };
}

export function paramsAreNeutral(params: Partial<EnhanceParams> | undefined): boolean {
  const p = clampParams(params);
  return (
    Math.abs(p.brightness) < 1e-3 &&
    Math.abs(p.contrast) < 1e-3 &&
    Math.abs(p.exposure) < 1e-3 &&
    Math.abs(p.saturation) < 1e-3 &&
    Math.abs(p.sharpness) < 1e-3
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   UTILIDADES NUMÉRICAS
   ══════════════════════════════════════════════════════════════════════════ */

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Luminancia rec.601 normalizada [0..1]. */
function luma01(r: number, g: number, b: number): number {
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

/** RGB (0..255) → HSV (h 0..360, s 0..1, v 0..1). */
export function rgbToHsv01(r: number, g: number, b: number): { h: number; s: number; v: number } {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === rn) h = 60 * (((gn - bn) / d) % 6);
    else if (max === gn) h = 60 * ((bn - rn) / d + 2);
    else h = 60 * ((rn - gn) / d + 4);
  }
  if (h < 0) h += 360;
  return { h, s: max === 0 ? 0 : d / max, v: max };
}

/** HSV (h 0..360, s 0..1, v 0..1) → RGB (0..255). */
export function hsv01ToRgb(h: number, s: number, v: number): [number, number, number] {
  const c = v * s;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0;
  let g = 0;
  let b = 0;
  if (hp < 1) { r = c; g = x; }
  else if (hp < 2) { r = x; g = c; }
  else if (hp < 3) { g = c; b = x; }
  else if (hp < 4) { g = x; b = c; }
  else if (hp < 5) { r = x; b = c; }
  else { r = c; b = x; }
  const m = v - c;
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

/* ══════════════════════════════════════════════════════════════════════════
   ANÁLISIS (modo Auto Mejorar)
   ══════════════════════════════════════════════════════════════════════════ */

/** Percentil de un histograma de 256 bins [0..255]. */
function percentile(hist: Uint32Array, total: number, p: number): number {
  const target = total * p;
  let acc = 0;
  for (let v = 0; v < 256; v++) {
    acc += hist[v];
    if (acc >= target) return v;
  }
  return 255;
}

export function analyzeImage(img: RgbaImage): ImageStats {
  const w = img.width;
  const h = img.height;
  const total = Math.max(1, w * h);
  const data = img.data;

  const histL = new Uint32Array(256);
  const histR = new Uint32Array(256);
  const histG = new Uint32Array(256);
  const histB = new Uint32Array(256);

  let sumL = 0;
  let sumL2 = 0;
  let sumSat = 0;
  let low = 0;
  let high = 0;

  for (let i = 0; i < total; i++) {
    const idx = i * 4;
    const r = data[idx];
    const g = data[idx + 1];
    const b = data[idx + 2];
    histR[r]++;
    histG[g]++;
    histB[b]++;

    const l = luma01(r, g, b);
    const lv = Math.min(255, Math.round(l * 255));
    histL[lv]++;
    sumL += l;
    sumL2 += l * l;
    if (l < 0.25) low++;
    if (l > 0.88) high++;

    const max = Math.max(r, g, b) / 255;
    const min = Math.min(r, g, b) / 255;
    sumSat += max === 0 ? 0 : (max - min) / max;
  }

  const meanLuma = sumL / total;
  const variance = Math.max(0, sumL2 / total - meanLuma * meanLuma);

  return {
    width: w,
    height: h,
    meanLuma,
    stdLuma: Math.sqrt(variance),
    meanSat: sumSat / total,
    lowLumaFraction: low / total,
    highLumaFraction: high / total,
    white: [
      percentile(histR, total, 0.96) / 255,
      percentile(histG, total, 0.96) / 255,
      percentile(histB, total, 0.96) / 255,
    ],
  };
}

/**
 * Parámetros automáticos conservadores: acercan la exposición a un objetivo sano,
 * suben contraste/saturación solo si la imagen está plana y apagan la sobreexposición.
 * NUNCA aplican valores extremos que destruyan la información.
 */
export function autoEnhanceParams(stats: ImageStats): EnhanceParams {
  const TARGET_LUMA = 0.55;

  // Exposición: corrección suave hacia el objetivo (±0.8 EV como máximo).
  const exposure = clamp((TARGET_LUMA - stats.meanLuma) * 1.6, -0.8, 0.8);
  // Brillito fino cuando la imagen es muy oscura pero no necesita ganancia grande.
  const brightness = clamp((TARGET_LUMA - stats.meanLuma) * 0.25, -0.12, 0.12);
  // Contraste: sube si la imagen está plana; baja un poco si está quemada.
  const contrast = clamp((0.2 - stats.stdLuma) * 2.2 - stats.highLumaFraction * 0.8, -0.35, 0.45);
  // Saturación: sube si hay poco color (tinta tenue); nunca la fuerza de más.
  const saturation = clamp((0.22 - stats.meanSat) * 1.6, -0.1, 0.4);
  // Nitidez moderada con poca luz / sombra.
  const sharpness = clamp(0.25 + stats.lowLumaFraction * 0.6, 0, 0.55);

  return clampParams({ brightness, contrast, exposure, saturation, sharpness });
}

/**
 * Preset "Optimizar para detección de nodos": no busca una foto bonita, busca
 * MAXIMIZAR la separación rojo/azul/plantilla (contraste adaptativo fuerte,
 * saturación selectiva y realce cromático), aun a costa del aspecto estético.
 */
export function optimizeForNodesParams(stats: ImageStats): EnhanceParams {
  const auto = autoEnhanceParams(stats);
  return clampParams({
    // No forzamos exposición al máximo: perderíamos tonos medios de la tinta.
    brightness: clamp(auto.brightness, -0.1, 0.1),
    exposure: clamp(auto.exposure, -0.5, 0.6),
    contrast: clamp(auto.contrast + 0.35, 0.2, SAFE_LIMITS.contrast),
    saturation: clamp(auto.saturation + 0.35, 0.2, 0.7),
    sharpness: clamp(auto.sharpness + 0.25, 0.2, 0.8),
  });
}

/* ══════════════════════════════════════════════════════════════════════════
   ETAPAS DE PROCESAMIENTO
   ══════════════════════════════════════════════════════════════════════════ */

/** Copia la imagen a planos Float32 por canal (0..255). */
function toPlanes(img: RgbaImage): { r: Float32Array; g: Float32Array; b: Float32Array } {
  const n = img.width * img.height;
  const r = new Float32Array(n);
  const g = new Float32Array(n);
  const b = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const idx = i * 4;
    r[i] = img.data[idx];
    g[i] = img.data[idx + 1];
    b[i] = img.data[idx + 2];
  }
  return { r, g, b };
}

/** Box blur horizontal+vertical sobre un plano Float32 (separado, O(n)). */
function boxBlurPlane(src: Float32Array, w: number, h: number, radius: number): Float32Array {
  const r = Math.max(0, Math.round(radius));
  if (r === 0) return src.slice();
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  const win = 2 * r + 1;

  for (let y = 0; y < h; y++) {
    const row = y * w;
    let acc = 0;
    for (let x = -r; x <= r; x++) acc += src[row + clamp(x, 0, w - 1)];
    for (let x = 0; x < w; x++) {
      tmp[row + x] = acc / win;
      const add = src[row + clamp(x + r + 1, 0, w - 1)];
      const sub = src[row + clamp(x - r, 0, w - 1)];
      acc += add - sub;
    }
  }
  for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let y = -r; y <= r; y++) acc += tmp[clamp(y, 0, h - 1) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = acc / win;
      const add = tmp[clamp(y + r + 1, 0, h - 1) * w + x];
      const sub = tmp[clamp(y - r, 0, h - 1) * w + x];
      acc += add - sub;
    }
  }
  return out;
}

/**
 * Normalización de iluminación (flat-field): estima el fondo iluminado con un
 * desenfoque muy grande y divide por él. Corrige sombras, viñeteado y focos
 * para que un nodo no sea invisible en una zona y evidente en otra.
 */
function normalizeIllumination(
  r: Float32Array,
  g: Float32Array,
  b: Float32Array,
  w: number,
  h: number,
  blend = 0.75
): void {
  const n = w * h;
  const luma = new Float32Array(n);
  let sum = 0;
  for (let i = 0; i < n; i++) {
    luma[i] = 0.299 * r[i] + 0.587 * g[i] + 0.114 * b[i];
    sum += luma[i];
  }
  const mean = sum / Math.max(1, n);
  const radius = Math.max(8, Math.round(Math.min(w, h) / 10));
  const background = boxBlurPlane(luma, w, h, radius);

  for (let i = 0; i < n; i++) {
    const bg = Math.max(12, background[i]);
    const target = mean;
    const factor = 1 + (target / bg - 1) * blend;
    const f = clamp(factor, 0.45, 1.9);
    r[i] = clamp(r[i] * f, 0, 255);
    g[i] = clamp(g[i] * f, 0, 255);
    b[i] = clamp(b[i] * f, 0, 255);
  }
}

/** Balance de blancos white-patch por canal (elimina dominantes de color). */
function whiteBalance(r: Float32Array, g: Float32Array, b: Float32Array, stats: ImageStats): void {
  const target = 245;
  const wr = Math.max(120, stats.white[0] * 255);
  const wg = Math.max(120, stats.white[1] * 255);
  const wb = Math.max(120, stats.white[2] * 255);
  const gr = clamp(target / wr, 0.8, 1.35);
  const gg = clamp(target / wg, 0.8, 1.35);
  const gb = clamp(target / wb, 0.8, 1.35);
  if (Math.abs(gr - 1) < 0.01 && Math.abs(gg - 1) < 0.01 && Math.abs(gb - 1) < 0.01) return;
  for (let i = 0; i < r.length; i++) {
    r[i] = clamp(r[i] * gr, 0, 255);
    g[i] = clamp(g[i] * gg, 0, 255);
    b[i] = clamp(b[i] * gb, 0, 255);
  }
}

/** Exposición (ganancia) + brillo (offset), con ganancia acotada. */
function applyExposureBrightness(
  r: Float32Array,
  g: Float32Array,
  b: Float32Array,
  exposure: number,
  brightness: number
): void {
  const gain = Math.pow(2, exposure * 1.2);
  const offset = brightness * 64;
  if (Math.abs(gain - 1) < 1e-3 && Math.abs(offset) < 0.5) return;
  for (let i = 0; i < r.length; i++) {
    r[i] = clamp(r[i] * gain + offset, 0, 255);
    g[i] = clamp(g[i] * gain + offset, 0, 255);
    b[i] = clamp(b[i] * gain + offset, 0, 255);
  }
}

/**
 * Contraste adaptativo tipo CLAHE sobre la LUMINANCIA, preservando el croma.
 * Se aplica como ganancia de luminancia (L'/L) sobre cada canal, de modo que el
 * tono (hue) y la relación de saturación de la tinta se conservan.
 */
function applyClahe(
  r: Float32Array,
  g: Float32Array,
  b: Float32Array,
  w: number,
  h: number,
  strength: number
): void {
  if (strength <= 0.01) return;
  const tilesX = clamp(Math.round(w / 160), 4, 8);
  const tilesY = clamp(Math.round(h / 160), 3, 8);
  const tileW = Math.ceil(w / tilesX);
  const tileH = Math.ceil(h / tilesY);

  // LUTs por tile (256 entradas) con recorte del histograma.
  const luts: Uint8Array[] = [];
  const clipFactor = 2.5 + (1 - strength) * 3.5;

  for (let ty = 0; ty < tilesY; ty++) {
    for (let tx = 0; tx < tilesX; tx++) {
      const hist = new Uint32Array(256);
      const x0 = tx * tileW;
      const y0 = ty * tileH;
      const x1 = Math.min(w, x0 + tileW);
      const y1 = Math.min(h, y0 + tileH);
      let count = 0;
      for (let y = y0; y < y1; y++) {
        const row = y * w;
        for (let x = x0; x < x1; x++) {
          const i = row + x;
          const l = clamp(Math.round(0.299 * r[i] + 0.587 * g[i] + 0.114 * b[i]), 0, 255);
          hist[l]++;
          count++;
        }
      }
      const clipLimit = Math.max(1, Math.round((count / 256) * clipFactor));
      let excess = 0;
      for (let v = 0; v < 256; v++) {
        if (hist[v] > clipLimit) {
          excess += hist[v] - clipLimit;
          hist[v] = clipLimit;
        }
      }
      const perBin = excess / 256;
      const cdf = new Float32Array(256);
      let acc = 0;
      for (let v = 0; v < 256; v++) {
        acc += hist[v] + perBin;
        cdf[v] = acc;
      }
      const total = Math.max(1, acc);
      const lut = new Uint8Array(256);
      for (let v = 0; v < 256; v++) {
        lut[v] = clamp(Math.round((cdf[v] / total) * 255), 0, 255);
      }
      luts.push(lut);
    }
  }

  // Aplicación con interpolación bilineal entre las 4 LUT de tiles vecinas.
  for (let y = 0; y < h; y++) {
    const gy = y / tileH - 0.5;
    const ty0 = clamp(Math.floor(gy), 0, tilesY - 1);
    const ty1 = clamp(ty0 + 1, 0, tilesY - 1);
    const fy = clamp(gy - ty0, 0, 1);
    const row = y * w;
    for (let x = 0; x < w; x++) {
      const i = row + x;
      const L = clamp(Math.round(0.299 * r[i] + 0.587 * g[i] + 0.114 * b[i]), 0, 255);
      const gx = x / tileW - 0.5;
      const tx0 = clamp(Math.floor(gx), 0, tilesX - 1);
      const tx1 = clamp(tx0 + 1, 0, tilesX - 1);
      const fx = clamp(gx - tx0, 0, 1);

      const l00 = luts[ty0 * tilesX + tx0][L];
      const l01 = luts[ty0 * tilesX + tx1][L];
      const l10 = luts[ty1 * tilesX + tx0][L];
      const l11 = luts[ty1 * tilesX + tx1][L];
      const top = l00 + (l01 - l00) * fx;
      const bot = l10 + (l11 - l10) * fx;
      const target = top + (bot - top) * fy;

      const mapped = L + (target - L) * strength;
      if (L < 1) continue;
      const factor = clamp(mapped / L, 0.35, 2.6);
      r[i] = clamp(r[i] * factor, 0, 255);
      g[i] = clamp(g[i] * factor, 0, 255);
      b[i] = clamp(b[i] * factor, 0, 255);
    }
  }
}

/**
 * Realce SELECTIVO de rojo/azul: solo se refuerzan los píxeles con matiz de tinta
 * (rojo o azul) y saturación real. Grises/negros de la plantilla (saturación ≈ 0)
 * quedan intactos, de modo que la plantilla impresa pierde relevancia frente a la
 * tinta manuscrita del usuario.
 */
function applySelectiveChroma(
  r: Float32Array,
  g: Float32Array,
  b: Float32Array,
  saturation: number,
  chromaBoost: number
): void {
  const satFactor = 1 + saturation * 0.6;
  const boost = 1 + chromaBoost * 0.8;
  for (let i = 0; i < r.length; i++) {
    const { h, s, v } = rgbToHsv01(r[i], g[i], b[i]);
    if (s < 0.02) continue;
    const isRed = h <= 30 || h >= 330;
    const isBlue = h >= 195 && h <= 285;
    let newS = s * satFactor;
    if ((isRed || isBlue) && s > 0.12) {
      // Realce cromático proporcional a la saturación ya presente.
      newS = newS * (1 + (boost - 1) * Math.min(1, s * 4));
    }
    newS = clamp(newS, 0, 1);
    if (Math.abs(newS - s) < 0.002) continue;
    const [nr, ng, nb] = hsv01ToRgb(h, newS, v);
    r[i] = nr;
    g[i] = ng;
    b[i] = nb;
  }
}

/** Reducción ligera de ruido: mediana 3×3 mezclada (no emborrona bordes). */
function denoise(r: Float32Array, g: Float32Array, b: Float32Array, w: number, h: number): void {
  if (w < 3 || h < 3) return;
  const blend = 0.45;
  const outR = r.slice();
  const outG = g.slice();
  const outB = b.slice();
  const m = new Float32Array(9);
  const median = (arr: Float32Array, cx: number, cy: number): number => {
    let k = 0;
    for (let dy = -1; dy <= 1; dy++) {
      const yy = clamp(cy + dy, 0, h - 1);
      for (let dx = -1; dx <= 1; dx++) {
        const xx = clamp(cx + dx, 0, w - 1);
        m[k++] = arr[yy * w + xx];
      }
    }
    // Red de comparadores de Paeth para la mediana de 9 (19 comparaciones),
    // más rápida y predecible que una ordenación por inserción por píxel.
    let t: number;
    const sw = (i: number, j: number) => {
      if (m[i] > m[j]) {
        t = m[i];
        m[i] = m[j];
        m[j] = t;
      }
    };
    sw(1, 2); sw(4, 5); sw(7, 8);
    sw(0, 1); sw(3, 4); sw(6, 7);
    sw(1, 2); sw(4, 5); sw(7, 8);
    sw(0, 3); sw(5, 8); sw(4, 7); sw(3, 6);
    sw(1, 4); sw(2, 5); sw(4, 7);
    sw(4, 2); sw(6, 4); sw(4, 2);
    return m[4];
  };
  for (let y = 1; y < h - 1; y++) {
    const row = y * w;
    for (let x = 1; x < w - 1; x++) {
      const i = row + x;
      outR[i] = r[i] * (1 - blend) + median(r, x, y) * blend;
      outG[i] = g[i] * (1 - blend) + median(g, x, y) * blend;
      outB[i] = b[i] * (1 - blend) + median(b, x, y) * blend;
    }
  }
  r.set(outR);
  g.set(outG);
  b.set(outB);
}

/** Enfoque de bordes: unsharp mask sobre la luminancia (preserva el color). */
function sharpen(
  r: Float32Array,
  g: Float32Array,
  b: Float32Array,
  w: number,
  h: number,
  amount: number
): void {
  if (amount <= 0.01) return;
  const n = w * h;
  const luma = new Float32Array(n);
  for (let i = 0; i < n; i++) luma[i] = 0.299 * r[i] + 0.587 * g[i] + 0.114 * b[i];
  const blurred = boxBlurPlane(luma, w, h, 1);
  const k = amount * 0.9;
  for (let i = 0; i < n; i++) {
    const detail = (luma[i] - blurred[i]) * k;
    r[i] = clamp(r[i] + detail, 0, 255);
    g[i] = clamp(g[i] + detail, 0, 255);
    b[i] = clamp(b[i] + detail, 0, 255);
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   API PRINCIPAL
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Aplica la cadena completa de mejora. Devuelve una imagen NUEVA; la de entrada
 * nunca se modifica (no destructivo: permite conservar `originalImage`).
 */
export function enhanceImage(
  img: RgbaImage,
  paramsInput: Partial<EnhanceParams>,
  options: EnhanceOptions = {}
): RgbaImage {
  const params = clampParams(paramsInput);
  const quality = options.quality ?? 'final';
  const normalize = options.normalizeIllumination ?? true;
  const chromaBoost =
    options.chromaBoost ??
    (paramsAreNeutral(params)
      ? 0
      : clamp(0.3 + Math.max(0, params.saturation) * 0.5 + Math.max(0, params.contrast) * 0.3, 0, 1));

  const w = img.width;
  const h = img.height;
  if (w <= 0 || h <= 0) {
    return { width: Math.max(1, w), height: Math.max(1, h), data: new Uint8ClampedArray(Math.max(4, w * h * 4)) };
  }

  // Sin ajustes y en preview rápido no hay nada que hacer: se devuelve una copia.
  if (paramsAreNeutral(params) && chromaBoost <= 0.001) {
    return { width: w, height: h, data: new Uint8ClampedArray(img.data) };
  }

  const stats = analyzeImage(img);
  const { r, g, b } = toPlanes(img);

  if (normalize) normalizeIllumination(r, g, b, w, h);
  whiteBalance(r, g, b, stats);
  applyExposureBrightness(r, g, b, params.exposure, params.brightness);

  if (quality === 'final') denoise(r, g, b, w, h);

  // Contraste: mezcla global (lineal) + adaptativo (CLAHE) con fuerza acotada.
  const globalContrast = 1 + params.contrast * 0.5;
  if (Math.abs(globalContrast - 1) > 1e-3) {
    const midpoint = 128;
    for (let i = 0; i < w * h; i++) {
      r[i] = clamp((r[i] - midpoint) * globalContrast + midpoint, 0, 255);
      g[i] = clamp((g[i] - midpoint) * globalContrast + midpoint, 0, 255);
      b[i] = clamp((b[i] - midpoint) * globalContrast + midpoint, 0, 255);
    }
  }
  const claheStrength = clamp(0.35 + params.contrast * 0.65, 0.15, 1);
  applyClahe(r, g, b, w, h, claheStrength);

  applySelectiveChroma(r, g, b, params.saturation, chromaBoost);

  if (quality === 'final') sharpen(r, g, b, w, h, params.sharpness);

  const out = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const idx = i * 4;
    out[idx] = r[i];
    out[idx + 1] = g[i];
    out[idx + 2] = b[i];
    out[idx + 3] = 255;
  }
  return { width: w, height: h, data: out };
}

/**
 * Reduce la imagen manteniendo la relación de aspecto (muestreo por promedio de
 * bloque). Etapa de PREVIEW: el usuario mueve los sliders a baja resolución y la
 * versión final se recalcula a resolución completa al soltar.
 */
export function downscaleImage(img: RgbaImage, maxWidth: number): RgbaImage {
  if (maxWidth <= 0 || img.width <= maxWidth) {
    return { width: img.width, height: img.height, data: new Uint8ClampedArray(img.data) };
  }
  const scale = maxWidth / img.width;
  const dw = Math.max(1, Math.round(img.width * scale));
  const dh = Math.max(1, Math.round(img.height * scale));
  const out = new Uint8ClampedArray(dw * dh * 4);
  const src = img.data;

  for (let y = 0; y < dh; y++) {
    const y0 = Math.floor((y * img.height) / dh);
    const y1 = Math.max(y0 + 1, Math.floor(((y + 1) * img.height) / dh));
    for (let x = 0; x < dw; x++) {
      const x0 = Math.floor((x * img.width) / dw);
      const x1 = Math.max(x0 + 1, Math.floor(((x + 1) * img.width) / dw));
      let sr = 0;
      let sg = 0;
      let sb = 0;
      let count = 0;
      for (let sy = y0; sy < y1; sy++) {
        const row = sy * img.width;
        for (let sx = x0; sx < x1; sx++) {
          const idx = (row + sx) * 4;
          sr += src[idx];
          sg += src[idx + 1];
          sb += src[idx + 2];
          count++;
        }
      }
      const inv = 1 / Math.max(1, count);
      const o = (y * dw + x) * 4;
      out[o] = sr * inv;
      out[o + 1] = sg * inv;
      out[o + 2] = sb * inv;
      out[o + 3] = 255;
    }
  }
  return { width: dw, height: dh, data: out };
}
