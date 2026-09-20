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
  const trackRef = useRef<HTMLDivElement | null>(null);

  const points = useChoreographyStore((state) => state.points);
  const selectedPointId = useChoreographyStore((state) => state.selectedPointId);
  const setSelectedPointId = useChoreographyStore((state) => state.setSelectedPointId);
  const updatePointTimestamp = useChoreographyStore((state) => state.updatePointTimestamp);
  const pushHistory = useChoreographyStore((state) => state.pushHistory);

  const [hoverTimeMs, setHoverTimeMs] = useState<number | null>(null);
  const [hoverX, setHoverX] = useState<number | null>(null);
  const [wavePeaks, setWavePeaks] = useState<number[]>([]);
  const [draggedPinId, setDraggedPinId] = useState<string | null>(null);
  const [hoveredPinId, setHoveredPinId] = useState<string | null>(null);

  // Filtrado exclusivo de Nodos Principales para el Timeline de Música:
  // Elimina la saturación de micro-puntos de curvatura y eleva el rendimiento en pantallas móviles
  const timelineNodes = points.filter((node, index) => isMainNode(node, index, points));

  const isDraggingPinRef = useRef<boolean>(false);
  const dragStartPointRef = useRef<{ id: string; originalMs: number } | null>(null);
  const hasMovedRef = useRef<boolean>(false);

  // Paleta de colores temáticos por figura técnica
  const getMarkerTheme = (type?: string, isSelected = false, isDragged = false) => {
    if (isDragged) {
      return { stroke: '#00D2FF', glow: 'rgba(0, 210, 255, 0.7)' };
    }
    if (isSelected) {
      return { stroke: '#10F49C', glow: 'rgba(16, 244, 156, 0.65)' };
    }
    switch (type) {
      case 'Jump':
        return { stroke: '#F59E0B', glow: 'rgba(245, 158, 11, 0.5)' };
      case 'Spin':
        return { stroke: '#06B6D4', glow: 'rgba(6, 182, 212, 0.5)' };
      case 'Step':
        return { stroke: '#10B981', glow: 'rgba(16, 185, 129, 0.5)' };
      case 'Choreo':
        return { stroke: '#EC4899', glow: 'rgba(236, 72, 153, 0.5)' };
      default:
        return { stroke: '#38BDF8', glow: 'rgba(56, 189, 248, 0.5)' };
    }
  };

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

    // 2. Proyección de Progreso de Reproducción con zona segura interna
    const PIN_RADIUS = 18;
    const rect = canvas.getBoundingClientRect();
    const padCanvas = PIN_RADIUS * (width / (rect.width || 1000));
    const availableW = Math.max(1, width - padCanvas * 2);

    const playheadRatio = Math.max(0, Math.min(1, currentTimeMs / effectiveDurationMs));
    const playheadPx = padCanvas + playheadRatio * availableW;

    // Área reproducida (sombreado sutil cian)
    const playedGradient = ctx.createLinearGradient(0, 0, playheadPx, 0);
    playedGradient.addColorStop(0, 'rgba(0, 245, 255, 0.04)');
    playedGradient.addColorStop(1, 'rgba(0, 245, 255, 0.16)');
    ctx.fillStyle = playedGradient;
    ctx.fillRect(0, 0, playheadPx, height);

    // 3. Renderizado de Picos de la Onda Sonora
    const peaks = wavePeaks.length > 0 ? wavePeaks : [0.5];
    const step = availableW / peaks.length;
    const barWidth = Math.max(1.5, step - 1);

    for (let i = 0; i < peaks.length; i++) {
      const peakVal = peaks[i];
      const barX = padCanvas + i * step;
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

    // 4. Marcadores de Nodos Coreográficos (Líneas verticales del Scrubber)
    // Renderiza EXCLUSIVAMENTE los Nodos Principales, despejando la interfaz de micro-puntos
    const sortedPoints = [...timelineNodes].sort((a, b) => a.timestamp - b.timestamp);

    sortedPoints.forEach((point) => {
      const pointRatio = Math.max(0, Math.min(1, point.timestamp / effectiveDurationMs));
      const pinX = padCanvas + pointRatio * availableW;
      const isSelected = point.id === selectedPointId;
      const isDragged = point.id === draggedPinId;
      const theme = getMarkerTheme(point.type, isSelected, isDragged);

      // Línea vertical marcadora (Scrubber Line atravesando el Waveform)
      ctx.save();
      ctx.strokeStyle = theme.stroke;
      ctx.lineWidth = isDragged ? 2.5 : (isSelected ? 2 : 1.2);
      if (!isSelected && !isDragged) {
        ctx.setLineDash([3, 2]);
        ctx.globalAlpha = 0.45;
      } else {
        ctx.setLineDash([]);
        // Resplandor neón de selección / arrastre activo
        ctx.shadowColor = theme.stroke;
        ctx.shadowBlur = isDragged ? 14 : 8;
      }

      ctx.beginPath();
      ctx.moveTo(pinX, 0);
      ctx.lineTo(pinX, height);
      ctx.stroke();
      ctx.restore();
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
    timelineNodes,
    selectedPointId,
    hoverX,
    hoverTimeMs,
    draggedPinId
  ]);

  // Gestores de Interacción Táctil y Puntero para los Marcadores DOM Gigantes (48px Touch Target)
  const handlePinPointerDown = (e: React.PointerEvent<HTMLDivElement>, point: ChoreographyPoint) => {
    e.stopPropagation();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch (err) {}

    // Respuesta háptica táctil en dispositivos móviles compatibles
    try {
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(35);
      }
    } catch (err) {}

    isDraggingPinRef.current = true;
    dragStartPointRef.current = { id: point.id, originalMs: point.timestamp };
    hasMovedRef.current = false;
    setDraggedPinId(point.id);
    setSelectedPointId(point.id);
  };

  const PIN_RADIUS = 18;

  const handlePinPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingPinRef.current || !dragStartPointRef.current) return;
    const track = trackRef.current;
    if (!track) return;

    const rect = track.getBoundingClientRect();
    const availableWidth = Math.max(1, rect.width - PIN_RADIUS * 2);
    const px = e.clientX - rect.left - PIN_RADIUS;
    const ratio = Math.max(0, Math.min(1, px / availableWidth));
    const timeMs = Math.round(ratio * effectiveDurationMs);

    hasMovedRef.current = true;
    updatePointTimestamp(dragStartPointRef.current.id, timeMs);
    onSeek(timeMs);
  };

  const handlePinPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isDraggingPinRef.current && dragStartPointRef.current) {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch (err) {}

      if (hasMovedRef.current) {
        pushHistory();
      } else {
        // Tap rápido intencional: Seleccionar el nodo y mover el cabezal de reproducción
        setSelectedPointId(dragStartPointRef.current.id);
        onSeek(dragStartPointRef.current.originalMs);
      }

      isDraggingPinRef.current = false;
      dragStartPointRef.current = null;
      setDraggedPinId(null);
    }
  };

  const handlePinPointerCancel = (e: React.PointerEvent<HTMLDivElement>) => {
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch (err) {}
    isDraggingPinRef.current = false;
    dragStartPointRef.current = null;
    setDraggedPinId(null);
  };

  // Gestores del Canvas: SOLO Seek de reproducción con respeto a la zona segura interna
  const handleCanvasPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const availableWidth = Math.max(1, rect.width - PIN_RADIUS * 2);
    const px = e.clientX - rect.left - PIN_RADIUS;
    const ratio = Math.max(0, Math.min(1, px / availableWidth));
    const targetTimeMs = Math.round(ratio * effectiveDurationMs);
    onSeek(targetTimeMs);
  };

  const handleCanvasPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const availableWidth = Math.max(1, rect.width - PIN_RADIUS * 2);
    const px = e.clientX - rect.left - PIN_RADIUS;
    const ratio = Math.max(0, Math.min(1, px / availableWidth));
    const timeMs = Math.round(ratio * effectiveDurationMs);

    const scaleX = canvas.width / rect.width;
    const canvasHoverX = (e.clientX - rect.left) * scaleX;

    setHoverX(canvasHoverX);
    setHoverTimeMs(timeMs);
  };

  const handleCanvasPointerLeave = () => {
    setHoverX(null);
    setHoverTimeMs(null);
  };

  const sortedTimelineNodes = [...timelineNodes].sort((a, b) => a.timestamp - b.timestamp);

  return (
    <div
      ref={containerRef}
      className="w-full h-full bg-surface-canvas text-text-primary px-3 sm:px-4 py-1 flex flex-col justify-between select-none relative overflow-hidden timeline-safe-zone"
    >
      {/* Cabecera del Waveform */}
      <div className="flex items-center justify-between gap-2 text-xs shrink-0">
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
            <span>Nodos: <strong className="text-text-primary font-bold">{timelineNodes.length}</strong></span>
          </div>
        </div>
      </div>

      {/* Contenedor del Track (Canvas + Overlay de Marcadores de Tamaño Fijo) */}
      <div
        ref={trackRef}
        className="relative w-full flex-1 min-h-0 overflow-x-auto overflow-y-hidden rounded-subtle border border-border-subtle bg-surface-card group mt-1"
        style={{ overflowX: 'auto', overflowY: 'hidden' }}
      >
        <canvas
          ref={canvasRef}
          width={1000}
          height={90}
          onPointerDown={handleCanvasPointerDown}
          onPointerMove={handleCanvasPointerMove}
          onPointerLeave={handleCanvasPointerLeave}
          style={{ cursor: 'crosshair', touchAction: 'none' }}
          className="w-full h-full block select-none touch-none rounded-subtle"
          title="Línea de tiempo de audio. Toca para reproducir. Arrastra los marcadores (#1, #2...) para sincronizar el tiempo."
        />

        {/* DOM Overlay de Marcadores (Mobile-First: Tamaño Fijo Estricto 36x36px, Sin Gigantismo, Seguro ante Biseles) */}
        <div className="absolute inset-0 pointer-events-none overflow-x-auto overflow-y-hidden">
          {sortedTimelineNodes.map((point, index) => {
            const pointRatio = Math.max(0, Math.min(1, point.timestamp / effectiveDurationMs));
            const isSelected = point.id === selectedPointId;
            const isDragged = point.id === draggedPinId;
            const isHovered = point.id === hoveredPinId;
            const theme = getMarkerTheme(point.type, isSelected, isDragged);
            const nodeNum = index + 1;

            return (
              <div
                key={point.id}
                className="absolute top-0 bottom-0 pointer-events-auto flex flex-col items-center select-none group/pin cursor-grab active:cursor-grabbing"
                style={{
                  left: `calc(${PIN_RADIUS}px + ${pointRatio} * (100% - ${PIN_RADIUS * 2}px))`,
                  transform: 'translateX(-50%)',
                  width: '36px',
                  maxWidth: '36px',
                  flexShrink: 0,
                  zIndex: isDragged ? 40 : (isSelected ? 30 : 20),
                  touchAction: 'none',
                }}
                onPointerDown={(e) => handlePinPointerDown(e, point)}
                onPointerMove={handlePinPointerMove}
                onPointerUp={handlePinPointerUp}
                onPointerCancel={handlePinPointerCancel}
                onPointerEnter={() => setHoveredPinId(point.id)}
                onPointerLeave={() => setHoveredPinId((cur) => (cur === point.id ? null : cur))}
              >
                {/* Floating Timestamp Badge (Visible en Selección, Arrastre o Hover) */}
                {(isSelected || isDragged || isHovered) && (
                  <div
                    className="absolute top-[38px] px-2 py-0.5 rounded bg-slate-950/95 border text-white text-[10px] font-bold font-mono shadow-2xl whitespace-nowrap pointer-events-none flex items-center gap-1 z-50 animate-in fade-in zoom-in-95 duration-150"
                    style={{
                      borderColor: theme.stroke,
                      boxShadow: `0 0 12px ${theme.glow}`,
                    }}
                  >
                    <span className="text-white font-black">#{nodeNum}</span>
                    <span style={{ color: theme.stroke }}>·</span>
                    <span className="text-white font-semibold">{(point.timestamp / 1000).toFixed(1)}s</span>
                    {point.label && point.label.trim() !== '' && (
                      <span className="text-slate-300 font-sans text-[9px] max-w-[70px] truncate">
                        ({point.label})
                      </span>
                    )}
                  </div>
                )}

                {/* Cabeza del Marcador Táctil (Tamaño Fijo Estricto 36x36px sin deformaciones) */}
                <div
                  className={`
                    w-[36px] h-[36px] max-w-[36px] max-h-[36px] rounded-full shrink-0
                    bg-slate-950 flex items-center justify-center
                    border-2 select-none transition-transform duration-100 ease-out
                    ${isDragged 
                      ? 'scale-110 shadow-2xl ring-2 ring-cyan-400/50' 
                      : (isSelected ? 'scale-105 shadow-xl ring-1 ring-white/20' : 'shadow-lg')}
                  `}
                  style={{
                    width: '36px',
                    height: '36px',
                    maxWidth: '36px',
                    maxHeight: '36px',
                    flexShrink: 0,
                    borderColor: theme.stroke,
                    boxShadow: isDragged 
                      ? `0 0 16px ${theme.glow}, 0 3px 10px rgba(0,0,0,0.9)` 
                      : (isSelected ? `0 0 12px ${theme.glow}, 0 2px 8px rgba(0,0,0,0.8)` : `0 2px 6px rgba(0,0,0,0.6)`),
                  }}
                  title={`Nodo #${nodeNum}: ${(point.timestamp / 1000).toFixed(1)}s. Arrastra para sincronizar con la música.`}
                >
                  <span className="text-xs font-black font-mono text-white leading-none tracking-tight">
                    {nodeNum}
                  </span>
                </div>

                {/* Tallo Scrubber Vertical que atraviesa la onda */}
                <div
                  className="w-0.5 flex-1 min-h-[10px] transition-opacity duration-150"
                  style={{
                    backgroundColor: theme.stroke,
                    opacity: isDragged ? 1 : (isSelected ? 0.9 : 0.4),
                    boxShadow: (isDragged || isSelected) ? `0 0 6px ${theme.glow}` : 'none',
                  }}
                />

                {/* Tooltip de tiempo inferior persistente en selección/arrastre */}
                {(isSelected || isDragged) && (
                  <div className="absolute bottom-1 px-1.5 py-0.5 rounded bg-slate-950/90 text-[9px] font-mono font-bold text-white border border-white/10 pointer-events-none shadow-md">
                    {(point.timestamp / 1000).toFixed(1)}s
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Indicador discreto */}
        <div className="absolute bottom-1 right-2 text-[9px] font-mono font-medium text-text-tertiary pointer-events-none group-hover:text-text-secondary transition-colors">
          Toca: Reproducir aquí · Arrastra marcadores: Ajustar tiempo
        </div>
      </div>
    </div>
  );
};
