import { ChoreographyPathPoint, SkaterAvatarState, RinkDimensions } from '../../types/choreography';

export const DEFAULT_RINK_DIMENSIONS: RinkDimensions = {
  lengthMeters: 50,
  widthMeters: 25,
  cornerRoundsMeters: 3.5
};

export interface CanvasViewportMetrics {
  scale: number;
  offsetX: number;
  offsetY: number;
  renderedW: number;
  renderedH: number;
  canvasW: number;
  canvasH: number;
}

export class RinkMath {
  /**
   * Calcula el factor de escala y márgenes para ajustar la pista reglamentaria al canvas manteniendo el ratio
   */
  public static calculateViewportMetrics(
    canvasW: number,
    canvasH: number,
    rink: RinkDimensions = DEFAULT_RINK_DIMENSIONS,
    paddingPx: number = 32
  ): CanvasViewportMetrics {
    const availW = Math.max(10, canvasW - paddingPx * 2);
    const availH = Math.max(10, canvasH - paddingPx * 2);

    let scale = availW / rink.lengthMeters;
    if (scale * rink.widthMeters > availH) {
      scale = availH / rink.widthMeters;
    }

    const renderedW = rink.lengthMeters * scale;
    const renderedH = rink.widthMeters * scale;
    const offsetX = (canvasW - renderedW) / 2;
    const offsetY = (canvasH - renderedH) / 2;

    return {
      scale,
      offsetX,
      offsetY,
      renderedW,
      renderedH,
      canvasW,
      canvasH
    };
  }

  public static metersToPixels(
    mX: number,
    mY: number,
    metrics: CanvasViewportMetrics
  ): { px: number; py: number } {
    return {
      px: metrics.offsetX + mX * metrics.scale,
      py: metrics.offsetY + mY * metrics.scale
    };
  }

  public static pixelsToMeters(
    pX: number,
    pY: number,
    metrics: CanvasViewportMetrics,
    rink: RinkDimensions = DEFAULT_RINK_DIMENSIONS
  ): { mX: number; mY: number } {
    const mX = Math.max(0, Math.min(rink.lengthMeters, (pX - metrics.offsetX) / metrics.scale));
    const mY = Math.max(0, Math.min(rink.widthMeters, (pY - metrics.offsetY) / metrics.scale));
    return { mX, mY };
  }

  /**
   * Obtiene los tiradores de control Bézier (CP1 y CP2) para un segmento de p0 a p1
   */
  public static getSegmentControlPoints(
    p0: ChoreographyPathPoint,
    p1: ChoreographyPathPoint
  ): { cp1: { x: number; y: number }; cp2: { x: number; y: number } } {
    const dx = p1.x - p0.x;
    const dy = p1.y - p0.y;

    const rawCp1x = p0.cp1x !== undefined ? p0.cp1x : p0.x + dx * 0.33;
    const rawCp1y = p0.cp1y !== undefined ? p0.cp1y : p0.y + dy * 0.33;

    const rawCp2x = p0.cp2x !== undefined ? p0.cp2x : p1.x - dx * 0.33;
    const rawCp2y = p0.cp2y !== undefined ? p0.cp2y : p1.y - dy * 0.33;

    // Asegurar que los tiradores nunca excedan los márgenes perimetrales de la pista
    const cp1x = Math.max(0.4, Math.min(49.6, rawCp1x));
    const cp1y = Math.max(0.4, Math.min(24.6, rawCp1y));
    const cp2x = Math.max(0.4, Math.min(49.6, rawCp2x));
    const cp2y = Math.max(0.4, Math.min(24.6, rawCp2y));

    return {
      cp1: { x: Math.round(cp1x * 10) / 10, y: Math.round(cp1y * 10) / 10 },
      cp2: { x: Math.round(cp2x * 10) / 10, y: Math.round(cp2y * 10) / 10 }
    };
  }

  /**
   * Evalúa punto y tangente de una curva cúbica de Bézier en el parámetro t (0 <= t <= 1)
   */
  public static evaluateCubicBezier(
    p0: { x: number; y: number },
    cp1: { x: number; y: number },
    cp2: { x: number; y: number },
    p1: { x: number; y: number },
    t: number
  ): { x: number; y: number; angleRad: number } {
    const clampedT = Math.max(0, Math.min(1, t));
    const mt = 1 - clampedT;
    const mt2 = mt * mt;
    const mt3 = mt2 * mt;
    const t2 = clampedT * clampedT;
    const t3 = t2 * clampedT;

    const x = mt3 * p0.x + 3 * mt2 * clampedT * cp1.x + 3 * mt * t2 * cp2.x + t3 * p1.x;
    const y = mt3 * p0.y + 3 * mt2 * clampedT * cp1.y + 3 * mt * t2 * cp2.y + t3 * p1.y;

    // Derivada primera para dirección/ángulo de orientación de los patines
    const dx = 3 * mt2 * (cp1.x - p0.x) + 6 * mt * clampedT * (cp2.x - cp1.x) + 3 * t2 * (p1.x - cp2.x);
    const dy = 3 * mt2 * (cp1.y - p0.y) + 6 * mt * clampedT * (cp2.y - cp1.y) + 3 * t2 * (p1.y - cp2.y);
    const angleRad = Math.atan2(dy, dx);

    return { x, y, angleRad };
  }

  /**
   * Convierte un segmento Catmull-Rom Spline entre p0 y p1 a puntos de control Bézier para Canvas 2D.
   * Garantiza que la curva pase obligatoriamente por los puntos con continuidad C1 suave.
   */
  public static catmullRomToBezier(
    pPrev: { x: number; y: number },
    p0: { x: number; y: number },
    p1: { x: number; y: number },
    pNext: { x: number; y: number },
    tension: number = 0.5
  ): { cp1: { x: number; y: number }; cp2: { x: number; y: number } } {
    const factor = tension / 3;
    const cp1x = p0.x + (p1.x - pPrev.x) * factor;
    const cp1y = p0.y + (p1.y - pPrev.y) * factor;
    const cp2x = p1.x - (pNext.x - p0.x) * factor;
    const cp2y = p1.y - (pNext.y - p0.y) * factor;

    return {
      cp1: {
        x: Math.round(Math.max(0.4, Math.min(49.6, cp1x)) * 10) / 10,
        y: Math.round(Math.max(0.4, Math.min(24.6, cp1y)) * 10) / 10
      },
      cp2: {
        x: Math.round(Math.max(0.4, Math.min(49.6, cp2x)) * 10) / 10,
        y: Math.round(Math.max(0.4, Math.min(24.6, cp2y)) * 10) / 10
      }
    };
  }

  /**
   * Obtiene los 3 puntos de agarre integrados directamente sobre la curva (Spline en línea)
   * para un tramo entre p0 y p1 (t = 0.25, 0.5, 0.75).
   */
  public static getSegmentGripPoints(
    p0: ChoreographyPathPoint,
    p1: ChoreographyPathPoint
  ): Array<{ id: string; t: number; x: number; y: number }> {
    const { cp1, cp2 } = this.getSegmentControlPoints(p0, p1);
    // 1 único punto conector de agarre central por tramo (t = 0.5), eliminando saturación visual
    const tValues = [0.5];

    return tValues.map((t) => {
      const pt = this.evaluateCubicBezier(p0, cp1, cp2, p1, t);
      return {
        id: `${p0.id}_grip_${Math.round(t * 100)}`,
        t,
        x: Math.round(pt.x * 10) / 10,
        y: Math.round(pt.y * 10) / 10
      };
    });
  }

  /**
   * Calcula los puntos de control Bézier para que la curva pase exactamente
   * a través de la posición de agarre deseada (targetX, targetY), simulando un imán Spline directo.
   * Permite llevar la curva libremente hasta los bordes de la pista (50m x 25m).
   */
  public static computeControlPointsFromThroughPoint(
    p0: ChoreographyPathPoint,
    p1: ChoreographyPathPoint,
    targetX: number,
    targetY: number,
    t: number = 0.5
  ): { cp1: { x: number; y: number }; cp2: { x: number; y: number } } {
    // La coordenada objetivo en la pista puede alcanzar los bordes reales (0 a 50m y 0 a 25m)
    const clampedGx = Math.max(0.1, Math.min(49.9, targetX));
    const clampedGy = Math.max(0.1, Math.min(24.9, targetY));

    const currentCps = this.getSegmentControlPoints(p0, p1);

    // Calcular la proyección longitudinal a lo largo del segmento p0 -> p1
    // para permitir que los 3 puntos se desplacen libremente entre y a lo largo de esa línea
    const dx = p1.x - p0.x;
    const dy = p1.y - p0.y;
    const segLenSq = dx * dx + dy * dy || 1;
    const tProj = ((clampedGx - p0.x) * dx + (clampedGy - p0.y) * dy) / segLenSq;

    let activeT: number;
    let rawCp1x: number;
    let rawCp1y: number;
    let rawCp2x: number;
    let rawCp2y: number;

    if (t <= 0.35) {
      // 1. MANIPULACIÓN DEL PUNTO 1 (Cercano a p0):
      // Puede desplazarse libremente entre p0 y el centro (t de 0.05 a 0.45)
      activeT = Math.max(0.05, Math.min(0.45, Number.isFinite(tProj) ? tProj : 0.25));
      const mt = 1 - activeT;
      const w1 = 3 * mt * mt * activeT;
      const w2 = 3 * mt * activeT * activeT;

      rawCp1x = (clampedGx - Math.pow(mt, 3) * p0.x - w2 * currentCps.cp2.x - Math.pow(activeT, 3) * p1.x) / w1;
      rawCp1y = (clampedGy - Math.pow(mt, 3) * p0.y - w2 * currentCps.cp2.y - Math.pow(activeT, 3) * p1.y) / w1;
      rawCp2x = currentCps.cp2.x;
      rawCp2y = currentCps.cp2.y;
    } else if (t >= 0.65) {
      // 2. MANIPULACIÓN DEL PUNTO 3 (Cercano a p1):
      // Puede desplazarse libremente entre el centro y p1 (t de 0.55 a 0.95)
      activeT = Math.max(0.55, Math.min(0.95, Number.isFinite(tProj) ? tProj : 0.75));
      const mt = 1 - activeT;
      const w1 = 3 * mt * mt * activeT;
      const w2 = 3 * mt * activeT * activeT;

      rawCp2x = (clampedGx - Math.pow(mt, 3) * p0.x - w1 * currentCps.cp1.x - Math.pow(activeT, 3) * p1.x) / w2;
      rawCp2y = (clampedGy - Math.pow(mt, 3) * p0.y - w1 * currentCps.cp1.y - Math.pow(activeT, 3) * p1.y) / w2;
      rawCp1x = currentCps.cp1.x;
      rawCp1y = currentCps.cp1.y;
    } else {
      // 3. MANIPULACIÓN DEL PUNTO CENTRAL:
      // Puede desplazarse a lo largo del arco central (t de 0.20 a 0.80)
      activeT = Math.max(0.20, Math.min(0.80, Number.isFinite(tProj) ? tProj : 0.5));
      const mt = 1 - activeT;
      const w1 = 3 * mt * mt * activeT;
      const w2 = 3 * mt * activeT * activeT;

      const currentBt = this.evaluateCubicBezier(p0, currentCps.cp1, currentCps.cp2, p1, activeT);
      const totalW = w1 + w2 || 0.75;
      const deltaX = (clampedGx - currentBt.x) / totalW;
      const deltaY = (clampedGy - currentBt.y) / totalW;

      rawCp1x = currentCps.cp1.x + deltaX;
      rawCp1y = currentCps.cp1.y + deltaY;
      rawCp2x = currentCps.cp2.x + deltaX;
      rawCp2y = currentCps.cp2.y + deltaY;
    }

    // Los tiradores actúan como imanes y tienen margen amplio fuera de la pista para alcanzar los bordes
    const cp1x = Math.max(-25, Math.min(75, rawCp1x));
    const cp1y = Math.max(-15, Math.min(40, rawCp1y));
    const cp2x = Math.max(-25, Math.min(75, rawCp2x));
    const cp2y = Math.max(-15, Math.min(40, rawCp2y));

    return {
      cp1: { x: Math.round(cp1x * 10) / 10, y: Math.round(cp1y * 10) / 10 },
      cp2: { x: Math.round(cp2x * 10) / 10, y: Math.round(cp2y * 10) / 10 }
    };
  }

  /**
   * Calcula la longitud acumulada de una polilínea o trazado
   */
  public static getPathLength(path: Array<{ x: number; y: number }>): number {
    let len = 0;
    for (let i = 1; i < path.length; i++) {
      len += Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y);
    }
    return len;
  }

  /**
   * Evalúa la posición (x, y) y la orientación cinemática (angleRad) a lo largo de un Catmull-Rom Spline
   * de múltiples puntos en el parámetro normalizado t (0 <= t <= 1)
   */
  public static evaluateSplinePath(
    path: Array<{ x: number; y: number }>,
    t: number
  ): { x: number; y: number; angleRad: number } {
    if (path.length === 0) return { x: 0, y: 0, angleRad: 0 };
    if (path.length === 1) return { x: path[0].x, y: path[0].y, angleRad: 0 };

    const clampedT = Math.max(0, Math.min(1, t));
    const n = path.length;

    // Calcular distancias acumuladas
    const dists: number[] = [0];
    for (let i = 1; i < n; i++) {
      dists.push(dists[i - 1] + Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y));
    }
    const totalDist = dists[n - 1];
    if (totalDist === 0) {
      return { x: path[0].x, y: path[0].y, angleRad: 0 };
    }

    const targetDist = clampedT * totalDist;

    // Localizar el segmento correspondiente
    let segIdx = 0;
    for (let i = 0; i < n - 1; i++) {
      if (targetDist >= dists[i] && targetDist <= dists[i + 1]) {
        segIdx = i;
        break;
      }
      if (i === n - 2) segIdx = n - 2;
    }

    const segLen = dists[segIdx + 1] - dists[segIdx];
    const u = segLen > 0 ? (targetDist - dists[segIdx]) / segLen : 0;

    const p0 = path[segIdx];
    const p1 = path[segIdx + 1];

    // Recorrido exacto milimétrico a lo largo de los puntos de la huella dibujada
    const x = p0.x + (p1.x - p0.x) * u;
    const y = p0.y + (p1.y - p0.y) * u;

    // Vector tangente del segmento actual del trazo por el que va pasando
    const angleRad = Math.atan2(p1.y - p0.y, p1.x - p0.x);

    return { x, y, angleRad };
  }

  /**
   * Calcula la posición e inclinación cinemática del patinador en un instante de tiempo
   */
  public static interpolateSkaterPosition(
    points: ChoreographyPathPoint[],
    currentTimeMs: number
  ): SkaterAvatarState | null {
    if (!points || points.length === 0) return null;

    const sorted = [...points].sort((a, b) => a.time_ms - b.time_ms);

    if (sorted.length === 1 || currentTimeMs <= sorted[0].time_ms) {
      return {
        x: sorted[0].x,
        y: sorted[0].y,
        angleRad: 0,
        speedMps: 0,
        activeElement: null,
        activePointIndex: 0
      };
    }

    if (currentTimeMs >= sorted[sorted.length - 1].time_ms) {
      const last = sorted[sorted.length - 1];
      return {
        x: last.x,
        y: last.y,
        angleRad: 0,
        speedMps: 0,
        activeElement: null,
        activePointIndex: sorted.length - 1
      };
    }

    for (let i = 0; i < sorted.length - 1; i++) {
      const p0 = sorted[i];
      const p1 = sorted[i + 1];

      if (currentTimeMs >= p0.time_ms && currentTimeMs <= p1.time_ms) {
        const timeSpanMs = p1.time_ms - p0.time_ms;
        const t = timeSpanMs > 0 ? (currentTimeMs - p0.time_ms) / timeSpanMs : 0;

        // Si el segmento posee huella de alta fidelidad, la patinadora recorre única y exclusivamente ese trazo
        if (p0.path && p0.path.length >= 2) {
          const splinePt = this.evaluateSplinePath(p0.path, t);
          const totalDist = this.getPathLength(p0.path);
          const speedMps = timeSpanMs > 0 ? (totalDist / (timeSpanMs / 1000)) : 0;

          return {
            x: splinePt.x,
            y: splinePt.y,
            angleRad: splinePt.angleRad,
            speedMps: Math.round(speedMps * 10) / 10,
            activeElement: null,
            activePointIndex: i
          };
        }

        // Si el segmento tiene tiradores de control manipulados explícitamente (Drag-to-Curve)
        if (p0.cp1x !== undefined && p0.cp2x !== undefined) {
          const cp1 = { x: p0.cp1x, y: p0.cp1y ?? p0.y };
          const cp2 = { x: p0.cp2x, y: p0.cp2y ?? p1.y };
          const { x, y, angleRad } = this.evaluateCubicBezier(p0, cp1, cp2, p1, t);

          const distanceM = Math.hypot(p1.x - p0.x, p1.y - p0.y);
          const speedMps = timeSpanMs > 0 ? (distanceM / (timeSpanMs / 1000)) : 0;

          return {
            x,
            y,
            angleRad,
            speedMps: Math.round(speedMps * 10) / 10,
            activeElement: null,
            activePointIndex: i
          };
        }

        // Tap simple (sin puntos intermedios): avance en línea recta directa entre nodos
        const distanceM = Math.hypot(p1.x - p0.x, p1.y - p0.y);
        const speedMps = timeSpanMs > 0 ? (distanceM / (timeSpanMs / 1000)) : 0;
        const x = p0.x + (p1.x - p0.x) * t;
        const y = p0.y + (p1.y - p0.y) * t;
        const angleRad = Math.atan2(p1.y - p0.y, p1.x - p0.x);

        return {
          x,
          y,
          angleRad,
          speedMps: Math.round(speedMps * 10) / 10,
          activeElement: null,
          activePointIndex: i
        };
      }
    }

    return {
      x: sorted[0].x,
      y: sorted[0].y,
      angleRad: 0,
      speedMps: 0,
      activeElement: null,
      activePointIndex: 0
    };
  }

  /**
   * Encuentra el punto más cercano sobre la trayectoria Bézier para inserción en Modo Libre
   * o división de tramos por doble clic. Muestrea 48 puntos por tramo para máxima fidelidad.
   */
  public static findNearestPointOnPath(
    points: ChoreographyPathPoint[],
    targetMetersX: number,
    targetMetersY: number
  ): { x: number; y: number; time_ms: number; segmentIndex: number; t: number; distanceMeters: number } | null {
    if (points.length < 2) return null;
    const sorted = [...points].sort((a, b) => a.time_ms - b.time_ms);

    let bestDist = Infinity;
    let bestPoint = {
      x: sorted[0].x,
      y: sorted[0].y,
      time_ms: sorted[0].time_ms,
      segmentIndex: 0,
      t: 0,
      distanceMeters: Infinity
    };

    for (let i = 0; i < sorted.length - 1; i++) {
      const p0 = sorted[i];
      const p1 = sorted[i + 1];
      const totalTimeMs = p1.time_ms - p0.time_ms;
      const SAMPLES = 48;

      if (p0.path && p0.path.length >= 2) {
        for (let s = 0; s <= SAMPLES; s++) {
          const t = s / SAMPLES;
          const { x, y } = this.evaluateSplinePath(p0.path, t);
          const dist = Math.hypot(x - targetMetersX, y - targetMetersY);
          if (dist < bestDist) {
            bestDist = dist;
            bestPoint = {
              x: Math.round(x * 10) / 10,
              y: Math.round(y * 10) / 10,
              time_ms: Math.round(p0.time_ms + t * totalTimeMs),
              segmentIndex: i,
              t,
              distanceMeters: dist
            };
          }
        }
      } else {
        const { cp1, cp2 } = this.getSegmentControlPoints(p0, p1);
        for (let s = 0; s <= SAMPLES; s++) {
          const t = s / SAMPLES;
          const { x, y } = this.evaluateCubicBezier(p0, cp1, cp2, p1, t);
          const dist = Math.hypot(x - targetMetersX, y - targetMetersY);
          if (dist < bestDist) {
            bestDist = dist;
            bestPoint = {
              x: Math.round(x * 10) / 10,
              y: Math.round(y * 10) / 10,
              time_ms: Math.round(p0.time_ms + t * totalTimeMs),
              segmentIndex: i,
              t,
              distanceMeters: dist
            };
          }
        }
      }
    }

    return bestPoint;
  }

  /**
   * Divide un tramo de curva Bézier entre p0 y p1 en dos subtramos exactos usando de Casteljau.
   * Garantiza que la geometría de la trayectoria no cambie en absoluto al insertar el nuevo nodo.
   */
  public static splitBezierSegmentAtT(
    p0: ChoreographyPathPoint,
    p1: ChoreographyPathPoint,
    t: number
  ): {
    midPoint: { x: number; y: number };
    leftCp1: { x: number; y: number };
    leftCp2: { x: number; y: number };
    rightCp1: { x: number; y: number };
    rightCp2: { x: number; y: number };
  } {
    const { cp1, cp2 } = this.getSegmentControlPoints(p0, p1);
    const clampedT = Math.max(0.01, Math.min(0.99, t));
    const mt = 1 - clampedT;

    // de Casteljau nivel 1
    const q0 = { x: mt * p0.x + clampedT * cp1.x, y: mt * p0.y + clampedT * cp1.y };
    const q1 = { x: mt * cp1.x + clampedT * cp2.x, y: mt * cp1.y + clampedT * cp2.y };
    const q2 = { x: mt * cp2.x + clampedT * p1.x, y: mt * cp2.y + clampedT * p1.y };

    // de Casteljau nivel 2
    const r0 = { x: mt * q0.x + clampedT * q1.x, y: mt * q0.y + clampedT * q1.y };
    const r1 = { x: mt * q1.x + clampedT * q2.x, y: mt * q1.y + clampedT * q2.y };

    // Punto medio exacto sobre la curva (nivel 3)
    const mid = { x: mt * r0.x + clampedT * r1.x, y: mt * r0.y + clampedT * r1.y };

    return {
      midPoint: { x: Math.round(mid.x * 10) / 10, y: Math.round(mid.y * 10) / 10 },
      leftCp1: { x: Math.round(q0.x * 10) / 10, y: Math.round(q0.y * 10) / 10 },
      leftCp2: { x: Math.round(r0.x * 10) / 10, y: Math.round(r0.y * 10) / 10 },
      rightCp1: { x: Math.round(r1.x * 10) / 10, y: Math.round(r1.y * 10) / 10 },
      rightCp2: { x: Math.round(q2.x * 10) / 10, y: Math.round(q2.y * 10) / 10 },
    };
  }

  /**
   * Obtiene la definición geométrica de las Guías Reglamentarias (World Skate / FEP):
   * - Eje Largo (Long Axis) con marcas de 3/4 para Skating Skills (>= 37.5m).
   * - Eje Corto (Short Axis) en el centro transversal (X = 25m).
   * - Diagonales con marcas de 3/4 para secuencias de Scissors (>= 41.9m).
   */
  public static getRegulatoryGuides(rink: RinkDimensions = DEFAULT_RINK_DIMENSIONS): {
    longAxis: {
      start: { x: number; y: number };
      end: { x: number; y: number };
      threeQuarterMarks: { x: number; y: number; label: string }[];
    };
    shortAxis: {
      start: { x: number; y: number };
      end: { x: number; y: number };
    };
    diagonals: {
      id: string;
      start: { x: number; y: number };
      end: { x: number; y: number };
      threeQuarterMarks: { x: number; y: number; label: string }[];
    }[];
  } {
    const L = rink.lengthMeters; // 50
    const W = rink.widthMeters;  // 25
    const midY = W / 2;          // 12.5
    const midX = L / 2;          // 25.0

    return {
      longAxis: {
        start: { x: 0, y: midY },
        end: { x: L, y: midY },
        threeQuarterMarks: [
          { x: L * 0.25, y: midY, label: '3/4 Izq (37.5m)' },
          { x: L * 0.75, y: midY, label: '3/4 Der (37.5m)' },
        ],
      },
      shortAxis: {
        start: { x: midX, y: 0 },
        end: { x: midX, y: W },
      },
      diagonals: [
        {
          id: 'diag-tl-br',
          start: { x: 0, y: 0 },
          end: { x: L, y: W },
          threeQuarterMarks: [
            { x: L * 0.25, y: W * 0.25, label: '3/4 Diag' },
            { x: L * 0.75, y: W * 0.75, label: '3/4 Diag' },
          ],
        },
        {
          id: 'diag-bl-tr',
          start: { x: 0, y: W },
          end: { x: L, y: 0 },
          threeQuarterMarks: [
            { x: L * 0.25, y: W * 0.75, label: '3/4 Diag' },
            { x: L * 0.75, y: W * 0.25, label: '3/4 Diag' },
          ],
        },
      ],
    };
  }

  /**
   * Obtiene el patrón oficial de círculos de Figuras Obligatorias World Skate:
   * 3 círculos tangentes alineados sobre el eje largo (diámetro 6m, radio 3m),
   * y bucles (loops) de 1.5m de diámetro según la normativa de figuras de precisión.
   */
  public static getCompulsoryFiguresCircles(rink: RinkDimensions = DEFAULT_RINK_DIMENSIONS): {
    id: string;
    name: string;
    center: { x: number; y: number };
    radius: number;
    isLoop?: boolean;
  }[] {
    const W = rink.widthMeters;
    const midY = W / 2; // 12.5

    return [
      // Círculo 1: Izquierdo (Centro 12.5m)
      { id: 'cf-circle-left', name: 'Círculo 1 (Izq)', center: { x: 12.5, y: midY }, radius: 3.0 },
      // Círculo 2: Central (Centro 25.0m)
      { id: 'cf-circle-center', name: 'Círculo 2 (Centro)', center: { x: 25.0, y: midY }, radius: 3.0 },
      // Círculo 3: Derecho (Centro 37.5m)
      { id: 'cf-circle-right', name: 'Círculo 3 (Der)', center: { x: 37.5, y: midY }, radius: 3.0 },
      // Bucle interior (Loop) en Círculo 1
      { id: 'cf-loop-left-top', name: 'Bucle Izq', center: { x: 12.5, y: midY - 2.25 }, radius: 0.75, isLoop: true },
      // Bucle interior (Loop) en Círculo 3
      { id: 'cf-loop-right-top', name: 'Bucle Der', center: { x: 37.5, y: midY - 2.25 }, radius: 0.75, isLoop: true },
    ];
  }
}


