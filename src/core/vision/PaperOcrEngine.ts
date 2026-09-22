/**
 * PaperOcrEngine — Detección de nodos NUMERADOS encerrados en círculos.
 *
 * ── PIPELINE (estricto) ─────────────────────────────────────────────────────
 *  1. CONTORNOS: sobre la imagen YA ALINEADA (homografía) y binarizada se buscan
 *     formas cerradas. Se detecta el INTERIOR blanco de cada círculo (componente
 *     conexa encerrada, sin tocar el borde) y se filtra por área, extensión y
 *     circularidad. El CENTROIDE de ese interior es la coordenada del nodo.
 *  2. ROI LIMPIO: se recorta un cuadrado alrededor del centroide y se aplica una
 *     MÁSCARA (disco centrado) que elimina los píxeles del aro del círculo,
 *     dejando SOLO el número. Se escala ×3 en blanco y negro puro.
 *  3. OCR de UN CARÁCTER por ROI (PSM 10) con whitelist 0-9.
 *  4. MAPEO estricto de coordenadas: el centroide (px de la imagen alineada) se
 *     convierte a metros de pista con la misma escala que usa el lienzo 2D.
 *  5. DEBUG: se devuelve la lista de círculos con su centroide, radio, texto
 *     leído y motivo de descarte para pintar el overlay.
 *
 * El círculo no se "adivina" del trazado: se usa la región blanca encerrada por
 * la tinta, que es un contorno cerrado real. Nunca se generan nodos sin dígito.
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

/** Entrada de depuración para el overlay visual. */
export interface OcrDebugEntry {
  /** Centroide en píxeles de la imagen alineada. */
  x: number;
  y: number;
  /** Radio del ROI en píxeles. */
  radius: number;
  /** Texto leído por el OCR ('' si no se ejecutó). */
  text: string;
  accepted: boolean;
  reason?: string;
}

export interface OcrResult {
  nodes: DetectedNodeMarker[];
  debug: OcrDebugEntry[];
  /** Método que produjo los nodos: 'vision' | 'circles' | 'contours' | 'none'. */
  method: 'vision' | 'circles' | 'contours' | 'none';
}

interface Rect {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  area: number;
  cx: number;
  cy: number;
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
  /** API simple: devuelve solo los nodos. */
  public static async detectNumberedNodes(
    warpedCanvas: HTMLCanvasElement,
    rink: RinkDimensions = DEFAULT_RINK_DIMENSIONS,
    binarized?: HTMLCanvasElement
  ): Promise<DetectedNodeMarker[]> {
    const result = await this.detectNumberedNodesWithDebug(warpedCanvas, rink, binarized);
    return result.nodes;
  }

  /** API completa con información de depuración para el overlay. */
  public static async detectNumberedNodesWithDebug(
    warpedCanvas: HTMLCanvasElement,
    rink: RinkDimensions = DEFAULT_RINK_DIMENSIONS,
    binarized?: HTMLCanvasElement
  ): Promise<OcrResult> {
    // El análisis se hace SIEMPRE sobre la imagen alineada (y binarizada si hay).
    const work = binarized && binarized.width > 0 ? binarized : warpedCanvas;
    const w = work.width;
    const h = work.height;
    if (w <= 0 || h <= 0) return { nodes: [], debug: [], method: 'none' };

    // 1) Google Cloud Vision (si hay clave) — lectura directa de números.
    const visionApiKey = (import.meta as any).env?.VITE_GOOGLE_VISION_API_KEY;
    if (visionApiKey) {
      try {
        const cloudNodes = await this.detectWithGoogleVision(work, visionApiKey, rink);
        const nodes = this.sanitize(cloudNodes, w, h, rink);
        if (nodes.length > 0) return { nodes, debug: [], method: 'vision' };
      } catch (err) {
        console.warn('[PaperOcrEngine] Falló Google Vision, se usará el pipeline local:', err);
      }
    }

    // 2) Pipeline local por CÍRCULOS + OCR de un carácter.
    const circleResult = await this.detectByCircles(work, rink);
    if (circleResult.nodes.length > 0) {
      return { nodes: this.sanitize(circleResult.nodes, w, h, rink), debug: circleResult.debug, method: 'circles' };
    }

    // 3) Último recurso: segmentación por contornos de tinta (números sin círculo).
    const contourResult = await this.detectByContourSegmentation(work, rink);
    if (contourResult.nodes.length > 0) {
      return { nodes: this.sanitize(contourResult.nodes, w, h, rink), debug: contourResult.debug, method: 'contours' };
    }

    // 4) Nada legible → CERO nodos (nunca fantasmas), pero se conserva el debug.
    return { nodes: [], debug: circleResult.debug, method: 'none' };
  }

  /* ══════════════════════════════════════════════════════════════════════
     MAPEO DE COORDENADAS (estricto)
     ══════════════════════════════════════════════════════════════════════ */

  /**
   * Convierte el centroide (px de la imagen ALINEADA) a metros de pista.
   * Es la misma relación que usa el lienzo 2D: px → metros → px_de_lienzo.
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

  /** Valida un candidato circular por área, extensión y proporción (lógica pura). */
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
    if (aspect < 0.6 || aspect > 1.6) return false;
    const extent = area / (bboxW * bboxH);
    // Un disco interior tiene extensión ~0.785; se admite 0.45–0.92.
    if (extent < 0.45 || extent > 0.92) return false;
    return true;
  }

  /* ══════════════════════════════════════════════════════════════════════
     PIPELINE POR CÍRCULOS
     ══════════════════════════════════════════════════════════════════════ */

  private static async detectByCircles(
    canvas: HTMLCanvasElement,
    rink: RinkDimensions
  ): Promise<{ nodes: DetectedNodeMarker[]; debug: OcrDebugEntry[] }> {
    const w = canvas.width;
    const h = canvas.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return { nodes: [], debug: [] };

    const { data } = ctx.getImageData(0, 0, w, h);

    // Región BLANCA (fondo/interior) y región de TINTA (negra).
    const isWhite = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) {
      const idx = i * 4;
      const lum = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
      isWhite[i] = lum > 128 ? 1 : 0;
    }

    const interiors = this.findEnclosedInteriors(isWhite, w, h);
    if (interiors.length === 0) return { nodes: [], debug: [] };

    const debug: OcrDebugEntry[] = [];
    const nodes: DetectedNodeMarker[] = [];

    if (interiors.length === 0) return { nodes, debug };

    // Tesseract solo si hay al menos un círculo candidato.
    const Tesseract = await import('tesseract.js');
    const createWorker = (Tesseract as any).createWorker;
    if (typeof createWorker !== 'function') return { nodes, debug };

    const worker = await createWorker('eng');
    try {
      await worker.setParameters({
        tessedit_char_whitelist: '0123456789',
        tessedit_pageseg_mode: '10', // Single Character
      });

      for (const roi of interiors) {
        const radius = Math.max(roi.maxX - roi.minX, roi.maxY - roi.minY) / 2;
        const entry: OcrDebugEntry = { x: roi.cx, y: roi.cy, radius, text: '', accepted: false };

        try {
          const cleanCanvas = this.buildCleanRoi(canvas, roi);
          if (!cleanCanvas) {
            entry.reason = 'ROI vacío';
            debug.push(entry);
            continue;
          }

          const r = await worker.recognize(cleanCanvas);
          const text = String(r?.data?.text ?? '').replace(/\s+/g, '');
          entry.text = text;

          const seq = parseSequenceToken(text);
          if (seq === null) {
            entry.reason = 'Sin dígito válido';
            debug.push(entry);
            continue;
          }

          entry.accepted = true;
          debug.push(entry);
          nodes.push({
            sequenceNumber: seq,
            positionMeters: this.pixelsToMeters(roi.cx, roi.cy, w, h, rink),
            confidence: 0.9,
            rawBoundingBox: {
              x: roi.minX,
              y: roi.minY,
              width: roi.maxX - roi.minX,
              height: roi.maxY - roi.minY,
            },
          });
        } catch {
          entry.reason = 'Error OCR';
          debug.push(entry);
        }
      }
    } finally {
      await worker.terminate();
    }

    return { nodes, debug };
  }

  /**
   * Encuentra las REGIONES BLANCAS ENCERRADAS (interior de cada círculo):
   * componentes conexas de fondo que NO tocan el borde y con forma circular.
   */
  private static findEnclosedInteriors(white: Uint8Array, w: number, h: number): Rect[] {
    const visited = new Uint8Array(w * h);
    const interiors: Rect[] = [];
    const minArea = Math.max(60, Math.round(w * h * 0.00035));
    const maxArea = Math.round(w * h * 0.03);
    const stack: number[] = [];

    for (let start = 0; start < w * h; start++) {
      if (white[start] !== 1 || visited[start] === 1) continue;

      stack.length = 0;
      stack.push(start);
      visited[start] = 1;

      const rect: Rect = { minX: w, maxX: 0, minY: h, maxY: 0, area: 0, cx: 0, cy: 0 };
      let touchesBorder = false;

      while (stack.length > 0) {
        const idx = stack.pop()!;
        const x = idx % w;
        const y = (idx - x) / w;
        rect.area++;
        if (x < rect.minX) rect.minX = x;
        if (x > rect.maxX) rect.maxX = x;
        if (y < rect.minY) rect.minY = y;
        if (y > rect.maxY) rect.maxY = y;
        if (x === 0 || y === 0 || x === w - 1 || y === h - 1) touchesBorder = true;

        if (x > 0) { const n = idx - 1; if (white[n] === 1 && visited[n] === 0) { visited[n] = 1; stack.push(n); } }
        if (x < w - 1) { const n = idx + 1; if (white[n] === 1 && visited[n] === 0) { visited[n] = 1; stack.push(n); } }
        if (y > 0) { const n = idx - w; if (white[n] === 1 && visited[n] === 0) { visited[n] = 1; stack.push(n); } }
        if (y < h - 1) { const n = idx + w; if (white[n] === 1 && visited[n] === 0) { visited[n] = 1; stack.push(n); } }
      }

      if (touchesBorder) continue; // fondo de la hoja

      const bw = rect.maxX - rect.minX + 1;
      const bh = rect.maxY - rect.minY + 1;
      if (!this.isCircleCandidate(bw, bh, rect.area, minArea, maxArea)) continue;

      rect.cx = (rect.minX + rect.maxX) / 2;
      rect.cy = (rect.minY + rect.maxY) / 2;
      interiors.push(rect);
    }

    return interiors;
  }

  /**
   * Recorta el ROI alrededor del centroide y ELIMINA el aro del círculo con una
   * máscara de disco centrado, dejando solo el número. Se escala ×3 y se añade
   * un margen blanco para el OCR.
   */
  private static buildCleanRoi(canvas: HTMLCanvasElement, roi: Rect): HTMLCanvasElement | null {
    const w = canvas.width;
    const h = canvas.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const bw = roi.maxX - roi.minX + 1;
    const bh = roi.maxY - roi.minY + 1;
    const size = Math.max(bw, bh);
    const pad = Math.round(size * 0.25);

    const x0 = Math.max(0, Math.round(roi.cx - size / 2 - pad));
    const y0 = Math.max(0, Math.round(roi.cy - size / 2 - pad));
    const cw = Math.min(w - x0, size + pad * 2);
    const ch = Math.min(h - y0, size + pad * 2);
    if (cw <= 2 || ch <= 2) return null;

    const crop = document.createElement('canvas');
    crop.width = cw;
    crop.height = ch;
    const cctx = crop.getContext('2d');
    if (!cctx) return null;
    cctx.drawImage(canvas, x0, y0, cw, ch, 0, 0, cw, ch);

    // Máscara: solo se conserva un disco centrado (elimina el aro del círculo).
    const discRadius = size / 2 + pad * 0.4;
    const cxp = cw / 2;
    const cyp = ch / 2;
    const cropData = cctx.getImageData(0, 0, cw, ch);
    const cd = cropData.data;
    for (let y = 0; y < ch; y++) {
      for (let x = 0; x < cw; x++) {
        const dx = x - cxp;
        const dy = y - cyp;
        if (dx * dx + dy * dy > discRadius * discRadius) {
          const i = (y * cw + x) * 4;
          cd[i] = 255;
          cd[i + 1] = 255;
          cd[i + 2] = 255;
          cd[i + 3] = 255;
        }
      }
    }
    cctx.putImageData(cropData, 0, 0);

    // Escalado ×3 con blanco alrededor (mejora la lectura de un solo carácter).
    const scale = 3;
    const margin = 12;
    const out = document.createElement('canvas');
    out.width = cw * scale + margin * 2;
    out.height = ch * scale + margin * 2;
    const octx = out.getContext('2d');
    if (!octx) return null;
    octx.fillStyle = '#FFFFFF';
    octx.fillRect(0, 0, out.width, out.height);
    octx.imageSmoothingEnabled = false;
    octx.drawImage(crop, margin, margin, cw * scale, ch * scale);

    return out;
  }

  /* ══════════════════════════════════════════════════════════════════════
     FALLBACK: contornos de tinta (números sin círculo) — PSM 7
     ══════════════════════════════════════════════════════════════════════ */

  private static async detectByContourSegmentation(
    canvas: HTMLCanvasElement,
    rink: RinkDimensions
  ): Promise<{ nodes: DetectedNodeMarker[]; debug: OcrDebugEntry[] }> {
    const w = canvas.width;
    const h = canvas.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return { nodes: [], debug: [] };
    const { data } = ctx.getImageData(0, 0, w, h);

    const ink = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) {
      const idx = i * 4;
      const lum = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
      ink[i] = lum < 128 ? 1 : 0;
    }

    const minSize = Math.max(6, Math.round(w * 0.012));
    const maxSize = Math.round(w * 0.075);
    const blobs = this.findInkBlobs(ink, w, h, minSize, maxSize).slice(0, 40);
    if (blobs.length === 0) return { nodes: [], debug: [] };

    const Tesseract = await import('tesseract.js');
    const createWorker = (Tesseract as any).createWorker;
    if (typeof createWorker !== 'function') return { nodes: [], debug: [] };

    const worker = await createWorker('eng');
    const debug: OcrDebugEntry[] = [];
    const nodes: DetectedNodeMarker[] = [];
    try {
      await worker.setParameters({
        tessedit_char_whitelist: '0123456789',
        tessedit_pageseg_mode: '7',
      });

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

        const cx = (b.minX + b.maxX) / 2;
        const cy = (b.minY + b.maxY) / 2;
        const entry: OcrDebugEntry = { x: cx, y: cy, radius: Math.max(cw, ch) / 2, text: '', accepted: false };

        try {
          const r = await worker.recognize(crop);
          const text = String(r?.data?.text ?? '').replace(/\s+/g, '');
          entry.text = text;
          const seq = parseSequenceToken(text);
          if (seq === null) {
            entry.reason = 'Sin dígito válido';
            debug.push(entry);
            continue;
          }
          entry.accepted = true;
          debug.push(entry);
          nodes.push({
            sequenceNumber: seq,
            positionMeters: this.pixelsToMeters(cx, cy, w, h, rink),
            confidence: 0.75,
            rawBoundingBox: { x: b.minX, y: b.minY, width: b.maxX - b.minX, height: b.maxY - b.minY },
          });
        } catch {
          entry.reason = 'Error OCR';
          debug.push(entry);
        }
      }
    } finally {
      await worker.terminate();
    }

    return { nodes, debug };
  }

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

  /* ══════════════════════════════════════════════════════════════════════
     VALIDACIÓN / NORMALIZACIÓN
     ══════════════════════════════════════════════════════════════════════ */

  private static sanitize(
    nodes: DetectedNodeMarker[],
    w: number,
    h: number,
    rink: RinkDimensions
  ): DetectedNodeMarker[] {
    const byNumber = new Map<number, DetectedNodeMarker>();

    for (const node of nodes) {
      const seq = parseSequenceToken(String(node.sequenceNumber));
      if (seq === null) continue;

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
      if (bb.x < -2 || bb.y < -2 || bb.x + bb.width > w + 2 || bb.y + bb.height > h + 2) continue;

      const existing = byNumber.get(seq);
      if (!existing || node.confidence > existing.confidence) {
        byNumber.set(seq, { ...node, sequenceNumber: seq });
      }
    }

    return [...byNumber.values()].sort((a, b) => a.sequenceNumber - b.sequenceNumber);
  }

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
      });
    }

    return nodes;
  }
}
