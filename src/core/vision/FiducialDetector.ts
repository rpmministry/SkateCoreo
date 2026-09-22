/**
 * FiducialDetector — Detección de las 4 marcas y NORMALIZACIÓN DE ORIENTACIÓN.
 *
 * La plantilla usa una marca ASIMÉTRICA: la esquina superior izquierda (origen)
 * es un cuadrado NEGRO SÓLIDO, mientras que las otras tres son "targets"
 * (cuadrado negro + anillo blanco + núcleo negro). Identificando la marca
 * sólida, el sistema sabe dónde está el (0,0) de la hoja y ordena las demás por
 * ángulo, de modo que la homografía deja la imagen SIEMPRE "de pie" sin leer
 * texto (independiente de que la foto venga a 0/90/180/270).
 *
 * Si no se encuentra la marca sólida (plantilla antigua), se aplica una
 * heurística de diseño (masa de tinta del encabezado) como respaldo.
 */

import { Point2D, QuadCorners } from './HomographyWarp';

export interface MarkerDetectionResult {
  corners: QuadCorners | null;
  /** Marcas válidas encontradas (0–4). */
  detected: number;
  /** Rotación detectada respecto a la hoja "de pie" (0/90/180/270 aprox.). */
  rotationDeg: number;
  /** true si la orientación se fijó con la marca sólida de origen. */
  originFound: boolean;
}

interface Marker {
  x: number;
  y: number;
  size: number;
  kind: 'origin' | 'target';
}

export class FiducialDetector {
  /** Detección estricta + orientación. Devuelve null si no hay 4 marcas fiables. */
  public static detectMarkers(
    image: HTMLImageElement | HTMLCanvasElement
  ): MarkerDetectionResult {
    const rawW = image instanceof HTMLImageElement ? image.naturalWidth : image.width;
    const rawH = image instanceof HTMLImageElement ? image.naturalHeight : image.height;
    if (rawW < 40 || rawH < 40) return { corners: null, detected: 0, rotationDeg: 0, originFound: false };

    const procScale = Math.min(1.0, 700 / rawW);
    const pw = Math.max(1, Math.round(rawW * procScale));
    const ph = Math.max(1, Math.round(rawH * procScale));

    const canvas = document.createElement('canvas');
    canvas.width = pw;
    canvas.height = ph;
    const ctx = canvas.getContext('2d');
    if (!ctx) return { corners: null, detected: 0, rotationDeg: 0, originFound: false };
    ctx.drawImage(image, 0, 0, pw, ph);
    const { data } = ctx.getImageData(0, 0, pw, ph);

    // Escala de grises + Otsu
    const gray = new Uint8Array(pw * ph);
    const histogram = new Array<number>(256).fill(0);
    for (let i = 0; i < pw * ph; i++) {
      const idx = i * 4;
      const lum = Math.round(0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2]);
      gray[i] = lum;
      histogram[lum]++;
    }
    const threshold = this.computeOtsu(histogram, pw * ph);

    const black = new Uint8Array(pw * ph);
    for (let i = 0; i < pw * ph; i++) black[i] = gray[i] <= threshold ? 1 : 0;

    // Marcas: ~1.5 cm sobre 29.7 cm de ancho ≈ 5% del ancho analizado.
    const minSize = Math.max(8, Math.round(pw * 0.02));
    const maxSize = Math.round(pw * 0.12);
    const blobs = this.findBlobs(black, pw, ph, minSize, maxSize);

    const markers: Marker[] = [];
    for (const blob of blobs) {
      const bw = blob.maxX - blob.minX + 1;
      const bh = blob.maxY - blob.minY + 1;
      const aspect = bw / Math.max(1, bh);
      if (aspect < 0.7 || aspect > 1.4) continue;
      const size = Math.max(bw, bh);
      if (size < minSize || size > maxSize) continue;

      const cx = (blob.minX + blob.maxX) / 2;
      const cy = (blob.minY + blob.maxY) / 2;
      const kind = this.classifyMarker(gray, pw, ph, cx, cy, size);
      if (kind) markers.push({ x: cx, y: cy, size, kind });
    }

    // Origen = marca sólida (si existe exactamente una).
    const solids = markers.filter((m) => m.kind === 'origin');
    const targets = markers.filter((m) => m.kind === 'target');

    let originFound = false;
    let corners: QuadCorners | null = null;

    if (solids.length === 1 && targets.length >= 3) {
      originFound = true;
      const origin = solids[0];
      const nearest = this.pickNearestTargets(origin, targets, 3);
      corners = this.orderCornersFromOrigin(origin, nearest);
    } else if (markers.length >= 4) {
      // Respaldo: elegir como origen la marca más "arriba-izquierda" y ordenar.
      const sorted = [...markers].sort((a, b) => a.x + a.y - (b.x + b.y));
      const origin = sorted[0];
      const others = sorted.slice(1, 4);
      corners = this.orderCornersFromOrigin(origin, others);
    }

    const detected = originFound ? 4 : Math.min(markers.length, 4);

    if (!corners || !this.isConvexQuad(corners)) {
      return { corners: null, detected, rotationDeg: 0, originFound };
    }

    const invScale = 1.0 / procScale;
    const scaled: QuadCorners = {
      topLeft: { x: Math.round(corners.topLeft.x * invScale), y: Math.round(corners.topLeft.y * invScale) },
      topRight: { x: Math.round(corners.topRight.x * invScale), y: Math.round(corners.topRight.y * invScale) },
      bottomRight: { x: Math.round(corners.bottomRight.x * invScale), y: Math.round(corners.bottomRight.y * invScale) },
      bottomLeft: { x: Math.round(corners.bottomLeft.x * invScale), y: Math.round(corners.bottomLeft.y * invScale) },
    };

    const rotationDeg = Math.round(
      (Math.atan2(scaled.topRight.y - scaled.topLeft.y, scaled.topRight.x - scaled.topLeft.x) * 180) / Math.PI
    );

    return { corners: scaled, detected: 4, rotationDeg, originFound };
  }

  /**
   * Ordena TR, BR y BL a partir del origen usando el ángulo de cada marca
   * respecto a la dirección "derecha". Es invariante a la rotación de la foto.
   */
  public static orderCornersFromOrigin(origin: Point2D, others: Point2D[]): QuadCorners {
    const sorted = [...others].sort((a, b) => {
      const angA = Math.atan2(a.y - origin.y, a.x - origin.x);
      const angB = Math.atan2(b.y - origin.y, b.x - origin.x);
      return angA - angB;
    });
    return {
      topLeft: origin,
      topRight: sorted[0] ?? origin,
      bottomRight: sorted[1] ?? origin,
      bottomLeft: sorted[2] ?? origin,
    };
  }

  private static pickNearestTargets(origin: Marker, targets: Marker[], count: number): Point2D[] {
    return [...targets]
      .sort(
        (a, b) =>
          Math.hypot(a.x - origin.x, a.y - origin.y) - Math.hypot(b.x - origin.x, b.y - origin.y)
      )
      .slice(0, count)
      .map((m) => ({ x: m.x, y: m.y }));
  }

  private static isConvexQuad(q: QuadCorners): boolean {
    const pts = [q.topLeft, q.topRight, q.bottomRight, q.bottomLeft];
    // Área del cuadrilátero (shoelace); debe ser positiva y significativa.
    let area = 0;
    for (let i = 0; i < 4; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % 4];
      area += a.x * b.y - b.x * a.y;
    }
    return Math.abs(area / 2) > 100;
  }

  /**
   * Clasifica una marca: 'origin' (cuadrado negro sólido) o 'target' (anillo
   * blanco en el 30% del lado y marco oscuro en el 45%).
   */
  private static classifyMarker(
    gray: Uint8Array,
    w: number,
    h: number,
    cx: number,
    cy: number,
    size: number
  ): 'origin' | 'target' | null {
    const sample = (x: number, y: number): number => {
      const xi = Math.max(0, Math.min(w - 1, Math.round(x)));
      const yi = Math.max(0, Math.min(h - 1, Math.round(y)));
      return gray[yi * w + xi];
    };

    // Núcleo debe ser oscuro.
    if (sample(cx, cy) > 140) return null;

    const dirs = [0, Math.PI / 4, Math.PI / 2, (3 * Math.PI) / 4, Math.PI, (5 * Math.PI) / 4, (3 * Math.PI) / 2, (7 * Math.PI) / 4];
    const rInner = size * 0.30;
    const rOuter = size * 0.45;
    let innerLight = 0;
    let outerDark = 0;
    let innerDark = 0;

    for (const a of dirs) {
      const inX = cx + Math.cos(a) * rInner;
      const inY = cy + Math.sin(a) * rInner;
      const v = sample(inX, inY);
      if (v > 150) innerLight++;
      if (v < 120) innerDark++;

      const outX = cx + Math.cos(a) * rOuter;
      const outY = cy + Math.sin(a) * rOuter;
      if (sample(outX, outY) < 120) outerDark++;
    }

    if (innerLight >= 6 && outerDark >= 6) return 'target';
    if (innerDark >= 7 && outerDark >= 6) return 'origin';
    return null;
  }

  private static findBlobs(
    black: Uint8Array,
    w: number,
    h: number,
    minSize: number,
    maxSize: number
  ): Array<{ minX: number; maxX: number; minY: number; maxY: number }> {
    const visited = new Uint8Array(w * h);
    const blobs: Array<{ minX: number; maxX: number; minY: number; maxY: number }> = [];
    const stack: number[] = [];

    for (let start = 0; start < w * h; start++) {
      if (black[start] !== 1 || visited[start] === 1) continue;

      const blob = { minX: w, maxX: 0, minY: h, maxY: 0 };
      stack.length = 0;
      stack.push(start);
      visited[start] = 1;

      while (stack.length > 0) {
        const idx = stack.pop()!;
        const x = idx % w;
        const y = (idx - x) / w;
        if (x < blob.minX) blob.minX = x;
        if (x > blob.maxX) blob.maxX = x;
        if (y < blob.minY) blob.minY = y;
        if (y > blob.maxY) blob.maxY = y;

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
