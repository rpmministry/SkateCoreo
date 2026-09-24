/**
 * PaperScannerCanvas — Puente entre el pipeline de visión PURO (`scan/`) y el DOM.
 *
 * El núcleo de visión (`scanPaper`, `ImageEnhance`) no conoce el DOM: trabaja con
 * `RgbaImage`. Este adaptador:
 *   · lee/escribe `HTMLCanvasElement` ↔ `RgbaImage`,
 *   · renderiza las MÁSCARAS de diagnóstico (roja / azul / combinada / residual),
 *   · dibuja un overlay con los nodos y candidatos sobre la imagen rectificada.
 *
 * Así el algoritmo es verificable en Node y la UI solo orquesta.
 */

import { RgbaImage, ScannedNode, RingCandidate } from './scan/types';
import { DEFAULT_RINK } from './scan/types';

export function canvasToRgbaImage(canvas: HTMLCanvasElement): RgbaImage {
  const w = Math.max(1, canvas.width);
  const h = Math.max(1, canvas.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) };
  const { data } = ctx.getImageData(0, 0, w, h);
  return { width: w, height: h, data };
}

export function rgbaImageToCanvas(img: RgbaImage): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const imageData = ctx.createImageData(img.width, img.height);
    imageData.data.set(img.data);
    ctx.putImageData(imageData, 0, 0);
  }
  return canvas;
}

/** Máscara binaria → canvas de un color sólido sobre fondo negro. */
export function maskToCanvas(
  mask: Uint8Array,
  width: number,
  height: number,
  color: [number, number, number] = [255, 255, 255]
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const imageData = ctx.createImageData(width, height);
    const data = imageData.data;
    for (let i = 0; i < width * height; i++) {
      const idx = i * 4;
      if (mask[i] === 1) {
        data[idx] = color[0];
        data[idx + 1] = color[1];
        data[idx + 2] = color[2];
      }
      data[idx + 3] = 255;
    }
    ctx.putImageData(imageData, 0, 0);
  }
  return canvas;
}

/** Máscara ROJA + AZUL combinadas en un único canvas (rojo real / azul real). */
export function combinedColorMaskToCanvas(red: Uint8Array, blue: Uint8Array, width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const imageData = ctx.createImageData(width, height);
    const data = imageData.data;
    for (let i = 0; i < width * height; i++) {
      const idx = i * 4;
      if (red[i] === 1) {
        data[idx] = 235;
        data[idx + 1] = 45;
        data[idx + 2] = 45;
      } else if (blue[i] === 1) {
        data[idx] = 45;
        data[idx + 1] = 120;
        data[idx + 2] = 245;
      }
      data[idx + 3] = 255;
    }
    ctx.putImageData(imageData, 0, 0);
  }
  return canvas;
}

/**
 * Overlay de diagnóstico sobre la imagen mejorada: círculos de los candidatos
 * (ámbar = propuesta) y nodos aceptados (verde) / a revisar (naranja), con su
 * número si se reconoció.
 */
export function buildScanOverlayCanvas(
  base: HTMLCanvasElement,
  nodes: ScannedNode[],
  candidates: RingCandidate[],
  rink = DEFAULT_RINK
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = base.width;
  canvas.height = base.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return base;

  ctx.drawImage(base, 0, 0);
  const pxPerMeter = base.width / rink.lengthMeters;

  // Candidatos (propuestas del detector) en ámbar tenue.
  ctx.lineWidth = 2;
  for (const c of candidates) {
    const r = Math.max(6, c.outerRadiusPx);
    ctx.beginPath();
    ctx.arc(c.center.x, c.center.y, r, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(245, 158, 11, 0.55)';
    ctx.stroke();
  }

  // Nodos validados.
  for (const n of nodes) {
    const cx = (n.xMeters / rink.lengthMeters) * base.width;
    const cy = (n.yMeters / rink.widthMeters) * base.height;
    const r = Math.max(10, n.radiusMeters * pxPerMeter + 4);
    const color = n.decision === 'accept' ? '#22C55E' : '#F59E0B';

    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx, cy, 4, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();

    const label = n.digit != null ? String(n.digit) : n.review ? 'REVISAR' : '?';
    ctx.font = 'bold 20px monospace';
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#FFFFFF';
    ctx.strokeText(label, cx + r + 6, cy - 6);
    ctx.fillStyle = color;
    ctx.fillText(label, cx + r + 6, cy - 6);
  }

  return canvas;
}

