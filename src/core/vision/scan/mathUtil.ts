/** Utilidades numéricas compartidas por el pipeline de visión. */

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Interpolación suave: 0 en `edge0`, 1 en `edge1` (con derivada nula). */
export function smoothstep(v: number, edge0: number, edge1: number): number {
  if (edge1 <= edge0) return v >= edge1 ? 1 : 0;
  const t = clamp((v - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Media geométrica ponderada de valores en [0,1]. */
export function weightedGeomean(values: number[], weights: number[]): number {
  let logSum = 0;
  let wSum = 0;
  for (let i = 0; i < values.length; i++) {
    const v = Math.max(1e-6, values[i]);
    logSum += Math.log(v) * weights[i];
    wSum += weights[i];
  }
  return wSum > 0 ? Math.exp(logSum / wSum) : 0;
}
