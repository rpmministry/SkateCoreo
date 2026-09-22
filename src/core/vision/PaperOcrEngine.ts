/**
 * PaperOcrEngine — Reconocimiento de nodos con IA de visión + segmentación por color.
 *
 * Se ABANDONA Tesseract (no lee números manuscritos dentro de círculos). Dos rutas:
 *
 *  OPCIÓN 1 · HTR en la nube (si `VITE_GOOGLE_VISION_API_KEY` está configurada):
 *    Google Cloud Vision (Document Text Detection) lee el número manuscrito y su
 *    bounding box con alta precisión, ignorando el círculo. Se filtran tokens
 *    ^\d+$ y se crea un nodo por número.
 *
 *  OPCIÓN 2 · "Truco del marcador" (offline, por defecto):
 *    El usuario dibuja con bolígrafo/marcador ROJO o AZUL. Se aísla esa tinta en
 *    HSV, desapareciendo la plantilla impresa; cada mancha es un nodo. El número
 *    se puede digitar a mano tocando el nodo en la Pista 2D.
 *
 * REGLA ABSOLUTA DE COORDENADAS: todo se calcula SOBRE LA IMAGEN YA ALINEADA
 * (warp perspective con las 4 marcas), nunca sobre la foto original.
 */

import { Point2D } from '../math/FreehandPathEngine';
import { RinkDimensions } from '../../types/choreography';
import { DEFAULT_RINK_DIMENSIONS } from '../canvas/RinkMath';
import { PaperColorDetector } from './PaperColorDetector';

export interface DetectedNodeMarker {
  /** Número leído por la IA. 0 = no reconocido (usuario lo digita a mano). */
  sequenceNumber: number;
  positionMeters: Point2D;
  confidence: number;
  rawBoundingBox: { x: number; y: number; width: number; height: number };
  /** true si el número aún no se conoce (nodo pendiente de edición). */
  unrecognized: boolean;
}

export interface OcrDebugEntry {
  x: number;
  y: number;
  radius: number;
  text: string;
  accepted: boolean;
  rejected?: boolean;
  reason?: string;
}

export interface OcrResult {
  nodes: DetectedNodeMarker[];
  debug: OcrDebugEntry[];
  method: 'vision' | 'color' | 'none';
}

/* Umbrales conservados para utilidades de validación/portabilidad. */
const MIN_AREA_RATIO = 0.0015;
const MAX_AREA_RATIO = 0.035;
const MIN_ASPECT = 0.6;
const MAX_ASPECT = 1.5;

/** Token numérico válido: solo dígitos (^\\d+$) y en rango razonable de nodos. */
function parseSequenceToken(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const token = String(raw).trim();
  if (!/^\d+$/.test(token)) return null;
  const value = Number.parseInt(token, 10);
  if (!Number.isFinite(value) || value < 1 || value > 99) return null;
  return value;
}

export class PaperOcrEngine {
  public static async detectNumberedNodes(
    warpedCanvas: HTMLCanvasElement,
    rink: RinkDimensions = DEFAULT_RINK_DIMENSIONS,
    binarized?: HTMLCanvasElement
  ): Promise<DetectedNodeMarker[]> {
    return (await this.detectNumberedNodesWithDebug(warpedCanvas, rink, binarized)).nodes;
  }

  public static async detectNumberedNodesWithDebug(
    warpedCanvas: HTMLCanvasElement,
    rink: RinkDimensions = DEFAULT_RINK_DIMENSIONS,
    _binarized?: HTMLCanvasElement
  ): Promise<OcrResult> {
    const w = warpedCanvas.width;
    const h = warpedCanvas.height;
    if (w <= 0 || h <= 0) return { nodes: [], debug: [], method: 'none' };

    // ── OPCIÓN 1: HTR en la nube (Google Cloud Vision) ─────────────────────
    const visionApiKey = (import.meta as any).env?.VITE_GOOGLE_VISION_API_KEY;
    if (visionApiKey) {
      try {
        const cloudNodes = await this.detectWithGoogleVision(warpedCanvas, visionApiKey, rink);
        const nodes = this.sanitize(cloudNodes, rink);
        if (nodes.length > 0) {
          const debug: OcrDebugEntry[] = nodes.map((n) => ({
            x: (n.positionMeters.x / rink.lengthMeters) * w,
            y: (n.positionMeters.y / rink.widthMeters) * h,
            radius: Math.max(8, Math.max(n.rawBoundingBox.width, n.rawBoundingBox.height) / 2),
            text: String(n.sequenceNumber),
            accepted: true,
          }));
          return { nodes, debug, method: 'vision' };
        }
      } catch (err) {
        console.warn('[PaperOcrEngine] Falló Cloud Vision; se usará el modo color:', err);
      }
    }

    // ── OPCIÓN 2: segmentación por COLOR (offline, fail-safe) ──────────────
    // Cada mancha ROJA/AZUL es un nodo. El número se digita tocando el nodo.
    const blobs = PaperColorDetector.detectInkBlobs(warpedCanvas);
    if (blobs.length > 0) {
      const nodes: DetectedNodeMarker[] = blobs.map((b) => ({
        sequenceNumber: 0,
        positionMeters: this.pixelsToMeters(b.cx, b.cy, w, h, rink),
        confidence: 0.5,
        rawBoundingBox: {
          x: b.minX,
          y: b.minY,
          width: b.maxX - b.minX,
          height: b.maxY - b.minY,
        },
        unrecognized: true,
      }));

      const debug: OcrDebugEntry[] = blobs.map((b) => ({
        x: b.cx,
        y: b.cy,
        radius: Math.max(b.maxX - b.minX, b.maxY - b.minY) / 2,
        text: '',
        accepted: true,
        reason: 'Nodo por color · digita el número con doble clic',
      }));

      return { nodes: this.sanitize(nodes, rink), debug, method: 'color' };
    }

    // Sin IA ni manchas de color → 0 nodos (nunca fantasmas).
    return { nodes: [], debug: [], method: 'none' };
  }

  /* ══════════════════════════════════════════════════════════════════════
     MAPEO DE COORDENADAS (estricto)
     ══════════════════════════════════════════════════════════════════════ */

  /**
   * Centroide (px de la imagen ALINEADA) → metros de pista.
   *   metro = px × (tamaño_pista / tamaño_imagen_normalizada)
   * Es la misma relación que usa el lienzo 2D (metros → px de pantalla).
   */
  public static pixelsToMeters(
    cx: number,
    cy: number,
    warpedW: number,
    warpedH: number,
    rink: RinkDimensions = DEFAULT_RINK_DIMENSIONS
  ): Point2D {
    if (warpedW <= 0 || warpedH <= 0) return { x: 0, y: 0 };
    return {
      x: Math.round((cx * (rink.lengthMeters / warpedW)) * 10) / 10,
      y: Math.round((cy * (rink.widthMeters / warpedH)) * 10) / 10,
    };
  }

  /** Valida un candidato por área relativa (0.15–3.5%). */
  public static passesAreaFilter(bboxArea: number, totalArea: number): boolean {
    if (totalArea <= 0) return false;
    const ratio = bboxArea / totalArea;
    return ratio >= MIN_AREA_RATIO && ratio <= MAX_AREA_RATIO;
  }

  /** Valida un candidato por área y proporción (0.6–1.5). */
  public static isCircleCandidate(
    bboxW: number,
    bboxH: number,
    area: number,
    minArea: number,
    maxArea: number
  ): boolean {
    if (bboxW <= 0 || bboxH <= 0) return false;
    if (area < minArea || area > maxArea) return false;
    const aspect = bboxW / bboxH;
    if (aspect < MIN_ASPECT || aspect > MAX_ASPECT) return false;
    return true;
  }

  /* ══════════════════════════════════════════════════════════════════════
     VALIDACIÓN (fail-safe)
     ══════════════════════════════════════════════════════════════════════ */

  private static sanitize(nodes: DetectedNodeMarker[], rink: RinkDimensions): DetectedNodeMarker[] {
    const recognized = new Map<number, DetectedNodeMarker>();
    const unrecognized: DetectedNodeMarker[] = [];

    for (const node of nodes) {
      if (
        node.positionMeters.x < 0 ||
        node.positionMeters.x > rink.lengthMeters ||
        node.positionMeters.y < 0 ||
        node.positionMeters.y > rink.widthMeters
      ) {
        continue;
      }
      const bb = node.rawBoundingBox;
      if (!bb || bb.width <= 0 || bb.height <= 0) continue;

      const seq = node.sequenceNumber;
      if (seq >= 1) {
        const existing = recognized.get(seq);
        if (!existing || node.confidence > existing.confidence) {
          recognized.set(seq, { ...node, sequenceNumber: seq, unrecognized: false });
        }
      } else {
        unrecognized.push({ ...node, sequenceNumber: 0, unrecognized: true });
      }
    }

    return [
      ...[...recognized.values()].sort((a, b) => a.sequenceNumber - b.sequenceNumber),
      ...unrecognized,
    ];
  }

  /**
   * Google Cloud Vision · Document Text Detection (HTR). Filtra tokens ^\\d+$ y
   * extrae el CENTRO del bounding box de cada número manuscrito.
   */
  private static async detectWithGoogleVision(
    canvas: HTMLCanvasElement,
    apiKey: string,
    rink: RinkDimensions
  ): Promise<DetectedNodeMarker[]> {
    const base64 = canvas.toDataURL('image/jpeg', 0.9).replace(/^data:image\/jpeg;base64,/, '');

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

    for (let i = 1; i < annotations.length; i++) {
      const item = annotations[i];
      const seq = parseSequenceToken(item?.description);
      if (seq === null) continue;

      const verts = item.boundingPoly?.vertices || [];
      if (verts.length < 2) continue;

      const xs = verts.map((v: any) => Number(v.x) || 0);
      const ys = verts.map((v: any) => Number(v.y) || 0);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);
      const width = Math.max(1, maxX - minX);
      const height = Math.max(1, maxY - minY);

      nodes.push({
        sequenceNumber: seq,
        positionMeters: {
          x: Math.round((minX + width / 2) * scaleX * 10) / 10,
          y: Math.round((minY + height / 2) * scaleY * 10) / 10,
        },
        confidence: 0.95,
        rawBoundingBox: { x: minX, y: minY, width, height },
        unrecognized: false,
      });
    }

    return nodes;
  }
}
