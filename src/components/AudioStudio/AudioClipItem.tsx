import React, { useRef, useEffect, useState } from 'react';
import { useDrag } from '@use-gesture/react';
import { AudioClip } from '../../types/audioStudio';
import { useAudioStudioStore } from '../../store/useAudioStudioStore';

interface AudioClipItemProps {
  clip: AudioClip;
  trackId: string;
  trackColor: string;
  totalDurationSec: number;
  contentWidth: number;
  trackLaneHeight?: number;
  onTrackHop?: (clipId: string, deltaY: number, newOffsetSec: number) => void;
}

export const AudioClipItem: React.FC<AudioClipItemProps> = ({
  clip,
  trackId,
  trackColor,
  totalDurationSec,
  contentWidth,
  trackLaneHeight = 56,
  onTrackHop,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const clipRef = useRef<HTMLDivElement | null>(null);

  const selectedClipId = useAudioStudioStore((s) => s.selectedClipId);
  const setSelectedClipId = useAudioStudioStore((s) => s.setSelectedClipId);
  const openContextMenu = useAudioStudioStore((s) => s.openContextMenu);
  const moveClip = useAudioStudioStore((s) => s.moveClip);
  const setClipFades = useAudioStudioStore((s) => s.setClipFades);

  const [isDraggingClip, setIsDraggingClip] = useState(false);
  const [dragOffsetSec, setDragOffsetSec] = useState<number | null>(null);
  const [dragDeltaY, setDragDeltaY] = useState(0);

  // Estados locales para arrastre de tiradores de Fade
  const [isAdjustingFadeIn, setIsAdjustingFadeIn] = useState(false);
  const [isAdjustingFadeOut, setIsAdjustingFadeOut] = useState(false);
  const [localFadeIn, setLocalFadeIn] = useState(clip.fadeInSec || 0);
  const [localFadeOut, setLocalFadeOut] = useState(clip.fadeOutSec || 0);

  useEffect(() => {
    setLocalFadeIn(clip.fadeInSec || 0);
    setLocalFadeOut(clip.fadeOutSec || 0);
  }, [clip.fadeInSec, clip.fadeOutSec]);

  const isSelected = selectedClipId === clip.id;
  const safeTotalDuration = Math.max(10, totalDurationSec);

  // Posicionamiento temporal
  const currentStartSec = dragOffsetSec !== null ? dragOffsetSec : clip.startOffsetSec;
  const clipDurationSec = Math.max(0.1, clip.trimEndSec - clip.trimStartSec);

  const leftPx = (currentStartSec / safeTotalDuration) * contentWidth;
  const widthPx = Math.max(16, (clipDurationSec / safeTotalDuration) * contentWidth);

  // Px por segundo actual para calcular arrastres
  const pxPerSec = contentWidth / safeTotalDuration;

  // ── Renderizado Canvas 2D de Onda Sonora con Curva de Fades ──
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !clip.buffer) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const renderWidth = Math.floor(widthPx);
    const renderHeight = Math.floor(trackLaneHeight);

    canvas.width = renderWidth * dpr;
    canvas.height = renderHeight * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, renderWidth, renderHeight);

    const channelData = clip.buffer.getChannelData(0);
    const bufferDuration = clip.buffer.duration;
    const startRatio = Math.max(0, clip.trimStartSec / bufferDuration);
    const endRatio = Math.min(1, clip.trimEndSec / bufferDuration);

    const startSample = Math.floor(startRatio * channelData.length);
    const endSample = Math.floor(endRatio * channelData.length);
    const samplesInClip = Math.max(1, endSample - startSample);

    const step = Math.max(1, Math.floor(samplesInClip / renderWidth));
    const midY = renderHeight / 2;

    // 1. Dibujar Forma de Onda
    ctx.fillStyle = trackColor;
    for (let x = 0; x < renderWidth; x++) {
      const idx = startSample + x * step;
      let maxPeak = 0;
      for (let s = 0; s < step && idx + s < endSample; s++) {
        const val = Math.abs(channelData[idx + s] || 0);
        if (val > maxPeak) maxPeak = val;
      }
      const barHeight = Math.max(2, maxPeak * (renderHeight * 0.78));
      ctx.fillRect(x, midY - barHeight / 2, 1.2, barHeight);
    }

    // 2. Dibujar envolvente visual de Fade In
    const fadeInWidth = (localFadeIn / clipDurationSec) * renderWidth;
    if (fadeInWidth > 2) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(fadeInWidth, 0);
      ctx.lineTo(0, renderHeight);
      ctx.closePath();
      ctx.fill();

      // Línea de rampa de entrada
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, renderHeight);
      ctx.lineTo(fadeInWidth, 0);
      ctx.stroke();
    }

    // 3. Dibujar envolvente visual de Fade Out
    const fadeOutWidth = (localFadeOut / clipDurationSec) * renderWidth;
    if (fadeOutWidth > 2) {
      const startFadeOutX = renderWidth - fadeOutWidth;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
      ctx.beginPath();
      ctx.moveTo(startFadeOutX, 0);
      ctx.lineTo(renderWidth, 0);
      ctx.lineTo(renderWidth, renderHeight);
      ctx.closePath();
      ctx.fill();

      // Línea de rampa de salida
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(startFadeOutX, 0);
      ctx.lineTo(renderWidth, renderHeight);
      ctx.stroke();
    }
  }, [clip.buffer, clip.trimStartSec, clip.trimEndSec, widthPx, trackLaneHeight, trackColor, localFadeIn, localFadeOut, clipDurationSec]);

  // ── Drag Gesture con @use-gesture/react ──
  // Permite arrastre horizontal (tiempo) y vertical (track hopping)
  const bindDrag = useDrag(
    ({ down, movement: [mx, my], first, last }) => {
      // Evitar que el gesto se dispare si se está arrastrando un tirador de fade
      if (isAdjustingFadeIn || isAdjustingFadeOut) return;

      if (first) {
        setIsDraggingClip(true);
        setSelectedClipId(clip.id);
        if ('vibrate' in navigator) navigator.vibrate(10);
      }

      if (down) {
        const deltaSec = mx / pxPerSec;
        const newSec = Math.max(0, clip.startOffsetSec + deltaSec);
        setDragOffsetSec(newSec);
        setDragDeltaY(my);
      }

      if (last) {
        setIsDraggingClip(false);
        const finalSec = dragOffsetSec !== null ? dragOffsetSec : clip.startOffsetSec;
        setDragOffsetSec(null);

        // Si se movió verticalmente más de medio carril, avisar para Track Hopping
        if (Math.abs(my) > trackLaneHeight * 0.5 && onTrackHop) {
          onTrackHop(clip.id, my, finalSec);
        } else {
          moveClip(trackId, clip.id, finalSec);
        }
        setDragDeltaY(0);
      }
    },
    {
      filterTaps: true,
      delay: 220, // Long-press umbral táctil
      threshold: 4,
    }
  );

  // Tap handler para abrir menú contextual flotante
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedClipId(clip.id);
    openContextMenu(trackId, clip.id, e.clientX, e.clientY);
  };

  // ── Tiradores de Fade In / Fade Out ──
  const handleFadeInPointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    setIsAdjustingFadeIn(true);
    const startX = e.clientX;
    const initialFade = localFadeIn;

    const handlePointerMove = (ev: PointerEvent) => {
      const deltaPx = ev.clientX - startX;
      const deltaSec = deltaPx / pxPerSec;
      const newFade = Math.max(0, Math.min(clipDurationSec * 0.8, initialFade + deltaSec));
      setLocalFadeIn(newFade);
    };

    const handlePointerUp = () => {
      setIsAdjustingFadeIn(false);
      setClipFades(trackId, clip.id, localFadeIn, localFadeOut);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };

  const handleFadeOutPointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    setIsAdjustingFadeOut(true);
    const startX = e.clientX;
    const initialFade = localFadeOut;

    const handlePointerMove = (ev: PointerEvent) => {
      // Movimiento hacia la izquierda incrementa fade out
      const deltaPx = startX - ev.clientX;
      const deltaSec = deltaPx / pxPerSec;
      const newFade = Math.max(0, Math.min(clipDurationSec * 0.8, initialFade + deltaSec));
      setLocalFadeOut(newFade);
    };

    const handlePointerUp = () => {
      setIsAdjustingFadeOut(false);
      setClipFades(trackId, clip.id, localFadeIn, localFadeOut);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };

  return (
    <div
      ref={clipRef}
      {...(bindDrag() as any)}
      onClick={handleClick}
      className={`absolute top-1 select-none cursor-pointer rounded-md overflow-hidden transition-shadow ${
        isDraggingClip ? 'z-30 shadow-2xl scale-[1.02] opacity-90' : 'z-10'
      } ${
        isSelected
          ? 'ring-2 ring-cyan shadow-glow-cyan'
          : 'ring-1 ring-white/20 hover:ring-white/40'
      }`}
      style={{
        left: `${leftPx}px`,
        width: `${widthPx}px`,
        height: `${trackLaneHeight - 8}px`,
        backgroundColor: `${trackColor}18`,
        transform: isDraggingClip ? `translateY(${dragDeltaY}px)` : 'none',
        touchAction: 'none',
      }}
    >
      {/* Canvas con la onda sonora del clip */}
      <canvas
        ref={canvasRef}
        className="w-full h-full block pointer-events-none"
        style={{ width: '100%', height: '100%' }}
      />

      {/* Header del Clip con nombre */}
      <div className="absolute top-0 inset-x-0 h-4 px-1.5 flex items-center justify-between bg-black/40 backdrop-blur-xs text-[10px] font-mono text-slate-200 pointer-events-none truncate">
        <span className="truncate">{clip.name}</span>
        <span className="text-[9px] text-slate-400 font-sans ml-1">
          {clipDurationSec.toFixed(1)}s
        </span>
      </div>

      {/* ── Tirador Fade In (Superior Izquierda) ── */}
      <div
        onPointerDown={handleFadeInPointerDown}
        className="absolute top-0 left-0 w-4 h-4 cursor-ew-resize z-20 flex items-start justify-start group"
        title="Arrastra para ajustar Fade In"
      >
        <div className="w-2.5 h-2.5 bg-white/70 group-hover:bg-cyan rounded-br transition-colors shadow-sm" />
      </div>

      {/* ── Tirador Fade Out (Superior Derecha) ── */}
      <div
        onPointerDown={handleFadeOutPointerDown}
        className="absolute top-0 right-0 w-4 h-4 cursor-ew-resize z-20 flex items-start justify-end group"
        title="Arrastra para ajustar Fade Out"
      >
        <div className="w-2.5 h-2.5 bg-white/70 group-hover:bg-cyan rounded-bl transition-colors shadow-sm" />
      </div>
    </div>
  );
};
