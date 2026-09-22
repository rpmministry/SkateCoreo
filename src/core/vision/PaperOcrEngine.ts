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
    rink: RinkDimensions = DEFAULT_RINK_DIMENSIONS,
    binarized?: HTMLCanvasElement
  ): Promise<DetectedNodeMarker[]> {
    // El OCR se ejecuta SIEMPRE sobre la imagen preprocesada/binarizada si existe.
    const ocrCanvas = binarized && binarized.width > 0 ? binarized : warpedCanvas;
    const w = ocrCanvas.width;
    const h = ocrCanvas.height;
    if (w <= 0 || h <= 0) return [];

    // 1) Google Cloud Vision (mejor precisión; requiere clave de entorno).
    const visionApiKey = (import.meta as any).env?.VITE_GOOGLE_VISION_API_KEY;
    if (visionApiKey) {
      try {
        const cloudNodes = await this.detectWithGoogleVision(ocrCanvas, visionApiKey, rink);
        if (cloudNodes.length > 0) return this.sanitize(cloudNodes, w, h, rink);
      } catch (err) {
        console.warn('[PaperOcrEngine] Falló Google Vision, se intentará OCR local:', err);
      }
    }

    // 2) Tesseract.js local (whitelist de dígitos + segmentación por contornos).
    try {
      const localNodes = await this.detectWithTesseract(ocrCanvas, rink);
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
   * OCR local con Tesseract.js, afinado para DÍGITOS:
   *   · whitelist = 0-9 (sin letras ni símbolos),
   *   · PSM 11 (texto disperso) para leer varios números en la hoja,
   *   · si no encuentra nada, SEGMENTACIÓN POR CONTORNOS: aísla las manchas de
   *     tinta y pasa cada recorte por OCR (PSM 7).
   */
  private static async detectWithTesseract(
    canvas: HTMLCanvasElement,
    rink: RinkDimensions
  ): Promise<DetectedNodeMarker[]> {
    const Tesseract = await import('tesseract.js');
    const createWorker = (Tesseract as any).createWorker;
    if (typeof createWorker !== 'function') return [];

    const worker = await createWorker('eng');
    const scaleX = rink.lengthMeters / canvas.width;
    const scaleY = rink.widthMeters / canvas.height;

    try {
      // ── Fase A: OCR sobre la hoja completa (solo dígitos) ──
      await worker.setParameters({
        tessedit_char_whitelist: '0123456789',
        tessedit_pageseg_mode: '11',
      });

      const result = await worker.recognize(canvas, {}, { tsv: true });
      const tsv: string | undefined = result?.data?.tsv;
      const found: DetectedNodeMarker[] = [];

      if (tsv) {
        for (const line of tsv.split('\n')) {
          const cols = line.split('\t');
          if (cols.length < 12 || cols[0] !== '5') continue; // 5 = nivel "word"

          const left = Number(cols[6]);
          const top = Number(cols[7]);
          const width = Number(cols[8]);
          const height = Number(cols[9]);
          const conf = Number(cols[10]);
          const seq = parseSequenceToken(cols[11]);
          if (seq === null) continue;
          if (!Number.isFinite(left) || !Number.isFinite(top) || width <= 0 || height <= 0) continue;

          found.push(this.toNode(seq, left + width / 2, top + height / 2, left, top, width, height, conf, scaleX, scaleY));
        }
      }

      if (found.length > 0) return found;

      // ── Fase B: segmentación por contornos (fallback) ──
      return await this.detectByContourSegmentation(worker, canvas, scaleX, scaleY);
    } finally {
      await worker.terminate();
    }
  }

  private static toNode(
    seq: number,
    cx: number,
    cy: number,
    left: number,
    top: number,
    width: number,
    height: number,
    conf: number,
    scaleX: number,
    scaleY: number
  ): DetectedNodeMarker {
    return {
      sequenceNumber: seq,
      positionMeters: {
        x: Math.round(cx * scaleX * 10) / 10,
        y: Math.round(cy * scaleY * 10) / 10,
      },
      confidence: Number.isFinite(conf) ? Math.max(0.5, conf / 100) : 0.7,
      rawBoundingBox: { x: left, y: top, width, height },
    };
  }

  /**
   * Aísla manchas de tinta (números) por componentes conexas sobre la imagen
   * binarizada y pasa cada recorte por OCR (PSM 7, solo dígitos).
   */
  private static async detectByContourSegmentation(
    worker: any,
    canvas: HTMLCanvasElement,
    scaleX: number,
    scaleY: number
  ): Promise<DetectedNodeMarker[]> {
    const w = canvas.width;
    const h = canvas.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return [];
    const { data } = ctx.getImageData(0, 0, w, h);

    // Mapa de tinta: píxel oscuro = 1
    const ink = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) {
      const idx = i * 4;
      const lum = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
      ink[i] = lum < 128 ? 1 : 0;
    }

    const minSize = Math.max(6, Math.round(w * 0.012));
    const maxSize = Math.round(w * 0.075);
    const blobs = this.findInkBlobs(ink, w, h, minSize, maxSize).slice(0, 40);
    if (blobs.length === 0) return [];

    await worker.setParameters({
      tessedit_char_whitelist: '0123456789',
      tessedit_pageseg_mode: '7',
    });

    const results: DetectedNodeMarker[] = [];

    for (const b of blobs) {
      const pad = Math.round(Math.max(b.maxX - b.minX, b.maxY - b.minY) * 0.15);
      const x0 = Math.max(0, b.minX - pad);
      const y0 = Math.max(0, b.minY - pad);
      const cw = Math.min(w - x0, b.maxX - b.minX + pad * 2);
      const ch = Math.min(h - y0, b.maxY - b.minY + pad * 2);
      if (cw <= 2 || ch <= 2) continue;

      const crop = document.createElement('canvas');
      crop.width = cw;
      crop.height = ch;
      const cctx = crop.getContext('2d');
      if (!cctx) continue;
      cctx.drawImage(canvas, x0, y0, cw, ch, 0, 0, cw, ch);

      try {
        const r = await worker.recognize(crop);
        const text: string = r?.data?.text ?? '';
        const seq = parseSequenceToken(text.replace(/\s+/g, ''));
        if (seq === null) continue;

        const cx = (b.minX + b.maxX) / 2;
        const cy = (b.minY + b.maxY) / 2;
        results.push(
          this.toNode(seq, cx, cy, b.minX, b.minY, b.maxX - b.minX, b.maxY - b.minY, 75, scaleX, scaleY)
        );
      } catch {
        /* recorte ilegible: se ignora */
      }
    }

    return results;
  }

  /** Componentes conexas de tinta dentro de un rango de tamaño. */
  private static findInkBlobs(
    ink: Uint8Array,
    w: number,
    h: number,
    minSize: number,
    maxSize: number
  ): Array<{ minX: number; maxX: number; minY: number; maxY: number }> {
    const visited = new Uint8Array(w * h);
    const blobs: Array<{ minX: number; maxX: number; minY: number; maxY: number }> = [];
    const stack: number[] = [];

    for (let start = 0; start < w * h; start++) {
      if (ink[start] !== 1 || visited[start] === 1) continue;

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

        if (x > 0) { const n = idx - 1; if (ink[n] === 1 && visited[n] === 0) { visited[n] = 1; stack.push(n); } }
        if (x < w - 1) { const n = idx + 1; if (ink[n] === 1 && visited[n] === 0) { visited[n] = 1; stack.push(n); } }
        if (y > 0) { const n = idx - w; if (ink[n] === 1 && visited[n] === 0) { visited[n] = 1; stack.push(n); } }
        if (y < h - 1) { const n = idx + w; if (ink[n] === 1 && visited[n] === 0) { visited[n] = 1; stack.push(n); } }
      }

      const size = Math.max(blob.maxX - blob.minX, blob.maxY - blob.minY);
      if (size >= minSize && size <= maxSize) blobs.push(blob);
    }

    return blobs;
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
