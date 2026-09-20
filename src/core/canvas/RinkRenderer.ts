import { CanvasViewportMetrics, RinkMath } from './RinkMath';
import { ChoreographyPathPoint, ElementLog, SkaterAvatarState, RinkDimensions, SkaterGender, isMainNode } from '../../types/choreography';

export type ChoreographyPhase = 'plot' | 'connect' | 'curve';

export interface RenderOptions {
  showRinkGrid: boolean;
  showControlHandles: boolean;
  selectedPointId: string | null;
  activeSegmentIndex: number | null;
  isPathGenerated?: boolean;
  phase?: ChoreographyPhase;
  isPlaying?: boolean;
  showFullTrailOverride?: boolean;
  currentTimeMs?: number;
  avatar?: SkaterAvatarState | null;
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
    ctx.roundRect(offsetX, offsetY, renderedW, renderedH, cornerRadiusPx);
    ctx.fillStyle = '#090D16';
    ctx.fill();

    // Valla perimetral reglamentaria en tono neutro
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#475569';
    ctx.stroke();

    // Fondo hielo interior sutil
    ctx.fillStyle = 'rgba(15, 23, 42, 0.4)';
    ctx.fill();

    // Línea central longitudinal (X = 25m)
    ctx.setLineDash([6, 6]);
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.3)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(offsetX, offsetY + renderedH / 2);
    ctx.lineTo(offsetX + renderedW, offsetY + renderedH / 2);
    ctx.stroke();

    // Línea central transversal (Y = 12.5m)
    ctx.beginPath();
    ctx.moveTo(offsetX + renderedW / 2, offsetY);
    ctx.lineTo(offsetX + renderedW / 2, offsetY + renderedH);
    ctx.stroke();
    ctx.setLineDash([]);

    // Círculo central reglamentario
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(offsetX + renderedW / 2, offsetY + renderedH / 2, 3 * scale, 0, Math.PI * 2);
    ctx.stroke();

    // Marcas de competición reglamentarias (Opcionales por toggle)
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

      // Panel de jueces World Skate
      const judgeW = renderedW * 0.32;
      const judgeH = 16;
      const judgeX = offsetX + (renderedW - judgeW) / 2;
      const judgeY = offsetY - 18;

      ctx.fillStyle = 'rgba(245, 158, 11, 0.15)';
      ctx.fillRect(judgeX, judgeY, judgeW, judgeH);
      ctx.strokeStyle = '#F59E0B';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(judgeX, judgeY, judgeW, judgeH);

      ctx.fillStyle = '#F59E0B';
      ctx.font = 'bold 9px JetBrains Mono, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('PANEL DE JUECES (WORLD SKATE)', judgeX + judgeW / 2, judgeY + judgeH / 2);
    }

    ctx.restore();
  }

  /**
   * Dibuja las curvas de trayectoria Bézier continuas (Glow exterior + línea sólida)
   * En Fase 1 (Ploteo Libre) NO se trazan líneas automáticas. Solo en Fase 2/3.
   */
  public static drawTrajectories(
    ctx: CanvasRenderingContext2D,
    metrics: CanvasViewportMetrics,
    points: ChoreographyPathPoint[],
    options: RenderOptions
  ) {
    if (points.length < 2) return;
    const sorted = [...points].sort((a, b) => a.time_ms - b.time_ms);

    const isPlaying = options.isPlaying ?? false;
    const showFullTrailOverride = options.showFullTrailOverride ?? false;

    // FASE DE REPRODUCCIÓN (PLAY): Líneas estáticas desaparecen por completo.
    // Solo se renderiza el Trazado Dinámico (Dynamic Trail) siguiendo al avatar.
    if (isPlaying && !showFullTrailOverride) {
      this.drawDynamicTrail(ctx, metrics, sorted, options);
      return;
    }

    // Si hay menos de 2 nodos, no hay trayectorias continuas que trazar
    if (sorted.length < 2) {
      return;
    }

    // FASE DE EDICIÓN / PREVIEW (o botón Ver Trazo Completo):
    // Se dibuja la guía visual de las trayectorias
    const { offsetX, offsetY, renderedW, renderedH, scale } = metrics;
    const cornerRadiusPx = 3.5 * scale;

    ctx.save();
    // Límite estricto perimetral: recorta toda la trayectoria a los límites físicos exactos de la pista
    ctx.beginPath();
    ctx.roundRect(offsetX, offsetY, renderedW, renderedH, cornerRadiusPx);
    ctx.clip();

    for (let i = 0; i < sorted.length - 1; i++) {
      const p0 = sorted[i];
      const p1 = sorted[i + 1];

      const pt0 = RinkMath.metersToPixels(p0.x, p0.y, metrics);
      const pt1 = RinkMath.metersToPixels(p1.x, p1.y, metrics);
      const { cp1: cp1M, cp2: cp2M } = RinkMath.getSegmentControlPoints(p0, p1);
      const cp1 = RinkMath.metersToPixels(cp1M.x, cp1M.y, metrics);
      const cp2 = RinkMath.metersToPixels(cp2M.x, cp2M.y, metrics);

      const isSegmentSelected = options.selectedPointId === p0.id || options.selectedPointId === p1.id;

      ctx.save();

      if (showFullTrailOverride) {
        // Modo Didáctico Iluminado: Alto contraste
        ctx.strokeStyle = isSegmentSelected ? 'rgba(0, 210, 255, 0.6)' : 'rgba(0, 210, 255, 0.35)';
        ctx.lineWidth = isSegmentSelected ? 8 : 5;
        ctx.beginPath();
        ctx.moveTo(pt0.px, pt0.py);
        ctx.bezierCurveTo(cp1.px, cp1.py, cp2.px, cp2.py, pt1.px, pt1.py);
        ctx.stroke();

        ctx.strokeStyle = isSegmentSelected ? '#67E8F9' : '#00D2FF';
        ctx.lineWidth = isSegmentSelected ? 3 : 2;
        ctx.beginPath();
        ctx.moveTo(pt0.px, pt0.py);
        ctx.bezierCurveTo(cp1.px, cp1.py, cp2.px, cp2.py, pt1.px, pt1.py);
        ctx.stroke();
      } else {
        // Guía inicial visual suave (no invasiva)
        ctx.setLineDash([5, 5]);
        ctx.strokeStyle = isSegmentSelected ? 'rgba(0, 210, 255, 0.7)' : 'rgba(56, 189, 248, 0.35)';
        ctx.lineWidth = isSegmentSelected ? 2.5 : 1.5;
        ctx.beginPath();
        ctx.moveTo(pt0.px, pt0.py);
        ctx.bezierCurveTo(cp1.px, cp1.py, cp2.px, cp2.py, pt1.px, pt1.py);
        ctx.stroke();
      }

      ctx.restore();
    }

    ctx.restore();
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
    ctx.roundRect(offsetX, offsetY, renderedW, renderedH, cornerRadiusPx);
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

    const { cp1: cp1M, cp2: cp2M } = RinkMath.getSegmentControlPoints(p0, p1);

    // 2. Efecto Estela / Fade-Out del Segmento Anterior (evita corte seco visual)
    if (activeSegIdx > 0) {
      const prevP0 = sortedPoints[activeSegIdx - 1];
      const prevP1 = sortedPoints[activeSegIdx];
      const { cp1: pCp1M, cp2: pCp2M } = RinkMath.getSegmentControlPoints(prevP0, prevP1);

      const ptPrev0 = RinkMath.metersToPixels(prevP0.x, prevP0.y, metrics);
      const ptPrev1 = RinkMath.metersToPixels(prevP1.x, prevP1.y, metrics);
      const cpPrev1 = RinkMath.metersToPixels(pCp1M.x, pCp1M.y, metrics);
      const cpPrev2 = RinkMath.metersToPixels(pCp2M.x, pCp2M.y, metrics);

      // Desvanecimiento suave en función de cuánto ha avanzado el avatar en el tramo actual
      const fadeAlpha = Math.max(0, 0.45 * (1 - t));
      if (fadeAlpha > 0.02) {
        ctx.save();
        ctx.strokeStyle = `rgba(0, 210, 255, ${fadeAlpha})`;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(ptPrev0.px, ptPrev0.py);
        ctx.bezierCurveTo(cpPrev1.px, cpPrev1.py, cpPrev2.px, cpPrev2.py, ptPrev1.px, ptPrev1.py);
        ctx.stroke();
        ctx.restore();
      }
    }

    // 3. Trazado Dinámico Activo: desde p0 hasta la posición actual del avatar (t)
    const pt0 = RinkMath.metersToPixels(p0.x, p0.y, metrics);
    const avatarPx = RinkMath.metersToPixels(avatar.x, avatar.y, metrics);

    // Subdividir curva de Bezier hasta t mediante algoritmo de de Casteljau
    const q1x = (1 - t) * p0.x + t * cp1M.x;
    const q1y = (1 - t) * p0.y + t * cp1M.y;
    const q2x = (1 - t) * cp1M.x + t * cp2M.x;
    const q2y = (1 - t) * cp1M.y + t * cp2M.y;
    const r1x = (1 - t) * q1x + t * q2x;
    const r1y = (1 - t) * q1y + t * q2y;

    const subCp1 = RinkMath.metersToPixels(q1x, q1y, metrics);
    const subCp2 = RinkMath.metersToPixels(r1x, r1y, metrics);

    ctx.save();
    // Resplandor Neón exterior de la cuchilla
    ctx.strokeStyle = 'rgba(0, 210, 255, 0.65)';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(pt0.px, pt0.py);
    ctx.bezierCurveTo(subCp1.px, subCp1.py, subCp2.px, subCp2.py, avatarPx.px, avatarPx.py);
    ctx.stroke();

    // Línea sólida de trazado dinámico
    ctx.strokeStyle = '#00D2FF';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(pt0.px, pt0.py);
    ctx.bezierCurveTo(subCp1.px, subCp1.py, subCp2.px, subCp2.py, avatarPx.px, avatarPx.py);
    ctx.stroke();

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
    selectedPointId: string | null
  ) {
    let visibleIndex = 0;

    points.forEach((p, idx) => {
      const isSelected = selectedPointId === p.id;

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
        ctx.arc(px, py, 20, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = 'rgba(16, 244, 156, 0.75)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      // 2. Círculo del ancla de alto contraste y tamaño ampliado (Nodo Maestro destacado):
      // Inactivo: Radio 11px (diámetro 22px) con borde Cian Neón (#38BDF8)
      // Seleccionado: Radio 14px (diámetro 28px) con fondo Menta Neón (#10F49C) y borde blanco puro (#FFFFFF)
      ctx.beginPath();
      ctx.arc(px, py, isSelected ? 14 : 11, 0, Math.PI * 2);
      ctx.fillStyle = isSelected ? '#10F49C' : '#0F172A';
      ctx.fill();

      ctx.lineWidth = isSelected ? 3 : 2.2;
      ctx.strokeStyle = isSelected ? '#FFFFFF' : '#38BDF8';
      ctx.stroke();

      // 3. Número de orden del nodo centrado en el interior - RESALTADO Y MÁS GRANDE
      ctx.fillStyle = isSelected ? '#000000' : '#FFFFFF';
      ctx.font = `900 ${isSelected ? '12px' : '11px'} JetBrains Mono, system-ui, monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${visibleIndex}`, px, py);

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
        ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 4);
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
      ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 4);
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
    const skaterSize = Math.max(54, Math.min(84, 64 * (metrics.scale / 20)));
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
    ctx.roundRect(-badgeW / 2, badgeY, badgeW, badgeH, 4);
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
