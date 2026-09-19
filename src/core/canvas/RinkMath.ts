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
    const rawCp1y = p0.cp1y !== undefined ? p0.cp1y : p0.y + dy * 0.2;

    const rawCp2x = p0.cp2x !== undefined ? p0.cp2x : p1.x - dx * 0.33;
    const rawCp2y = p0.cp2y !== undefined ? p0.cp2y : p1.y - dy * 0.2;

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
   * Obtiene los puntos de agarre integrados directamente sobre la curva (Spline en línea)
   * para un tramo entre p0 y p1.
   */
  public static getSegmentGripPoints(
    p0: ChoreographyPathPoint,
    p1: ChoreographyPathPoint
  ): Array<{ id: string; t: number; x: number; y: number }> {
    const { cp1, cp2 } = this.getSegmentControlPoints(p0, p1);
    const dist = Math.hypot(p1.x - p0.x, p1.y - p0.y);

    // Para tramos largos (> 12m) distribuimos 2-3 puntos de agarre; para tramos estándar, el punto central (t=0.5)
    const tValues = dist > 14 ? [0.33, 0.5, 0.67] : (dist > 8 ? [0.35, 0.65] : [0.5]);

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
   * a través de la posición de agarre deseada (targetX, targetY), simulando un Spline directo.
   */
  public static computeControlPointsFromThroughPoint(
    p0: ChoreographyPathPoint,
    p1: ChoreographyPathPoint,
    targetX: number,
    targetY: number,
    t: number = 0.5
  ): { cp1: { x: number; y: number }; cp2: { x: number; y: number } } {
    // Para t = 0.5 (punto medio exacto):
    // B(0.5) = (P0 + 3*CP1 + 3*CP2 + P1) / 8 = G
    // => CP1 = (4*G - P0) / 3, CP2 = (4*G - P1) / 3
    const clampedGx = Math.max(0.4, Math.min(49.6, targetX));
    const clampedGy = Math.max(0.4, Math.min(24.6, targetY));

    // Deformación proporcional exacta según el parámetro t para que B(t) = G
    const clampedT = Math.max(0.08, Math.min(0.92, t));
    const denom = 3 * clampedT * (1 - clampedT);
    const baselineX = (1 - clampedT) * p0.x + clampedT * p1.x;
    const baselineY = (1 - clampedT) * p0.y + clampedT * p1.y;
    const deltaX = (clampedGx - baselineX) / denom;
    const deltaY = (clampedGy - baselineY) / denom;

    const rawCp1x = (p0.x + (p1.x - p0.x) / 3) + deltaX;
    const rawCp1y = (p0.y + (p1.y - p0.y) / 3) + deltaY;
    const rawCp2x = (p1.x - (p1.x - p0.x) / 3) + deltaX;
    const rawCp2y = (p1.y - (p1.y - p0.y) / 3) + deltaY;

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
        const { cp1, cp2 } = this.getSegmentControlPoints(p0, p1);
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
   * Subdivide un segmento Bézier entre p0 y p1 en 'count' tiempos musicales (2 a 15)
   * Genera los Nodos de Tiempo correspondientes a lo largo de la curva física y temporal.
   */
  public static subdivideBezierSegment(
    p0: ChoreographyPathPoint,
    p1: ChoreographyPathPoint,
    count: number
  ): Array<{ x: number; y: number; time_ms: number; timeBeat: number }> {
    const safeCount = Math.max(2, Math.min(15, Math.round(count)));
    const { cp1, cp2 } = this.getSegmentControlPoints(p0, p1);
    const totalTimeMs = p1.time_ms - p0.time_ms;
    const result: Array<{ x: number; y: number; time_ms: number; timeBeat: number }> = [];

    // Subdivisión en 'safeCount' partes proporcionales (safeCount - 1 nodos interiores)
    for (let i = 1; i < safeCount; i++) {
      const t = i / safeCount;
      const { x, y } = this.evaluateCubicBezier(p0, cp1, cp2, p1, t);
      const time_ms = Math.round(p0.time_ms + t * totalTimeMs);

      result.push({
        x: Math.round(x * 10) / 10,
        y: Math.round(y * 10) / 10,
        time_ms,
        timeBeat: i + 1,
      });
    }

    return result;
  }

  /**
   * Encuentra el punto más cercano sobre la trayectoria Bézier para inserción en Modo Libre
   */
  public static findNearestPointOnPath(
    points: ChoreographyPathPoint[],
    targetMetersX: number,
    targetMetersY: number
  ): { x: number; y: number; time_ms: number; segmentIndex: number; distanceMeters: number } | null {
    if (points.length < 2) return null;
    const sorted = [...points].sort((a, b) => a.time_ms - b.time_ms);

    let bestDist = Infinity;
    let bestPoint = {
      x: sorted[0].x,
      y: sorted[0].y,
      time_ms: sorted[0].time_ms,
      segmentIndex: 0,
      distanceMeters: Infinity
    };

    for (let i = 0; i < sorted.length - 1; i++) {
      const p0 = sorted[i];
      const p1 = sorted[i + 1];
      const { cp1, cp2 } = this.getSegmentControlPoints(p0, p1);
      const totalTimeMs = p1.time_ms - p0.time_ms;

      // Muestrear 24 puntos a lo largo de la curva Bézier
      const SAMPLES = 24;
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
            distanceMeters: dist
          };
        }
      }
    }

    return bestPoint;
  }
}

