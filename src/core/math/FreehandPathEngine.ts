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

    // ── MODELADO MATEMÁTICO DE CURVA: EXACTAMENTE 2 NODOS (INICIO Y FIN) ──
    // Separación Estricta: La línea trazada es Path Data, y se modela en un único segmento
    // Bézier Cúbico con CP1 y CP2 calculados para seguir la trayectoria del gesto táctil.
    // Cero Nodos Intermedios ("Node Spam Eradication").

    const durationMs = Math.max(800, Math.round((Math.max(chordDist, totalLength) / estimatedSpeedMps) * 1000));

    // 1. Vector de dirección inicial (tangente de salida en pStart)
    const idxStart = Math.max(1, Math.min(smoothed.length - 1, Math.floor(smoothed.length * 0.25)));
    let t0x = smoothed[idxStart].x - pStart.x;
    let t0y = smoothed[idxStart].y - pStart.y;
    const len0 = Math.hypot(t0x, t0y) || 1;
    t0x /= len0;
    t0y /= len0;

    // 2. Vector de dirección final (tangente de llegada en pEnd)
    const idxEnd = Math.max(0, Math.min(smoothed.length - 2, Math.floor(smoothed.length * 0.75)));
    let t1x = pEnd.x - smoothed[idxEnd].x;
    let t1y = pEnd.y - smoothed[idxEnd].y;
    const len1 = Math.hypot(t1x, t1y) || 1;
    t1x /= len1;
    t1y /= len1;

    // 3. Punto de flexión o ápice de la curva (punto de máxima desviación o punto medio del trazo)
    let pMid = smoothed[Math.floor(smoothed.length / 2)];
    let maxDev = 0;
    for (let i = 1; i < smoothed.length - 1; i++) {
      const dev = this.perpendicularDistance(smoothed[i], pStart, pEnd);
      if (dev > maxDev) {
        maxDev = dev;
        pMid = smoothed[i];
      }
    }

    // Longitud base de los tiradores
    const handleDist = Math.min(chordDist * 0.45, Math.max(chordDist * 0.33, 1.0));

    let cp1x = pStart.x + t0x * handleDist;
    let cp1y = pStart.y + t0y * handleDist;
    let cp2x = pEnd.x - t1x * handleDist;
    let cp2y = pEnd.y - t1y * handleDist;

    // 4. Ajuste por flexión en t = 0.5:
    // B(0.5) = 0.125 * pStart + 0.375 * cp1 + 0.375 * cp2 + 0.125 * pEnd
    const b05x = 0.125 * pStart.x + 0.375 * cp1x + 0.375 * cp2x + 0.125 * pEnd.x;
    const b05y = 0.125 * pStart.y + 0.375 * cp1y + 0.375 * cp2y + 0.125 * pEnd.y;
    const deltaX = (pMid.x - b05x) / 0.75;
    const deltaY = (pMid.y - b05y) / 0.75;

    cp1x += deltaX * 0.85;
    cp1y += deltaY * 0.85;
    cp2x += deltaX * 0.85;
    cp2y += deltaY * 0.85;

    // Limitar tiradores dentro de límites de pista ampliados
    cp1x = Math.max(-10, Math.min(60, Math.round(cp1x * 10) / 10));
    cp1y = Math.max(-10, Math.min(35, Math.round(cp1y * 10) / 10));
    cp2x = Math.max(-10, Math.min(60, Math.round(cp2x * 10) / 10));
    cp2y = Math.max(-10, Math.min(35, Math.round(cp2y * 10) / 10));

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
        cp1x,
        cp1y,
        cp2x,
        cp2y,
        controlPoint1: { x: cp1x, y: cp1y },
        controlPoint2: { x: cp2x, y: cp2y },
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
}
