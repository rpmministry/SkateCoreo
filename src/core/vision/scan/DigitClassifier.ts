/**
 * DigitClassifier — Reconocimiento del NÚMERO manuscrito SOLO dentro del nodo.
 *
 * El OCR general (Tesseract/Paddle/EasyOCR) está pensado para líneas de texto; su
 * precisión con DÍGITOS manuscritos aislados dentro de un círculo es pobre. Aquí se
 * reduce el problema a su mínima expresión:
 *
 *   1. Recortar el INTERIOR del nodo (disco r < 0.8·radio interior) — nunca fuera.
 *   2. Aislar la tinta interior (más oscura que el papel local).
 *   3. Normalizar como MNIST: binarizar, centrar por centro de masas y escalar a
 *      28×28 píxeles.
 *   4. Clasificar SOLO en el vocabulario {0..9} con un modelo pequeño.
 *
 * La clasificación real se delega en un modelo (CNN ONNX) mediante un adaptador
 * (`createOnnxDigitClassifier`). El clasificador por defecto es CONSERVADOR: si no
 * hay modelo cargado devuelve `digit = null` y el nodo queda para revisión manual.
 * Esto cumple la regla "no inventar": jamás se devuelve un número sin evidencia.
 */

import { RgbaImage } from './types';
import { clamp } from './mathUtil';
import { luma } from './ImageOps';

export const DIGIT_TENSOR_SIZE = 28;

export interface DigitTensor {
  /** Vector 28×28 = 784 valores (1 = tinta, 0 = fondo), listo para una CNN. */
  data: Float32Array;
  hasInk: boolean;
  inkFraction: number;
}

export interface DigitPrediction {
  /** Dígito 0-9 o null si no hay evidencia suficiente. */
  digit: number | null;
  confidence: number;
}

export interface DigitClassifier {
  classify(tensor: DigitTensor): Promise<DigitPrediction>;
}

/** Clasificador seguro por defecto: nunca inventa un dígito. */
export class NullDigitClassifier implements DigitClassifier {
  async classify(_tensor: DigitTensor): Promise<DigitPrediction> {
    return { digit: null, confidence: 0 };
  }
}

/**
 * Extrae el tensor 28×28 del dígito interior. `innerRadiusPx` es el radio interior
 * del anillo (hueco). Solo mira dentro del disco para no confundir el círculo.
 */
export function extractDigitTensor(
  image: RgbaImage,
  cx: number,
  cy: number,
  innerRadiusPx: number
): DigitTensor {
  const empty = new Float32Array(DIGIT_TENSOR_SIZE * DIGIT_TENSOR_SIZE);
  const inspectR = innerRadiusPx * 0.8;
  if (inspectR < 2) return { data: empty, hasInk: false, inkFraction: 0 };

  const half = Math.max(3, Math.ceil(inspectR));
  const x0 = Math.max(0, Math.floor(cx - half));
  const x1 = Math.min(image.width - 1, Math.ceil(cx + half));
  const y0 = Math.max(0, Math.floor(cy - half));
  const y1 = Math.min(image.height - 1, Math.ceil(cy + half));
  const bw = x1 - x0 + 1;
  const bh = y1 - y0 + 1;
  if (bw < 3 || bh < 3) return { data: empty, hasInk: false, inkFraction: 0 };

  // Luminancia de la región interior + papel local (percentil alto).
  const lum = new Float32Array(bw * bh);
  const hist = new Uint32Array(256);
  let insideCount = 0;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const i = (y - y0) * bw + (x - x0);
      const p = (y * image.width + x) * 4;
      const l = luma(image.data[p], image.data[p + 1], image.data[p + 2]);
      lum[i] = dx * dx + dy * dy <= inspectR * inspectR ? l : -1;
      if (lum[i] >= 0) {
        hist[Math.min(255, Math.round(l))]++;
        insideCount++;
      }
    }
  }
  if (insideCount < 6) return { data: empty, hasInk: false, inkFraction: 0 };

  const paper = percentile(hist, insideCount, 0.9);
  const inkThreshold = paper * 0.72;
  const ink = new Uint8Array(bw * bh);
  let inkCount = 0;
  for (let i = 0; i < ink.length; i++) {
    if (lum[i] >= 0 && lum[i] < inkThreshold && lum[i] > 12) {
      ink[i] = 1;
      inkCount++;
    }
  }
  const inkFraction = inkCount / Math.max(1, insideCount);
  if (inkCount < 4 || inkFraction < 0.01) {
    return { data: empty, hasInk: false, inkFraction };
  }

  // Bounding box de la tinta interior.
  let minX = bw;
  let minY = bh;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < bh; y++) {
    for (let x = 0; x < bw; x++) {
      if (ink[y * bw + x] !== 1) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  const glyphW = maxX - minX + 1;
  const glyphH = maxY - minY + 1;

  // Escalado con margen interno (20×20 dentro de 28×28), preservando aspecto.
  const target = 20;
  const scale = target / Math.max(glyphW, glyphH);
  const drawW = Math.max(1, Math.round(glyphW * scale));
  const drawH = Math.max(1, Math.round(glyphH * scale));
  const offX = (DIGIT_TENSOR_SIZE - drawW) / 2;
  const offY = (DIGIT_TENSOR_SIZE - drawH) / 2;

  const out = new Float32Array(DIGIT_TENSOR_SIZE * DIGIT_TENSOR_SIZE);
  for (let ty = 0; ty < drawH; ty++) {
    for (let tx = 0; tx < drawW; tx++) {
      const sx = minX + Math.floor((tx / drawW) * glyphW);
      const sy = minY + Math.floor((ty / drawH) * glyphH);
      if (ink[sy * bw + sx] === 1) {
        const ox = Math.floor(offX) + tx;
        const oy = Math.floor(offY) + ty;
        if (ox >= 0 && ox < DIGIT_TENSOR_SIZE && oy >= 0 && oy < DIGIT_TENSOR_SIZE) {
          out[oy * DIGIT_TENSOR_SIZE + ox] = 1;
        }
      }
    }
  }

  return { data: shiftToCenterOfMass(out), hasInk: true, inkFraction };
}

/** Clasificador basado en un modelo ONNX (u otro) inyectado como función de inferencia. */
export function createOnnxDigitClassifier(
  run: (input: Float32Array) => Promise<Float32Array>,
  minConfidence = 0.6
): DigitClassifier {
  return {
    async classify(tensor: DigitTensor): Promise<DigitPrediction> {
      if (!tensor.hasInk) return { digit: null, confidence: 0 };
      const logits = await run(tensor.data);
      if (!logits || logits.length < 10) return { digit: null, confidence: 0 };
      const probs = softmax(logits.slice(0, 10));
      let best = 0;
      for (let i = 1; i < 10; i++) if (probs[i] > probs[best]) best = i;
      return probs[best] >= minConfidence
        ? { digit: best, confidence: Math.round(probs[best] * 1000) / 1000 }
        : { digit: null, confidence: Math.round(probs[best] * 1000) / 1000 };
    },
  };
}

function softmax(values: Float32Array): Float32Array {
  let max = -Infinity;
  for (const v of values) if (v > max) max = v;
  let sum = 0;
  const out = new Float32Array(values.length);
  for (let i = 0; i < values.length; i++) {
    const e = Math.exp(values[i] - max);
    out[i] = e;
    sum += e;
  }
  for (let i = 0; i < out.length; i++) out[i] /= sum || 1;
  return out;
}

function percentile(hist: Uint32Array, total: number, p: number): number {
  const target = total * p;
  let acc = 0;
  for (let v = 0; v < 256; v++) {
    acc += hist[v];
    if (acc >= target) return v;
  }
  return 255;
}

/** Desplaza la imagen binaria para que su centro de masas quede en el centro. */
function shiftToCenterOfMass(src: Float32Array): Float32Array {
  const size = DIGIT_TENSOR_SIZE;
  let sum = 0;
  let cx = 0;
  let cy = 0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const v = src[y * size + x];
      if (v > 0) {
        sum += v;
        cx += x * v;
        cy += y * v;
      }
    }
  }
  if (sum === 0) return src;
  cx /= sum;
  cy /= sum;
  const target = (size - 1) / 2;
  const shiftX = clamp(Math.round(target - cx), -6, 6);
  const shiftY = clamp(Math.round(target - cy), -6, 6);
  if (shiftX === 0 && shiftY === 0) return src;

  const out = new Float32Array(src.length);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nx = x + shiftX;
      const ny = y + shiftY;
      if (nx >= 0 && nx < size && ny >= 0 && ny < size) {
        out[ny * size + nx] = src[y * size + x];
      }
    }
  }
  return out;
}
