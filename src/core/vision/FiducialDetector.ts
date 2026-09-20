/**
 * FiducialDetector — Detector Automático de Marcas Fiduciales en la Hoja de Coreografía
 *
 * Localiza los 4 marcadores de calibración de alto contraste impresos en las esquinas
 * de la plantilla reglamentaria A4 (Top-Left, Top-Right, Bottom-Right, Bottom-Left).
 */

import { Point2D, QuadCorners } from './HomographyWarp';

export class FiducialDetector {
  /**
   * Intenta detectar automáticamente las 4 marcas fiduciales en la imagen.
   * Si la detección en algún cuadrante falla o es ambigua, provee un fallback seguro
   * con márgenes estándar para que la entrenadora ajuste los pines con la lupa interactiva.
   */
  public static detectCorners(
    image: HTMLImageElement | HTMLCanvasElement
  ): QuadCorners {
    const rawW = image instanceof HTMLImageElement ? image.naturalWidth : image.width;
    const rawH = image instanceof HTMLImageElement ? image.naturalHeight : image.height;

    // Escala de procesamiento para análisis rápido (~600px de ancho)
    const procScale = Math.min(1.0, 600 / rawW);
    const pw = Math.round(rawW * procScale);
    const ph = Math.round(rawH * procScale);

    const canvas = document.createElement('canvas');
    canvas.width = pw;
    canvas.height = ph;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return this.getDefaultCorners(rawW, rawH);
    }

    ctx.drawImage(image, 0, 0, pw, ph);
    const imgData = ctx.getImageData(0, 0, pw, ph);
    const d = imgData.data;

    // Convertir a escala de grises
    const gray = new Uint8Array(pw * ph);
    for (let i = 0; i < pw * ph; i++) {
      const idx = i * 4;
      // Luminancia estándar rec.601
      gray[i] = Math.round(0.299 * d[idx] + 0.587 * d[idx + 1] + 0.114 * d[idx + 2]);
    }

    // Búsqueda de centroide fiducial en cada cuadrante (margen entre 4% y 35% de los bordes)
    const marginX = Math.round(pw * 0.04);
    const marginY = Math.round(ph * 0.04);
    const searchW = Math.round(pw * 0.32);
    const searchH = Math.round(ph * 0.32);

    const tlProc = this.findMarkerInRegion(gray, pw, marginX, marginY, searchW, searchH);
    const trProc = this.findMarkerInRegion(gray, pw, pw - marginX - searchW, marginY, searchW, searchH);
    const brProc = this.findMarkerInRegion(gray, pw, pw - marginX - searchW, ph - marginY - searchH, searchW, searchH);
    const blProc = this.findMarkerInRegion(gray, pw, marginX, ph - marginY - searchH, searchW, searchH);

    // Escalar coordenadas detectadas a la resolución nativa de la foto
    const invScale = 1.0 / procScale;

    return {
      topLeft: tlProc ? { x: Math.round(tlProc.x * invScale), y: Math.round(tlProc.y * invScale) } : { x: Math.round(rawW * 0.08), y: Math.round(rawH * 0.12) },
      topRight: trProc ? { x: Math.round(trProc.x * invScale), y: Math.round(trProc.y * invScale) } : { x: Math.round(rawW * 0.92), y: Math.round(rawH * 0.12) },
      bottomRight: brProc ? { x: Math.round(brProc.x * invScale), y: Math.round(brProc.y * invScale) } : { x: Math.round(rawW * 0.92), y: Math.round(rawH * 0.88) },
      bottomLeft: blProc ? { x: Math.round(blProc.x * invScale), y: Math.round(blProc.y * invScale) } : { x: Math.round(rawW * 0.08), y: Math.round(rawH * 0.88) },
    };
  }

  /**
   * Busca el punto con mayor densidad de contraste / cruce fiducial en una región
   */
  private static findMarkerInRegion(
    gray: Uint8Array,
    imgW: number,
    rx: number,
    ry: number,
    rw: number,
    rh: number
  ): Point2D | null {
    let bestScore = -1;
    let bestX = -1;
    let bestY = -1;

    const kernelRadius = 4;

    for (let y = ry + kernelRadius; y < ry + rh - kernelRadius; y += 2) {
      for (let x = rx + kernelRadius; x < rx + rw - kernelRadius; x += 2) {
        // Muestrear vecindario 9x9 para medir si es una cruz oscura rodeada de blanco
        let centerVal = 0;
        let count = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            centerVal += gray[(y + dy) * imgW + (x + dx)];
            count++;
          }
        }
        centerVal /= count;

        let surroundVal = 0;
        let sCount = 0;
        for (let r = 3; r <= kernelRadius; r++) {
          surroundVal += gray[(y - r) * imgW + x];
          surroundVal += gray[(y + r) * imgW + x];
          surroundVal += gray[y * imgW + (x - r)];
          surroundVal += gray[y * imgW + (x + r)];
          sCount += 4;
        }
        surroundVal /= sCount;

        // Marcador fiducial oscuro en centro rodeado de marco claro
        const contrast = surroundVal - centerVal;
        if (contrast > bestScore && contrast > 30) {
          bestScore = contrast;
          bestX = x;
          bestY = y;
        }
      }
    }

    if (bestScore > 35 && bestX !== -1 && bestY !== -1) {
      return { x: bestX, y: bestY };
    }

    return null;
  }

  /**
   * Fallback con márgenes perimetrales simétricos estándar
   */
  public static getDefaultCorners(rawW: number, rawH: number): QuadCorners {
    return {
      topLeft: { x: Math.round(rawW * 0.08), y: Math.round(rawH * 0.12) },
      topRight: { x: Math.round(rawW * 0.92), y: Math.round(rawH * 0.12) },
      bottomRight: { x: Math.round(rawW * 0.92), y: Math.round(rawH * 0.88) },
      bottomLeft: { x: Math.round(rawW * 0.08), y: Math.round(rawH * 0.88) },
    };
  }
}

