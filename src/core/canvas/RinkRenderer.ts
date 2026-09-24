import { CanvasViewportMetrics, RinkMath } from './RinkMath';
import { roundRectPath } from './roundRectPath';
import { ChoreographyPathPoint, ElementLog, SkaterAvatarState, RinkDimensions, SkaterGender, isMainNode } from '../../types/choreography';

export type ChoreographyPhase = 'plot' | 'connect' | 'curve' | 'erase';

export interface RenderOptions {
  showRinkGrid: boolean;
  showControlHandles: boolean;
  selectedPointId: string | null;
  activeSegmentIndex: number | null;
  /** Nodo que se está arrastrando ahora mismo (feedback visual reforzado). */
  draggingPointId?: string | null;
  isPathGenerated?: boolean;
  phase?: ChoreographyPhase;
  isPlaying?: boolean;
  showFullTrailOverride?: boolean;
  currentTimeMs?: number;
  avatar?: SkaterAvatarState | null;
  showReglamentaryGuides?: boolean;
  showCompulsoryFigures?: boolean;
  paperTraceOverlay?: { imageUrl: string; opacity: number; visible: boolean } | null;
  paperTraceImageElement?: HTMLImageElement | null;
}

// Pre-carga de imágenes de los patinadores artísticos (SVG de alta resolución)
let femaleSkaterImage: HTMLImageElement | null = null;
let maleSkaterImage: HTMLImageElement | null = null;

if (typeof window !== 'undefined') {
  femaleSkaterImage = new Image();
  femaleSkaterImage.src = '/female_skater.svg';

  maleSkaterImage = new Image();
  maleSkaterImage.src = '/male_skater.svg';
}

export class RinkRenderer {
  public static clear(ctx: CanvasRenderingContext2D, width: number, height: number) {
    ctx.clearRect(0, 0, width, height);
  }

  /**
   * Dibuja la pista reglamentaria de 50x25m con marcas oficiales World Skate
   */
  public static drawRinkFloor(
    ctx: CanvasRenderingContext2D,
    metrics: CanvasViewportMetrics,
    rink: RinkDimensions,
    options: RenderOptions
  ) {
    const { offsetX, offsetY, renderedW, renderedH, scale } = metrics;
    const cornerRadiusPx = rink.cornerRoundsMeters * scale;

    ctx.save();

    // Superficie de la pista (Pabellón oscuro de alto contraste)
    ctx.beginPath();
    roundRectPath(ctx, offsetX, offsetY, renderedW, renderedH, cornerRadiusPx);
    ctx.fillStyle = '#090D16';
    ctx.fill();

    // ── Etapa 1: Superposición de Calco de Papel (Paper-to-Digital Overlay) ──
    if (
      options.paperTraceOverlay?.visible &&
      options.paperTraceImageElement &&
      options.paperTraceImageElement.complete &&
      options.paperTraceImageElement.naturalWidth > 0
    ) {
      ctx.save();
      ctx.beginPath();
      roundRectPath(ctx, offsetX, offsetY, renderedW, renderedH, cornerRadiusPx);
      ctx.clip(); // Recortar estrictamente al perímetro interior de la pista

      ctx.globalAlpha = Math.max(0.05, Math.min(1.0, options.paperTraceOverlay.opacity));
      ctx.drawImage(
        options.paperTraceImageElement,
        offsetX,
        offsetY,
        renderedW,
        renderedH
      );
      ctx.restore();
    }

    // Valla perimetral reglamentaria en tono neutro
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#475569';
    ctx.stroke();

    // Fondo hielo interior sutil
    ctx.fillStyle = 'rgba(15, 23, 42, 0.4)';
    ctx.fill();

    // ── Guías Espaciales Reglamentarias (World Skate / FEP) ──
    const showGuides = options.showReglamentaryGuides !== false;

    if (showGuides) {
      const guides = RinkMath.getRegulatoryGuides(rink);

      // 1. Eje Largo (Long Axis) - Evaluación de Skating Skills (>= 3/4 recorrido)
      ctx.save();
      ctx.setLineDash([6, 6]);
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.35)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(offsetX, offsetY + renderedH / 2);
      ctx.lineTo(offsetX + renderedW, offsetY + renderedH / 2);
      ctx.stroke();

      // Marcas de 3/4 de longitud: SOLO referencia gráfica, sin texto alguno.
      // La pista debe quedar libre de rótulos obstructivos; el indicador es
      // puramente visual (tick + punto) y se puede desactivar con
      // `showReglamentaryGuides: false` desde Ajustes de Pista.
      ctx.setLineDash([]);
      ctx.strokeStyle = '#00F0FF';
      ctx.fillStyle = '#00F0FF';
      ctx.lineWidth = 1.5;

      guides.longAxis.threeQuarterMarks.forEach((mark) => {
        const markX = offsetX + mark.x * scale;
        const markY = offsetY + renderedH / 2;

        // Tick perpendicular
        ctx.beginPath();
        ctx.moveTo(markX, markY - 8);
        ctx.lineTo(markX, markY + 8);
        ctx.stroke();

        // Punto central de referencia (sustituye al antiguo texto "3/4 (37.5m)")
        ctx.beginPath();
        ctx.arc(markX, markY, 2.4, 0, Math.PI * 2);
        ctx.fillStyle = '#00F0FF';
        ctx.fill();

        // Halo tenue para reforzar la lectura sin añadir ruido tipográfico
        ctx.beginPath();
        ctx.arc(markX, markY, 5, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(0, 240, 255, 0.35)';
        ctx.lineWidth = 1;
        ctx.stroke();
      });
      ctx.restore();

      // 2. Eje Corto (Short Axis) - Línea central transversal
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.3)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(offsetX + renderedW / 2, offsetY);
      ctx.lineTo(offsetX + renderedW / 2, offsetY + renderedH);
      ctx.stroke();
      ctx.restore();

      // 3. Diagonales Reglamentarias - Evaluación de Scissors (>= 3/4 recorrido)
      ctx.save();
      ctx.setLineDash([4, 6]);
      ctx.strokeStyle = 'rgba(168, 85, 247, 0.25)'; // Púrpura sutil
      ctx.lineWidth = 1.2;

      guides.diagonals.forEach((diag) => {
        const startX = offsetX + diag.start.x * scale;
        const startY = offsetY + diag.start.y * scale;
        const endX = offsetX + diag.end.x * scale;
        const endY = offsetY + diag.end.y * scale;

        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(endX, endY);
        ctx.stroke();

        // Marcas de 3/4 sobre la diagonal
        diag.threeQuarterMarks.forEach((m) => {
          const mx = offsetX + m.x * scale;
          const my = offsetY + m.y * scale;

          ctx.save();
          ctx.setLineDash([]);
          ctx.strokeStyle = '#A855F7';
          ctx.fillStyle = '#A855F7';
          ctx.beginPath();
          ctx.arc(mx, my, 2.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          ctx.restore();
        });
      });
      ctx.restore();
    }

    // Círculo central reglamentario
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(offsetX + renderedW / 2, offsetY + renderedH / 2, 3 * scale, 0, Math.PI * 2);
    ctx.stroke();

    // ── Patrón Oficial de Figuras Obligatorias (World Skate Compulsory Figures) ──
    if (options.showCompulsoryFigures) {
      ctx.save();
      const figures = RinkMath.getCompulsoryFiguresCircles(rink);

      figures.forEach((fig) => {
        const cx = offsetX + fig.center.x * scale;
        const cy = offsetY + fig.center.y * scale;
        const rPx = fig.radius * scale;

        ctx.setLineDash(fig.isLoop ? [2, 2] : [4, 4]);
        ctx.strokeStyle = fig.isLoop ? 'rgba(245, 158, 11, 0.6)' : 'rgba(0, 240, 255, 0.45)';
        ctx.lineWidth = fig.isLoop ? 1.5 : 1.2;
        ctx.beginPath();
        ctx.arc(cx, cy, rPx, 0, Math.PI * 2);
        ctx.stroke();

        // Centro del círculo
        ctx.fillStyle = fig.isLoop ? '#F59E0B' : '#00F0FF';
        ctx.beginPath();
        ctx.arc(cx, cy, 2, 0, Math.PI * 2);
        ctx.fill();

        // Etiqueta del círculo
        ctx.font = '8px JetBrains Mono, monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillStyle = fig.isLoop ? 'rgba(245, 158, 11, 0.8)' : 'rgba(0, 240, 255, 0.7)';
        ctx.fillText(fig.name, cx, cy + (fig.isLoop ? rPx + 2 : 4));
      });
      ctx.restore();
    }

    // Marcas de competición reglamentarias (Opcionales por toggle de cuadrícula)
    if (options.showRinkGrid) {
      // Círculos de saltos y trompos (3 círculos reglamentarios)
      const circleRPx = 6 * scale;

      // Círculo izquierdo
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.25)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(offsetX + renderedW * 0.25, offsetY + renderedH / 2, circleRPx, 0, Math.PI * 2);
      ctx.stroke();

      // Círculo derecho
      ctx.beginPath();
      ctx.arc(offsetX + renderedW * 0.75, offsetY + renderedH / 2, circleRPx, 0, Math.PI * 2);
      ctx.stroke();

      // Panel de jueces World Skate con ancho dinámico intrínseco (Text Overflow Fix)
      const judgeText = 'PANEL DE JUECES (WORLD SKATE)';
      ctx.font = 'bold 9px JetBrains Mono, monospace';
      const textMetrics = ctx.measureText(judgeText);
      const judgePadX = 14;
      const judgeW = Math.ceil(textMetrics.width + judgePadX * 2);
      const judgeH = 18;
      const judgeX = offsetX + (renderedW - judgeW) / 2;
      const judgeY = Math.max(2, offsetY - 20);

      ctx.fillStyle = 'rgba(245, 158, 11, 0.15)';
      ctx.beginPath();
      roundRectPath(ctx, judgeX, judgeY, judgeW, judgeH, 4);
      ctx.fill();

      ctx.strokeStyle = '#F59E0B';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.fillStyle = '#F59E0B';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(judgeText, judgeX + judgeW / 2, judgeY + judgeH / 2);
    }

    ctx.restore();
  }

  /**
   * Dibuja las curvas de trayectoria (Glow exterior + línea sólida).
   *
   * REGLA FUNDAMENTAL (separación Nodos / Trazar):
   *   · Colocar o mover nodos NUNCA dibuja una línea entre ellos.
   *   · Un segmento sólo se representa si el usuario lo CREÓ explícitamente con
   *     la herramienta Trazar: huella de alta fidelidad (`path` = dibujo libre)
   *     o curva esculpida (drag-to-curve). Sin trazo explícito no hay recorrido.
   * Las guías reglamentarias de la pista se dibujan en otra capa y no se tocan.
   */
  public static drawTrajectories(
    ctx: CanvasRenderingContext2D,
    metrics: CanvasViewportMetrics,
    points: ChoreographyPathPoint[],
    options: RenderOptions
  ) {
    if (points.length < 2) return;
    const sorted = [...points].sort((a, b) => a.time_ms - b.time_ms);
    if (sorted.length < 2) return;

    const isPlaying = options.isPlaying ?? false;
    const showFullTrailOverride = options.showFullTrailOverride ?? false;

    // 1) LA TRAYECTORIA REAL DEL USUARIO SIEMPRE SE DIBUJA.
    //    Es una capa INDEPENDIENTE del avatar: aunque la patinadora esté oculta
    //    durante PLAY, el recorrido creado con Trazar permanece visible. Durante
    //    la reproducción (o el modo "Ver Trazo Completo") se pinta en alto
    //    contraste; en edición, como guía suave.
    this.drawTracedPath(ctx, metrics, sorted, options, isPlaying || showFullTrailOverride);

    // 2) La ESTELA DINÁMICA de progreso es ADITIVA: se superpone al trazado
    //    únicamente durante PLAY y cuando el avatar está visible. Nunca lo sustituye.
    if (isPlaying && options.avatar) {
      this.drawDynamicTrail(ctx, metrics, sorted, options);
    }
  }

  /**
   * Dibuja la trayectoria real trazada por el usuario (solo segmentos creados
   * explícitamente con Trazar). Capa independiente del avatar.
   */
  private static drawTracedPath(
    ctx: CanvasRenderingContext2D,
    metrics: CanvasViewportMetrics,
    sorted: ChoreographyPathPoint[],
    options: RenderOptions,
    highContrast: boolean
  ) {
    const { offsetX, offsetY, renderedW, renderedH, scale } = metrics;
    const cornerRadiusPx = 3.5 * scale;

    ctx.save();
    // Límite estricto perimetral: recorta toda la trayectoria a los límites físicos exactos de la pista
    ctx.beginPath();
    roundRectPath(ctx, offsetX, offsetY, renderedW, renderedH, cornerRadiusPx);
    ctx.clip();

    for (let i = 0; i < sorted.length - 1; i++) {
      const p0 = sorted[i];
      const p1 = sorted[i + 1];

      // Los nodos recién DIGITALIZADOS no tienen conexión (unlinked): la pista
      // solo muestra puntos sueltos, sin trazos de unión, hasta que el usuario
      // los edite/conecte.
      if (p0.unlinked || p1.unlinked) continue;

      const isSegmentSelected = options.selectedPointId === p0.id || options.selectedPointId === p1.id;
      const hasSplinePath = Boolean(p0.path && p0.path.length >= 2);
      // Bézier SOLO si el usuario esculpió la curva (drag-to-curve).
      const hasCustomCps =
        p0.curveShaped === true && p0.cp1x !== undefined && p0.cp2x !== undefined;

      // Sin trazo explícito no hay recorrido: los nodos permanecen independientes
      // (ninguna conexión automática por el simple hecho de existir 2+ nodos).
      if (!hasSplinePath && !hasCustomCps) continue;

      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      const strokeCurve = () => {
        ctx.beginPath();
        if (hasSplinePath) {
          RinkRenderer.traceSplinePath(ctx, p0.path!, metrics);
        } else {
          const pt0 = RinkMath.metersToPixels(p0.x, p0.y, metrics);
          const pt1 = RinkMath.metersToPixels(p1.x, p1.y, metrics);
          const cp1 = RinkMath.metersToPixels(p0.cp1x!, p0.cp1y ?? p0.y, metrics);
          const cp2 = RinkMath.metersToPixels(p0.cp2x!, p0.cp2y ?? p1.y, metrics);
          ctx.moveTo(pt0.px, pt0.py);
          ctx.bezierCurveTo(cp1.px, cp1.py, cp2.px, cp2.py, pt1.px, pt1.py);
        }
        ctx.stroke();
      };

      if (highContrast) {
        // Reproducción / Modo Didáctico: trazado claro y siempre visible.
        ctx.strokeStyle = isSegmentSelected ? 'rgba(0, 210, 255, 0.6)' : 'rgba(0, 210, 255, 0.35)';
        ctx.lineWidth = isSegmentSelected ? 8 : 5;
        strokeCurve();

        ctx.strokeStyle = isSegmentSelected ? '#67E8F9' : '#00D2FF';
        ctx.lineWidth = isSegmentSelected ? 3 : 2;
        strokeCurve();
      } else {
        // Guía inicial visual suave (no invasiva)
        ctx.setLineDash([5, 5]);
        ctx.strokeStyle = isSegmentSelected ? 'rgba(0, 210, 255, 0.7)' : 'rgba(56, 189, 248, 0.35)';
        ctx.lineWidth = isSegmentSelected ? 2.5 : 1.5;
        strokeCurve();
      }

      ctx.restore();
    }

    ctx.restore();
  }

  /**
   * Traza una trayectoria continua conectando TODOS los puntos capturados en la huella (Polyline / Multi-segment).
   * Itera sobre cada punto garantizando la preservación exacta de figuras complejas (círculos 360°, bucles, ochos).
   */
  public static traceSplinePath(
    ctx: CanvasRenderingContext2D,
    path: Array<{ x: number; y: number }>,
    metrics: CanvasViewportMetrics
  ) {
    if (path.length < 2) return;
    const n = path.length;

    const pt0 = RinkMath.metersToPixels(path[0].x, path[0].y, metrics);
    ctx.moveTo(pt0.px, pt0.py);

    // Bucle iterativo sobre CADA UNO de los puntos capturados en el arreglo
    for (let i = 1; i < n; i++) {
      const pt = RinkMath.metersToPixels(path[i].x, path[i].y, metrics);
      ctx.lineTo(pt.px, pt.py);
    }
  }

  /**
   * Traza una trayectoria continua parcial a través de la huella hasta el parámetro t (0 <= t <= 1).
   */
  public static tracePartialSplinePath(
    ctx: CanvasRenderingContext2D,
    path: Array<{ x: number; y: number }>,
    t: number,
    metrics: CanvasViewportMetrics
  ) {
    if (path.length < 2) return;
    const clampedT = Math.max(0, Math.min(1, t));
    const n = path.length;

    const dists: number[] = [0];
    for (let i = 1; i < n; i++) {
      dists.push(dists[i - 1] + Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y));
    }
    const totalDist = dists[n - 1];
    if (totalDist === 0) return;

    const targetDist = clampedT * totalDist;
    const pt0 = RinkMath.metersToPixels(path[0].x, path[0].y, metrics);
    ctx.moveTo(pt0.px, pt0.py);

    for (let i = 1; i < n; i++) {
      if (dists[i] <= targetDist) {
        const pt = RinkMath.metersToPixels(path[i].x, path[i].y, metrics);
        ctx.lineTo(pt.px, pt.py);
      } else {
        const segLen = dists[i] - dists[i - 1];
        const u = segLen > 0 ? (targetDist - dists[i - 1]) / segLen : 0;
        const interpX = path[i - 1].x + (path[i].x - path[i - 1].x) * u;
        const interpY = path[i - 1].y + (path[i].y - path[i - 1].y) * u;
        const pt = RinkMath.metersToPixels(interpX, interpY, metrics);
        ctx.lineTo(pt.px, pt.py);
        break;
      }
    }
  }

  /**
   * Trazado Dinámico (Dynamic Trail Rendering):
   * Dibuja la estela activa desde el último checkpoint alcanzado hasta el avatar,
   * y aplica un desvanecimiento suave (Fade-Out) al tramo anterior para evitar saturación y flickering.
   */
  public static drawDynamicTrail(
    ctx: CanvasRenderingContext2D,
    metrics: CanvasViewportMetrics,
    sortedPoints: ChoreographyPathPoint[],
    options: RenderOptions
  ) {
    if (sortedPoints.length < 2) return;
    const currentTimeMs = options.currentTimeMs ?? 0;
    const avatar = options.avatar;
    if (!avatar) return;

    const { offsetX, offsetY, renderedW, renderedH, scale } = metrics;
    const cornerRadiusPx = 3.5 * scale;

    ctx.save();
    ctx.beginPath();
    roundRectPath(ctx, offsetX, offsetY, renderedW, renderedH, cornerRadiusPx);
    ctx.clip();

    // 1. Encontrar el tramo actual del avatar
    let activeSegIdx = -1;
    for (let i = 0; i < sortedPoints.length - 1; i++) {
      if (currentTimeMs >= sortedPoints[i].time_ms && currentTimeMs <= sortedPoints[i + 1].time_ms) {
        activeSegIdx = i;
        break;
      }
    }

    if (activeSegIdx < 0) {
      if (currentTimeMs > sortedPoints[sortedPoints.length - 1].time_ms) {
        activeSegIdx = sortedPoints.length - 2;
      } else {
        ctx.restore();
        return;
      }
    }

    const p0 = sortedPoints[activeSegIdx];
    const p1 = sortedPoints[activeSegIdx + 1];
    const totalTimeMs = p1.time_ms - p0.time_ms;
    const t = totalTimeMs > 0 ? Math.min(1, Math.max(0, (currentTimeMs - p0.time_ms) / totalTimeMs)) : 1;

    // 2. Efecto Estela / Fade-Out del Segmento Anterior (evita corte seco visual)
    if (activeSegIdx > 0) {
      const prevP0 = sortedPoints[activeSegIdx - 1];
      const prevP1 = sortedPoints[activeSegIdx];
      const fadeAlpha = Math.max(0, 0.45 * (1 - t));
      if (fadeAlpha > 0.02) {
        ctx.save();
        ctx.strokeStyle = `rgba(0, 210, 255, ${fadeAlpha})`;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        if (prevP0.path && prevP0.path.length >= 2) {
          RinkRenderer.traceSplinePath(ctx, prevP0.path, metrics);
        } else if (prevP0.cp1x !== undefined && prevP0.cp2x !== undefined) {
          const ptPrev0 = RinkMath.metersToPixels(prevP0.x, prevP0.y, metrics);
          const ptPrev1 = RinkMath.metersToPixels(prevP1.x, prevP1.y, metrics);
          const cpPrev1 = RinkMath.metersToPixels(prevP0.cp1x, prevP0.cp1y ?? prevP0.y, metrics);
          const cpPrev2 = RinkMath.metersToPixels(prevP0.cp2x, prevP0.cp2y ?? prevP1.y, metrics);
          ctx.moveTo(ptPrev0.px, ptPrev0.py);
          ctx.bezierCurveTo(cpPrev1.px, cpPrev1.py, cpPrev2.px, cpPrev2.py, ptPrev1.px, ptPrev1.py);
        } else {
          const ptPrev0 = RinkMath.metersToPixels(prevP0.x, prevP0.y, metrics);
          const ptPrev1 = RinkMath.metersToPixels(prevP1.x, prevP1.y, metrics);
          ctx.moveTo(ptPrev0.px, ptPrev0.py);
          ctx.lineTo(ptPrev1.px, ptPrev1.py);
        }
        ctx.stroke();
        ctx.restore();
      }
    }

    // 3. Trazado Dinámico Activo: desde p0 hasta la posición actual del avatar (t)
    const avatarPx = RinkMath.metersToPixels(avatar.x, avatar.y, metrics);

    ctx.save();

    const traceActive = () => {
      ctx.beginPath();
      if (p0.path && p0.path.length >= 2) {
        RinkRenderer.tracePartialSplinePath(ctx, p0.path, t, metrics);
      } else if (p0.cp1x !== undefined && p0.cp2x !== undefined) {
        const pt0 = RinkMath.metersToPixels(p0.x, p0.y, metrics);
        const q1x = (1 - t) * p0.x + t * p0.cp1x;
        const q1y = (1 - t) * p0.y + t * (p0.cp1y ?? p0.y);
        const q2x = (1 - t) * p0.cp1x + t * p0.cp2x;
        const q2y = (1 - t) * (p0.cp1y ?? p0.y) + t * (p0.cp2y ?? p1.y);
        const subCp1 = RinkMath.metersToPixels(q1x, q1y, metrics);
        const subCp2 = RinkMath.metersToPixels(q2x, q2y, metrics);
        ctx.moveTo(pt0.px, pt0.py);
        ctx.bezierCurveTo(subCp1.px, subCp1.py, subCp2.px, subCp2.py, avatarPx.px, avatarPx.py);
      } else {
        const pt0 = RinkMath.metersToPixels(p0.x, p0.y, metrics);
        ctx.moveTo(pt0.px, pt0.py);
        ctx.lineTo(avatarPx.px, avatarPx.py);
      }
      ctx.stroke();
    };

    // Resplandor Neón exterior de la cuchilla
    ctx.strokeStyle = 'rgba(0, 210, 255, 0.65)';
    ctx.lineWidth = 8;
    traceActive();

    // Línea sólida de trazado dinámico
    ctx.strokeStyle = '#00D2FF';
    ctx.lineWidth = 3.5;
    traceActive();

    // Chispazo luminoso sutil en la cuchilla de la patinadora
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(avatarPx.px, avatarPx.py, 3, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
    ctx.restore();
  }

  /**
   * Dibuja los puntos de anclaje de posición estándar de la coreografía.
   * Filtro visual inteligente: Muestra ÚNICAMENTE los Nodos Principales (Nodos Maestros),
   * ocultando los puntos de curvatura intermedios para que la línea se vea limpia y despejada.
   */
  public static drawAnchorPoints(
    ctx: CanvasRenderingContext2D,
    metrics: CanvasViewportMetrics,
    points: ChoreographyPathPoint[],
    selectedPointId: string | null,
    draggingPointId: string | null = null
  ) {
    let visibleIndex = 0;

    points.forEach((p, idx) => {
      const isSelected = selectedPointId === p.id;
      const isDraggingNode = draggingPointId === p.id;
      // Nodo pendiente: detectado por el escáner pero sin número reconocido.
      const isPending = p.unrecognized === true;

      // Un nodo se dibuja en el lienzo ÚNICAMENTE si es un Nodo Principal (Nodo Maestro).
      // Los puntos de curvatura secundarios nunca se renderizan en pantalla para mantener el lienzo 100% limpio y minimalista.
      const isPrincipalNode = isMainNode(p, idx, points);
      if (!isPrincipalNode) {
        return;
      }

      visibleIndex++;
      const { px, py } = RinkMath.metersToPixels(p.x, p.y, metrics);

      ctx.save();

      // 1. Halo luminoso exterior si está seleccionado (Neón Menta #10F49C)
      if (isSelected) {
        ctx.fillStyle = 'rgba(16, 244, 156, 0.25)';
        ctx.beginPath();
        ctx.arc(px, py, 16, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = 'rgba(16, 244, 156, 0.75)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      // 1.b Feedback de ARRASTRE: anillo cian punteado con resplandor para que
      //     quede inequívoco que el nodo se está MOVIENDO bajo el dedo/cursor.
      if (isDraggingNode) {
        ctx.save();
        ctx.setLineDash([4, 3]);
        ctx.strokeStyle = 'rgba(0, 210, 255, 0.95)';
        ctx.lineWidth = 2;
        ctx.shadowColor = 'rgba(0, 210, 255, 0.9)';
        ctx.shadowBlur = 14;
        ctx.beginPath();
        ctx.arc(px, py, 20, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      // 2. Círculo del ancla de alto contraste. Visual reducido en móvil, pero el
      //    área táctil se mantiene amplia (44px) y desacoplada del tamaño visual.
      // Inactivo: Radio 9px · Seleccionado: Radio 11px · Arrastrando: Radio 12px
      ctx.beginPath();
      ctx.arc(px, py, isDraggingNode ? 12 : isSelected ? 11 : 9, 0, Math.PI * 2);
      ctx.fillStyle = isPending ? '#7C2D12' : isSelected ? '#10F49C' : '#0F172A';
      ctx.fill();

      ctx.lineWidth = isSelected ? 2.5 : 1.8;
      // Nodo pendiente: se conserva el COLOR de tinta con el que se dibujó (rojo/azul)
      // para que el usuario reconozca el trazo original aunque falte el número.
      const pendingStroke = p.inkColor === 'blue' ? '#60A5FA' : p.inkColor === 'red' ? '#F87171' : '#FB923C';
      ctx.strokeStyle = isPending ? pendingStroke : isSelected ? '#FFFFFF' : '#38BDF8';
      ctx.stroke();

      // 3. Número de orden del nodo centrado en el interior (legible).
      //    Los nodos pendientes muestran "?" en naranja hasta editarse a mano.
      ctx.fillStyle = isPending ? '#FDBA74' : isSelected ? '#000000' : '#FFFFFF';
      ctx.font = `900 ${isSelected ? '11px' : '10px'} JetBrains Mono, system-ui, monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(isPending ? '?' : `${p.nodeNumber ?? visibleIndex}`, px, py);

      // 4. Etiqueta / Nombre de la figura debajo del nodo
      if (p.label) {
        ctx.font = isSelected ? 'bold 10px Inter, sans-serif' : '500 9px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';

        const labelText = p.label;
        const textMetrics = ctx.measureText(labelText);
        const badgeW = textMetrics.width + 10;
        const badgeH = 15;
        const badgeX = px - badgeW / 2;
        const badgeY = py + (isSelected ? 18 : 15);

        ctx.fillStyle = isSelected ? 'rgba(16, 244, 156, 0.2)' : 'rgba(18, 24, 38, 0.85)';
        ctx.beginPath();
        roundRectPath(ctx, badgeX, badgeY, badgeW, badgeH, 4);
        ctx.fill();

        ctx.strokeStyle = isSelected ? 'rgba(16, 244, 156, 0.7)' : 'rgba(71, 85, 105, 0.4)';
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.fillStyle = isSelected ? '#10F49C' : '#94A3B8';
        ctx.fillText(labelText, px, badgeY + 2.5);
      }

      ctx.restore();
    });
  }

  /**
   * Dibuja los marcadores de elementos técnicos RollArt sobre los puntos de la pista
   */
  public static drawTechnicalElements(
    ctx: CanvasRenderingContext2D,
    metrics: CanvasViewportMetrics,
    points: ChoreographyPathPoint[],
    elements: ElementLog[]
  ) {
    if (points.length === 0 || elements.length === 0) return;
    const sorted = [...points].sort((a, b) => a.time_ms - b.time_ms);

    elements.forEach((el) => {
      const closestPoint = sorted.reduce((prev, curr) =>
        Math.abs(curr.time_ms - el.execution_timestamp) < Math.abs(prev.time_ms - el.execution_timestamp)
          ? curr
          : prev
      );

      const { px, py } = RinkMath.metersToPixels(closestPoint.x, closestPoint.y, metrics);

      ctx.save();
      const badgeColor =
        el.element_type === 'Jump' ? '#38BDF8' : el.element_type === 'Spin' ? '#C084FC' : '#34D399';

      const badgeW = 38;
      const badgeH = 16;
      const badgeX = px - badgeW / 2;
      const badgeY = py - 32;

      ctx.fillStyle = badgeColor;
      ctx.beginPath();
      roundRectPath(ctx, badgeX, badgeY, badgeW, badgeH, 4);
      ctx.fill();

      ctx.fillStyle = '#090D16';
      ctx.font = 'bold 9px JetBrains Mono, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(el.base_code, px, badgeY + badgeH / 2);

      ctx.restore();
    });
  }

  /**
   * Dibuja el avatar cinemático del patinador/a (el playhead físico sobre la pista)
   * Soporta estética artística para Patinadora Femenina (♀) y Patinador Masculino (♂)
   */
  public static drawSkaterAvatar(
    ctx: CanvasRenderingContext2D,
    metrics: CanvasViewportMetrics,
    avatar: SkaterAvatarState | null,
    skaterGender: SkaterGender = 'female'
  ) {
    if (!avatar) return;
    const { px, py } = RinkMath.metersToPixels(avatar.x, avatar.y, metrics);

    ctx.save();
    ctx.translate(px, py);

    const isFemale = skaterGender === 'female';

    // 1. Base circular luminosa de deslizamiento en el hielo
    const haloGradient = ctx.createRadialGradient(0, 0, 4, 0, 0, 32);
    if (isFemale) {
      haloGradient.addColorStop(0, 'rgba(244, 63, 94, 0.7)');
      haloGradient.addColorStop(0.5, 'rgba(236, 72, 153, 0.3)');
      haloGradient.addColorStop(1, 'rgba(236, 72, 153, 0)');
    } else {
      haloGradient.addColorStop(0, 'rgba(14, 165, 233, 0.7)');
      haloGradient.addColorStop(0.5, 'rgba(56, 189, 248, 0.3)');
      haloGradient.addColorStop(1, 'rgba(56, 189, 248, 0)');
    }
    ctx.fillStyle = haloGradient;
    ctx.beginPath();
    ctx.arc(0, 0, 32, 0, Math.PI * 2);
    ctx.fill();

    // 2. Rotación según la trayectoria tangente
    ctx.rotate(avatar.angleRad);

    // 3. Renderizado de la Ilustración Gráfica de la Patinadora o el Patinador (Tamaño óptimo visible)
    const skaterSize = Math.max(40, Math.min(72, 56 * (metrics.scale / 20)));
    const halfSize = skaterSize / 2;
    const imgToDraw = isFemale ? femaleSkaterImage : maleSkaterImage;

    if (imgToDraw && imgToDraw.complete && imgToDraw.naturalWidth > 0) {
      // Ilustración SVG de alta definición: figura artística en Arabesque deslizándose sobre el filo
      ctx.drawImage(imgToDraw, -halfSize, -halfSize, skaterSize, skaterSize);
    } else {
      // Renderizado vectorial de respaldo: Silueta anatómica de Patinaje Artístico en Arabesque
      // 1. Línea de filo y cuchilla en el hielo
      ctx.strokeStyle = '#38BDF8';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(-24, 14);
      ctx.quadraticCurveTo(-10, 12, 6, 10);
      ctx.stroke();

      // Cuchilla cromada
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-4, 11);
      ctx.lineTo(12, 11);
      ctx.stroke();

      // Bota de patinaje de apoyo
      ctx.fillStyle = isFemale ? '#FFFFFF' : '#0F172A';
      ctx.strokeStyle = isFemale ? '#CBD5E1' : '#334155';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(4, 9, 7, 3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // 2. Pierna de apoyo y pierna libre en Arabesque (hacia -X, -Y)
      ctx.strokeStyle = isFemale ? '#FECDD3' : '#FED7AA';
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(4, 8);
      ctx.lineTo(0, 0); // Pierna de apoyo
      ctx.moveTo(0, 0);
      ctx.lineTo(-20, -10); // Pierna libre en elevación Arabesque (alta y extendida)
      ctx.stroke();

      // Bota de la pierna libre en el aire
      ctx.fillStyle = isFemale ? '#FFFFFF' : '#0F172A';
      ctx.beginPath();
      ctx.ellipse(-21, -11, 4.5, 2.2, -0.4, 0, Math.PI * 2);
      ctx.fill();

      // 3. Vestuario / Falda en espiral
      if (isFemale) {
        ctx.fillStyle = '#F43F5E';
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(-12, 2, -18, -4);
        ctx.quadraticCurveTo(-10, 8, 2, 2);
        ctx.closePath();
        ctx.fill();
      } else {
        ctx.fillStyle = '#0284C7';
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(-14, -6);
        ctx.lineTo(4, -2);
        ctx.closePath();
        ctx.fill();
      }

      // 4. Torso y brazos en pose coreográfica
      ctx.fillStyle = isFemale ? '#FDA4AF' : '#0369A1';
      ctx.beginPath();
      ctx.ellipse(3, -2, 6, 4, 0.3, 0, Math.PI * 2);
      ctx.fill();

      // Brazos gráciles extendidos
      ctx.strokeStyle = isFemale ? '#FECDD3' : '#FED7AA';
      ctx.lineWidth = 2.8;
      ctx.beginPath();
      ctx.moveTo(4, -4);
      ctx.quadraticCurveTo(12, -7, 19, -4); // Brazo delantero hacia +X
      ctx.moveTo(0, -3);
      ctx.quadraticCurveTo(-8, -9, -15, -13); // Brazo trasero en contrapeso
      ctx.stroke();

      // 5. Cabeza y peinado
      ctx.fillStyle = isFemale ? '#78350F' : '#1E293B';
      ctx.beginPath();
      ctx.arc(8, -8, 4, 0, Math.PI * 2);
      ctx.fill();

      if (isFemale) {
        // Moño alto de patinadora
        ctx.fillStyle = '#FDA4AF';
        ctx.beginPath();
        ctx.arc(6, -11, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }

      // Flecha indicadora de avance delantero
      ctx.fillStyle = '#F59E0B';
      ctx.beginPath();
      ctx.moveTo(24, 0);
      ctx.lineTo(19, -3.5);
      ctx.lineTo(20, 0);
      ctx.lineTo(19, 3.5);
      ctx.closePath();
      ctx.fill();
    }

    // 4. Micro-badge flotante horizontal sobre la patinadora (Inconfundible para el usuario)
    ctx.rotate(-avatar.angleRad); // Deshacer rotación para legibilidad horizontal perfecta
    const labelText = isFemale ? '♀ Patinadora' : '♂ Patinador';
    ctx.font = 'bold 9px JetBrains Mono, system-ui, sans-serif';
    const textMetrics = ctx.measureText(labelText);
    const badgeW = textMetrics.width + 12;
    const badgeH = 15;
    const badgeY = -halfSize - 12;

    ctx.fillStyle = 'rgba(9, 13, 22, 0.92)';
    ctx.strokeStyle = isFemale ? '#F43F5E' : '#38BDF8';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    roundRectPath(ctx, -badgeW / 2, badgeY, badgeW, badgeH, 4);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = isFemale ? '#FECDD3' : '#E0F2FE';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(labelText, 0, badgeY + badgeH / 2);

    ctx.restore();
  }

  /**
   * OVERLAY SUPERIOR DE TIRADORES BÉZIER:
   * Se dibuja por ENCIMA de todo para que CP1 y CP2 NUNCA queden tapados.
   * Proporciona alto contraste, brazos conectores dorados y cianes, y badges prominentes.
   */
  /**
   * Dibuja los Puntos de Arrastre Integrados en la Línea (Splines)
   * Elimina por completo los tiradores flotantes externos (CPs) y sus brazos discontinuos.
   * Dibuja puntos pequeños, discretos y luminosos directamente sobre el trazo para esculpir la curva.
   */
  /**
   * Ultra-minimalismo 2D: Cero tiradores ni puntos de agarre visuales en la línea.
   * La curva se manipula directamente mediante detección de proximidad al toque (Drag-to-Curve).
   */
  public static drawSplineGripPoints(
    _ctx: CanvasRenderingContext2D,
    _metrics: CanvasViewportMetrics,
    _points: ChoreographyPathPoint[],
    _options: RenderOptions
  ) {
    // Intencionalmente vacío: los puntos secundarios no se renderizan para mantener el lienzo ultra-limpio.
    return;
  }

  /**
   * Alias de compatibilidad: redirige al nuevo sistema sin puntos visuales
   */
  public static drawBezierControlOverlay(
    ctx: CanvasRenderingContext2D,
    metrics: CanvasViewportMetrics,
    points: ChoreographyPathPoint[],
    options: RenderOptions
  ) {
    this.drawSplineGripPoints(ctx, metrics, points, options);
  }
}
