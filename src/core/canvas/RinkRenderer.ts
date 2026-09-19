import { CanvasViewportMetrics, RinkMath } from './RinkMath';
import { ChoreographyPathPoint, ElementLog, SkaterAvatarState, RinkDimensions, SkaterGender } from '../../types/choreography';

export type ChoreographyPhase = 'plot' | 'connect' | 'curve';

export interface RenderOptions {
  showRinkGrid: boolean;
  showControlHandles: boolean;
  selectedPointId: string | null;
  activeSegmentIndex: number | null;
  isPathGenerated?: boolean;
  phase?: ChoreographyPhase;
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
    if (options.phase === 'plot' || options.isPathGenerated === false) return;
    if (points.length < 2) return;
    const sorted = [...points].sort((a, b) => a.time_ms - b.time_ms);

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

      // Resplandor exterior de la curva: Electric Cyan Neón (#00D2FF)
      ctx.save();
      ctx.strokeStyle = isSegmentSelected ? 'rgba(0, 210, 255, 0.55)' : 'rgba(0, 210, 255, 0.28)';
      ctx.lineWidth = isSegmentSelected ? 10 : 6;
      ctx.beginPath();
      ctx.moveTo(pt0.px, pt0.py);
      ctx.bezierCurveTo(cp1.px, cp1.py, cp2.px, cp2.py, pt1.px, pt1.py);
      ctx.stroke();

      // Línea principal de la curva: Electric Cyan Neón
      ctx.strokeStyle = isSegmentSelected ? '#67E8F9' : '#00D2FF';
      ctx.lineWidth = isSegmentSelected ? 3.5 : 2.5;
      ctx.beginPath();
      ctx.moveTo(pt0.px, pt0.py);
      ctx.bezierCurveTo(cp1.px, cp1.py, cp2.px, cp2.py, pt1.px, pt1.py);
      ctx.stroke();
      ctx.restore();
    }

    ctx.restore();
  }

  /**
   * Dibuja los puntos de anclaje de la coreografía con estilo Impeccable (alto contraste y nitidez)
   */
  public static drawAnchorPoints(
    ctx: CanvasRenderingContext2D,
    metrics: CanvasViewportMetrics,
    points: ChoreographyPathPoint[],
    selectedPointId: string | null
  ) {
    points.forEach((p, idx) => {
      const { px, py } = RinkMath.metersToPixels(p.x, p.y, metrics);
      const isSelected = selectedPointId === p.id;

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

      // 2. Círculo del ancla de alto contraste:
      // Inactivo: Slate-800 (#192234) con borde Slate-500 (#64748B)
      // Seleccionado: Menta Neón (#10F49C) con borde blanco puro (#FFFFFF)
      ctx.beginPath();
      ctx.arc(px, py, isSelected ? 10 : 7.5, 0, Math.PI * 2);
      ctx.fillStyle = isSelected ? '#10F49C' : '#192234';
      ctx.fill();

      ctx.lineWidth = isSelected ? 2.5 : 1.8;
      ctx.strokeStyle = isSelected ? '#FFFFFF' : '#64748B';
      ctx.stroke();

      // 3. Número de orden del nodo centrado en el interior
      ctx.fillStyle = isSelected ? '#0B0F19' : '#CBD5E1';
      ctx.font = 'bold 9.5px JetBrains Mono, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${idx + 1}`, px, py);

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
        const badgeY = py + 12;

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
  public static drawBezierControlOverlay(
    ctx: CanvasRenderingContext2D,
    metrics: CanvasViewportMetrics,
    points: ChoreographyPathPoint[],
    options: RenderOptions
  ) {
    if (!options.showControlHandles || points.length < 2) return;
    // En FASE 1 (Ploteo Libre) NO se muestran tiradores ni brazos
    if (options.phase === 'plot' || options.isPathGenerated === false) return;

    const sorted = [...points].sort((a, b) => a.time_ms - b.time_ms);

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

      // --- 1. BRAZO CONECTOR CP1: p0 -> cp1 (Dorado/Ámbar de Salida) ---
      ctx.strokeStyle = isSegmentSelected ? '#F59E0B' : 'rgba(245, 158, 11, 0.7)';
      ctx.lineWidth = isSegmentSelected ? 2.5 : 1.5;
      if (!isSegmentSelected) {
        ctx.setLineDash([5, 4]);
      } else {
        ctx.setLineDash([]);
      }
      ctx.beginPath();
      ctx.moveTo(pt0.px, pt0.py);
      ctx.lineTo(cp1.px, cp1.py);
      ctx.stroke();

      // --- 2. BRAZO CONECTOR CP2: p1 -> cp2 (Cian/Azul de Llegada) ---
      ctx.strokeStyle = isSegmentSelected ? '#38BDF8' : 'rgba(56, 189, 248, 0.7)';
      ctx.lineWidth = isSegmentSelected ? 2.5 : 1.5;
      if (!isSegmentSelected) {
        ctx.setLineDash([5, 4]);
      } else {
        ctx.setLineDash([]);
      }
      ctx.beginPath();
      ctx.moveTo(pt1.px, pt1.py);
      ctx.lineTo(cp2.px, cp2.py);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.restore();

      // --- 3. TIRADOR CP1 (Salida de Curva) ---
      this.drawProminentHandle(ctx, cp1.px, cp1.py, 'CP1 Salida', '#F59E0B', '#FCD34D', isSegmentSelected);

      // --- 4. TIRADOR CP2 (Llegada de Curva) ---
      this.drawProminentHandle(ctx, cp2.px, cp2.py, 'CP2 Llegada', '#0284C7', '#38BDF8', isSegmentSelected);
    }
  }

  private static drawProminentHandle(
    ctx: CanvasRenderingContext2D,
    px: number,
    py: number,
    label: string,
    colorHex: string,
    textHex: string,
    isActive: boolean
  ) {
    const haloRadius = isActive ? 26 : 18;
    const coreRadius = isActive ? 11 : 9;

    ctx.save();

    // Halo táctil exterior luminoso
    ctx.fillStyle = isActive ? `${colorHex}66` : `${colorHex}35`;
    ctx.beginPath();
    ctx.arc(px, py, haloRadius, 0, Math.PI * 2);
    ctx.fill();

    // Anillo exterior de contraste
    ctx.strokeStyle = `${colorHex}AA`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(px, py, haloRadius, 0, Math.PI * 2);
    ctx.stroke();

    // Núcleo del tirador
    ctx.fillStyle = colorHex;
    ctx.beginPath();
    ctx.arc(px, py, coreRadius, 0, Math.PI * 2);
    ctx.fill();

    // Borde blanco grueso de alto contraste
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = isActive ? 3 : 2.5;
    ctx.stroke();

    // Punto blanco central de precisión
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(px, py, 3, 0, Math.PI * 2);
    ctx.fill();

    // Etiqueta en formato píldora oscura de alta visibilidad
    const badgeText = label;
    ctx.font = 'bold 10px JetBrains Mono, monospace';
    const textWidth = ctx.measureText(badgeText).width;
    const pillW = textWidth + 12;
    const pillH = 17;
    const pillX = px - pillW / 2;
    const pillY = py - (isActive ? 32 : 28);

    // Fondo píldora
    ctx.fillStyle = '#090D16';
    ctx.beginPath();
    if (typeof (ctx as any).roundRect === 'function') {
      (ctx as any).roundRect(pillX, pillY, pillW, pillH, 5);
    } else {
      ctx.rect(pillX, pillY, pillW, pillH);
    }
    ctx.fill();

    // Borde de la píldora
    ctx.strokeStyle = colorHex;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Texto de la píldora
    ctx.fillStyle = textHex;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(badgeText, px, pillY + pillH / 2);

    ctx.restore();
  }
}
