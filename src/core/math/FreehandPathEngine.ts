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
   * Suavizado de curva por filtrado laplaciano ponderado multi-paso (elimina temblor táctil)
   */
  public static smoothStrokePoints(points: Point2D[], iterations: number = 3): Point2D[] {
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
   * 1. Detecta si el trazo es una línea recta intencional y la corrige eliminando cualquier oscilación.
   * 2. Detecta si es un bucle cerrado y lo enlaza perfectamente.
   * 3. Detecta esquinas y puntos de curvatura para crear Nodos Principales únicamente donde corresponde.
   * 4. Calcula tiradores Bézier C1 continuos sin saturar la línea con puntos intermedios.
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

    // Pre-filtrado: descartar micro-movimientos redundantes (< 0.06m)
    const cleaned: Point2D[] = [rawStroke[0]];
    for (let i = 1; i < rawStroke.length; i++) {
      const p = rawStroke[i];
      const last = cleaned[cleaned.length - 1];
      if (Math.hypot(p.x - last.x, p.y - last.y) >= 0.06) {
        cleaned.push(p);
      }
    }
    if (cleaned.length < 2) {
      cleaned.push(rawStroke[rawStroke.length - 1]);
    }

    // 1. Suavizado multi-paso para eliminar el temblor táctil del dedo
    let smoothed = this.smoothStrokePoints(cleaned, 3);

    const pStart = smoothed[0];
    let pEnd = smoothed[smoothed.length - 1];
    const chordDist = Math.hypot(pEnd.x - pStart.x, pEnd.y - pStart.y);

    // Calcular longitud total acumulada del trazo
    let totalLength = 0;
    for (let i = 1; i < smoothed.length; i++) {
      totalLength += Math.hypot(smoothed[i].x - smoothed[i - 1].x, smoothed[i].y - smoothed[i - 1].y);
    }

    // ── INTELIGENCIA 1: Corrección de Cierre de Bucle / Círculo ──
    if (chordDist < 1.6 && totalLength > 4.5) {
      pEnd = { x: pStart.x, y: pStart.y };
      smoothed[smoothed.length - 1] = pEnd;
    }

    // ── INTELIGENCIA 2: Detección y Enderezado Inteligente de Línea Recta ──
    let maxDevFromChord = 0;
    for (let i = 1; i < smoothed.length - 1; i++) {
      const dev = this.perpendicularDistance(smoothed[i], pStart, pEnd);
      if (dev > maxDevFromChord) maxDevFromChord = dev;
    }

    // Es recta si la desviación máxima es menor a 0.55m o menor al 6.5% de la longitud
    const isStraightLineIntent = chordDist > 1.5 && (maxDevFromChord < 0.55 || (maxDevFromChord / chordDist) < 0.065);

    if (isStraightLineIntent) {
      const durationMs = Math.max(800, Math.round((chordDist / estimatedSpeedMps) * 1000));
      const dx = (pEnd.x - pStart.x) / 3;
      const dy = (pEnd.y - pStart.y) / 3;

      return [
        {
          id: crypto.randomUUID(),
          x: Math.round(pStart.x * 10) / 10,
          y: Math.round(pStart.y * 10) / 10,
          time_ms: baseStartTimeMs,
          timestamp: baseStartTimeMs,
          type: 'Step',
          label: '',
          isMainNode: true,
          cp1x: Math.round((pStart.x + dx) * 10) / 10,
          cp1y: Math.round((pStart.y + dy) * 10) / 10,
          cp2x: Math.round((pEnd.x - dx) * 10) / 10,
          cp2y: Math.round((pEnd.y - dy) * 10) / 10,
          controlPoint1: { x: Math.round((pStart.x + dx) * 10) / 10, y: Math.round((pStart.y + dy) * 10) / 10 },
          controlPoint2: { x: Math.round((pEnd.x - dx) * 10) / 10, y: Math.round((pEnd.y - dy) * 10) / 10 },
        },
        {
          id: crypto.randomUUID(),
          x: Math.round(pEnd.x * 10) / 10,
          y: Math.round(pEnd.y * 10) / 10,
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

    // ── INTELIGENCIA 3: Simplificación Adaptativa de Curvas (RDP Dinámico) ──
    // Tolerancia adaptativa (0.40m - 0.75m) para capturar solo vértices y arcos significativos
    const dynamicEpsilon = Math.max(0.40, Math.min(0.75, totalLength * 0.055));
    let simplified = this.simplifyRDP(smoothed, dynamicEpsilon);

    if (simplified.length < 2) {
      simplified = [smoothed[0], smoothed[smoothed.length - 1]];
    }

    const n = simplified.length;
    const result: ChoreographyPoint[] = [];

    const cumulativeDistances: number[] = [0];
    for (let i = 1; i < n; i++) {
      const dist = Math.hypot(simplified[i].x - simplified[i - 1].x, simplified[i].y - simplified[i - 1].y);
      cumulativeDistances.push(cumulativeDistances[i - 1] + dist);
    }

    for (let i = 0; i < n; i++) {
      const p = simplified[i];
      const distFromStart = cumulativeDistances[i];
      const durationMs = i === 0 ? 0 : Math.max(600 * i, Math.round((distFromStart / estimatedSpeedMps) * 1000));
      const nodeTimeMs = baseStartTimeMs + durationMs;

      let cp1x = p.x;
      let cp1y = p.y;
      let cp2x = p.x;
      let cp2y = p.y;

      let isCorner = false;
      if (i > 0 && i < n - 1) {
        const v1x = p.x - simplified[i - 1].x;
        const v1y = p.y - simplified[i - 1].y;
        const v2x = simplified[i + 1].x - p.x;
        const v2y = simplified[i + 1].y - p.y;
        const dot = v1x * v2x + v1y * v2y;
        const m1 = Math.hypot(v1x, v1y);
        const m2 = Math.hypot(v2x, v2y);
        if (m1 > 0 && m2 > 0) {
          const cosAngle = Math.max(-1, Math.min(1, dot / (m1 * m2)));
          const angleDeg = (Math.acos(cosAngle) * 180) / Math.PI;
          if (angleDeg > 45) {
            isCorner = true;
          }
        }
      }

      if (i < n - 1) {
        const pNext = simplified[i + 1];
        const pPrev = i > 0 ? simplified[i - 1] : { x: p.x - (pNext.x - p.x), y: p.y - (pNext.y - p.y) };
        const pNextNext = i < n - 2 ? simplified[i + 2] : { x: pNext.x + (pNext.x - p.x), y: pNext.y + (pNext.y - p.y) };

        // Si es una esquina intencional, quebrar tangencia para ángulo nítido
        const t0x = isCorner ? (pNext.x - p.x) : (pNext.x - pPrev.x) / 2;
        const t0y = isCorner ? (pNext.y - p.y) : (pNext.y - pPrev.y) / 2;
        const t1x = (pNextNext.x - p.x) / 2;
        const t1y = (pNextNext.y - p.y) / 2;

        const segDist = Math.hypot(pNext.x - p.x, pNext.y - p.y);
        const factor = 0.33;
        const maxHandleDist = segDist * 0.45;

        const h1Len = Math.hypot(t0x * factor, t0y * factor);
        const scale1 = h1Len > maxHandleDist && h1Len > 0 ? maxHandleDist / h1Len : 1;

        const h2Len = Math.hypot(t1x * factor, t1y * factor);
        const scale2 = h2Len > maxHandleDist && h2Len > 0 ? maxHandleDist / h2Len : 1;

        cp1x = p.x + (t0x * factor) * scale1;
        cp1y = p.y + (t0y * factor) * scale1;
        cp2x = pNext.x - (t1x * factor) * scale2;
        cp2y = pNext.y - (t1y * factor) * scale2;

        cp1x = Math.max(0.2, Math.min(49.8, Math.round(cp1x * 10) / 10));
        cp1y = Math.max(0.2, Math.min(24.8, Math.round(cp1y * 10) / 10));
        cp2x = Math.max(0.2, Math.min(49.8, Math.round(cp2x * 10) / 10));
        cp2y = Math.max(0.2, Math.min(24.8, Math.round(cp2y * 10) / 10));
      }

      // Nodos Principales: solo Inicio, Fin y Vértices/Esquinas
      const isMaster = (i === 0 || i === n - 1 || isCorner);
      const nodeType = isMaster ? 'Step' : 'Curve';
      const label = '';

      result.push({
        id: crypto.randomUUID(),
        x: Math.round(p.x * 10) / 10,
        y: Math.round(p.y * 10) / 10,
        time_ms: nodeTimeMs,
        timestamp: nodeTimeMs,
        type: nodeType,
        label,
        isMainNode: isMaster,
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
