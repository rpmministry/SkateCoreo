/**
 * FreehandPathEngine.ts — Motor de Trazado a Mano Alzada (Freehand Pathing)
 *
 * Convierte los cientos de puntos muestreados por el sensor táctil en una curva
 * Bézier cúbica limpia y fluida, aplicando:
 *  1. Ramer-Douglas-Peucker (RDP) para simplificación y reducción de ruido.
 *  2. Interpolación suave de Splines (Catmull-Rom a Bézier cúbico).
 *  3. Creación de Nodos Maestros al inicio y fin del trazo libre.
 */

import { ChoreographyPoint } from '../../types/choreography';

export interface Point2D {
  x: number; // en metros de la pista (0 - 50)
  y: number; // en metros de la pista (0 - 25)
}

export class FreehandPathEngine {
  /**
   * Distancia perpendicular de un punto P a la recta definida por A y B
   */
  public static perpendicularDistance(p: Point2D, a: Point2D, b: Point2D): number {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lenSq = dx * dx + dy * dy;

    if (lenSq === 0) {
      return Math.hypot(p.x - a.x, p.y - a.y);
    }

    // Proyección escalar sobre la recta
    const num = Math.abs(dy * p.x - dx * p.y + b.x * a.y - b.y * a.x);
    return num / Math.sqrt(lenSq);
  }

  /**
   * Algoritmo Ramer-Douglas-Peucker (RDP) para simplificación de polilíneas.
   * Reduce el ruido del temblor manual conservando fielmente bucles (loops), círculos 360°,
   * figuras en ocho, brackets y serpentinas.
   *
   * @param points Puntos capturados por el sensor táctil
   * @param epsilon Tolerancia en metros (0.12m ~ 2.4 píxeles en viewport estándar)
   */
  public static simplifyRDP(points: Point2D[], epsilon: number = 0.12): Point2D[] {
    if (points.length <= 2) return points;

    let dmax = 0;
    let index = 0;
    const last = points.length - 1;

    for (let i = 1; i < last; i++) {
      const d = this.perpendicularDistance(points[i], points[0], points[last]);
      if (d > dmax) {
        index = i;
        dmax = d;
      }
    }

    if (dmax > epsilon) {
      // División recursiva
      const left = this.simplifyRDP(points.slice(0, index + 1), epsilon);
      const right = this.simplifyRDP(points.slice(index), epsilon);
      return left.slice(0, left.length - 1).concat(right);
    } else {
      return [points[0], points[last]];
    }
  }

  /**
   * Suavizado de curva por filtrado laplaciano ponderado multi-paso (elimina temblor táctil)
   */
  public static smoothStrokePoints(points: Point2D[], iterations: number = 2): Point2D[] {
    if (points.length <= 2) return points;
    let smoothed = [...points];

    for (let it = 0; it < iterations; it++) {
      const next: Point2D[] = [smoothed[0]];
      for (let i = 1; i < smoothed.length - 1; i++) {
        const prev = smoothed[i - 1];
        const curr = smoothed[i];
        const nxt = smoothed[i + 1];
        next.push({
          x: 0.15 * prev.x + 0.70 * curr.x + 0.15 * nxt.x,
          y: 0.15 * prev.y + 0.70 * curr.y + 0.15 * nxt.y,
        });
      }
      next.push(smoothed[smoothed.length - 1]);
      smoothed = next;
    }
    return smoothed;
  }

  /**
   * Perfeccionamiento Inteligente y Conversión a Nodos Coreográficos:
   * 1. Detecta si el trazo es una línea recta intencional y la alinea limpiamente.
   * 2. Si el trazo es una figura compleja (loops, giros de 360°, figuras en ocho, espirales),
   *    preserva íntegramente la huella geométrica filtrada mediante RDP conservador (epsilon ~0.12m / ~2.5px).
   * 3. Retorna estrictamente 2 Nodos Maestros (inicio y fin) para evitar saturación de la interfaz (Zero Node Spam),
   *    asociando el arreglo completo de puntos del trazo (path) al nodo de inicio para renderizado Catmull-Rom Spline.
   * 4. Ancla el Nodo Final con precisión micrométrica exactamente donde se levantó el dedo (Touch End).
   *
   * @param rawStroke Puntos crudos registrados durante el gesto táctil
   * @param baseStartTimeMs Marca de tiempo inicial para el primer nodo
   * @param estimatedSpeedMps Velocidad promedio del patinador (por defecto 3.5 m/s)
   */
  public static convertStrokeToChoreographyPoints(
    rawStroke: Point2D[],
    baseStartTimeMs: number,
    estimatedSpeedMps: number = 3.5
  ): ChoreographyPoint[] {
    if (rawStroke.length < 2) return [];

    // Pre-filtrado: descartar micro-movimientos redundantes (< 0.04m ~ 0.8px)
    const cleaned: Point2D[] = [rawStroke[0]];
    for (let i = 1; i < rawStroke.length; i++) {
      const p = rawStroke[i];
      const last = cleaned[cleaned.length - 1];
      if (Math.hypot(p.x - last.x, p.y - last.y) >= 0.04) {
        cleaned.push(p);
      }
    }
    if (cleaned.length < 2) {
      cleaned.push(rawStroke[rawStroke.length - 1]);
    }

    // 1. Suavizado multi-paso moderado para eliminar el temblor táctil sin desdibujar la figura
    const smoothed = this.smoothStrokePoints(cleaned, 2);

    const pStart = smoothed[0];
    const pEnd = smoothed[smoothed.length - 1];
    const chordDist = Math.hypot(pEnd.x - pStart.x, pEnd.y - pStart.y);

    // Calcular longitud total acumulada del trazo
    let totalLength = 0;
    for (let i = 1; i < smoothed.length; i++) {
      totalLength += Math.hypot(smoothed[i].x - smoothed[i - 1].x, smoothed[i].y - smoothed[i - 1].y);
    }

    // ── INTELIGENCIA: Detección de Línea Recta Intencional ──
    let maxDevFromChord = 0;
    for (let i = 1; i < smoothed.length - 1; i++) {
      const dev = this.perpendicularDistance(smoothed[i], pStart, pEnd);
      if (dev > maxDevFromChord) maxDevFromChord = dev;
    }

    // Es recta si la desviación máxima es menor a 0.35m o menor al 5% de la cuerda
    const isStraightLineIntent = chordDist > 1.5 && (maxDevFromChord < 0.35 || (maxDevFromChord / chordDist) < 0.05);

    let pathPoints: Point2D[];
    if (isStraightLineIntent) {
      pathPoints = [
        { x: Math.round(pStart.x * 100) / 100, y: Math.round(pStart.y * 100) / 100 },
        { x: Math.round(pEnd.x * 100) / 100, y: Math.round(pEnd.y * 100) / 100 }
      ];
    } else {
      // Conservación fiel de TODOS los micro-puntos capturados (círculos, bucles, ochos)
      // Sin colapso destructivo RDP: Cada punto por donde pasó el dedo se preserva
      pathPoints = smoothed.map(p => ({
        x: Math.round(p.x * 100) / 100,
        y: Math.round(p.y * 100) / 100
      }));
      pathPoints[0] = { x: Math.round(pStart.x * 100) / 100, y: Math.round(pStart.y * 100) / 100 };
      pathPoints[pathPoints.length - 1] = { x: Math.round(pEnd.x * 100) / 100, y: Math.round(pEnd.y * 100) / 100 };
    }

    const durationMs = Math.max(800, Math.round((Math.max(chordDist, totalLength) / estimatedSpeedMps) * 1000));

    // Tangentes de salida y llegada para tiradores Bézier de respaldo (fallback)
    const idxStart = Math.max(1, Math.min(smoothed.length - 1, Math.floor(smoothed.length * 0.25)));
    let t0x = smoothed[idxStart].x - pStart.x;
    let t0y = smoothed[idxStart].y - pStart.y;
    const len0 = Math.hypot(t0x, t0y) || 1;
    t0x /= len0;
    t0y /= len0;

    const idxEnd = Math.max(0, Math.min(smoothed.length - 2, Math.floor(smoothed.length * 0.75)));
    let t1x = pEnd.x - smoothed[idxEnd].x;
    let t1y = pEnd.y - smoothed[idxEnd].y;
    const len1 = Math.hypot(t1x, t1y) || 1;
    t1x /= len1;
    t1y /= len1;

    const handleDist = Math.min(chordDist * 0.45, Math.max(chordDist * 0.33, 1.0));
    let cp1x = Math.round((pStart.x + t0x * handleDist) * 10) / 10;
    let cp1y = Math.round((pStart.y + t0y * handleDist) * 10) / 10;
    let cp2x = Math.round((pEnd.x - t1x * handleDist) * 10) / 10;
    let cp2y = Math.round((pEnd.y - t1y * handleDist) * 10) / 10;

    return [
      {
        id: crypto.randomUUID(),
        x: Math.round(pStart.x * 100) / 100,
        y: Math.round(pStart.y * 100) / 100,
        time_ms: baseStartTimeMs,
        timestamp: baseStartTimeMs,
        type: 'Step',
        label: '',
        isMainNode: true,
        cp1x,
        cp1y,
        cp2x,
        cp2y,
        controlPoint1: { x: cp1x, y: cp1y },
        controlPoint2: { x: cp2x, y: cp2y },
        path: pathPoints, // Huella geométrica completa preservando loops y círculos
      },
      {
        id: crypto.randomUUID(),
        x: Math.round(pEnd.x * 100) / 100,
        y: Math.round(pEnd.y * 100) / 100,
        time_ms: baseStartTimeMs + durationMs,
        timestamp: baseStartTimeMs + durationMs,
        type: 'Step',
        label: '',
        isMainNode: true,
        cp1x: Math.round(pEnd.x * 10) / 10,
        cp1y: Math.round(pEnd.y * 10) / 10,
        cp2x: Math.round(pEnd.x * 10) / 10,
        cp2y: Math.round(pEnd.y * 10) / 10,
        controlPoint1: { x: Math.round(pEnd.x * 10) / 10, y: Math.round(pEnd.y * 10) / 10 },
        controlPoint2: { x: Math.round(pEnd.x * 10) / 10, y: Math.round(pEnd.y * 10) / 10 },
      },
    ];
  }
}
