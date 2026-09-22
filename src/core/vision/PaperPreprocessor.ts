/**
 * PaperPreprocessor — Preprocesamiento de imagen para OCR (Canvas puro).
 *
 * Fases (requeridas antes de leer números):
 *   1. Escala de grises (luminancia rec.601).
 *   2. Ajuste de brillo/contraste dinámico (estirado por percentiles 2%–98%).
 *   3. Binarización por umbral de Otsu → blanco puro / negro puro, eliminando
 *      sombras, arrugas y ruido de fondo.
 *
 * Todo el procesamiento es local y sin dependencias externas.
 */

export interface PreprocessResult {
  /** Canvas binarizado (blanco puro / negro puro). */
  binarized: HTMLCanvasElement;
  /** Canvas en grises con contraste estirado (útil para preview/diagnóstico). */
  contrasted: HTMLCanvasElement;
  /** Umbral de Otsu calculado (0–255). */
  otsuThreshold: number;
}

export class PaperPreprocessor {
  /** Ejecuta el pipeline completo de preprocesamiento. */
  public static preprocess(source: HTMLCanvasElement): PreprocessResult {
    const w = Math.max(1, source.width);
    const h = Math.max(1, source.height);

    const srcCanvas = document.createElement('canvas');
    srcCanvas.width = w;
    srcCanvas.height = h;
    const srcCtx = srcCanvas.getContext('2d');
    if (!srcCtx) throw new Error('No se pudo crear contexto 2D para el preprocesamiento');
    srcCtx.drawImage(source, 0, 0, w, h);

    const imgData = srcCtx.getImageData(0, 0, w, h);
    const data = imgData.data;

    // 1. Escala de grises
    const gray = new Uint8ClampedArray(w * h);
    const histogram = new Array<number>(256).fill(0);
    for (let i = 0; i < w * h; i++) {
      const idx = i * 4;
      const lum = Math.round(0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2]);
      gray[i] = lum;
      histogram[lum]++;
    }

    // 2. Estirado de contraste por percentiles 2%–98%
    const total = w * h;
    const lowCut = total * 0.02;
    const highCut = total * 0.98;
    let acc = 0;
    let pLow = 0;
    let pHigh = 255;
    for (let v = 0; v < 256; v++) {
      acc += histogram[v];
      if (acc >= lowCut) { pLow = v; break; }
    }
    acc = 0;
    for (let v = 0; v < 256; v++) {
      acc += histogram[v];
      if (acc >= highCut) { pHigh = v; break; }
    }
    const span = Math.max(1, pHigh - pLow);

    const contrasted = new Uint8ClampedArray(w * h);
    const contrastedHist = new Array<number>(256).fill(0);
    for (let i = 0; i < w * h; i++) {
      const stretched = Math.round(((gray[i] - pLow) * 255) / span);
      const clamped = stretched < 0 ? 0 : stretched > 255 ? 255 : stretched;
      contrasted[i] = clamped;
      contrastedHist[clamped]++;
    }

    // 3. Umbral de Otsu sobre la imagen contrastada
    const otsuThreshold = this.computeOtsu(contrastedHist, total);

    // Preparar canvas de salida
    const contrastedCanvas = document.createElement('canvas');
    contrastedCanvas.width = w;
    contrastedCanvas.height = h;
    const contrastedCtx = contrastedCanvas.getContext('2d')!;
    const contrastedData = contrastedCtx.createImageData(w, h);

    const binarizedCanvas = document.createElement('canvas');
    binarizedCanvas.width = w;
    binarizedCanvas.height = h;
    const binarizedCtx = binarizedCanvas.getContext('2d')!;
    const binarizedData = binarizedCtx.createImageData(w, h);

    for (let i = 0; i < w * h; i++) {
      const idx = i * 4;
      const v = contrasted[i];

      contrastedData.data[idx] = v;
      contrastedData.data[idx + 1] = v;
      contrastedData.data[idx + 2] = v;
      contrastedData.data[idx + 3] = 255;

      // Binarización: tinta = negro puro; fondo = blanco puro.
      const bin = v <= otsuThreshold ? 0 : 255;
      binarizedData.data[idx] = bin;
      binarizedData.data[idx + 1] = bin;
      binarizedData.data[idx + 2] = bin;
      binarizedData.data[idx + 3] = 255;
    }

    contrastedCtx.putImageData(contrastedData, 0, 0);
    binarizedCtx.putImageData(binarizedData, 0, 0);

    return { binarized: binarizedCanvas, contrasted: contrastedCanvas, otsuThreshold };
  }

  /** Umbral óptimo de Otsu a partir del histograma. */
  public static computeOtsu(histogram: number[], total: number): number {
    let sum = 0;
    for (let i = 0; i < 256; i++) sum += i * histogram[i];

    let sumB = 0;
    let wB = 0;
    let maxVariance = -1;
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

      if (between > maxVariance) {
        maxVariance = between;
        threshold = t;
      }
    }

    return threshold;
  }
}
