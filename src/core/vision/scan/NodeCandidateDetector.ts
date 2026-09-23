/**
 * NodeCandidateDetector — FASE 1 (CANDIDATOS). No decide, solo propone.
 *
 * En lugar de HoughCircles sobre toda la foto, explota la topología de la tinta:
 *
 *   1. CIERRE morfológico para unir micro-cortes del bolígrafo.
 *   2. HUECOS: un nodo circular dibujado a mano encierra una región de fondo. El
 *      centroide/ajuste del hueco es un estimador de centro muy estable. Si una
 *      línea de trayectoria ATRAVIESA el círculo, el interior se parte en dos
 *      huecos; se FUSIONAN cuando su unión vuelve a encajar en un círculo (así un
 *      solo nodo nunca se cuenta dos veces).
 *   3. COMPONENTES COMPACTAS: discos rellenos (marcador) se detectan por relleno y
 *      relación de aspecto ≈ 1.
 *   4. AJUSTE DE CÍRCULO (Kasa) para anillos ABIERTOS (con gap): si el ajuste es
 *      bueno y el radio cae en rango, se propone como anillo aunque no cierre.
 *
 * La circularidad (RMS) es SIEMPRE medida con un ajuste real, nunca supuesta.
 * Nunca se propone un candidato sin tinta de color de entrada.
 */

import {
  ComponentStats,
  HoleRegion,
  annulusMask,
  close,
  collectComponentPixels,
  connectedComponents,
  findEnclosedHoles,
  fitCircleKasa,
  radialProfile,
} from './ImageOps';
import { Pt, RingCandidate } from './types';

export interface CandidateOptions {
  minRadiusPx: number;
  maxRadiusPx: number;
  /** Radio de cierre para unir cortes del bolígrafo. */
  gapCloseRadiusPx?: number;
  /** Área mínima de hueco considerada interior de nodo. */
  minHoleAreaPx?: number;
}

export function detectCandidates(
  residualMask: Uint8Array,
  width: number,
  height: number,
  red: Uint8Array,
  blue: Uint8Array,
  options: CandidateOptions
): RingCandidate[] {
  const minR = Math.max(3, options.minRadiusPx);
  const maxR = Math.max(minR + 2, options.maxRadiusPx);
  const closeR = options.gapCloseRadiusPx ?? Math.max(2, Math.round(minR * 0.15));
  const minHoleArea =
    options.minHoleAreaPx ?? Math.max(12, Math.round(Math.PI * (minR * 0.35) ** 2));

  const closed = close(residualMask, width, height, closeR);

  // ── 1. Candidatos por HUECO (con fusión de huecos de un mismo círculo) ─────
  const holes = findEnclosedHoles(closed, width, height, minHoleArea);
  const candidates: RingCandidate[] = buildHoleCandidates(
    holes,
    closed,
    width,
    height,
    red,
    blue,
    minR,
    maxR
  );

  // ── 2 y 3. Componentes: discos rellenos y anillos abiertos ────────────────
  const { labels, stats } = connectedComponents(closed, width, height, Math.max(9, (minR * minR) / 4));
  for (const stat of stats) {
    const filled = compactFilledCandidate(stat, width, height, red, blue, minR, maxR);
    if (filled) {
      candidates.push(filled);
      continue;
    }
    const ring = openRingCandidate(closed, labels, stat, width, height, red, blue, minR, maxR);
    if (ring) candidates.push(ring);
  }

  return dedupe(candidates, Math.max(6, minR * 0.6));
}

interface FittedHole {
  hole: HoleRegion;
  center: Pt;
  radius: number;
  rms: number;
}

/**
 * Construye candidatos a partir de huecos. Agrupa huecos cercanos y, si la unión
 * vuelve a ajustarse bien a un círculo, emite UN candidato (soluciona el caso de
 * una línea que cruza el círculo y parte su interior en dos).
 */
function buildHoleCandidates(
  holes: HoleRegion[],
  closed: Uint8Array,
  width: number,
  height: number,
  red: Uint8Array,
  blue: Uint8Array,
  minR: number,
  maxR: number
): RingCandidate[] {
  const mergeRatio = 1.3;
  const fitted: FittedHole[] = [];
  for (const hole of holes) {
    const fit = hole.points.length >= 5 ? fitCircleKasa(hole.points) : null;
    const radius = fit && fit.r > 0 ? fit.r : Math.sqrt(hole.area / Math.PI);
    if (radius > maxR * 1.15) continue; // hueco demasiado grande: no es un nodo
    // Sin ajuste válido, se usa la redondez como cota conservadora del error.
    const rms = fit ? fit.rms : (1 - hole.roundness) * radius;
    fitted.push({
      hole,
      center: fit ? { x: fit.cx, y: fit.cy } : { x: hole.cx, y: hole.cy },
      radius,
      rms,
    });
  }
  if (fitted.length === 0) return [];

  // Agrupación voraz (mayor área primero) por cercanía relativa al radio interior.
  // Un círculo atravesado por una línea produce dos medios huecos cuyos centros
  // distan ~0.85·r (< 1.3·r): se fusionan en un único nodo.
  const used = new Array<boolean>(fitted.length).fill(false);
  const order = fitted.map((_, i) => i).sort((a, b) => fitted[b].hole.area - fitted[a].hole.area);
  const clusters: number[][] = [];
  for (const i of order) {
    if (used[i]) continue;
    used[i] = true;
    const cluster = [i];
    for (const j of order) {
      if (used[j]) continue;
      const d = Math.hypot(
        fitted[i].center.x - fitted[j].center.x,
        fitted[i].center.y - fitted[j].center.y
      );
      if (d <= mergeRatio * Math.max(fitted[i].radius, fitted[j].radius)) {
        used[j] = true;
        cluster.push(j);
      }
    }
    clusters.push(cluster);
  }

  const out: RingCandidate[] = [];
  for (const cluster of clusters) {
    let center = fitted[cluster[0]].center;
    let innerRadius = fitted[cluster[0]].radius;
    let rms = fitted[cluster[0]].rms;
    if (cluster.length > 1) {
      // Centro ponderado por área; radio interior del área total (exacto para dos
      // semicírculos que forman un disco). RMS = cota superior de los miembros.
      let totalArea = 0;
      let sx = 0;
      let sy = 0;
      let maxRms = 0;
      for (const k of cluster) {
        const f = fitted[k];
        totalArea += f.hole.area;
        sx += f.center.x * f.hole.area;
        sy += f.center.y * f.hole.area;
        maxRms = Math.max(maxRms, f.rms);
      }
      center = { x: sx / totalArea, y: sy / totalArea };
      innerRadius = Math.sqrt(totalArea / Math.PI);
      rms = Math.min(maxRms, innerRadius * 0.3);
    }
    const candidate = makeHoleCandidate(
      center,
      innerRadius,
      rms,
      closed,
      width,
      height,
      red,
      blue,
      minR,
      maxR
    );
    if (candidate) out.push(candidate);
  }
  return out;
}

function makeHoleCandidate(
  center: Pt,
  innerRadius: number,
  circleRmsPx: number,
  closed: Uint8Array,
  width: number,
  height: number,
  red: Uint8Array,
  blue: Uint8Array,
  minR: number,
  maxR: number
): RingCandidate | null {
  const profile = radialProfile(
    closed,
    width,
    height,
    center.x,
    center.y,
    Math.max(1, innerRadius * 0.5),
    maxR * 1.6
  );
  if (profile.coverage <= 0 || profile.outerRadius <= 0) return null;
  const outerRadius = Math.max(profile.outerRadius, innerRadius + 1);
  if (outerRadius < minR * 0.5) return null;
  const { redFraction, blueFraction, ringPixelCount } = ringColorStats(
    width,
    height,
    center.x,
    center.y,
    innerRadius * 0.8,
    outerRadius + 2,
    red,
    blue
  );
  return {
    center,
    innerRadiusPx: innerRadius,
    outerRadiusPx: outerRadius,
    angularCoverage: profile.coverage,
    circleRmsPx,
    strokeWidthPx: profile.strokeWidth,
    ringPixelCount,
    source: 'hole',
    redFraction,
    blueFraction,
  };
}

function compactFilledCandidate(
  stat: ComponentStats,
  width: number,
  height: number,
  red: Uint8Array,
  blue: Uint8Array,
  minR: number,
  maxR: number
): RingCandidate | null {
  const bw = stat.maxX - stat.minX + 1;
  const bh = stat.maxY - stat.minY + 1;
  if (bw <= 0 || bh <= 0) return null;
  const aspect = bw / bh;
  if (aspect < 0.55 || aspect > 1.8) return null;
  const radius = Math.max(bw, bh) / 2;
  if (radius < minR || radius > maxR) return null;
  const fillRatio = stat.area / (bw * bh);
  if (fillRatio < 0.55) return null;

  // Circularidad REAL del contorno (4πA/P²) → error equivalente del ajuste.
  const roundness =
    stat.perimeter > 0
      ? Math.min(1, (4 * Math.PI * stat.area) / (stat.perimeter * stat.perimeter))
      : 0;
  const circleRmsPx = Math.max(0, (1 - roundness) * radius);

  const { redFraction, blueFraction, ringPixelCount } = ringColorStats(
    width,
    height,
    stat.cx,
    stat.cy,
    0,
    radius,
    red,
    blue
  );
  return {
    center: { x: stat.cx, y: stat.cy },
    innerRadiusPx: 0,
    outerRadiusPx: radius,
    angularCoverage: 1,
    circleRmsPx,
    strokeWidthPx: radius,
    ringPixelCount,
    source: 'ring',
    redFraction,
    blueFraction,
  };
}

function openRingCandidate(
  closed: Uint8Array,
  labels: Int32Array,
  stat: ComponentStats,
  width: number,
  height: number,
  red: Uint8Array,
  blue: Uint8Array,
  minR: number,
  maxR: number
): RingCandidate | null {
  const pts = collectComponentPixels(labels, width, stat, 3000);
  if (pts.length < 12) return null;

  const fit = fitCircleKasa(pts);
  if (!fit) return null;
  if (fit.r < minR || fit.r > maxR) return null;
  const rmsLimit = Math.max(2.5, fit.r * 0.22);
  if (fit.rms > rmsLimit) return null;

  const profile = radialProfile(
    closed,
    width,
    height,
    fit.cx,
    fit.cy,
    Math.max(1, fit.r * 0.6),
    maxR * 1.6
  );
  if (profile.coverage < 0.45) return null;

  const outerRadius = Math.max(profile.outerRadius, fit.r);
  const { redFraction, blueFraction, ringPixelCount } = ringColorStats(
    width,
    height,
    fit.cx,
    fit.cy,
    Math.max(0, fit.r - profile.strokeWidth),
    outerRadius + 2,
    red,
    blue
  );

  return {
    center: { x: fit.cx, y: fit.cy },
    innerRadiusPx: Math.max(0, fit.r - profile.strokeWidth),
    outerRadiusPx: outerRadius,
    angularCoverage: profile.coverage,
    circleRmsPx: fit.rms,
    strokeWidthPx: profile.strokeWidth,
    ringPixelCount,
    source: 'ring',
    redFraction,
    blueFraction,
  };
}

function ringColorStats(
  width: number,
  height: number,
  cx: number,
  cy: number,
  rInner: number,
  rOuter: number,
  red: Uint8Array,
  blue: Uint8Array
): { redFraction: number; blueFraction: number; ringPixelCount: number } {
  const { mask, width: mw, x0, y0 } = annulusMask(width, height, cx, cy, rInner, rOuter);
  let redCount = 0;
  let blueCount = 0;
  for (let ly = 0; ly < mask.length; ly++) {
    if (mask[ly] !== 1) continue;
    const lx = ly % mw;
    const row = (ly - lx) / mw;
    const g = (y0 + row) * width + (x0 + lx);
    if (red[g] === 1) redCount++;
    else if (blue[g] === 1) blueCount++;
  }
  const denom = Math.max(1, redCount + blueCount);
  return {
    redFraction: redCount / denom,
    blueFraction: blueCount / denom,
    ringPixelCount: redCount + blueCount,
  };
}

function dedupe(candidates: RingCandidate[], minSeparation: number): RingCandidate[] {
  const sorted = [...candidates].sort((a, b) => {
    // Prioriza huecos (centro más fiable) y luego anillos con más cobertura.
    if (a.source !== b.source) return a.source === 'hole' ? -1 : 1;
    return b.angularCoverage - a.angularCoverage;
  });
  const kept: RingCandidate[] = [];
  for (const c of sorted) {
    const tooClose = kept.some(
      (k) => Math.hypot(k.center.x - c.center.x, k.center.y - c.center.y) < minSeparation
    );
    if (!tooClose) kept.push(c);
  }
  return kept;
}
