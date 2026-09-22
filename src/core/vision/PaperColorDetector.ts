/**
 * PaperColorDetector — Segmentación por COLOR (HSV) del "truco del marcador".
 *
 * El usuario dibuja los nodos (círculo + número) con bolígrafo/marcador AZUL o
 * ROJO. Al aislar esos píxeles en HSV, TODA la tinta negra/gris de la plantilla
 * impresa (textos, marco, círculo central) desaparece y solo quedan las manchas
 * del marcador. Sobre esa máscara limpia, cada mancha ES UN NODO.
 *
 * Se aplica SIEMPRE sobre la imagen ALINEADA (warp perspective), nunca sobre la
 * foto cruda. El HSV es resistente a cambios de iluminación y sombras.
 *
 * Rangos (equivalentes a OpenCV: H 0-180 / S 0-255 / V 0-255):
 *   · AZUL: H 100–140  → 200°–280° en escala 0-360
 *   · ROJO: H 0–10 y 160–180 → 0°–20° y 320°–360° (se suman ambas máscaras)
 *   · S > 50/255 y V > 50/255
 */

export interface ColorBlob {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  area: number;
  cx: number;
  cy: number;
}

/** Conversión RGB → HSV (H en grados 0-360, S y V en 0-1). */
export function rgbToHsv(r: number, g: number, b: number): { h: number; s: number; v: number } {
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

  const s = max === 0 ? 0 : d / max;
  return { h, s, v: max };
}

/** Umbrales de saturación/valor (OpenCV: 50/255 ≈ 0.196). */
const MIN_SAT = 0.16;
const MIN_VAL = 0.15;

export interface ColorDetectOptions {
  minSat?: number;
  minVal?: number;
  /** Radio de erosión extra (fracción del lado menor). */
  erodeRatio?: number;
  minAspect?: number;
  maxAspect?: number;
  minAreaRatio?: number;
  maxAreaRatio?: number;
}

/** ¿El píxel es tinta de marcador AZUL o ROJO? (Ignora negro/gris/blanco). */
export function isMarkerInk(
  r: number,
  g: number,
  b: number,
  minSat: number = MIN_SAT,
  minVal: number = MIN_VAL
): boolean {
  const { h, s, v } = rgbToHsv(r, g, b);
  if (s < minSat || v < minVal) return false;

  // AZUL (OpenCV H 100–140)
  const isBlue = h >= 200 && h <= 280;
  // ROJO en dos extremos (OpenCV H 0–10 y 160–180)
  const isRed = h <= 20 || h >= 320;

  return isBlue || isRed;
}

export class PaperColorDetector {
  /** Máscara binaria (1 = tinta de color) de la imagen alineada. */
  public static buildMask(canvas: HTMLCanvasElement, options: ColorDetectOptions = {}): Uint8Array {
    const w = canvas.width;
    const h = canvas.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new Uint8Array(0);
    const { data } = ctx.getImageData(0, 0, w, h);

    const minSat = options.minSat ?? MIN_SAT;
    const minVal = options.minVal ?? MIN_VAL;
    const mask = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) {
      const idx = i * 4;
      mask[i] = isMarkerInk(data[idx], data[idx + 1], data[idx + 2], minSat, minVal) ? 1 : 0;
    }

    // Cierre morfológico (dilate → erode): rellena huecos del bolígrafo y une la
    // tinta del número con la del círculo.
    const closeR = Math.max(1, Math.round(Math.min(w, h) * 0.005));
    const dilated = this.morph(mask, w, h, closeR, true);
    const closed = this.morph(dilated, w, h, closeR, false);

    // Erosión controlada: adelgaza los trazos finos (líneas) sin destruir los
    // círculos. Configurable por si la hoja tiene trazos gruesos/finos.
    const erodeR = Math.max(0, Math.round(Math.min(w, h) * (options.erodeRatio ?? 0.004)));
    return erodeR > 0 ? this.morph(closed, w, h, erodeR, false) : closed;
  }

  /** Canvas de la máscara: fondo NEGRO puro y trazos de color en BLANCO puro. */
  public static buildMaskCanvas(canvas: HTMLCanvasElement): HTMLCanvasElement {
    const w = canvas.width;
    const h = canvas.height;
    const mask = this.buildMask(canvas);

    const out = document.createElement('canvas');
    out.width = w;
    out.height = h;
    const octx = out.getContext('2d');
    if (octx) {
      const img = octx.createImageData(w, h);
      for (let i = 0; i < w * h; i++) {
        const v = mask[i] === 1 ? 255 : 0;
        const idx = i * 4;
        img.data[idx] = v;
        img.data[idx + 1] = v;
        img.data[idx + 2] = v;
        img.data[idx + 3] = 255;
      }
      octx.putImageData(img, 0, 0);
    }
    return out;
  }

  /**
   * FILTRO GEOMÉTRICO ANTI-LÍNEAS: un nodo (círculo) es ~1:1; una línea de
   * recorrido es muy alargada. Solo se acepta 0.6 ≤ w/h ≤ 1.6.
   */
  public static passesAspectFilter(bw: number, bh: number, min = 0.6, max = 1.6): boolean {
    if (bw <= 0 || bh <= 0) return false;
    const aspect = bw / bh;
    return aspect >= min && aspect <= max;
  }

  /**
   * Componentes conexas de la máscara (ya cerrada). Filtro de ruido:
   * área entre 0.2% y 5% de la imagen. Cada mancha es un nodo.
   */
  public static detectInkBlobs(canvas: HTMLCanvasElement, options: ColorDetectOptions = {}): ColorBlob[] {
    const w = canvas.width;
    const h = canvas.height;
    if (w <= 0 || h <= 0) return [];

    const mask = this.buildMask(canvas, options);
    if (mask.length === 0) return [];

    const total = w * h;
    const minArea = Math.round(total * (options.minAreaRatio ?? 0.002)); // 0.2%
    const maxArea = Math.round(total * (options.maxAreaRatio ?? 0.05));  // 5%
    const minAspect = options.minAspect ?? 0.5;
    const maxAspect = options.maxAspect ?? 2.0;

    const visited = new Uint8Array(w * h);
    const blobs: ColorBlob[] = [];
    const stack: number[] = [];

    for (let start = 0; start < w * h; start++) {
      if (mask[start] !== 1 || visited[start] === 1) continue;

      const blob: ColorBlob = { minX: w, maxX: 0, minY: h, maxY: 0, area: 0, cx: 0, cy: 0 };
      stack.length = 0;
      stack.push(start);
      visited[start] = 1;

      while (stack.length > 0) {
        const idx = stack.pop()!;
        const x = idx % w;
        const y = (idx - x) / w;
        blob.area++;
        if (x < blob.minX) blob.minX = x;
        if (x > blob.maxX) blob.maxX = x;
        if (y < blob.minY) blob.minY = y;
        if (y > blob.maxY) blob.maxY = y;

        if (x > 0) { const n = idx - 1; if (mask[n] === 1 && visited[n] === 0) { visited[n] = 1; stack.push(n); } }
        if (x < w - 1) { const n = idx + 1; if (mask[n] === 1 && visited[n] === 0) { visited[n] = 1; stack.push(n); } }
        if (y > 0) { const n = idx - w; if (mask[n] === 1 && visited[n] === 0) { visited[n] = 1; stack.push(n); } }
        if (y < h - 1) { const n = idx + w; if (mask[n] === 1 && visited[n] === 0) { visited[n] = 1; stack.push(n); } }
      }

      if (blob.area < minArea || blob.area > maxArea) continue;

      // ── FILTRO GEOMÉTRICO ANTI-LÍNEAS ──────────────────────────────────
      // Un nodo (círculo) es ~1:1; una línea de recorrido es muy alargada.
      const bw = blob.maxX - blob.minX + 1;
      const bh = blob.maxY - blob.minY + 1;
      if (!this.passesAspectFilter(bw, bh, minAspect, maxAspect)) continue;

      blob.cx = (blob.minX + blob.maxX) / 2;
      blob.cy = (blob.minY + blob.maxY) / 2;
      blobs.push(blob);
    }

    return blobs;
  }

  /**
   * Detección ADAPTATIVA: si los ajustes estrictos no devuelven nodos, prueba
   * presets progresivamente más tolerantes (menos erosión, aspecto más amplio,
   * umbrales de color más bajos). Mantiene el filtro anti-líneas por aspecto.
   */
  public static detectInkBlobsAdaptive(canvas: HTMLCanvasElement): ColorBlob[] {
    const presets: ColorDetectOptions[] = [
      {}, // ajustes recomendados
      { erodeRatio: 0.002, minAspect: 0.4, maxAspect: 2.6, minSat: 0.12, minVal: 0.12, minAreaRatio: 0.0012 },
      { erodeRatio: 0, minAspect: 0.35, maxAspect: 3.2, minSat: 0.1, minVal: 0.1, minAreaRatio: 0.001 },
    ];

    for (const preset of presets) {
      const blobs = this.detectInkBlobs(canvas, preset);
      if (blobs.length > 0) return blobs;
    }
    return [];
  }

  /**
   * Filtro morfológico separable (máximo para dilatar, mínimo para erosionar)
   * con radio `r`. Coste O(w·h·r) en lugar de O(w·h·r²).
   */
  private static morph(
    src: Uint8Array,
    w: number,
    h: number,
    r: number,
    dilate: boolean
  ): Uint8Array {
    const tmp = new Uint8Array(w * h);
    const out = new Uint8Array(w * h);
    const pick = dilate ? 1 : 0;
    const other = dilate ? 0 : 1;

    // Horizontal
    for (let y = 0; y < h; y++) {
      const row = y * w;
      for (let x = 0; x < w; x++) {
        let value = other;
        for (let dx = -r; dx <= r; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= w) continue;
          if (src[row + nx] === pick) { value = pick; break; }
        }
        tmp[row + x] = value;
      }
    }
    // Vertical
    for (let x = 0; x < w; x++) {
      for (let y = 0; y < h; y++) {
        let value = other;
        for (let dy = -r; dy <= r; dy++) {
          const ny = y + dy;
          if (ny < 0 || ny >= h) continue;
          if (tmp[ny * w + x] === pick) { value = pick; break; }
        }
        out[y * w + x] = value;
      }
    }
    return out;
  }
}
