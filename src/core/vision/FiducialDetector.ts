/**
 * FiducialDetector — Detección EXACTA de las 4 marcas fiduciales tipo QR.
 *
 * Las marcas de la plantilla son "targets" de alto contraste (cuadrado negro +
 * anillo blanco + núcleo negro), de ≥1.5 cm, inspiradas en los finder patterns
 * de QR/ArUco. Este detector:
 *   1. Binariza (Otsu) la imagen.
 *   2. Etiqueta componentes conexas de tinta negra.
 *   3. Valida el PATRÓN del target (núcleo oscuro, anillo claro, marco oscuro).
 *   4. Elige la mejor marca en cada cuadrante (TL/TR/BR/BL).
 *
 * Si no encuentra las 4 marcas de forma fiable devuelve `null`: la interfaz debe
 * pedir re-escanear o ajustar manualmente, en lugar de generar nodos erróneos.
 */

import { Point2D, QuadCorners } from './HomographyWarp';

export interface MarkerDetectionResult {
  corners: QuadCorners | null;
  /** Marcas válidas encontradas (0–4). */
  detected: number;
}

interface Blob {
  minX: number; maxX: number; minY: number; maxY: number; count: number;
}

export class FiducialDetector {
  /** Detección estricta: devuelve null si no hay exactamente 4 marcas válidas. */
  public static detectMarkers(
    image: HTMLImageElement | HTMLCanvasElement
  ): MarkerDetectionResult {
    const rawW = image instanceof HTMLImageElement ? image.naturalWidth : image.width;
    const rawH = image instanceof HTMLImageElement ? image.naturalHeight : image.height;
    if (rawW < 40 || rawH < 40) return { corners: null, detected: 0 };

    // Análisis a ~700px para rapidez, conservando la proporción.
    const procScale = Math.min(1.0, 700 / rawW);
    const pw = Math.max(1, Math.round(rawW * procScale));
    const ph = Math.max(1, Math.round(rawH * procScale));

    const canvas = document.createElement('canvas');
    canvas.width = pw;
    canvas.height = ph;
    const ctx = canvas.getContext('2d');
    if (!ctx) return { corners: null, detected: 0 };
    ctx.drawImage(image, 0, 0, pw, ph);
    const { data } = ctx.getImageData(0, 0, pw, ph);

    // 1. Escala de grises + histograma para Otsu
    const gray = new Uint8Array(pw * ph);
    const histogram = new Array<number>(256).fill(0);
    for (let i = 0; i < pw * ph; i++) {
      const idx = i * 4;
      const lum = Math.round(0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2]);
      gray[i] = lum;
      histogram[lum]++;
    }
    // Reutilizamos Otsu para un umbral adaptativo a la iluminación.
    const threshold = this.computeOtsu(histogram, pw * ph);

    // 2. Mapa de tinta negra + componentes conexas
    const black = new Uint8Array(pw * ph);
    for (let i = 0; i < pw * ph; i++) black[i] = gray[i] <= threshold ? 1 : 0;

    const minSize = Math.max(8, Math.round(pw * 0.025));
    const maxSize = Math.round(pw * 0.16);
    const blobs = this.findBlobs(black, pw, ph, minSize, maxSize);

    // 3. Validar patrón de cada candidato
    const validMarkers: Point2D[] = [];
    for (const blob of blobs) {
      const size = Math.max(blob.maxX - blob.minX, blob.maxY - blob.minY);
      const aspect = (blob.maxX - blob.minX) / Math.max(1, blob.maxY - blob.minY);
      if (aspect < 0.7 || aspect > 1.4) continue;
      if (size < minSize || size > maxSize) continue;

      const cx = Math.round((blob.minX + blob.maxX) / 2);
      const cy = Math.round((blob.minY + blob.maxY) / 2);
      if (this.matchesTargetPattern(gray, pw, ph, cx, cy, size)) {
        validMarkers.push({ x: cx, y: cy });
      }
    }

    if (validMarkers.length < 4) {
      return { corners: null, detected: validMarkers.length };
    }

    // 4. Una marca por cuadrante (la más cercana a cada esquina).
    const pickCorner = (targetX: number, targetY: number, quadX: number, quadY: number): Point2D | null => {
      let best: Point2D | null = null;
      let bestDist = Infinity;
      for (const m of validMarkers) {
        const inQuadrant = (quadX === 0 ? m.x < pw / 2 : m.x >= pw / 2) && (quadY === 0 ? m.y < ph / 2 : m.y >= ph / 2);
        if (!inQuadrant) continue;
        const dist = Math.hypot(m.x - targetX, m.y - targetY);
        if (dist < bestDist) { bestDist = dist; best = m; }
      }
      return best;
    };

    const tl = pickCorner(0, 0, 0, 0);
    const tr = pickCorner(pw, 0, 1, 0);
    const br = pickCorner(pw, ph, 1, 1);
    const bl = pickCorner(0, ph, 0, 1);

    if (!tl || !tr || !br || !bl) {
      return { corners: null, detected: validMarkers.length };
    }

    const invScale = 1.0 / procScale;
    return {
      detected: 4,
      corners: {
        topLeft: { x: Math.round(tl.x * invScale), y: Math.round(tl.y * invScale) },
        topRight: { x: Math.round(tr.x * invScale), y: Math.round(tr.y * invScale) },
        bottomRight: { x: Math.round(br.x * invScale), y: Math.round(br.y * invScale) },
        bottomLeft: { x: Math.round(bl.x * invScale), y: Math.round(bl.y * invScale) },
      },
    };
  }

  /**
   * Valida el patrón "target": núcleo oscuro, anillo claro (~0.30·S) y marco
   * oscuro (~0.45·S) en varias direcciones.
   */
  private static matchesTargetPattern(
    gray: Uint8Array,
    w: number,
    h: number,
    cx: number,
    cy: number,
    size: number
  ): boolean {
    const sample = (x: number, y: number): number => {
      const xi = Math.max(0, Math.min(w - 1, Math.round(x)));
      const yi = Math.max(0, Math.min(h - 1, Math.round(y)));
      return gray[yi * w + xi];
    };

    // Núcleo debe ser oscuro (usa el umbral global aproximado por el mínimo local)
    const center = sample(cx, cy);
    if (center > 140) return false;

    const rLight = size * 0.30;
    const rDark = size * 0.45;
    const dirs = [0, Math.PI / 4, Math.PI / 2, (3 * Math.PI) / 4, Math.PI, (5 * Math.PI) / 4, (3 * Math.PI) / 2, (7 * Math.PI) / 4];

    let lightOk = 0;
    let darkOk = 0;
    for (const a of dirs) {
      const lx = cx + Math.cos(a) * rLight;
      const ly = cy + Math.sin(a) * rLight;
      if (sample(lx, ly) > 150) lightOk++;

      const dx = cx + Math.cos(a) * rDark;
      const dy = cy + Math.sin(a) * rDark;
      if (sample(dx, dy) < 120) darkOk++;
    }

    return lightOk >= 6 && darkOk >= 6;
  }

  /** Componentes conexas de tinta dentro de un rango de tamaño. */
  private static findBlobs(
    black: Uint8Array,
    w: number,
    h: number,
    minSize: number,
    maxSize: number
  ): Blob[] {
    const visited = new Uint8Array(w * h);
    const blobs: Blob[] = [];
    const stack: number[] = [];

    for (let start = 0; start < w * h; start++) {
      if (black[start] !== 1 || visited[start] === 1) continue;

      const blob: Blob = { minX: w, maxX: 0, minY: h, maxY: 0, count: 0 };
      stack.length = 0;
      stack.push(start);
      visited[start] = 1;

      while (stack.length > 0) {
        const idx = stack.pop()!;
        const x = idx % w;
        const y = (idx - x) / w;
        blob.count++;
        if (x < blob.minX) blob.minX = x;
        if (x > blob.maxX) blob.maxX = x;
        if (y < blob.minY) blob.minY = y;
        if (y > blob.maxY) blob.maxY = y;

        // Vecindad 4-conectada
        if (x > 0) { const n = idx - 1; if (black[n] === 1 && visited[n] === 0) { visited[n] = 1; stack.push(n); } }
        if (x < w - 1) { const n = idx + 1; if (black[n] === 1 && visited[n] === 0) { visited[n] = 1; stack.push(n); } }
        if (y > 0) { const n = idx - w; if (black[n] === 1 && visited[n] === 0) { visited[n] = 1; stack.push(n); } }
        if (y < h - 1) { const n = idx + w; if (black[n] === 1 && visited[n] === 0) { visited[n] = 1; stack.push(n); } }
      }

      const size = Math.max(blob.maxX - blob.minX, blob.maxY - blob.minY);
      if (size >= minSize && size <= maxSize) blobs.push(blob);
    }

    return blobs;
  }

  private static computeOtsu(histogram: number[], total: number): number {
    let sum = 0;
    for (let i = 0; i < 256; i++) sum += i * histogram[i];
    let sumB = 0, wB = 0, maxVariance = -1, threshold = 127;
    for (let t = 0; t < 256; t++) {
      wB += histogram[t];
      if (wB === 0) continue;
      const wF = total - wB;
      if (wF === 0) break;
      sumB += t * histogram[t];
      const mB = sumB / wB;
      const mF = (sum - sumB) / wF;
      const between = wB * wF * (mB - mF) * (mB - mF);
      if (between > maxVariance) { maxVariance = between; threshold = t; }
    }
    return threshold;
  }

  /** Fallback con márgenes perimetrales simétricos estándar (ajuste manual). */
  public static getDefaultCorners(rawW: number, rawH: number): QuadCorners {
    return {
      topLeft: { x: Math.round(rawW * 0.08), y: Math.round(rawH * 0.12) },
      topRight: { x: Math.round(rawW * 0.92), y: Math.round(rawH * 0.12) },
      bottomRight: { x: Math.round(rawW * 0.92), y: Math.round(rawH * 0.88) },
      bottomLeft: { x: Math.round(rawW * 0.08), y: Math.round(rawH * 0.88) },
    };
  }
}
