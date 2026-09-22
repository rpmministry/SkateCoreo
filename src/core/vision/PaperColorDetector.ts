/**
 * PaperColorDetector — Segmentación por COLOR (HSV) del "truco del marcador".
 *
 * El usuario dibuja los nodos (círculo + número) con bolígrafo/marcador ROJO o
 * AZUL. Al aislar esos píxeles en HSV, TODA la plantilla impresa (textos, marco,
 * círculo central, etc.) desaparece y solo quedan las manchas manuscritas.
 *
 * Sobre esa máscara limpia, cada componente conexa ES UN NODO: se guarda su
 * centroide (en píxeles del lienzo ALINEADO) para mapearlo a la pista 2D.
 *
 * No requiere OCR ni servicios externos: funciona 100% offline.
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

/** ¿El píxel es tinta ROJA o AZUL (marcador)? */
export function isMarkerInk(r: number, g: number, b: number): boolean {
  const { h, s, v } = rgbToHsv(r, g, b);
  if (v < 0.18) return false; // demasiado oscuro (sombra/negro)
  if (s < 0.28) return false; // poco saturado (papel/grises)

  // ROJO: entorno de 0°/360°
  const isRed = h <= 20 || h >= 340;
  // AZUL: azul de marcador (se excluye el cian de marca, ~189°)
  const isBlue = h >= 200 && h <= 265;

  return isRed || isBlue;
}

export class PaperColorDetector {
  /**
   * Devuelve las manchas de tinta roja/azul de la imagen ALINEADA.
   * Cada mancha es un nodo potencial (círculo o número dibujado por el usuario).
   */
  public static detectInkBlobs(canvas: HTMLCanvasElement): ColorBlob[] {
    const w = canvas.width;
    const h = canvas.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return [];
    const { data } = ctx.getImageData(0, 0, w, h);

    const mask = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) {
      const idx = i * 4;
      mask[i] = isMarkerInk(data[idx], data[idx + 1], data[idx + 2]) ? 1 : 0;
    }

    // Solo se descartan motas de polvo (área mínima relativa muy baja).
    const minArea = Math.max(24, Math.round(w * h * 0.0002));

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

      if (blob.area < minArea) continue;
      blob.cx = (blob.minX + blob.maxX) / 2;
      blob.cy = (blob.minY + blob.maxY) / 2;
      blobs.push(blob);
    }

    return blobs;
  }
}
