/**
 * HomographyWarp — Motor de Homografía Proyectiva 2D y Corrección de Perspectiva (Perspective Warp)
 *
 * Transforma un cuadrilátero arbitrario (foto inclinada tomada por la entrenadora)
 * a una vista ortogonal plana y rectificada con relación de aspecto reglamentaria 2:1 (50x25m).
 *
 * Utiliza mapeo inverso (Inverse Mapping) con interpolación bilineal de sub-píxel
 * para evitar artefactos de muestreo o vacíos en la imagen resultante.
 */

export interface Point2D {
  x: number;
  y: number;
}

export interface QuadCorners {
  topLeft: Point2D;
  topRight: Point2D;
  bottomRight: Point2D;
  bottomLeft: Point2D;
}

export class HomographyWarp {
  /**
   * Resuelve el sistema lineal de 8 ecuaciones para calcular la matriz de homografía 3x3
   * que mapea puntos de origen (src) a puntos de destino (dst).
   */
  public static findHomography(
    src: [Point2D, Point2D, Point2D, Point2D],
    dst: [Point2D, Point2D, Point2D, Point2D]
  ): number[] {
    const A: number[][] = [];
    const b: number[] = [];

    for (let i = 0; i < 4; i++) {
      const { x: sx, y: sy } = src[i];
      const { x: dx, y: dy } = dst[i];

      // Ecuación 1 para dx
      A.push([sx, sy, 1, 0, 0, 0, -dx * sx, -dx * sy]);
      b.push(dx);

      // Ecuación 2 para dy
      A.push([0, 0, 0, sx, sy, 1, -dy * sx, -dy * sy]);
      b.push(dy);
    }

    // Eliminación gaussiana con pivoteo parcial para resolver A * h = b
    const h = this.solveGaussian(A, b);
    return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1.0];
  }

  /**
   * Mapeo analítico directo de un punto (x, y) a través de la matriz de homografía 3x3
   */
  public static transformPoint(p: Point2D, H: number[]): Point2D {
    const w = H[6] * p.x + H[7] * p.y + H[8];
    const safeW = Math.abs(w) < 1e-7 ? 1e-7 : w;
    return {
      x: (H[0] * p.x + H[1] * p.y + H[2]) / safeW,
      y: (H[3] * p.x + H[4] * p.y + H[5]) / safeW,
    };
  }

  /**
   * Aplica la corrección de perspectiva a un elemento de imagen o Canvas origen,
   * produciendo un nuevo Canvas ortogonal plano con las dimensiones solicitadas.
   */
  public static warpPerspective(
    sourceImage: HTMLImageElement | HTMLCanvasElement,
    corners: QuadCorners,
    targetWidth: number = 2000,
    targetHeight: number = 1000
  ): HTMLCanvasElement {
    // 1. Obtener píxeles de la imagen origen en un canvas auxiliar
    const srcCanvas = document.createElement('canvas');
    srcCanvas.width = sourceImage instanceof HTMLImageElement ? sourceImage.naturalWidth : sourceImage.width;
    srcCanvas.height = sourceImage instanceof HTMLImageElement ? sourceImage.naturalHeight : sourceImage.height;
    const srcCtx = srcCanvas.getContext('2d');
    if (!srcCtx) throw new Error('No se pudo crear contexto 2D para imagen origen');

    srcCtx.drawImage(sourceImage, 0, 0);
    const srcData = srcCtx.getImageData(0, 0, srcCanvas.width, srcCanvas.height);
    const srcPixels = srcData.data;
    const sw = srcCanvas.width;
    const sh = srcCanvas.height;

    // 2. Definir esquinas destino rectificadas
    const dstCorners: [Point2D, Point2D, Point2D, Point2D] = [
      { x: 0, y: 0 },
      { x: targetWidth, y: 0 },
      { x: targetWidth, y: targetHeight },
      { x: 0, y: targetHeight },
    ];

    const srcPoints: [Point2D, Point2D, Point2D, Point2D] = [
      corners.topLeft,
      corners.topRight,
      corners.bottomRight,
      corners.bottomLeft,
    ];

    // Para evitar huecos e interpolar suavemente, calculamos la homografía inversa
    // Destino (ortogonal) -> Origen (foto inclinada)
    const Hinv = this.findHomography(dstCorners, srcPoints);

    // 3. Crear canvas destino
    const outCanvas = document.createElement('canvas');
    outCanvas.width = targetWidth;
    outCanvas.height = targetHeight;
    const outCtx = outCanvas.getContext('2d');
    if (!outCtx) throw new Error('No se pudo crear contexto 2D para imagen destino');

    const outData = outCtx.createImageData(targetWidth, targetHeight);
    const outPixels = outData.data;

    const [h0, h1, h2, h3, h4, h5, h6, h7, h8] = Hinv;

    // 4. Mapeo inverso con interpolación bilineal
    let outIdx = 0;
    for (let dy = 0; dy < targetHeight; dy++) {
      for (let dx = 0; dx < targetWidth; dx++) {
        const denom = h6 * dx + h7 * dy + h8;
        const safeDenom = Math.abs(denom) < 1e-7 ? 1e-7 : denom;
        const sx = (h0 * dx + h1 * dy + h2) / safeDenom;
        const sy = (h3 * dx + h4 * dy + h5) / safeDenom;

        if (sx >= 0 && sx < sw - 1 && sy >= 0 && sy < sh - 1) {
          const x0 = Math.floor(sx);
          const y0 = Math.floor(sy);
          const x1 = x0 + 1;
          const y1 = y0 + 1;

          const wx = sx - x0;
          const wy = sy - y0;
          const w00 = (1 - wx) * (1 - wy);
          const w10 = wx * (1 - wy);
          const w01 = (1 - wx) * wy;
          const w11 = wx * wy;

          const idx00 = (y0 * sw + x0) * 4;
          const idx10 = (y0 * sw + x1) * 4;
          const idx01 = (y1 * sw + x0) * 4;
          const idx11 = (y1 * sw + x1) * 4;

          outPixels[outIdx] = Math.round(
            srcPixels[idx00] * w00 + srcPixels[idx10] * w10 + srcPixels[idx01] * w01 + srcPixels[idx11] * w11
          );
          outPixels[outIdx + 1] = Math.round(
            srcPixels[idx00 + 1] * w00 + srcPixels[idx10 + 1] * w10 + srcPixels[idx01 + 1] * w01 + srcPixels[idx11 + 1] * w11
          );
          outPixels[outIdx + 2] = Math.round(
            srcPixels[idx00 + 2] * w00 + srcPixels[idx10 + 2] * w10 + srcPixels[idx01 + 2] * w01 + srcPixels[idx11 + 2] * w11
          );
          outPixels[outIdx + 3] = 255;
        } else {
          // Fuera de los límites de la foto: negro transparente
          outPixels[outIdx] = 0;
          outPixels[outIdx + 1] = 0;
          outPixels[outIdx + 2] = 0;
          outPixels[outIdx + 3] = 0;
        }

        outIdx += 4;
      }
    }

    outCtx.putImageData(outData, 0, 0);
    return outCanvas;
  }

  /**
   * Resuelve sistema lineal A * x = b usando eliminación gaussiana con pivoteo parcial
   */
  private static solveGaussian(A: number[][], b: number[]): number[] {
    const n = b.length;
    const M: number[][] = A.map((row, i) => [...row, b[i]]);

    for (let i = 0; i < n; i++) {
      // Pivoteo parcial
      let maxRow = i;
      for (let k = i + 1; k < n; k++) {
        if (Math.abs(M[k][i]) > Math.abs(M[maxRow][i])) {
          maxRow = k;
        }
      }
      const tmp = M[i];
      M[i] = M[maxRow];
      M[maxRow] = tmp;

      if (Math.abs(M[i][i]) < 1e-12) continue;

      for (let k = i + 1; k < n; k++) {
        const factor = M[k][i] / M[i][i];
        for (let j = i; j <= n; j++) {
          M[k][j] -= factor * M[i][j];
        }
      }
    }

    // Sustitución regresiva
    const x: number[] = new Array(n).fill(0);
    for (let i = n - 1; i >= 0; i--) {
      let sum = M[i][n];
      for (let j = i + 1; j < n; j++) {
        sum -= M[i][j] * x[j];
      }
      x[i] = Math.abs(M[i][i]) > 1e-12 ? sum / M[i][i] : 0;
    }

    return x;
  }
}

