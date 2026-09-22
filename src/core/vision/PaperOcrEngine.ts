/**
 * PaperOcrEngine — Reconocimiento ÓPTICO de nodos numerados (1, 2, 3…).
 *
 * ── REGLA DE ARQUITECTURA (crítica) ─────────────────────────────────────────
 * El ÚNICO evento que instancia un nodo es la IDENTIFICACIÓN EXPLÍCITA DE UN
 * CARÁCTER NUMÉRICO (texto nativo/OCR). Queda terminantemente prohibido derivar
 * nodos de bordes, líneas, curvas, polígonos o vértices del trazado: eso era lo
 * que generaba decenas de nodos "fantasma" (p. ej. 30 nodos sobre una hoja con 5
 * números).
 *
 * Motores soportados, en orden de preferencia:
 *   1. Google Cloud Vision (si VITE_GOOGLE_VISION_API_KEY está configurada).
 *   2. Tesseract.js (OCR local, importado de forma dinámica; nada de blobs).
 *   3. Sin motor disponible → 0 nodos (nunca se inventan nodos).
 *
 * Mapeo ESTRICTO 1 a 1: un número reconocido = un nodo, usando el CENTRO del
 * bounding box del texto. La secuencia del nodo es el número LEÍDO, no el orden.
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

/** Token numérico válido: solo dígitos (^\\d+$) y en rango razonable de nodos. */
function parseSequenceToken(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const token = String(raw).trim();
  if (!/^\d+$/.test(token)) return null;
  const value = Number.parseInt(token, 10);
  if (!Number.isFinite(value) || value < 1 || value > 50) return null;
  return value;
}

export class PaperOcrEngine {
  /**
   * Detecta y extrae los nodos numerados. Devuelve exactamente un nodo por
   * número reconocido (0 si ningún motor puede leer dígitos).
   */
  public static async detectNumberedNodes(
    warpedCanvas: HTMLCanvasElement,
    rink: RinkDimensions = DEFAULT_RINK_DIMENSIONS
  ): Promise<DetectedNodeMarker[]> {
    const w = warpedCanvas.width;
    const h = warpedCanvas.height;
    if (w <= 0 || h <= 0) return [];

    // 1) Google Cloud Vision (mejor precisión; requiere clave de entorno).
    const visionApiKey = (import.meta as any).env?.VITE_GOOGLE_VISION_API_KEY;
    if (visionApiKey) {
      try {
        const cloudNodes = await this.detectWithGoogleVision(warpedCanvas, visionApiKey, rink);
        if (cloudNodes.length > 0) return this.sanitize(cloudNodes, w, h, rink);
      } catch (err) {
        console.warn('[PaperOcrEngine] Falló Google Vision, se intentará OCR local:', err);
      }
    }

    // 2) Tesseract.js local (sin blobs, sin trazados). Import dinámico: no pesa
    //    en el bundle principal y, si no está disponible/offline, se degrada.
    try {
      const localNodes = await this.detectWithTesseract(warpedCanvas, rink);
      if (localNodes.length > 0) return this.sanitize(localNodes, w, h, rink);
    } catch (err) {
      console.warn('[PaperOcrEngine] OCR local no disponible:', err);
    }

    // 3) Sin lectura semántica de números → CERO nodos (nunca nodos fantasma).
    return [];
  }

  /**
   * Normaliza y valida el resultado: solo números válidos, un nodo por número,
   * y siempre dentro del bounding box de la hoja A4.
   */
  private static sanitize(
    nodes: DetectedNodeMarker[],
    w: number,
    h: number,
    rink: RinkDimensions
  ): DetectedNodeMarker[] {
    const byNumber = new Map<number, DetectedNodeMarker>();

    for (const node of nodes) {
      // Filtro de descarte: tipo numérico validado (^\\d+$).
      const seq = parseSequenceToken(String(node.sequenceNumber));
      if (seq === null) continue;

      // Validación espacial (bounding box A4): fuera de la hoja se descarta.
      if (
        node.positionMeters.x <= 0 ||
        node.positionMeters.x >= rink.lengthMeters ||
        node.positionMeters.y <= 0 ||
        node.positionMeters.y >= rink.widthMeters
      ) {
        continue;
      }
      const bb = node.rawBoundingBox;
      if (!bb || bb.width <= 0 || bb.height <= 0) continue;
      // Tolerancia de 2px por redondeos del OCR antes de considerar "fuera".
      if (bb.x < -2 || bb.y < -2 || bb.x + bb.width > w + 2 || bb.y + bb.height > h + 2) continue;

      // Mapeo 1 a 1: si el número se repite, se conserva la mejor confianza.
      const existing = byNumber.get(seq);
      if (!existing || node.confidence > existing.confidence) {
        byNumber.set(seq, { ...node, sequenceNumber: seq });
      }
    }

    return [...byNumber.values()].sort((a, b) => a.sequenceNumber - b.sequenceNumber);
  }

  /**
   * OCR local con Tesseract.js. Se pide salida TSV para obtener el texto y el
   * bounding box por palabra, y solo se aceptan tokens numéricos.
   */
  private static async detectWithTesseract(
    canvas: HTMLCanvasElement,
    rink: RinkDimensions
  ): Promise<DetectedNodeMarker[]> {
    // Import dinámico: Tesseract (y sus workers) solo se descargan al digitalizar.
    const Tesseract = await import('tesseract.js');
    const createWorker = (Tesseract as any).createWorker;
    if (typeof createWorker !== 'function') return [];

    const worker = await createWorker('eng');
    try {
      // `output.tsv` da columnas: level page block par line word left top width height conf text
      const result = await worker.recognize(canvas, {}, { tsv: true });
      const tsv: string | undefined = result?.data?.tsv;
      if (!tsv) return [];

      const scaleX = rink.lengthMeters / canvas.width;
      const scaleY = rink.widthMeters / canvas.height;
      const found: DetectedNodeMarker[] = [];

      for (const line of tsv.split('\n')) {
        const cols = line.split('\t');
        if (cols.length < 12) continue;

        const level = cols[0];
        if (level !== '5') continue; // 5 = nivel "word"

        const left = Number(cols[6]);
        const top = Number(cols[7]);
        const width = Number(cols[8]);
        const height = Number(cols[9]);
        const conf = Number(cols[10]);
        const text = cols[11];

        const seq = parseSequenceToken(text);
        if (seq === null) continue;
        if (!Number.isFinite(left) || !Number.isFinite(top) || width <= 0 || height <= 0) continue;

        const cx = left + width / 2;
        const cy = top + height / 2;

        found.push({
          sequenceNumber: seq,
          positionMeters: {
            x: Math.round(cx * scaleX * 10) / 10,
            y: Math.round(cy * scaleY * 10) / 10,
          },
          confidence: Number.isFinite(conf) ? Math.max(0.5, conf / 100) : 0.7,
          rawBoundingBox: { x: left, y: top, width, height },
        });
      }

      return found;
    } finally {
      await worker.terminate();
    }
  }

  /**
   * Google Cloud Vision: lee números y mapea el centro de su bounding box.
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

    // El primer elemento es todo el texto agrupado; los siguientes son palabras.
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
      const cx = minX + width / 2;
      const cy = minY + height / 2;

      nodes.push({
        sequenceNumber: seq,
        positionMeters: {
          x: Math.round(cx * scaleX * 10) / 10,
          y: Math.round(cy * scaleY * 10) / 10,
        },
        confidence: 0.95,
        rawBoundingBox: { x: minX, y: minY, width, height },
      });
    }

    return nodes;
  }
}
