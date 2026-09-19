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
   * Reduce drásticamente la cantidad de puntos preservando bucles, serpentinas y esquinas.
   *
   * @param points Puntos capturados por el sensor táctil
   * @param epsilon Tolerancia en metros (ej. 0.35m - 0.45m)
   */
  public static simplifyRDP(points: Point2D[], epsilon: number = 0.35): Point2D[] {
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
   * Suavizado adicional por promedio ponderado (Laplacian smoothing) para eliminar temblor de dedo
   */
  public static smoothStrokePoints(points: Point2D[], iterations: number = 1): Point2D[] {
    if (points.length <= 2) return points;
    let smoothed = [...points];

    for (let it = 0; it < iterations; it++) {
      const next: Point2D[] = [smoothed[0]];
      for (let i = 1; i < smoothed.length - 1; i++) {
        const prev = smoothed[i - 1];
        const curr = smoothed[i];
        const nxt = smoothed[i + 1];
        next.push({
          x: 0.25 * prev.x + 0.5 * curr.x + 0.25 * nxt.x,
          y: 0.25 * prev.y + 0.5 * curr.y + 0.25 * nxt.y,
        });
      }
      next.push(smoothed[smoothed.length - 1]);
      smoothed = next;
    }
    return smoothed;
  }

  /**
   * Convierte un conjunto de puntos simplificados en una secuencia de segmentos Bézier cúbicos
   * con Nodos Maestros en los extremos y control points tangenciales (Catmull-Rom to Bezier).
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

    // 1. Suavizar levemente para mitigar temblores del sensor táctil
    const smoothed = this.smoothStrokePoints(rawStroke, 1);

    // 2. Simplificar con RDP (epsilon de 0.30 metros para alta fidelidad de bucles y curvas)
    let simplified = this.simplifyRDP(smoothed, 0.30);

    // Si la simplificación fue demasiado agresiva y dejó menos de 2 puntos, usar extremos
    if (simplified.length < 2) {
      simplified = [smoothed[0], smoothed[smoothed.length - 1]];
    }

    const n = simplified.length;
    const result: ChoreographyPoint[] = [];

    // Calcular distancias acumuladas para distribución temporal proporcional y realista
    const cumulativeDistances: number[] = [0];
    for (let i = 1; i < n; i++) {
      const dist = Math.hypot(simplified[i].x - simplified[i - 1].x, simplified[i].y - simplified[i - 1].y);
      cumulativeDistances.push(cumulativeDistances[i - 1] + dist);
    }

    // 3. Generar tiradores Bézier C1 continuos para cada segmento
    for (let i = 0; i < n; i++) {
      const p = simplified[i];
      const distFromStart = cumulativeDistances[i];
      
      // Tiempo proporcional al desplazamiento en metros (mínimo 600ms por tramo, primer nodo en 0ms)
      const durationMs = i === 0 ? 0 : Math.max(600 * i, Math.round((distFromStart / estimatedSpeedMps) * 1000));
      const nodeTimeMs = baseStartTimeMs + durationMs;

      // Calcular tangentes Catmull-Rom para el segmento hacia el siguiente punto
      let cp1x = p.x;
      let cp1y = p.y;
      let cp2x = p.x;
      let cp2y = p.y;

      if (i < n - 1) {
        const pNext = simplified[i + 1];
        const pPrev = i > 0 ? simplified[i - 1] : { x: p.x - (pNext.x - p.x), y: p.y - (pNext.y - p.y) };
        const pNextNext = i < n - 2 ? simplified[i + 2] : { x: pNext.x + (pNext.x - p.x), y: pNext.y + (pNext.y - p.y) };

        // Vector tangente en p y en pNext
        const t0x = (pNext.x - pPrev.x) / 2;
        const t0y = (pNext.y - pPrev.y) / 2;
        const t1x = (pNextNext.x - p.x) / 2;
        const t1y = (pNextNext.y - p.y) / 2;

        const segDist = Math.hypot(pNext.x - p.x, pNext.y - p.y);
        const factor = 0.33; // 1/3 para Catmull-Rom a Bézier estándar

        // Limitar la magnitud del tirador para evitar auto-intersecciones en giros muy cerrados
        const maxHandleDist = segDist * 0.45;
        const h1Len = Math.hypot(t0x * factor, t0y * factor);
        const scale1 = h1Len > maxHandleDist && h1Len > 0 ? maxHandleDist / h1Len : 1;

        const h2Len = Math.hypot(t1x * factor, t1y * factor);
        const scale2 = h2Len > maxHandleDist && h2Len > 0 ? maxHandleDist / h2Len : 1;

        cp1x = p.x + (t0x * factor) * scale1;
        cp1y = p.y + (t0y * factor) * scale1;
        cp2x = pNext.x - (t1x * factor) * scale2;
        cp2y = pNext.y - (t1y * factor) * scale2;

        // Clamping a límites de la pista
        cp1x = Math.max(0.2, Math.min(49.8, Math.round(cp1x * 10) / 10));
        cp1y = Math.max(0.2, Math.min(24.8, Math.round(cp1y * 10) / 10));
        cp2x = Math.max(0.2, Math.min(49.8, Math.round(cp2x * 10) / 10));
        cp2y = Math.max(0.2, Math.min(24.8, Math.round(cp2y * 10) / 10));
      }

      const isMaster = (i === 0 || i === n - 1);
      const nodeType = isMaster ? 'Step' : 'Curve';

      result.push({
        id: crypto.randomUUID(),
        x: Math.round(p.x * 10) / 10,
        y: Math.round(p.y * 10) / 10,
        time_ms: nodeTimeMs,
        timestamp: nodeTimeMs,
        type: nodeType,
        label: isMaster ? (i === 0 ? 'Inicio Trazo' : 'Fin Trazo') : '',
        cp1x,
        cp1y,
        cp2x,
        cp2y,
        controlPoint1: { x: cp1x, y: cp1y },
        controlPoint2: { x: cp2x, y: cp2y },
      });
    }

    return result;
  }
}
