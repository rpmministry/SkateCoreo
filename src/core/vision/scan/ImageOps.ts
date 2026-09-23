/**
 * ImageOps — Operaciones binarias y de color puras (sin DOM).
 *
 * Contiene morfología separable, etiquetado de componentes conexas, detección
 * de huecos (regiones de fondo ENCERRADAS por la tinta) y ajuste algebraico de
 * círculo (mínimos cuadrados tipo Kasa). Los huecos son la clave del detector:
 * un nodo manuscrito es, geométricamente, "un hueco de fondo rodeado de tinta".
 */

import { Pt } from './types';

export function countMask(mask: Uint8Array): number {
  let n = 0;
  for (let i = 0; i < mask.length; i++) if (mask[i] === 1) n++;
  return n;
}

/**
 * Morfología separable (máximo para dilatar, mínimo para erosionar) con radio
 * `r`. Coste O(w·h·r). Frontera tratada como 0 (no-tinta).
 */
export function morph(
  src: Uint8Array,
  w: number,
  h: number,
  r: number,
  dilate: boolean
): Uint8Array {
  if (r <= 0) return src.slice();
  const tmp = new Uint8Array(w * h);
  const out = new Uint8Array(w * h);
  const pick = dilate ? 1 : 0;

  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      let value = dilate ? 0 : 1;
      for (let dx = -r; dx <= r; dx++) {
        const nx = x + dx;
        if (nx < 0 || nx >= w) continue;
        if (src[row + nx] === pick) {
          value = pick;
          break;
        }
      }
      tmp[row + x] = value;
    }
  }
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      let value = dilate ? 0 : 1;
      for (let dy = -r; dy <= r; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= h) continue;
        if (tmp[ny * w + x] === pick) {
          value = pick;
          break;
        }
      }
      out[y * w + x] = value;
    }
  }
  return out;
}

export const dilate = (m: Uint8Array, w: number, h: number, r: number) =>
  morph(m, w, h, r, true);
export const erode = (m: Uint8Array, w: number, h: number, r: number) =>
  morph(m, w, h, r, false);

/** Cierre: rellena huecos más pequeños que 2r (une trazos discontinuos). */
export const close = (m: Uint8Array, w: number, h: number, r: number) =>
  erode(dilate(m, w, h, r), w, h, r);

export function andMask(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = a[i] === 1 && b[i] === 1 ? 1 : 0;
  return out;
}

export function andNotMask(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = a[i] === 1 && b[i] === 0 ? 1 : 0;
  return out;
}

export function orMask(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = a[i] === 1 || b[i] === 1 ? 1 : 0;
  return out;
}

export interface ComponentStats {
  id: number;
  area: number;
  /** Nº de píxeles del borde (píxeles con algún vecino 4-conexo fuera de la componente). */
  perimeter: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  cx: number;
  cy: number;
  touchesBorder: boolean;
}

/**
 * Etiquetado de componentes conexas (4-conectividad) iterativo (sin recursión).
 * Devuelve etiquetas (0 = fondo/no pertenece, 1..count = componente).
 */
export function connectedComponents(
  mask: Uint8Array,
  w: number,
  h: number,
  minArea = 1
): { labels: Int32Array; count: number; stats: ComponentStats[] } {
  const labels = new Int32Array(w * h);
  const stats: ComponentStats[] = [];
  const stack: number[] = [];
  const cleanup: number[] = [];
  let next = 1; // La etiqueta 0 significa "no pertenece a ninguna componente".

  for (let start = 0; start < w * h; start++) {
    if (mask[start] !== 1 || labels[start] !== 0) continue;

    const id = next++;
    const s: ComponentStats = {
      id,
      area: 0,
      perimeter: 0,
      minX: w,
      minY: h,
      maxX: -1,
      maxY: -1,
      cx: 0,
      cy: 0,
      touchesBorder: false,
    };
    stack.length = 0;
    cleanup.length = 0;
    stack.push(start);
    labels[start] = id;

    while (stack.length > 0) {
      const idx = stack.pop()!;
      const x = idx % w;
      const y = (idx - x) / w;

      s.area++;
      s.cx += x;
      s.cy += y;
      if (x < s.minX) s.minX = x;
      if (x > s.maxX) s.maxX = x;
      if (y < s.minY) s.minY = y;
      if (y > s.maxY) s.maxY = y;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) s.touchesBorder = true;

      // Perímetro: píxel de borde si algún vecino 4-conexo está fuera de la componente.
      const outside =
        x === 0 ||
        x === w - 1 ||
        y === 0 ||
        y === h - 1 ||
        mask[idx - 1] !== 1 ||
        mask[idx + 1] !== 1 ||
        mask[idx - w] !== 1 ||
        mask[idx + w] !== 1;
      if (outside) s.perimeter++;

      // Índices de la componente, solo para poder limpiarla si se rechaza.
      cleanup.push(idx);

      if (x > 0) {
        const n = idx - 1;
        if (mask[n] === 1 && labels[n] === 0) {
          labels[n] = id;
          stack.push(n);
        }
      }
      if (x < w - 1) {
        const n = idx + 1;
        if (mask[n] === 1 && labels[n] === 0) {
          labels[n] = id;
          stack.push(n);
        }
      }
      if (y > 0) {
        const n = idx - w;
        if (mask[n] === 1 && labels[n] === 0) {
          labels[n] = id;
          stack.push(n);
        }
      }
      if (y < h - 1) {
        const n = idx + w;
        if (mask[n] === 1 && labels[n] === 0) {
          labels[n] = id;
          stack.push(n);
        }
      }
    }

    if (s.area >= minArea) {
      s.cx /= s.area;
      s.cy /= s.area;
      stats.push(s);
    } else {
      // Limpia SOLO los píxeles de esta componente (O(area), no O(w·h)).
      for (const idx of cleanup) labels[idx] = 0;
    }
  }

  return { labels, count: stats.length, stats };
}

export interface HoleRegion {
  area: number;
  /** Redondez 4πA/P² (1 = disco perfecto; ~0.75 = semicírculo). */
  roundness: number;
  cx: number;
  cy: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  /** Puntos del hueco (submuestreados) para ajustar círculo y fusionar huecos. */
  points: Pt[];
}

/**
 * Huecos: componentes de FONDO (mask==0) que NO tocan el borde de la imagen,
 * es decir, regiones encerradas por la tinta. El centroide de un hueco es el
 * mejor estimador del centro de un nodo circular dibujado a mano.
 */
export function findEnclosedHoles(
  mask: Uint8Array,
  w: number,
  h: number,
  minArea = 8,
  maxPointsPerHole = 2000
): HoleRegion[] {
  const background = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) background[i] = mask[i] === 1 ? 0 : 1;

  const { stats } = connectedComponents(background, w, h, 1);
  const holes: HoleRegion[] = [];
  for (const s of stats) {
    if (s.touchesBorder) continue;
    if (s.area < minArea) continue;
    const perimeter = Math.max(1, s.perimeter);
    holes.push({
      area: s.area,
      roundness: Math.min(1, (4 * Math.PI * s.area) / (perimeter * perimeter)),
      cx: s.cx,
      cy: s.cy,
      minX: s.minX,
      minY: s.minY,
      maxX: s.maxX,
      maxY: s.maxY,
      points: collectRegionPoints(background, w, h, s, maxPointsPerHole),
    });
  }
  return holes;
}

/**
 * Puntos del CONTORNO de una región (no del relleno): un píxel es de borde si
 * algún vecino 4-conexo no pertenece a la región. Ajustar un círculo al contorno
 * (no al disco relleno) es lo que da un radio y un RMS correctos.
 */
function collectRegionPoints(
  mask: Uint8Array,
  w: number,
  h: number,
  stat: ComponentStats,
  maxPoints: number
): Pt[] {
  const isRegion = (x: number, y: number) => mask[y * w + x] === 1;
  const isBoundary = (x: number, y: number) =>
    x === 0 ||
    x === w - 1 ||
    y === 0 ||
    y === h - 1 ||
    !isRegion(x - 1, y) ||
    !isRegion(x + 1, y) ||
    !isRegion(x, y - 1) ||
    !isRegion(x, y + 1);

  const step = Math.max(1, Math.ceil(stat.perimeter / maxPoints));
  const pts: Pt[] = [];
  let seen = 0;
  for (let y = stat.minY; y <= stat.maxY; y++) {
    for (let x = stat.minX; x <= stat.maxX; x++) {
      if (mask[y * w + x] !== 1 || !isBoundary(x, y)) continue;
      if (seen % step === 0) pts.push({ x, y });
      seen++;
    }
  }
  return pts;
}

/**
 * Perfil radial de una máscara alrededor de un centro. Para cada dirección busca
 * el PRIMER tramo contiguo de tinta (primer píxel → fin del tramo, tolerando
 * micro-cortes de 1 px) y usa la MEDIANA sobre todas las direcciones. Usar solo el
 * primer tramo y mediana evita que una línea de trayectoria que sale del nodo
 * infle el radio exterior estimado.
 */
export function radialProfile(
  mask: Uint8Array,
  w: number,
  h: number,
  cx: number,
  cy: number,
  rMin: number,
  rMax: number,
  angles = 72
): { coverage: number; innerRadius: number; outerRadius: number; strokeWidth: number } {
  const firsts: number[] = [];
  const lasts: number[] = [];

  for (let a = 0; a < angles; a++) {
    const theta = (a / angles) * Math.PI * 2;
    const dx = Math.cos(theta);
    const dy = Math.sin(theta);

    let first = -1;
    let last = -1;
    let gap = 0;
    for (let r = rMin; r <= rMax; r += 1) {
      const x = Math.round(cx + dx * r);
      const y = Math.round(cy + dy * r);
      const inside = x >= 0 && x < w && y >= 0 && y < h;
      const on = inside && mask[y * w + x] === 1;
      if (on) {
        if (first < 0) first = r;
        last = r;
        gap = 0;
      } else if (first >= 0) {
        gap++;
        if (gap > 1) break; // fin del primer tramo de tinta
      }
    }
    if (first >= 0) {
      firsts.push(first);
      lasts.push(last);
    }
  }

  if (firsts.length === 0) {
    return { coverage: 0, innerRadius: 0, outerRadius: 0, strokeWidth: 0 };
  }
  firsts.sort((a, b) => a - b);
  lasts.sort((a, b) => a - b);
  const inner = firsts[Math.floor(firsts.length / 2)];
  const outer = lasts[Math.floor(lasts.length / 2)];
  return {
    coverage: firsts.length / angles,
    innerRadius: inner,
    outerRadius: outer,
    strokeWidth: Math.max(1, outer - inner + 1),
  };
}

/**
 * Ajuste algebraico de círculo (Kasa) a un conjunto de puntos. Devuelve centro,
 * radio y error RMS. Se usa para cuantificar "cuán circular" es una mancha: una
 * línea recta encaja mal (RMS alto) o exige un radio desmesurado.
 */
export function fitCircleKasa(points: Pt[]): { cx: number; cy: number; r: number; rms: number } | null {
  const n = points.length;
  if (n < 5) return null;

  let sx = 0;
  let sy = 0;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  let sxz = 0;
  let syz = 0;
  let sz = 0;
  for (const p of points) {
    const z = p.x * p.x + p.y * p.y;
    sx += p.x;
    sy += p.y;
    sxx += p.x * p.x;
    syy += p.y * p.y;
    sxy += p.x * p.y;
    sxz += p.x * z;
    syz += p.y * z;
    sz += z;
  }

  // [sxx sxy sx; sxy syy sy; sx sy n] · [a b c]^T = [sxz syz sz]^T
  const A = [
    [sxx, sxy, sx],
    [sxy, syy, sy],
    [sx, sy, n],
  ];
  const b = [sxz, syz, sz];
  const sol = solve3x3(A, b);
  if (!sol) return null;

  const [a, bb, c] = sol;
  const cx = a / 2;
  const cy = bb / 2;
  const rSq = c + cx * cx + cy * cy;
  if (!Number.isFinite(rSq) || rSq <= 0) return null;
  const r = Math.sqrt(rSq);

  let acc = 0;
  for (const p of points) {
    const d = Math.hypot(p.x - cx, p.y - cy) - r;
    acc += d * d;
  }
  return { cx, cy, r, rms: Math.sqrt(acc / n) };
}

function solve3x3(A: number[][], b: number[]): [number, number, number] | null {
  const M = [
    [A[0][0], A[0][1], A[0][2], b[0]],
    [A[1][0], A[1][1], A[1][2], b[1]],
    [A[2][0], A[2][1], A[2][2], b[2]],
  ];
  for (let i = 0; i < 3; i++) {
    let piv = i;
    for (let k = i + 1; k < 3; k++) {
      if (Math.abs(M[k][i]) > Math.abs(M[piv][i])) piv = k;
    }
    if (Math.abs(M[piv][i]) < 1e-9) return null;
    const tmp = M[i];
    M[i] = M[piv];
    M[piv] = tmp;

    for (let k = i + 1; k < 3; k++) {
      const f = M[k][i] / M[i][i];
      for (let j = i; j < 4; j++) M[k][j] -= f * M[i][j];
    }
  }
  const x: number[] = [0, 0, 0];
  for (let i = 2; i >= 0; i--) {
    let sum = M[i][3];
    for (let j = i + 1; j < 3; j++) sum -= M[i][j] * x[j];
    x[i] = sum / M[i][i];
  }
  return [x[0], x[1], x[2]];
}

/** Extrae píxeles (submuestreados) de una componente, recorriendo SOLO su bbox. */
export function collectComponentPixels(
  labels: Int32Array,
  w: number,
  stat: ComponentStats,
  maxPoints = 4000
): Pt[] {
  const step = Math.max(1, Math.ceil(stat.area / maxPoints));
  const pts: Pt[] = [];
  let seen = 0;
  for (let y = stat.minY; y <= stat.maxY; y++) {
    const row = y * w;
    for (let x = stat.minX; x <= stat.maxX; x++) {
      if (labels[row + x] !== stat.id) continue;
      if (seen % step === 0) pts.push({ x, y });
      seen++;
    }
  }
  return pts;
}

/** Convierte (x,y) de píxel a metros de pista (asume rectificado 2:1). */
export function pixelToMeters(x: number, y: number, w: number, h: number, rink: { lengthMeters: number; widthMeters: number }): Pt {
  return {
    x: (x / Math.max(1, w)) * rink.lengthMeters,
    y: (y / Math.max(1, h)) * rink.widthMeters,
  };
}

/** Luminancia Rec.601 de un píxel RGBA. */
export function luma(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/**
 * Máscara COMPACTA de un anillo (rInner..rOuter). Devuelve solo el rectángulo del
 * anillo junto con su origen, para no asignar buffers de tamaño imagen completa.
 * `mask` se indexa con `(y - y0) * width + (x - x0)`.
 */
export function annulusMask(
  w: number,
  h: number,
  cx: number,
  cy: number,
  rInner: number,
  rOuter: number
): { mask: Uint8Array; width: number; height: number; x0: number; y0: number; area: number } {
  const x0 = Math.max(0, Math.floor(cx - rOuter));
  const x1 = Math.min(w - 1, Math.ceil(cx + rOuter));
  const y0 = Math.max(0, Math.floor(cy - rOuter));
  const y1 = Math.min(h - 1, Math.ceil(cy + rOuter));
  const bw = Math.max(0, x1 - x0 + 1);
  const bh = Math.max(0, y1 - y0 + 1);
  const mask = new Uint8Array(bw * bh);
  let area = 0;
  const in2 = rInner * rInner;
  const out2 = rOuter * rOuter;
  for (let y = y0; y <= y1; y++) {
    const localRow = (y - y0) * bw;
    for (let x = x0; x <= x1; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 >= in2 && d2 <= out2) {
        mask[localRow + (x - x0)] = 1;
        area++;
      }
    }
  }
  return { mask, width: bw, height: bh, x0, y0, area };
}
