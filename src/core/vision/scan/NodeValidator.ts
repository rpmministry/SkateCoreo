/**
 * NodeValidator — FASE 2 (VALIDACIÓN). Convierte candidatos en nodos con evidencia.
 *
 * NINGÚN candidato se acepta por una única métrica. Se calculan confidencias
 * independientes (color, geometría/circularidad, radio, densidad de tinta y
 * posición) y se combinan con una media geométrica ponderada. La decisión final es:
 *
 *   accept  → evidencia suficiente (se digitaliza automáticamente).
 *   review  → ambiguo (se muestra al usuario para confirmar; NUNCA se inventa).
 *   reject  → evidencia insuficiente (se descarta en silencio).
 *
 * Regla de oro: es preferible marcar "REVISAR" que aceptar un nodo inexistente.
 */

import { clamp, smoothstep, weightedGeomean } from './mathUtil';
import { pixelToMeters } from './ImageOps';
import { TemplateModel } from './TemplateModel';
import { NodeConfidence, RingCandidate, Rink, ScannedNode, InkChannel } from './types';

export interface ValidationOptions {
  rink: Rink;
  width: number;
  height: number;
  pxPerMeter: number;
  minRadiusMeters?: number;
  maxRadiusMeters?: number;
  /** Umbral para aceptar automáticamente. */
  acceptThreshold?: number;
  /** Umbral por debajo del cual se rechaza (en medio: revisar). */
  reviewThreshold?: number;
}

export function validateCandidate(
  candidate: RingCandidate,
  _red: Uint8Array,
  _blue: Uint8Array,
  width: number,
  height: number,
  options: ValidationOptions
): ScannedNode | null {
  const rink = options.rink;
  const minR = options.minRadiusMeters ?? 0.5;
  const maxR = options.maxRadiusMeters ?? 3.0;
  const acceptThreshold = options.acceptThreshold ?? 0.7;
  const reviewThreshold = options.reviewThreshold ?? 0.42;

  const reasons: string[] = [];
  const channel: InkChannel = candidate.redFraction >= candidate.blueFraction ? 'red' : 'blue';
  const purity = Math.max(candidate.redFraction, candidate.blueFraction);

  // ── Hard gate de color: sin tinta de color no hay nodo posible ────────────
  if (candidate.ringPixelCount < 8 || purity < 0.5) {
    return null;
  }

  // ── Geometría / circularidad ──────────────────────────────────────────────
  const coverageScore = smoothstep(candidate.angularCoverage, 0.5, 0.95);
  const rmsLimit = Math.max(2.5, candidate.outerRadiusPx * 0.3);
  const rmsScore = clamp(1 - candidate.circleRmsPx / rmsLimit, 0, 1);
  const circleConfidence = clamp(0.7 * coverageScore + 0.3 * rmsScore, 0, 1);
  if (coverageScore < 0.25) {
    reasons.push('cobertura angular insuficiente');
  }

  // ── Radio en metros ───────────────────────────────────────────────────────
  const radiusMeters = candidate.outerRadiusPx / Math.max(1, options.pxPerMeter);
  let radiusConfidence: number;
  if (radiusMeters >= minR && radiusMeters <= maxR) {
    radiusConfidence = 1;
  } else if (radiusMeters >= minR * 0.6 && radiusMeters <= maxR * 1.4) {
    radiusConfidence = 0.45;
    reasons.push('radio fuera del rango típico');
  } else {
    return null; // mancha demasiado grande/pequeña para ser un nodo
  }

  // ── Color ─────────────────────────────────────────────────────────────────
  const colorConfidence = clamp(purity, 0, 1);

  // ── Densidad de tinta (anillo realmente cubierto de color) ────────────────
  const annulusArea = Math.max(
    1,
    Math.PI *
      (candidate.outerRadiusPx * candidate.outerRadiusPx -
        candidate.innerRadiusPx * candidate.innerRadiusPx)
  );
  const occupied = candidate.ringPixelCount / annulusArea;
  const expectedOccupancy = candidate.innerRadiusPx > 0 ? 0.28 : 0.6;
  const inkDensityConfidence = clamp(occupied / expectedOccupancy, 0, 1);
  if (inkDensityConfidence < 0.25) reasons.push('trazo discontinuo o tenue');

  // ── Posición: dentro de la pista ──────────────────────────────────────────
  const meters = pixelToMeters(candidate.center.x, candidate.center.y, width, height, rink);
  const inside =
    meters.x >= -0.5 &&
    meters.x <= rink.lengthMeters + 0.5 &&
    meters.y >= -0.5 &&
    meters.y <= rink.widthMeters + 0.5;
  if (!inside) return null;

  const distToPrinted = TemplateModel.distanceToPrinted(meters.x, meters.y, rink);
  let positionConfidence = 1;
  if (distToPrinted < 0.15) {
    positionConfidence = 0.75; // el centro cae sobre geometría impresa: leve duda
  }

  // ── Media geométrica ponderada (helper compartido, normaliza por Σpesos) ──
  const overall = clamp(
    weightedGeomean(
      [colorConfidence, circleConfidence, radiusConfidence, inkDensityConfidence, positionConfidence],
      [0.3, 0.3, 0.15, 0.15, 0.1]
    ),
    0,
    1
  );

  const confidence: NodeConfidence = {
    colorConfidence,
    circleConfidence,
    positionConfidence,
    inkDensityConfidence,
    digitConfidence: 0,
    overall,
  };

  let decision: ScannedNode['decision'];
  if (overall >= acceptThreshold && coverageScore >= 0.55) {
    decision = 'accept';
  } else if (overall >= reviewThreshold) {
    decision = 'review';
  } else {
    return null;
  }

  return {
    xMeters: round1(meters.x),
    yMeters: round1(meters.y),
    channel,
    radiusMeters: round2(radiusMeters),
    confidence,
    digit: null,
    review: decision === 'review',
    decision,
    reasons,
  };
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}
function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
