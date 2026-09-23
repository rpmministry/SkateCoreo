import React, { useCallback, useRef, useEffect, useState } from 'react';
import { useChoreographyStore } from '../store/useChoreographyStore';
import { useAudioStudioStore } from '../store/useAudioStudioStore';
import { audioEngine } from '../core/audio/AudioEngine';
import { roundRectPath } from '../core/canvas/roundRectPath';
import { ChoreographyPoint, isMainNode } from '../types/choreography';
import { 
  Music, 
  ZoomIn, 
  ZoomOut, 
  RotateCcw,
  Sliders,
} from 'lucide-react';
import { useAudioZoomPan } from '../hooks/useAudioZoomPan';
import { usePlayheadSync } from '../hooks/usePlayheadSync';
import { RinkAudioMixerDrawer } from './RinkAudioMixerDrawer';

interface InteractiveWaveformProps {
  currentTimeMs: number;
  durationMs: number;
  isPlaying?: boolean;
  onSeek: (timeMs: number) => void;
  fileName?: string | null;
  onOpenStudio?: () => void;
}

export const InteractiveWaveform: React.FC<InteractiveWaveformProps> = ({
  currentTimeMs,
  durationMs,
  isPlaying,
  onSeek,
  fileName,
  onOpenStudio,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

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
  const [isMiniMixerOpen, setIsMiniMixerOpen] = useState(false);

  // Store de Audio Studio: volumen master para el badge resumido de mezcla
  const tracks = useAudioStudioStore((s) => s.tracks);
  const masterTrack = tracks.music;
  const musicVolume = masterTrack?.volume ?? 1.0;
  const musicMuted = masterTrack?.muted ?? false;

  // Radio seguro de marcadores en px
  const PIN_RADIUS = 18;

  // Filtrado exclusivo de Nodos Principales para el Timeline de Música:
  // Elimina la saturación de micro-puntos de curvatura y eleva el rendimiento en pantallas móviles
  const timelineNodes = points.filter((node, index) => isMainNode(node, index, points));

  const isDraggingPinRef = useRef<boolean>(false);
  const dragStartPointRef = useRef<{ id: string; originalMs: number } | null>(null);
  const hasMovedRef = useRef<boolean>(false);

  // Motor de Zoom y Paneo Dinámico Multidispositivo
  const {
    zoom,
    containerRef: trackRef,
    contentWidth,
    zoomIn,
    zoomOut,
    resetZoom,
  } = useAudioZoomPan({
    minZoom: 1.0,
    maxZoom: 35.0,
    initialZoom: 1.0,
    enableWheelPan: true,
  });

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

  // Integración reactiva con el Manifiesto de Mezcla Ligero del Estudio de Audio
  const mixManifest = useAudioStudioStore((state) => state.mixManifest);

  // Actualizar datos de onda sonora al cambiar de pista, duración, zoom o mezcla en el estudio
  useEffect(() => {
    const updatePeaks = () => {
      // Al hacer zoom, solicitamos una mayor resolución de buckets al AudioBuffer para detalle milimétrico
      const numBuckets = Math.max(300, Math.min(3000, Math.floor(contentWidth / 3.2)));
      const basePeaks = audioEngine.getWaveformData(numBuckets);
      if (basePeaks && basePeaks.length > 0) {
        // Modular reactivamente la onda según los volúmenes y estados Mute del manifiesto del estudio
        const masterVol = mixManifest.masterTrack.muted ? 0 : mixManifest.masterTrack.volume;
        const modulated = basePeaks.map((p) => Math.min(1.0, p * masterVol));
        setWavePeaks(modulated);
      } else {
        // Generar onda representativa elegante si aún no se ha cargado archivo
        const demoPeaks: number[] = [];
        for (let i = 0; i < numBuckets; i++) {
          const t = i / numBuckets;
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
  }, [durationMs, fileName, contentWidth, mixManifest]);

  // NOTA: aquí se auto-cargaba una pista de demostración. Se eliminó para que la
  // aplicación arranque en "lienzo en blanco": sin audio de ejemplo, el usuario
  // carga su propia música con el botón «Cargar Audio».

  // Formato mm:ss.S
  const formatTime = (ms: number): string => {
    const totalSec = Math.max(0, ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = Math.floor(totalSec % 60);
    const tenths = Math.floor((ms % 1000) / 100);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${tenths}`;
  };

  /**
   * Dibujo del Waveform en resolución nativa (Retina) con CERO transform: scaleX.
   *
   * `timeMs` llega SIEMPRE del reloj de hardware (`AudioContext.currentTime`),
   * nunca del `currentTimeMs` de React (que se actualiza a ~12Hz y va con
   * retraso). Así la aguja y el sombreado de progreso quedan clavados a la
   * música al milisegundo, a 60fps, sin provocar un solo re-render.
   */
  const drawWaveform = useCallback((timeMs: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const width = contentWidth;
    const height = canvas.clientHeight || 90;

    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
    }

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    const centerY = height / 2;

    // 1. Limpieza de Fondo
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
    //    Coma flotante pura: sin Math.round para no introducir micro-saltos
    const availableW = Math.max(1, width - PIN_RADIUS * 2);
    const playheadRatio = Math.max(0, Math.min(1, timeMs / effectiveDurationMs));
    const playheadPx = PIN_RADIUS + playheadRatio * availableW;

    // Área reproducida (sombreado sutil cian)
    const playedGradient = ctx.createLinearGradient(0, 0, playheadPx, 0);
    playedGradient.addColorStop(0, 'rgba(0, 245, 255, 0.04)');
    playedGradient.addColorStop(1, 'rgba(0, 245, 255, 0.16)');
    ctx.fillStyle = playedGradient;
    ctx.fillRect(0, 0, playheadPx, height);

    // 3. Renderizado de Picos de la Onda Sonora (Detalle de alta densidad al hacer zoom)
    const peaks = wavePeaks.length > 0 ? wavePeaks : [0.5];
    const step = availableW / peaks.length;
    const barWidth = Math.max(1.5, Math.min(6, step - 1));

    for (let i = 0; i < peaks.length; i++) {
      const peakVal = peaks[i];
      const barX = PIN_RADIUS + i * step;
      const barHeight = Math.max(3, peakVal * (height * 0.82));
      const topY = centerY - barHeight / 2;

      // Color dinámico según si ya ha sido reproducido o está por sonar
      const isPast = barX <= playheadPx;
      ctx.fillStyle = isPast ? '#00F5FF' : 'rgba(161, 161, 170, 0.35)';

      ctx.beginPath();
      roundRectPath(ctx, barX, topY, barWidth, barHeight, 1);
      ctx.fill();
    }

    // 4. Marcadores de Nodos Coreográficos (Líneas verticales del Scrubber)
    const sortedPoints = [...timelineNodes].sort((a, b) => a.timestamp - b.timestamp);

    sortedPoints.forEach((point) => {
      const pointRatio = Math.max(0, Math.min(1, point.timestamp / effectiveDurationMs));
      const pinX = PIN_RADIUS + pointRatio * availableW;
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
      roundRectPath(ctx, hTipX, hTipY, hTipW, hTipH, 3);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#38BDF8';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(timeStr, hTipX + hTipW / 2, hTipY + hTipH / 2);
      ctx.restore();
    }

    ctx.restore();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    contentWidth,
    wavePeaks,
    effectiveDurationMs,
    timelineNodes,
    selectedPointId,
    hoverX,
    hoverTimeMs,
    draggedPinId,
  ]);

  /**
   * Sincronización del lienzo con el reloj de hardware:
   * - reproduciendo → un frame de rAF compartido (`PlaybackClock`) para toda la app;
   *   se redibuja la onda y se auto-desplaza el scroll siguiendo la aguja.
   * - en pausa / zoom / carga → una única escritura puntual con el tiempo real.
   */
  usePlayheadSync(
    useCallback(
      (timeMs: number) => {
        drawWaveform(timeMs);

        if (!isPlaying || zoom <= 1.05) return;
        const track = trackRef.current;
        if (!track) return;

        const availableW = Math.max(1, contentWidth - PIN_RADIUS * 2);
        const playheadPx =
          PIN_RADIUS + Math.max(0, Math.min(1, timeMs / effectiveDurationMs)) * availableW;
        const left = track.scrollLeft;
        const right = left + track.clientWidth;
        if (playheadPx > right - 80 || playheadPx < left + 20) {
          track.scrollLeft = Math.max(0, playheadPx - track.clientWidth / 2);
        }
      },
      [drawWaveform, isPlaying, zoom, contentWidth, effectiveDurationMs]
    ),
    {
      // Mientras suena, el bucle de frames mueve la aguja.
      active: Boolean(isPlaying),
      // En pausa, cualquier cambio de tiempo (seek, scrub, rewind), geometría o
      // marcadores provoca UNA escritura puntual con el tiempo real del motor.
      refreshKey: `${contentWidth}|${effectiveDurationMs}|${wavePeaks.length}|${timelineNodes.length}|${zoom}|${
        isPlaying ? '-' : Math.round(currentTimeMs / 50)
      }`,
    }
  );

  // Gestores de Interacción Táctil y Puntero para los Marcadores DOM (Tamaño Fijo Rígido 36x36px)
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

  const handlePinPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingPinRef.current || !dragStartPointRef.current) return;
    const track = trackRef.current;
    if (!track) return;

    const rect = track.getBoundingClientRect();
    const availableWidth = Math.max(1, contentWidth - PIN_RADIUS * 2);
    // Incorpora scrollLeft para arrastre exacto en cualquier nivel de zoom
    const px = e.clientX - rect.left + track.scrollLeft - PIN_RADIUS;
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

  // Gestores del Canvas: Seek de reproducción con respeto al desplazamiento horizontal
  const handleCanvasPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const track = trackRef.current;
    if (!track) return;

    const rect = track.getBoundingClientRect();
    const availableWidth = Math.max(1, contentWidth - PIN_RADIUS * 2);
    const px = e.clientX - rect.left + track.scrollLeft - PIN_RADIUS;
    const ratio = Math.max(0, Math.min(1, px / availableWidth));
    const targetTimeMs = Math.round(ratio * effectiveDurationMs);
    onSeek(targetTimeMs);
  };

  const handleCanvasPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const track = trackRef.current;
    if (!track) return;

    const rect = track.getBoundingClientRect();
    const availableWidth = Math.max(1, contentWidth - PIN_RADIUS * 2);
    const px = e.clientX - rect.left + track.scrollLeft - PIN_RADIUS;
    const ratio = Math.max(0, Math.min(1, px / availableWidth));
    const timeMs = Math.round(ratio * effectiveDurationMs);

    const canvasX = e.clientX - rect.left + track.scrollLeft;

    setHoverX(canvasX);
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
      className="w-full h-full bg-surface-canvas text-text-primary px-3 sm:px-4 py-1 landscape:py-0.5 flex flex-col justify-between select-none relative overflow-hidden timeline-safe-zone"
    >
      {/* ── Cabecera del Waveform: identidad de pista + zoom + mezcla ──
          El tiempo y la duración viven en el transporte único (RinkAudioPlayer)
          para eliminar telemetría duplicada en pantalla.
          Todas las áreas táctiles respetan el mínimo de 48x48px. */}
      <div className="flex shrink-0 items-center justify-between gap-2 text-xs landscape:h-6 landscape:justify-end">
        <div className="flex min-w-0 items-center gap-2 landscape:hidden">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-subtle border border-border-subtle bg-surface-hover text-text-secondary">
            <Music className="h-3.5 w-3.5" />
          </div>
          <div className="flex min-w-0 flex-col leading-tight">
            <span className="truncate font-semibold text-text-primary max-w-[130px] sm:max-w-[190px] xl:max-w-[260px]">
              {fileName || 'Pista Musical'}
            </span>
            <span className="hidden text-[9px] font-mono uppercase tracking-wider text-text-tertiary lg:inline">
              Waveform · {timelineNodes.length} nodos
            </span>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {/* Botón Desplegable Mini-Mezclador (único acceso a la mezcla de la Pista 2D) */}
          <button
            type="button"
            onClick={() => setIsMiniMixerOpen((prev) => !prev)}
            className={`min-h-touch min-w-touch landscape:h-9 landscape:min-h-0 landscape:min-w-0 rounded-subtle flex items-center justify-center gap-1.5 border px-2.5 landscape:px-2 font-sans text-[11px] font-bold press lg:px-3 ${
              isMiniMixerOpen
                ? 'border-cyan/40 bg-cyan/20 text-cyan shadow-sm shadow-cyan/20'
                : 'border-border-subtle bg-surface-hover/80 text-text-secondary hover:bg-surface-active hover:text-text-primary'
            }`}
            title="Ajustar volúmenes independientes (Música Master, Metrónomo, Voces Guía)"
            aria-label="Abrir mezcla de audio"
          >
            <Sliders className="h-3.5 w-3.5 text-cyan" />
            <span className="hidden lg:inline">Mezcla</span>
            <span className="hidden font-mono text-[9px] text-text-tertiary xl:inline">
              {musicMuted ? 'M' : `${Math.round(musicVolume * 100)}%`}
            </span>
          </button>

          {/* Botones de Zoom In / Zoom Out / Reset (48x48px; 36px en landscape para ceder altura al canvas) */}
          <div className="flex items-center gap-0.5 rounded-subtle border border-border-subtle bg-surface-hover/80 p-0.5">
            <button
              type="button"
              onClick={() => zoomOut()}
              disabled={zoom <= 1.01}
              className="flex min-h-touch min-w-touch landscape:h-9 landscape:w-9 landscape:min-h-0 landscape:min-w-0 items-center justify-center rounded text-text-secondary press hover:bg-surface-active hover:text-text-primary disabled:pointer-events-none disabled:opacity-25"
              title="Alejar (Ctrl + Rueda abajo)"
              aria-label="Alejar"
            >
              <ZoomOut className="h-4 w-4" />
            </button>

            <span
              className="hidden min-w-[34px] px-1 text-center font-mono text-[10px] font-bold text-accent lg:inline"
              title="Factor de zoom horizontal actual"
            >
              {zoom.toFixed(1)}x
            </span>

            <button
              type="button"
              onClick={() => zoomIn()}
              disabled={zoom >= 34.9}
              className="flex min-h-touch min-w-touch landscape:h-9 landscape:w-9 landscape:min-h-0 landscape:min-w-0 items-center justify-center rounded text-text-secondary press hover:bg-surface-active hover:text-text-primary disabled:pointer-events-none disabled:opacity-25"
              title="Acercar (Ctrl + Rueda arriba o Pellizco)"
              aria-label="Acercar"
            >
              <ZoomIn className="h-4 w-4" />
            </button>

            {zoom > 1.05 && (
              <button
                type="button"
                onClick={resetZoom}
                className="flex min-h-touch min-w-touch landscape:h-9 landscape:min-h-0 landscape:min-w-0 items-center justify-center gap-0.5 rounded bg-accent/15 px-1 text-[9px] font-bold text-accent press hover:bg-accent/25"
                title="Restablecer a vista completa (1x)"
                aria-label="Restablecer zoom"
              >
                <RotateCcw className="h-3 w-3" />
                1x
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Contenedor del Track Desplazable (Scroll & Paneo Nativo Horizontal) ── */}
      <div
        ref={trackRef}
        className="relative w-full flex-1 min-h-0 overflow-x-auto overflow-y-hidden rounded-subtle border border-border-subtle bg-surface-card group mt-1 landscape:mt-0.5"
        style={{
          overflowX: 'auto',
          overflowY: 'hidden',
          WebkitOverflowScrolling: 'touch',
          // Fijo (no reactivo): `useAudioZoomPan` gestiona touch-action una sola
          // vez y mutarlo aquí a mitad de gesto rompía la pinza. `pan-x pan-y`
          // desactiva el zoom nativo y deja el gesto de dos dedos al hook.
          touchAction: 'pan-x pan-y',
        }}
      >
        {/* Canvas de Onda con resolución nativa de píxeles (¡Cero CSS scaleX!) */}
        <canvas
          ref={canvasRef}
          onPointerDown={handleCanvasPointerDown}
          onPointerMove={handleCanvasPointerMove}
          onPointerLeave={handleCanvasPointerLeave}
          style={{
            width: `${contentWidth}px`,
            minWidth: `${contentWidth}px`,
            height: '100%',
            cursor: 'crosshair',
          }}
          className="h-full block select-none rounded-subtle"
          title="Línea de tiempo de audio. Ctrl + Scroll o Pellizco para Zoom. Toca para reproducir. Arrastra marcadores para sincronizar."
        />

        {/* DOM Overlay de Marcadores (Tamaño Fijo Rígido 36x36px, Sin Deformación Óptica) */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            width: `${contentWidth}px`,
            minWidth: `${contentWidth}px`,
          }}
        >
          {sortedTimelineNodes.map((point, index) => {
            const pointRatio = Math.max(0, Math.min(1, point.timestamp / effectiveDurationMs));
            const availableW = Math.max(1, contentWidth - PIN_RADIUS * 2);
            const pinLeftPx = PIN_RADIUS + pointRatio * availableW;

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
                  left: `${pinLeftPx}px`,
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

                {/* Cabeza del Marcador Táctil (Tamaño Fijo Estricto 36x36px: CERO Deformación Ovalada) */}
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

        {/* Indicador de Ayuda Dinámico */}
        <div className="absolute bottom-1 right-2 text-[9px] font-mono font-medium text-text-tertiary pointer-events-none group-hover:text-text-secondary transition-colors">
          {zoom > 1.05
            ? `Zoom ${zoom.toFixed(1)}x · Paneo activo (Scroll horizontal o Arrastre)`
            : 'Ctrl + Rueda o Pellizco para Zoom · Arrastra marcadores para sincronizar'}
        </div>
      </div>

      {/* ── Menú de Mezcla Responsivo (Bottom Sheet en Portrait / Sidebar Drawer en Landscape) ── */}
      <RinkAudioMixerDrawer
        isOpen={isMiniMixerOpen}
        onClose={() => setIsMiniMixerOpen(false)}
        onOpenStudio={onOpenStudio}
      />
    </div>
  );
};
