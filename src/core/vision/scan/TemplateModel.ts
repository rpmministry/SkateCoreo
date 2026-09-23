/**
 * TemplateModel — MODELO DIGITAL de la plantilla impresa (fuente única de verdad).
 *
 * La app ya conoce la geometría exacta del documento: bordes, cuadrícula de 1 m y
 * 5 m, líneas centrales, círculo central y diagonales. Tras rectificar la foto con
 * los 4 fiduciales, esos elementos caen SIEMPRE en las mismas coordenadas. Este
 * modelo permite:
 *   1. RASTERIZAR la plantilla (para restarla de la foto → "template subtraction").
 *   2. PROTEGER el análisis: rechazar candidatos pegados a geometría impresa.
 *   3. SINTETIZAR hojas de prueba sin depender de fotos reales.
 *
 * Coordenadas en METROS de pista (0..lengthMeters, 0..widthMeters). La conversión
 * a píxeles de la imagen rectificada es lineal: px = m × (dim / tamañoPista).
 */

import { Pt, PrintedCircle, PrintedSegment, RgbaImage, Rink } from './types';

export interface TemplateGeometry {
  segments: PrintedSegment[];
  circles: PrintedCircle[];
}

export class TemplateModel {
  /** Geometría impresa en metros. Sin duplicados: rectángulo, rejilla, ejes, diagonales. */
  public static getGeometry(rink: Rink): TemplateGeometry {
    const L = rink.lengthMeters;
    const W = rink.widthMeters;
    const segments: PrintedSegment[] = [];
    const circles: PrintedCircle[] = [];

    // Borde perimetral (se aproxima por sus 4 lados).
    segments.push({ x1: 0, y1: 0, x2: L, y2: 0 });
    segments.push({ x1: L, y1: 0, x2: L, y2: W });
    segments.push({ x1: L, y1: W, x2: 0, y2: W });
    segments.push({ x1: 0, y1: W, x2: 0, y2: 0 });

    // Cuadrícula fina de 1 m (las coordenadas enteras; las de 5 m se incluyen aquí).
    for (let m = 1; m < L; m++) segments.push({ x1: m, y1: 0, x2: m, y2: W });
    for (let m = 1; m < W; m++) segments.push({ x1: 0, y1: m, x2: L, y2: m });

    // Ejes centrales.
    segments.push({ x1: L / 2, y1: 0, x2: L / 2, y2: W });
    segments.push({ x1: 0, y1: W / 2, x2: L, y2: W / 2 });

    // Diagonales de evaluación.
    segments.push({ x1: 0, y1: 0, x2: L, y2: W });
    segments.push({ x1: 0, y1: W, x2: L, y2: 0 });

    // Marcas de 3/4 del eje largo (segmento corto centrado en el eje).
    const tick = 1.5;
    segments.push({ x1: L * 0.25, y1: W / 2 - tick / 2, x2: L * 0.25, y2: W / 2 + tick / 2 });
    segments.push({ x1: L * 0.75, y1: W / 2 - tick / 2, x2: L * 0.75, y2: W / 2 + tick / 2 });

    // Círculo central reglamentario.
    circles.push({ cx: L / 2, cy: W / 2, r: 3 });

    return { segments, circles };
  }

  /**
   * Máscara binaria (1 = tinta impresa) de la imagen YA RECTIFICADA. `thicknessPx`
   * debe reflejar el grosor de las líneas impresas tras el warp (≈1-3 px).
   */
  public static rasterizeMask(
    width: number,
    height: number,
    rink: Rink,
    thicknessPx = 2
  ): Uint8Array {
    const mask = new Uint8Array(width * height);
    const { segments, circles } = this.getGeometry(rink);
    const sx = width / rink.lengthMeters;
    const sy = height / rink.widthMeters;
    const r = Math.max(1, Math.round(thicknessPx / 2));

    for (const s of segments) {
      drawLineMask(mask, width, height, s.x1 * sx, s.y1 * sy, s.x2 * sx, s.y2 * sy, r);
    }
    for (const c of circles) {
      drawCircleMask(mask, width, height, c.cx * sx, c.cy * sy, c.r * sx, r);
    }
    return mask;
  }

  /** Dibuja la plantilla impresa (gris) sobre una imagen sintética de prueba. */
  public static renderOntoImage(
    img: RgbaImage,
    rink: Rink,
    rgb: [number, number, number] = [120, 120, 120],
    thicknessPx = 2
  ): void {
    const { segments, circles } = this.getGeometry(rink);
    const sx = img.width / rink.lengthMeters;
    const sy = img.height / rink.widthMeters;
    const r = Math.max(1, Math.round(thicknessPx / 2));

    for (const s of segments) {
      drawLineImage(img, s.x1 * sx, s.y1 * sy, s.x2 * sx, s.y2 * sy, r, rgb);
    }
    for (const c of circles) {
      drawCircleImage(img, c.cx * sx, c.cy * sy, c.r * sx, r, rgb);
    }
  }

  /** ¿El punto (metros) cae sobre geometría impresa dentro de `toleranceMeters`? */
  public static distanceToPrinted(x: number, y: number, rink: Rink): number {
    const { segments, circles } = this.getGeometry(rink);
    let best = Infinity;

    for (const s of segments) {
      best = Math.min(best, pointSegmentDistance(x, y, s.x1, s.y1, s.x2, s.y2));
    }
    for (const c of circles) {
      best = Math.min(best, Math.abs(Math.hypot(x - c.cx, y - c.cy) - c.r));
    }
    return best;
  }
}

function pointSegmentDistance(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  let t = lenSq > 0 ? ((px - x1) * dx + (py - y1) * dy) / lenSq : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

/** Pinta un disco de radio `r` en la máscara (usado como pincel de línea). */
function stampMask(mask: Uint8Array, w: number, h: number, cx: number, cy: number, r: number): void {
  const r2 = r * r;
  const x0 = Math.max(0, Math.floor(cx - r));
  const x1 = Math.min(w - 1, Math.ceil(cx + r));
  const y0 = Math.max(0, Math.floor(cy - r));
  const y1 = Math.min(h - 1, Math.ceil(cy + r));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= r2) mask[y * w + x] = 1;
    }
  }
}

export function drawLineMask(
  mask: Uint8Array,
  w: number,
  h: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  r: number
): void {
  const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    stampMask(mask, w, h, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, r);
  }
}

export function drawCircleMask(
  mask: Uint8Array,
  w: number,
  h: number,
  cx: number,
  cy: number,
  radius: number,
  r: number
): void {
  const circumference = Math.max(8, Math.ceil(2 * Math.PI * radius));
  for (let i = 0; i < circumference; i++) {
    const a = (i / circumference) * Math.PI * 2;
    stampMask(mask, w, h, cx + Math.cos(a) * radius, cy + Math.sin(a) * radius, r);
  }
}

function stampImage(
  img: RgbaImage,
  cx: number,
  cy: number,
  r: number,
  rgb: [number, number, number]
): void {
  const x0 = Math.max(0, Math.floor(cx - r));
  const x1 = Math.min(img.width - 1, Math.ceil(cx + r));
  const y0 = Math.max(0, Math.floor(cy - r));
  const y1 = Math.min(img.height - 1, Math.ceil(cy + r));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= r * r) {
        const i = (y * img.width + x) * 4;
        img.data[i] = rgb[0];
        img.data[i + 1] = rgb[1];
        img.data[i + 2] = rgb[2];
        img.data[i + 3] = 255;
      }
    }
  }
}

function drawLineImage(
  img: RgbaImage,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  r: number,
  rgb: [number, number, number]
): void {
  const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    stampImage(img, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, r, rgb);
  }
}

function drawCircleImage(
  img: RgbaImage,
  cx: number,
  cy: number,
  radius: number,
  r: number,
  rgb: [number, number, number]
): void {
  const circumference = Math.max(8, Math.ceil(2 * Math.PI * radius));
  for (let i = 0; i < circumference; i++) {
    const a = (i / circumference) * Math.PI * 2;
    stampImage(img, cx + Math.cos(a) * radius, cy + Math.sin(a) * radius, r, rgb);
  }
}

/** Distancia de un punto a la geometría impresa (metros). */
export function distanceToGeometry(p: Pt, geometry: TemplateGeometry): number {
  let best = Infinity;
  for (const s of geometry.segments) {
    best = Math.min(best, pointSegmentDistance(p.x, p.y, s.x1, s.y1, s.x2, s.y2));
  }
  for (const c of geometry.circles) {
    best = Math.min(best, Math.abs(Math.hypot(p.x - c.cx, p.y - c.cy) - c.r));
  }
  return best;
}
