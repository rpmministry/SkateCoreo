import React, { useRef, useEffect, useState } from 'react';
import { useChoreographyStore } from '../store/useChoreographyStore';
import { audioEngine } from '../core/audio/AudioEngine';
import { ChoreographyPoint, isMainNode } from '../types/choreography';
import { Clock, Music, Sparkles } from 'lucide-react';

interface InteractiveWaveformProps {
  currentTimeMs: number;
  durationMs: number;
  isPlaying?: boolean;
  onSeek: (timeMs: number) => void;
  fileName?: string | null;
}

export const InteractiveWaveform: React.FC<InteractiveWaveformProps> = ({
  currentTimeMs,
  durationMs,
  onSeek,
  fileName
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const points = useChoreographyStore((state) => state.points);
  const selectedPointId = useChoreographyStore((state) => state.selectedPointId);
  const setSelectedPointId = useChoreographyStore((state) => state.setSelectedPointId);
  const addPointFromAudio = useChoreographyStore((state) => state.addPointFromAudio);
  const updatePointTimestamp = useChoreographyStore((state) => state.updatePointTimestamp);
  const pushHistory = useChoreographyStore((state) => state.pushHistory);

  const [hoverTimeMs, setHoverTimeMs] = useState<number | null>(null);
  const [hoverX, setHoverX] = useState<number | null>(null);
  const [wavePeaks, setWavePeaks] = useState<number[]>([]);
  const [draggedPinId, setDraggedPinId] = useState<string | null>(null);
  const [cursorStyle, setCursorStyle] = useState<string>('crosshair');

  // Filtrado exclusivo de Nodos Principales para el Timeline de Música:
  // Elimina la saturación de micro-puntos de curvatura y eleva el rendimiento en pantallas móviles
  const timelineNodes = points.filter((node, index) => isMainNode(node, index, points));

  const isDraggingPinRef = useRef<boolean>(false);
  const dragStartPointRef = useRef<{ id: string; originalMs: number } | null>(null);
  const hasMovedRef = useRef<boolean>(false);

  // Duración efectiva (por defecto 120s si no hay audio cargado aún)
  const effectiveDurationMs = durationMs > 0 ? durationMs : 120000;

  // Actualizar datos de onda sonora al cambiar de pista o al montar
  useEffect(() => {
    const updatePeaks = () => {
      const peaks = audioEngine.getWaveformData(300);
      if (peaks && peaks.length > 0) {
        setWavePeaks(peaks);
      } else {
        // Generar onda representativa elegante si aún no se ha cargado archivo
        const demoPeaks: number[] = [];
        for (let i = 0; i < 300; i++) {
          const t = i / 300;
          const beat = Math.sin(t * Math.PI * 16) * 0.4 + 0.5;
          const harmonic = Math.sin(t * Math.PI * 64) * 0.25;
          const noise = Math.sin(t * 123.45) * 0.15;
          demoPeaks.push(Math.max(0.12, Math.min(1.0, beat * 0.6 + harmonic + noise)));
        }
        setWavePeaks(demoPeaks);
      }
    };

    updatePeaks();

    const unsubState = audioEngine.onStateChange(() => {
      updatePeaks();
    });

    return () => unsubState();
  }, [durationMs, fileName]);

  // Auto-cargar la pista de música de prueba oficial si no hay audio cargado
  useEffect(() => {
    if (!audioEngine.getState().hasAudioLoaded) {
      audioEngine.generateDemoTrack().catch((err) => {
        console.warn('[InteractiveWaveform] Fallback auto-load:', err);
      });
    }
  }, []);

  // Formato mm:ss.S
  const formatTime = (ms: number): string => {
    const totalSec = Math.max(0, ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = Math.floor(totalSec % 60);
    const tenths = Math.floor((ms % 1000) / 100);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${tenths}`;
  };

  // Render Loop del Waveform Canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const centerY = height / 2;

    // 1. Limpieza de Fondo
    ctx.clearRect(0, 0, width, height);

    // Fondo oscuro con sutil textura
    ctx.fillStyle = '#090D16';
    ctx.fillRect(0, 0, width, height);

    // Línea base central
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, centerY);
    ctx.lineTo(width, centerY);
    ctx.stroke();

    // 2. Proyección de Progreso de Reproducción
    const playheadRatio = Math.max(0, Math.min(1, currentTimeMs / effectiveDurationMs));
    const playheadPx = playheadRatio * width;

    // Área reproducida (sombreado sutil cian)
    const playedGradient = ctx.createLinearGradient(0, 0, playheadPx, 0);
    playedGradient.addColorStop(0, 'rgba(0, 245, 255, 0.04)');
    playedGradient.addColorStop(1, 'rgba(0, 245, 255, 0.16)');
    ctx.fillStyle = playedGradient;
    ctx.fillRect(0, 0, playheadPx, height);

    // 3. Renderizado de Picos de la Onda Sonora
    const peaks = wavePeaks.length > 0 ? wavePeaks : [0.5];
    const barWidth = Math.max(1.5, (width / peaks.length) - 1);
    const step = width / peaks.length;

    for (let i = 0; i < peaks.length; i++) {
      const peakVal = peaks[i];
      const barX = i * step;
      const barHeight = Math.max(3, peakVal * (height * 0.82));
      const topY = centerY - barHeight / 2;

      // Color dinámico según si ya ha sido reproducido o está por sonar
      const isPast = barX <= playheadPx;

      if (isPast) {
        // Picos ya reproducidos: Electric Ice Cyan puro y nítido
        ctx.fillStyle = '#00F5FF';
      } else {
        // Picos futuros: monocromático atenuado de alto contraste WCAG
        ctx.fillStyle = 'rgba(161, 161, 170, 0.35)';
      }

      ctx.beginPath();
      ctx.roundRect(barX, topY, barWidth, barHeight, 1);
      ctx.fill();
    }

    // 4. Marcadores de Nodos Coreográficos (Pins y Badges sobre la onda)
    // Renderiza EXCLUSIVAMENTE los Nodos Principales, despejando la interfaz de micro-puntos
    const sortedPoints = [...timelineNodes].sort((a, b) => a.timestamp - b.timestamp);

    sortedPoints.forEach((point, index) => {
      const pointRatio = Math.max(0, Math.min(1, point.timestamp / effectiveDurationMs));
      const pinX = pointRatio * width;
      const isSelected = point.id === selectedPointId;

      // Color temático según figura técnica
      let themeColor = '#38BDF8'; // Sky
      if (point.type === 'Jump') themeColor = '#F59E0B'; // Ámbar
      else if (point.type === 'Spin') themeColor = '#06B6D4'; // Cian
      else if (point.type === 'Step') themeColor = '#10B981'; // Esmeralda
      else if (point.type === 'Choreo') themeColor = '#EC4899'; // Rosa Fucsia

      const isDragged = point.id === draggedPinId;

      // Línea vertical marcadora
      ctx.save();
      ctx.strokeStyle = isDragged ? '#38BDF8' : (isSelected ? '#FFFFFF' : themeColor);
      ctx.lineWidth = isDragged ? 3 : (isSelected ? 2.5 : 1.5);
      if (!isSelected && !isDragged) {
        ctx.setLineDash([3, 2]);
      } else {
        ctx.setLineDash([]);
        // Resplandor de selección / arrastre
        ctx.shadowColor = isDragged ? '#38BDF8' : themeColor;
        ctx.shadowBlur = isDragged ? 16 : 10;
      }

      ctx.beginPath();
      ctx.moveTo(pinX, 0);
      ctx.lineTo(pinX, height);
      ctx.stroke();
      ctx.restore();

      // Badge superior (#N con fondo)
      const badgeW = isDragged ? 34 : 28;
      const badgeH = 16;
      const badgeY = 4;
      const badgeX = Math.max(2, Math.min(width - badgeW - 2, pinX - badgeW / 2));

      ctx.save();
      ctx.fillStyle = isDragged ? '#38BDF8' : (isSelected ? '#FFFFFF' : themeColor);
      ctx.beginPath();
      ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 4);
      ctx.fill();

      // Texto de orden (#1, #2, ...)
      ctx.fillStyle = (isSelected || isDragged) ? '#090D16' : '#0B0F19';
      ctx.font = 'bold 9px JetBrains Mono, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`#${index + 1}`, badgeX + badgeW / 2, badgeY + badgeH / 2);
      ctx.restore();

      // Si está seleccionado o arrastrado, dibujar tooltip con el tiempo o nombre debajo
      if (isSelected || isDragged) {
        const timeSec = (point.timestamp / 1000).toFixed(1);
        const hasRealLabel = Boolean(point.label && point.label.trim() !== '');
        const labelText = isDragged 
          ? `T: ${timeSec}s` 
          : (hasRealLabel ? `${point.label} (${timeSec}s)` : `#${index + 1} (${timeSec}s)`);
        ctx.font = 'bold 10px Inter, system-ui, sans-serif';
        const textMetrics = ctx.measureText(labelText);
        const tipW = Math.max(50, textMetrics.width + 12);
        const tipH = 18;
        const tipY = height - tipH - 4;
        const tipX = Math.max(2, Math.min(width - tipW - 2, pinX - tipW / 2));

        ctx.fillStyle = 'rgba(15, 23, 42, 0.95)';
        ctx.strokeStyle = themeColor;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(tipX, tipY, tipW, tipH, 4);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#FFFFFF';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(labelText, tipX + tipW / 2, tipY + tipH / 2);
      }
    });

    // 5. Aguja del Playhead (Posición actual en tiempo real)
    ctx.save();
    ctx.shadowColor = '#00F5FF';
    ctx.shadowBlur = 10;
    ctx.strokeStyle = '#00F5FF';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(playheadPx, 0);
    ctx.lineTo(playheadPx, height);
    ctx.stroke();

    // Cabeza triangular del playhead
    ctx.fillStyle = '#00F5FF';
    ctx.beginPath();
    ctx.moveTo(playheadPx - 4, 0);
    ctx.lineTo(playheadPx + 4, 0);
    ctx.lineTo(playheadPx, 6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // 6. Guía interactiva de Hover (cuando el usuario pasa el cursor)
    if (hoverX !== null && hoverTimeMs !== null) {
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      ctx.moveTo(hoverX, 0);
      ctx.lineTo(hoverX, height);
      ctx.stroke();

      // Tooltip con el tiempo proyectado
      const timeStr = formatTime(hoverTimeMs);
      ctx.font = '9px JetBrains Mono, monospace';
      const mText = ctx.measureText(timeStr);
      const hTipW = mText.width + 10;
      const hTipH = 16;
      const hTipX = Math.max(2, Math.min(width - hTipW - 2, hoverX - hTipW / 2));
      const hTipY = height / 2 - hTipH / 2;

      ctx.fillStyle = 'rgba(30, 41, 59, 0.9)';
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.5)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(hTipX, hTipY, hTipW, hTipH, 3);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#38BDF8';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(timeStr, hTipX + hTipW / 2, hTipY + hTipH / 2);
      ctx.restore();
    }
  }, [
    wavePeaks,
    currentTimeMs,
    effectiveDurationMs,
    points,
    selectedPointId,
    hoverX,
    hoverTimeMs,
    draggedPinId
  ]);

  // Detección de Pin cercano con tolerancia en píxeles (exclusivo para Nodos Principales)
  const findPinAtPx = (px: number, canvasWidth: number, tolerance = 18): ChoreographyPoint | null => {
    for (const pt of timelineNodes) {
      const ptPx = (pt.timestamp / effectiveDurationMs) * canvasWidth;
      if (Math.abs(px - ptPx) <= tolerance) {
        return pt;
      }
    }
    return null;
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const px = (e.clientX - rect.left) * scaleX;

    const hit = findPinAtPx(px, canvas.width, 16);
    if (hit) {
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch (err) {}
      isDraggingPinRef.current = true;
      dragStartPointRef.current = { id: hit.id, originalMs: hit.timestamp };
      hasMovedRef.current = false;
      setDraggedPinId(hit.id);
      setSelectedPointId(hit.id);
      setCursorStyle('grabbing');
    } else {
      isDraggingPinRef.current = false;
      dragStartPointRef.current = null;
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const px = (e.clientX - rect.left) * scaleX;
    const ratio = Math.max(0, Math.min(1, px / canvas.width));
    const timeMs = Math.round(ratio * effectiveDurationMs);

    setHoverX(px);
    setHoverTimeMs(timeMs);

    if (isDraggingPinRef.current && dragStartPointRef.current) {
      hasMovedRef.current = true;
      updatePointTimestamp(dragStartPointRef.current.id, timeMs);
      onSeek(timeMs);
      setCursorStyle('grabbing');
    } else {
      const isNearPin = Boolean(findPinAtPx(px, canvas.width, 14));
      setCursorStyle(isNearPin ? 'ew-resize' : 'crosshair');
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (isDraggingPinRef.current && dragStartPointRef.current) {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch (err) {}

      if (hasMovedRef.current) {
        pushHistory();
      } else {
        setSelectedPointId(dragStartPointRef.current.id);
        onSeek(dragStartPointRef.current.originalMs);
      }

      isDraggingPinRef.current = false;
      dragStartPointRef.current = null;
      setDraggedPinId(null);
      setCursorStyle('crosshair');
      return;
    }

    // Clic en zona vacía: Crear nuevo nodo Audio-First
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const clickPx = (e.clientX - rect.left) * scaleX;
    const clickRatio = Math.max(0, Math.min(1, clickPx / canvas.width));
    const targetTimeMs = Math.round(clickRatio * effectiveDurationMs);

    const hit = findPinAtPx(clickPx, canvas.width, 14);
    if (hit) {
      setSelectedPointId(hit.id);
      onSeek(hit.timestamp);
    } else {
      const newPoint = addPointFromAudio(targetTimeMs);
      setSelectedPointId(newPoint.id);
      onSeek(targetTimeMs);
    }
  };

  const handlePointerLeave = () => {
    if (!isDraggingPinRef.current) {
      setHoverX(null);
      setHoverTimeMs(null);
      setCursorStyle('crosshair');
    }
  };

  const handlePointerCancel = (e: React.PointerEvent<HTMLCanvasElement>) => {
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch (err) {}
    isDraggingPinRef.current = false;
    dragStartPointRef.current = null;
    setDraggedPinId(null);
    setCursorStyle('crosshair');
    setHoverX(null);
    setHoverTimeMs(null);
  };

  return (
    <div
      ref={containerRef}
      className="w-full h-full bg-surface-canvas text-text-primary px-3 py-2 flex flex-col justify-between select-none relative overflow-hidden"
    >
      {/* Cabecera del Waveform */}
      <div className="flex items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-5 h-5 rounded-subtle bg-surface-hover text-text-secondary flex items-center justify-center border border-border-subtle shrink-0">
            <Music className="w-3 h-3" />
          </div>
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="font-semibold text-text-primary truncate max-w-[130px] sm:max-w-[200px]">
              {fileName || 'Pista Musical'}
            </span>
            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-surface-hover text-text-tertiary border border-border-subtle hidden sm:inline shrink-0">
              Waveform
            </span>
          </div>
        </div>

        {/* Telemetría rápida */}
        <div className="flex items-center gap-2 font-mono text-[11px] shrink-0">
          <div className="flex items-center gap-1 text-text-tertiary">
            <Clock className="w-3 h-3 text-accent" />
            <span className="text-accent font-semibold">{formatTime(currentTimeMs)}</span>
            <span>/</span>
            <span>{formatTime(effectiveDurationMs)}</span>
          </div>

          <div className="flex items-center gap-1 text-text-secondary bg-surface-hover/70 px-2 py-0.5 rounded-subtle border border-border-subtle">
            <Sparkles className="w-3 h-3 text-accent" />
            <span>Nodos: <strong className="text-text-primary font-bold">{points.length}</strong></span>
          </div>
        </div>
      </div>

      {/* Canvas Interactivo de la Onda */}
      <div className="relative w-full flex-1 min-h-0 overflow-hidden rounded-subtle border border-border-subtle bg-surface-card group">
        <canvas
          ref={canvasRef}
          width={1000}
          height={90}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
          onPointerLeave={handlePointerLeave}
          style={{ cursor: cursorStyle, touchAction: 'none' }}
          className="w-full h-full block select-none touch-none"
          title="Haz clic para crear un nodo. Arrastra los marcadores (#1, #2...) para mover su tiempo."
        />

        {/* Indicador discreto */}
        <div className="absolute bottom-1 right-2 text-[9px] font-mono font-medium text-text-tertiary pointer-events-none group-hover:text-text-secondary transition-colors">
          Clic: Crear/Buscar · Arrastrar: Ajustar tiempo
        </div>
      </div>
    </div>
  );
};
