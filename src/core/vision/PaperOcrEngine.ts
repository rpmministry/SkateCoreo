/**
 * PaperOcrEngine — Detección HEURÍSTICA y tolerante de nodos numerados.
 *
 * ── PRINCIPIOS (fail-safe) ──────────────────────────────────────────────────
 *  1. DETECCIÓN RELAJADA: nada de circularidad estricta ni HoughCircles. Se
 *     buscan contornos cerrados/semi-cerrados (componentes conexas de tinta) y
 *     se validan SOLO por ÁREA (0.5%–4% de la hoja) y ASPECTO (0.5–1.8).
 *  2. REGISTRO INMEDIATO: todo contorno que pase el filtro ES UN NODO. Su
 *     centroide se guarda al momento, ANTES de leer el número.
 *  3. CROP CENTRAL: no se limpia el aro del círculo (eso borra el número). Se
 *     recorta el 60% central del bounding box (se descarta el 20% por lado).
 *  4. OCR: el recorte se escala ×3 y se le añade padding blanco de 24 px; se lee
 *     con PSM 10 (un carácter) y whitelist 0-9.
 *  5. FAIL-SAFE: si el OCR falla, el nodo IGUAL existe con número 0 (se marca
 *     como no reconocido para editarlo a mano en la pista). Nunca se descarta.
 *  6. MAPEO: el centroide (px de la imagen YA ALINEADA) se convierte a metros de
 *     pista con la misma escala que usa el lienzo 2D.
 */

import { Point2D } from '../math/FreehandPathEngine';
import { RinkDimensions } from '../../types/choreography';
import { DEFAULT_RINK_DIMENSIONS } from '../canvas/RinkMath';

export interface DetectedNodeMarker {
  /** Número leído por el OCR. 0 = no reconocido (nodo pendiente de editar). */
  sequenceNumber: number;
  positionMeters: Point2D;
  confidence: number;
  rawBoundingBox: { x: number; y: number; width: number; height: number };
  /** true si el OCR no pudo leer el número (nodo fail-safe pendiente). */
  unrecognized: boolean;
}

export interface OcrDebugEntry {
  x: number;
  y: number;
  radius: number;
  text: string;
  accepted: boolean;
  reason?: string;
}

export interface OcrResult {
  nodes: DetectedNodeMarker[];
  debug: OcrDebugEntry[];
  method: 'vision' | 'contours' | 'none';
}

interface ContourRect {
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
    binarized?: HTMLCanvasElement
  ): Promise<OcrResult> {
    const work = binarized && binarized.width > 0 ? binarized : warpedCanvas;
    const w = work.width;
    const h = work.height;
    if (w <= 0 || h <= 0) return { nodes: [], debug: [], method: 'none' };

    // 1) Google Cloud Vision (si hay clave): lectura directa y precisa.
    const visionApiKey = (import.meta as any).env?.VITE_GOOGLE_VISION_API_KEY;
    if (visionApiKey) {
      try {
        const cloudNodes = await this.detectWithGoogleVision(work, visionApiKey, rink);
        const nodes = this.sanitize(cloudNodes, rink);
        if (nodes.length > 0) return { nodes, debug: [], method: 'vision' };
      } catch (err) {
        console.warn('[PaperOcrEngine] Falló Google Vision, se usará el pipeline local:', err);
      }
    }

    // 2) Contornos relajados + OCR de un carácter (con fail-safe).
    const contours = this.findInkContours(work);
    if (contours.length === 0) return { nodes: [], debug: [], method: 'none' };

    const debug: OcrDebugEntry[] = [];
    const nodes: DetectedNodeMarker[] = [];

    // El nodo se registra SIEMPRE; el OCR solo intenta asignarle número.
    const Tesseract = await import('tesseract.js');
    const createWorker = (Tesseract as any).createWorker;
    let worker: any = null;
    if (typeof createWorker === 'function') {
      try {
        worker = await createWorker('eng');
        await worker.setParameters({
          tessedit_char_whitelist: '0123456789',
          tessedit_pageseg_mode: '10', // Single Character
        });
      } catch {
        worker = null;
      }
    }

    try {
      for (const c of contours) {
        const radius = Math.max(c.maxX - c.minX, c.maxY - c.minY) / 2;
        const entry: OcrDebugEntry = { x: c.cx, y: c.cy, radius, text: '', accepted: false };

        let seq = 0;
        if (worker) {
          try {
            const roi = this.buildCentralCropRoi(work, c);
            if (roi) {
              const r = await worker.recognize(roi);
              const text = String(r?.data?.text ?? '').replace(/\s+/g, '');
              entry.text = text;
              const parsed = parseSequenceToken(text);
              if (parsed !== null) {
                seq = parsed;
                entry.accepted = true;
              } else {
                entry.reason = 'Sin dígito (nodo pendiente de edición)';
              }
            } else {
              entry.reason = 'ROI vacío';
            }
          } catch {
            entry.reason = 'Error OCR (nodo pendiente de edición)';
          }
        } else {
          entry.reason = 'OCR no disponible (nodo pendiente de edición)';
        }

        debug.push(entry);

        // FAIL-SAFE: el nodo se crea SIEMPRE (seq 0 si el OCR falló).
        nodes.push({
          sequenceNumber: seq,
          positionMeters: this.pixelsToMeters(c.cx, c.cy, w, h, rink),
          confidence: seq > 0 ? 0.9 : 0.3,
          rawBoundingBox: {
            x: c.minX,
            y: c.minY,
            width: c.maxX - c.minX,
            height: c.maxY - c.minY,
          },
          unrecognized: seq <= 0,
        });
      }
    } finally {
      if (worker) {
        try {
          await worker.terminate();
        } catch {
          /* worker ya cerrado */
        }
      }
    }

    return { nodes: this.sanitize(nodes, rink), debug, method: 'contours' };
  }

  /* ══════════════════════════════════════════════════════════════════════
     MAPEO DE COORDENADAS (estricto)
     ══════════════════════════════════════════════════════════════════════ */

  /** Centroide (px de la imagen ALINEADA) → metros de pista. */
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

  /**
   * Filtro RELAJADO de contorno: solo área (0.5–4% de la hoja) y aspecto
   * (0.5–1.8). Sin circularidad estricta (permite óvalos y cuadrados irregulares).
   */
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
    if (aspect < 0.5 || aspect > 1.8) return false;
    return true;
  }

  /* ══════════════════════════════════════════════════════════════════════
     DETECCIÓN DE CONTORNOS (componentes conexas de tinta)
     ══════════════════════════════════════════════════════════════════════ */

  private static findInkContours(canvas: HTMLCanvasElement): ContourRect[] {
    const w = canvas.width;
    const h = canvas.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return [];
    const { data } = ctx.getImageData(0, 0, w, h);

    const ink = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) {
      const idx = i * 4;
      const lum = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
      ink[i] = lum < 128 ? 1 : 0;
    }

    // Área del contorno entre 0.5% y 4% de la hoja.
    const minArea = Math.round(w * h * 0.005);
    const maxArea = Math.round(w * h * 0.04);

    const visited = new Uint8Array(w * h);
    const contours: ContourRect[] = [];
    const stack: number[] = [];

    for (let start = 0; start < w * h; start++) {
      if (ink[start] !== 1 || visited[start] === 1) continue;

      const rect: ContourRect = { minX: w, maxX: 0, minY: h, maxY: 0, area: 0, cx: 0, cy: 0 };
      stack.length = 0;
      stack.push(start);
      visited[start] = 1;

      while (stack.length > 0) {
        const idx = stack.pop()!;
        const x = idx % w;
        const y = (idx - x) / w;
        rect.area++;
        if (x < rect.minX) rect.minX = x;
        if (x > rect.maxX) rect.maxX = x;
        if (y < rect.minY) rect.minY = y;
        if (y > rect.maxY) rect.maxY = y;

        if (x > 0) { const n = idx - 1; if (ink[n] === 1 && visited[n] === 0) { visited[n] = 1; stack.push(n); } }
        if (x < w - 1) { const n = idx + 1; if (ink[n] === 1 && visited[n] === 0) { visited[n] = 1; stack.push(n); } }
        if (y > 0) { const n = idx - w; if (ink[n] === 1 && visited[n] === 0) { visited[n] = 1; stack.push(n); } }
        if (y < h - 1) { const n = idx + w; if (ink[n] === 1 && visited[n] === 0) { visited[n] = 1; stack.push(n); } }
      }

      const bw = rect.maxX - rect.minX + 1;
      const bh = rect.maxY - rect.minY + 1;
      // Área del contorno = área de su bounding box (envolvente del dibujo).
      const bboxArea = bw * bh;
      if (!this.isCircleCandidate(bw, bh, bboxArea, minArea, maxArea)) continue;

      rect.cx = (rect.minX + rect.maxX) / 2;
      rect.cy = (rect.minY + rect.maxY) / 2;
      contours.push(rect);
    }

    return contours;
  }

  /**
   * Crop CENTRAL del bounding box (60% central: descarta el 20% por lado), luego
   * escala ×3 y añade padding blanco de 24 px. Sin limpieza morfológica.
   */
  private static buildCentralCropRoi(canvas: HTMLCanvasElement, c: ContourRect): HTMLCanvasElement | null {
    const w = canvas.width;
    const h = canvas.height;

    const bw = c.maxX - c.minX + 1;
    const bh = c.maxY - c.minY + 1;
    const cropW = Math.max(3, Math.round(bw * 0.6));
    const cropH = Math.max(3, Math.round(bh * 0.6));
    const x0 = Math.max(0, Math.min(w - cropW, Math.round(c.cx - cropW / 2)));
    const y0 = Math.max(0, Math.min(h - cropH, Math.round(c.cy - cropH / 2)));
    if (cropW <= 2 || cropH <= 2) return null;

    const scale = 3; // ~200% más grande
    const padding = 24; // borde blanco sólido
    const out = document.createElement('canvas');
    out.width = cropW * scale + padding * 2;
    out.height = cropH * scale + padding * 2;
    const octx = out.getContext('2d');
    if (!octx) return null;

    octx.fillStyle = '#FFFFFF';
    octx.fillRect(0, 0, out.width, out.height);
    octx.imageSmoothingEnabled = false;
    octx.drawImage(canvas, x0, y0, cropW, cropH, padding, padding, cropW * scale, cropH * scale);

    return out;
  }

  /* ══════════════════════════════════════════════════════════════════════
     VALIDACIÓN / NORMALIZACIÓN (fail-safe: conserva nodos con seq 0)
     ══════════════════════════════════════════════════════════════════════ */

  private static sanitize(
    nodes: DetectedNodeMarker[],
    rink: RinkDimensions
  ): DetectedNodeMarker[] {
    const recognized = new Map<number, DetectedNodeMarker>();
    const unrecognized: DetectedNodeMarker[] = [];

    for (const node of nodes) {
      // Posición dentro de la hoja/pista (bounding box A4).
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
        // Fail-safe: se conservan TODOS los nodos no reconocidos.
        unrecognized.push({ ...node, sequenceNumber: 0, unrecognized: true });
      }
    }

    return [
      ...[...recognized.values()].sort((a, b) => a.sequenceNumber - b.sequenceNumber),
      ...unrecognized,
    ];
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
        unrecognized: false,
      });
    }

    return nodes;
  }
}
