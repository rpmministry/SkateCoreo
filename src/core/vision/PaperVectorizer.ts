/**
 * PaperVectorizer — Vectorizador de Trazos Físicos de Marcador sobre la Pista
 *
 * Procesa la imagen rectificada (2:1 ortogonal), aísla la tinta oscura del marcador
 * respecto a la cuadrícula de fondo, y genera trazos vectoriales suaves utilizando
 * el algoritmo de simplificación Ramer-Douglas-Peucker (RDP).
 */

import { Point2D, FreehandPathEngine } from '../math/FreehandPathEngine';
import { RinkDimensions } from '../../types/choreography';
import { DEFAULT_RINK_DIMENSIONS } from '../canvas/RinkMath';

export interface VectorizedStroke {
  id: string;
  pointsMeters: Point2D[];
  rawPixelCount: number;
}

export class PaperVectorizer {
  /**
   * Extrae los trazos de tinta a mano alzada de la imagen rectificada
   * y los proyecta a metros reglamentarios (0-50m, 0-25m).
   */
  public static extractStrokes(
    warpedCanvas: HTMLCanvasElement,
    rink: RinkDimensions = DEFAULT_RINK_DIMENSIONS,
    options: {
      threshold?: number;       // Umbral de oscuridad (0-255). Tinta de marcador suele ser < 110
      minStrokeLength?: number; // Longitud mínima de puntos para descartar manchas o motas
      rdpToleranceMeters?: number; // Tolerancia RDP (ej. 0.35m para preservar bucles y curvas)
    } = {}
  ): VectorizedStroke[] {
    const {
      threshold = 115,
      minStrokeLength = 15,
      rdpToleranceMeters = 0.35,
    } = options;

    const width = warpedCanvas.width;
    const height = warpedCanvas.height;

    const ctx = warpedCanvas.getContext('2d');
    if (!ctx) return [];

    const imgData = ctx.getImageData(0, 0, width, height);
    const d = imgData.data;

    // 1. Crear máscara binaria de tinta (1 = tinta oscura, 0 = papel / cuadrícula clara)
    const binary = new Uint8Array(width * height);
    for (let i = 0; i < width * height; i++) {
      const idx = i * 4;
      const r = d[idx];
      const g = d[idx + 1];
      const b = d[idx + 2];
      // Luminancia
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;

      // La tinta es oscura; el papel y la cuadrícula fina tienen lum > 170
      binary[i] = lum < threshold ? 1 : 0;
    }

    // 2. Extraer cadenas continuas de píxeles (Tracing / DFS de componentes conectados)
    const visited = new Uint8Array(width * height);
    const rawPaths: Point2D[][] = [];

    // Muestreo con paso de 3px para balance óptimo de velocidad y precisión
    const step = 3;
    for (let y = 10; y < height - 10; y += step) {
      for (let x = 10; x < width - 10; x += step) {
        const idx = y * width + x;
        if (binary[idx] === 1 && visited[idx] === 0) {
          const currentPath: Point2D[] = [];
          this.traceComponent(binary, visited, width, height, x, y, currentPath);

          if (currentPath.length >= minStrokeLength) {
            rawPaths.push(currentPath);
          }
        }
      }
    }

    // 3. Proyectar a metros y simplificar con Ramer-Douglas-Peucker
    const scaleX = rink.lengthMeters / width;
    const scaleY = rink.widthMeters / height;

    const vectorized: VectorizedStroke[] = [];

    rawPaths.forEach((rawPath, index) => {
      // Convertir a metros
      const metersPath: Point2D[] = rawPath.map((p) => ({
        x: Math.round(p.x * scaleX * 100) / 100,
        y: Math.round(p.y * scaleY * 100) / 100,
      }));

      // Simplificar con RDP conservando arcos, bucles y círculos
      const simplified = FreehandPathEngine.simplifyRDP(metersPath, rdpToleranceMeters);

      if (simplified.length >= 2) {
        vectorized.push({
          id: `stroke-vector-${index + 1}`,
          pointsMeters: simplified,
          rawPixelCount: rawPath.length,
        });
      }
    });

    return vectorized;
  }

  /**
   * Recorrido voraz de píxeles adyacentes para armar la línea continua
   */
  private static traceComponent(
    binary: Uint8Array,
    visited: Uint8Array,
    w: number,
    h: number,
    startX: number,
    startY: number,
    outPath: Point2D[]
  ): void {
    let curX = startX;
    let curY = startY;

    // Vecindad de 8 direcciones
    const dxs = [1, 1, 0, -1, -1, -1, 0, 1];
    const dys = [0, 1, 1, 1, 0, -1, -1, -1];

    let maxSteps = 4000;
    while (maxSteps-- > 0) {
      const idx = curY * w + curX;
      visited[idx] = 1;
      outPath.push({ x: curX, y: curY });

      // Buscar siguiente vecino de tinta no visitado
      let nextX = -1;
      let nextY = -1;

      for (let i = 0; i < 8; i++) {
        const nx = curX + dxs[i];
        const ny = curY + dys[i];
        if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
          const nidx = ny * w + nx;
          if (binary[nidx] === 1 && visited[nidx] === 0) {
            nextX = nx;
            nextY = ny;
            break;
          }
        }
      }

      if (nextX === -1) {
        // Mirar si hay un salto de 2-3px en la misma dirección
        for (let r = 2; r <= 3; r++) {
          for (let i = 0; i < 8; i++) {
            const nx = curX + dxs[i] * r;
            const ny = curY + dys[i] * r;
            if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
              const nidx = ny * w + nx;
              if (binary[nidx] === 1 && visited[nidx] === 0) {
                nextX = nx;
                nextY = ny;
                break;
              }
            }
          }
          if (nextX !== -1) break;
        }
      }

      if (nextX === -1) break; // Fin de la línea
      curX = nextX;
      curY = nextY;
    }
  }
}

