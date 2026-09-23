/**
 * PaperScanner — ORQUESTADOR del pipeline de digitalización (v2).
 *
 * Flujo completo, en el orden exigido por el rediseño:
 *
 *   IMAGEN RECTIFICADA
 *     → segmentación de color (CIELab, adaptativa)      [aislar rojo/azul]
 *     → modelo digital de plantilla (rasterizado)        [plantilla conocida]
 *     → sustracción de plantilla                         [eliminar impreso/fringe]
 *     → detección de candidatos (huecos + círculos)      [FASE 1]
 *     → validación multicriterio con confianza           [FASE 2]
 *     → lectura de dígito SOLO dentro del nodo           [OCR restringido]
 *     → normalización a metros de pista                  [digitalización]
 *
 * El módulo es PURO y ASÍNCRONO (la lectura de dígitos puede usar un modelo). El
 * resultado incluye las máscaras intermedias para el MODO DIAGNÓSTICO.
 */

import {
  DEFAULT_RINK,
  RingCandidate,
  Rink,
  RgbaImage,
  ScanDebug,
  ScannedNode,
} from './types';
import { countMask } from './ImageOps';
import { segmentInk } from './InkSegmentation';
import { TemplateModel } from './TemplateModel';
import { subtractPrintedMask } from './TemplateSubtractor';
import { detectCandidates } from './NodeCandidateDetector';
import { validateCandidate } from './NodeValidator';
import {
  DigitClassifier,
  DigitTensor,
  NullDigitClassifier,
  extractDigitTensor,
} from './DigitClassifier';

export interface ScanOptions {
  rink?: Rink;
  /** Grosor (px) con que se rasteriza la plantilla impresa. */
  printedThicknessPx?: number;
  /** Radio de protección alrededor de la plantilla impresa. */
  protectionRadiusPx?: number;
  minRadiusMeters?: number;
  maxRadiusMeters?: number;
  acceptThreshold?: number;
  reviewThreshold?: number;
  digitClassifier?: DigitClassifier;
}

export interface ScanStats {
  colorInkPixels: number;
  residualInkPixels: number;
  removedByTemplate: number;
  candidateCount: number;
  acceptedCount: number;
  reviewCount: number;
}

export interface ScanResult {
  nodes: ScannedNode[];
  debug: ScanDebug;
  stats: ScanStats;
}

export async function scanPaper(image: RgbaImage, options: ScanOptions = {}): Promise<ScanResult> {
  const rink = options.rink ?? DEFAULT_RINK;
  const width = image.width;
  const height = image.height;
  const pxPerMeter = width / rink.lengthMeters;

  // 1. Segmentación de color (rojo/azul) en CIELab.
  const seg = segmentInk(image);

  // 2. Modelo digital de la plantilla + sustracción.
  const printedMask = TemplateModel.rasterizeMask(
    width,
    height,
    rink,
    options.printedThicknessPx ?? 2
  );
  const subtraction = subtractPrintedMask(
    seg.ink,
    printedMask,
    width,
    height,
    options.protectionRadiusPx ?? 3,
    seg.strong
  );

  // 3. Detección de candidatos (fase 1).
  const minRadiusMeters = options.minRadiusMeters ?? 0.5;
  const maxRadiusMeters = options.maxRadiusMeters ?? 3.0;
  const candidates = detectCandidates(subtraction.residual, width, height, seg.red, seg.blue, {
    minRadiusPx: minRadiusMeters * pxPerMeter,
    maxRadiusPx: maxRadiusMeters * pxPerMeter,
  });

  // 4. Validación multicriterio (fase 2).
  const classifier = options.digitClassifier ?? new NullDigitClassifier();
  const validated: Array<{ node: ScannedNode; candidate: RingCandidate }> = [];
  for (const candidate of candidates) {
    const node = validateCandidate(candidate, seg.red, seg.blue, width, height, {
      rink,
      width,
      height,
      pxPerMeter,
      minRadiusMeters,
      maxRadiusMeters,
      acceptThreshold: options.acceptThreshold,
      reviewThreshold: options.reviewThreshold,
    });
    if (node) validated.push({ node, candidate });
  }

  // 5. Deduplicación por cercanía conservando la mejor evidencia.
  //    La separación mínima es relativa al tamaño de nodo (nunca en metros fijos
  //    grandes, para no fusionar nodos manuscritos próximos entre sí).
  const deduped = dedupeNodes(validated, Math.max(0.15, minRadiusMeters * 0.6), pxPerMeter);

  // 6. Lectura del dígito SOLO en el interior del nodo (no inventa: null si duda).
  for (const { node, candidate } of deduped) {
    const innerRadius = candidate.innerRadiusPx > 1 ? candidate.innerRadiusPx : candidate.outerRadiusPx * 0.6;
    const tensor: DigitTensor = extractDigitTensor(
      image,
      candidate.center.x,
      candidate.center.y,
      innerRadius
    );
    const prediction = await classifier.classify(tensor);
    node.digit = prediction.digit;
    node.confidence.digitConfidence = prediction.confidence;
    if (prediction.digit === null && tensor.hasInk) {
      node.reasons.push('dígito no reconocido: confirmar número manualmente');
    }
  }

  // 7. Orden estable: aceptados por posición; los revisables al final.
  const nodes = deduped.map((d) => d.node);
  const accepted = nodes.filter((n) => n.decision === 'accept');
  const review = nodes.filter((n) => n.decision !== 'accept');
  const ordered: ScannedNode[] = [...accepted, ...review];

  const debug: ScanDebug = {
    printedMask,
    inkMask: seg.ink,
    residualMask: subtraction.residual,
    redMask: seg.red,
    blueMask: seg.blue,
    candidates,
  };

  return {
    nodes: ordered,
    debug,
    stats: {
      colorInkPixels: countMask(seg.ink),
      residualInkPixels: countMask(subtraction.residual),
      removedByTemplate: subtraction.removedByTemplate,
      candidateCount: candidates.length,
      acceptedCount: accepted.length,
      reviewCount: review.length,
    },
  };
}

function dedupeNodes(
  entries: Array<{ node: ScannedNode; candidate: RingCandidate }>,
  minSeparationMeters: number,
  pxPerMeter: number
): Array<{ node: ScannedNode; candidate: RingCandidate }> {
  const minSepPx = minSeparationMeters * pxPerMeter;
  const sorted = [...entries].sort(
    (a, b) => b.node.confidence.overall - a.node.confidence.overall
  );
  const kept: Array<{ node: ScannedNode; candidate: RingCandidate }> = [];
  for (const e of sorted) {
    const tooClose = kept.some(
      (k) =>
        Math.hypot(
          k.candidate.center.x - e.candidate.center.x,
          k.candidate.center.y - e.candidate.center.y
        ) < minSepPx
    );
    if (!tooClose) kept.push(e);
  }
  return kept;
}
