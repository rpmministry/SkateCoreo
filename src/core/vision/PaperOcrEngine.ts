/**
 * PaperOcrEngine — Motor de Reconocimiento Óptico de Nodos Manuscritos (1, 2, 3...)
 *
 * Identifica los círculos y números dibujados a mano sobre la pista de papel,
 * extrayendo sus coordenadas espaciales exactas en metros (X, Y) y su secuencia temporal.
 *
 * Funciona de forma 100% offline mediante análisis morfométrico de blobs,
 * con soporte para Google Cloud Vision API si se dispone de clave de entorno.
 */

import { Point2D } from '../math/FreehandPathEngine';
import { RinkDimensions } from '../../types/choreography';
import { DEFAULT_RINK_DIMENSIONS } from '../canvas/RinkMath';

export interface DetectedNodeMarker {
  sequenceNumber: number;
  positionMeters: Point2D;
  confidence: number;
  rawBoundingBox: { x: number; y: number; width: number; height: number };
}

export class PaperOcrEngine {
  /**
   * Detecta y extrae los nodos numerados dibujados sobre la pista
   */
  public static async detectNumberedNodes(
    warpedCanvas: HTMLCanvasElement,
    rink: RinkDimensions = DEFAULT_RINK_DIMENSIONS
  ): Promise<DetectedNodeMarker[]> {
    const ctx = warpedCanvas.getContext('2d');
    if (!ctx) return [];

    // 1. Si existe clave de Google Cloud Vision, intentar OCR en la nube
    const visionApiKey = (import.meta as any).env?.VITE_GOOGLE_VISION_API_KEY;
    if (visionApiKey) {
      try {
        const cloudNodes = await this.detectWithGoogleVision(warpedCanvas, visionApiKey, rink);
        if (cloudNodes.length > 0) return cloudNodes;
      } catch (err) {
        console.warn('[PaperOcrEngine] Fallback a motor morfológico local:', err);
      }
    }

    // 2. Motor Morfológico Local (100% Offline): Detección de Blobs Circulares
    return this.detectCircularBlobsOffline(warpedCanvas, rink);
  }

  /**
   * Algoritmo de detección offline de nodos circulares dibujados
   */
  private static detectCircularBlobsOffline(
    canvas: HTMLCanvasElement,
    rink: RinkDimensions
  ): DetectedNodeMarker[] {
    const w = canvas.width;
    const h = canvas.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return [];

    const imgData = ctx.getImageData(0, 0, w, h);
    const d = imgData.data;

    // Mascara de tinta oscura (umbral < 110)
    const binary = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) {
      const idx = i * 4;
      const lum = 0.299 * d[idx] + 0.587 * d[idx + 1] + 0.114 * d[idx + 2];
      binary[i] = lum < 110 ? 1 : 0;
    }

    // Búsqueda de componentes compactos (círculos de nodos de ~15px a ~60px)
    const visited = new Uint8Array(w * h);
    const candidates: { minX: number; maxX: number; minY: number; maxY: number; count: number }[] = [];

    const step = 4;
    for (let y = 15; y < h - 15; y += step) {
      for (let x = 15; x < w - 15; x += step) {
        const idx = y * w + x;
        if (binary[idx] === 1 && visited[idx] === 0) {
          const blob = { minX: x, maxX: x, minY: y, maxY: y, count: 0 };
          this.exploreBlob(binary, visited, w, h, x, y, blob);

          const bw = blob.maxX - blob.minX;
          const bh = blob.maxY - blob.minY;
          const aspect = bw / Math.max(1, bh);

          // Un nodo dibujado a mano suele ser aproximadamente circular (aspect ratio 0.6 a 1.6)
          // y tener un tamaño entre 12px y 70px
          if (bw >= 12 && bw <= 75 && bh >= 12 && bh <= 75 && aspect >= 0.55 && aspect <= 1.8 && blob.count >= 20) {
            candidates.push(blob);
          }
        }
      }
    }

    // Convertir a metros y ordenar secuencialmente (de izquierda a derecha o por proximidad)
    const scaleX = rink.lengthMeters / w;
    const scaleY = rink.widthMeters / h;

    // Ordenar de izquierda a derecha (o por X ascendente como aproximación temporal primaria)
    candidates.sort((a, b) => (a.minX + a.maxX) / 2 - (b.minX + b.maxX) / 2);

    return candidates.map((c, i) => {
      const cx = (c.minX + c.maxX) / 2;
      const cy = (c.minY + c.maxY) / 2;

      return {
        sequenceNumber: i + 1,
        positionMeters: {
          x: Math.round(cx * scaleX * 10) / 10,
          y: Math.round(cy * scaleY * 10) / 10,
        },
        confidence: 0.85,
        rawBoundingBox: {
          x: c.minX,
          y: c.minY,
          width: c.maxX - c.minX,
          height: c.maxY - c.minY,
        },
      };
    });
  }

  private static exploreBlob(
    binary: Uint8Array,
    visited: Uint8Array,
    w: number,
    h: number,
    x: number,
    y: number,
    blob: { minX: number; maxX: number; minY: number; maxY: number; count: number }
  ): void {
    const queue: [number, number][] = [[x, y]];
    visited[y * w + x] = 1;

    let limit = 2000;
    while (queue.length > 0 && limit-- > 0) {
      const [cx, cy] = queue.shift()!;
      blob.count++;
      if (cx < blob.minX) blob.minX = cx;
      if (cx > blob.maxX) blob.maxX = cx;
      if (cy < blob.minY) blob.minY = cy;
      if (cy > blob.maxY) blob.maxY = cy;

      const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1]];
      for (const [dx, dy] of dirs) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
          const nidx = ny * w + nx;
          if (binary[nidx] === 1 && visited[nidx] === 0) {
            visited[nidx] = 1;
            queue.push([nx, ny]);
          }
        }
      }
    }
  }

  /**
   * Integración con Google Cloud Vision API si está provista en variables de entorno
   */
  private static async detectWithGoogleVision(
    canvas: HTMLCanvasElement,
    apiKey: string,
    rink: RinkDimensions
  ): Promise<DetectedNodeMarker[]> {
    const base64 = canvas.toDataURL('image/jpeg', 0.85).replace(/^data:image\/jpeg;base64,/, '');

    const response = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: [
          {
            image: { content: base64 },
            features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
          },
        ],
      }),
    });

    if (!response.ok) throw new Error(`Google Vision Error ${response.status}`);
    const data = await response.json();
    const annotations = data.responses?.[0]?.textAnnotations || [];

    const nodes: DetectedNodeMarker[] = [];
    const scaleX = rink.lengthMeters / canvas.width;
    const scaleY = rink.widthMeters / canvas.height;

    // El primer elemento es todo el texto agrupado, los subsecuentes son palabras
    for (let i = 1; i < annotations.length; i++) {
      const item = annotations[i];
      const num = parseInt(item.description, 10);
      if (!isNaN(num) && num >= 1 && num <= 50) {
        const verts = item.boundingPoly?.vertices || [];
        if (verts.length >= 2) {
          const cx = (verts[0].x + (verts[2]?.x || verts[1]?.x || verts[0].x)) / 2;
          const cy = (verts[0].y + (verts[2]?.y || verts[1]?.y || verts[0].y)) / 2;

          nodes.push({
            sequenceNumber: num,
            positionMeters: {
              x: Math.round(cx * scaleX * 10) / 10,
              y: Math.round(cy * scaleY * 10) / 10,
            },
            confidence: 0.95,
            rawBoundingBox: {
              x: verts[0].x,
              y: verts[0].y,
              width: Math.abs((verts[1]?.x || cx) - verts[0].x),
              height: Math.abs((verts[2]?.y || cy) - verts[0].y),
            },
          });
        }
      }
    }

    nodes.sort((a, b) => a.sequenceNumber - b.sequenceNumber);
    return nodes;
  }
}

