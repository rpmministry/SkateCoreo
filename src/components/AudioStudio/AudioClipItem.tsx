import React, { useRef, useEffect, useState } from 'react';
import { useDrag } from '@use-gesture/react';
import { AudioClip } from '../../types/audioStudio';
import { useAudioStudioStore } from '../../store/useAudioStudioStore';
import { useLongPress } from '../../hooks/useLongPress';

/** Id DOM de la Dropzone (basurero) compartido con `AudioStudioView`. */
export const TRASH_ZONE_ID = 'studio-trash-zone';

interface AudioClipItemProps {
  clip: AudioClip;
  trackId: string;
  trackColor: string;
  totalDurationSec: number;
  contentWidth: number;
  trackLaneHeight?: number;
  trackIndex?: number;
  totalTracks?: number;
  onTrackHop?: (clipId: string, deltaY: number, newOffsetSec: number) => void;
}

export const AudioClipItem: React.FC<AudioClipItemProps> = ({
  clip,
  trackId,
  trackColor,
  totalDurationSec,
  contentWidth,
  trackLaneHeight = 60,
  trackIndex = 0,
  totalTracks = 1,
  onTrackHop,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const clipRef = useRef<HTMLDivElement | null>(null);

  const selectedClipId = useAudioStudioStore((s) => s.selectedClipId);
  const setSelectedClipId = useAudioStudioStore((s) => s.setSelectedClipId);
  const openContextMenu = useAudioStudioStore((s) => s.openContextMenu);
  const moveClip = useAudioStudioStore((s) => s.moveClip);
  const moveClipToTrack = useAudioStudioStore((s) => s.moveClipToTrack);
  const setClipFades = useAudioStudioStore((s) => s.setClipFades);
  const calculateSnapOffset = useAudioStudioStore((s) => s.calculateSnapOffset);
  const setDraggingGhost = useAudioStudioStore((s) => s.setDraggingGhost);
  const additionalTracks = useAudioStudioStore((s) => s.additionalTracks);
  const masterTrack = useAudioStudioStore((s) => s.tracks.music);
  const recordingTrack = useAudioStudioStore((s) => s.tracks.recording);
  const beginTrashDrag = useAudioStudioStore((s) => s.beginTrashDrag);
  const setTrashHover = useAudioStudioStore((s) => s.setTrashHover);
  const endTrashDrag = useAudioStudioStore((s) => s.endTrashDrag);
  const deleteClip = useAudioStudioStore((s) => s.deleteClip);

  const [isDraggingClip, setIsDraggingClip] = useState(false);
  const [dragOffsetSec, setDragOffsetSec] = useState<number | null>(null);
  const [dragDeltaY, setDragDeltaY] = useState(0);

  // Tras una pulsación larga, el "click" sintético que sigue al soltar debe
  // ignorarse para no abrir el menú contextual encima del modo basurero.
  const suppressClickRef = useRef(false);

  /** ¿El puntero está dentro de la Dropzone de basura? (para resaltarla y borrar). */
  const isPointOverTrash = (x: number, y: number) => {
    const el = document.getElementById(TRASH_ZONE_ID);
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  };

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
  const widthPx = Math.max(24, (clipDurationSec / safeTotalDuration) * contentWidth);

  // Px por segundo actual para calcular arrastres
  const pxPerSec = contentWidth / safeTotalDuration;

  // ── Renderizado Canvas 2D de Onda Sonora (Estilo BandLab: Forma de onda contrastada y nítida sobre bloque sólido) ──
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !clip.buffer) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const renderWidth = Math.max(1, Math.floor(widthPx));
    const renderHeight = Math.max(1, Math.floor(trackLaneHeight - 8));

    // Fijar dimensiones exactas en CSS y píxeles físicos multiplicados por DPR
    canvas.style.width = `${renderWidth}px`;
    canvas.style.height = `${renderHeight}px`;
    canvas.width = Math.round(renderWidth * dpr);
    canvas.height = Math.round(renderHeight * dpr);

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, renderWidth, renderHeight);

    const channelData = clip.buffer.getChannelData(0);
    const bufferDuration = clip.buffer.duration;
    const startRatio = Math.max(0, clip.trimStartSec / bufferDuration);
    const endRatio = Math.min(1, clip.trimEndSec / bufferDuration);

    const startSample = Math.floor(startRatio * channelData.length);
    const endSample = Math.floor(endRatio * channelData.length);
    const samplesInClip = Math.max(1, endSample - startSample);

    const midY = renderHeight / 2;

    // Línea base central tenue
    ctx.fillStyle = 'rgba(0, 0, 0, 0.20)';
    ctx.fillRect(0, midY - 0.5, renderWidth, 1);

    // 1. Forma de onda de ALTA RESOLUCIÓN (1 barra por píxel de dispositivo)
    //
    // El paso se calcula en píxeles FÍSICOS y se convierte a CSS, de modo que
    // cada barra ocupa exactamente 1px de hardware con 1px de separación: en
    // pantallas Retina/OLED la onda se ve nítida y permite cortes milimétricos
    // sin aliasing ni emborronado.
    const stepCss = Math.max(1 / dpr, Math.min(3, renderWidth / 2600));
    const barCss = Math.max(1 / dpr, stepCss - 1 / dpr);
    const numBars = Math.max(1, Math.floor(renderWidth / stepCss));
    const samplesPerBar = Math.max(1, samplesInClip / numBars);

    ctx.fillStyle = 'rgba(0, 0, 0, 0.68)';

    for (let i = 0; i < numBars; i++) {
      // Alinear al grid de píxeles físicos para evitar antialiasing difuso
      const xDev = Math.round(i * stepCss * dpr) / dpr;
      if (xDev > renderWidth) break;

      const sampleStart = startSample + Math.floor(i * samplesPerBar);
      const sampleEnd = Math.min(
        endSample,
        startSample + Math.floor((i + 1) * samplesPerBar) + 1
      );

      let maxPeak = 0;
      for (let s = sampleStart; s < sampleEnd; s++) {
        const val = Math.abs(channelData[s] || 0);
        if (val > maxPeak) maxPeak = val;
      }

      const halfH = Math.max(1.2, maxPeak * (renderHeight * 0.38));
      ctx.fillRect(xDev, midY - halfH, barCss, halfH * 2);
    }

    // 2. Dibujar envolvente visual de Fade In
    const fadeInWidth = (localFadeIn / clipDurationSec) * renderWidth;
    if (fadeInWidth > 2) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.40)';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(fadeInWidth, 0);
      ctx.lineTo(0, renderHeight);
      ctx.closePath();
      ctx.fill();

      // Línea de rampa de entrada
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, renderHeight);
      ctx.lineTo(fadeInWidth, 0);
      ctx.stroke();
    }

    // 3. Dibujar envolvente visual de Fade Out
    const fadeOutWidth = (localFadeOut / clipDurationSec) * renderWidth;
    if (fadeOutWidth > 2) {
      const startFadeOutX = renderWidth - fadeOutWidth;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.40)';
      ctx.beginPath();
      ctx.moveTo(startFadeOutX, 0);
      ctx.lineTo(renderWidth, 0);
      ctx.lineTo(renderWidth, renderHeight);
      ctx.closePath();
      ctx.fill();

      // Línea de rampa de salida
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(startFadeOutX, 0);
      ctx.lineTo(renderWidth, renderHeight);
      ctx.stroke();
    }

    ctx.restore();
  }, [clip.buffer, clip.trimStartSec, clip.trimEndSec, widthPx, trackLaneHeight, localFadeIn, localFadeOut, clipDurationSec]);

  /**
   * Arreglo REAL del Studio: [Master(música), VOZ grabada, ...adicionales].
   * La pista de grabación es EXCLUSIVA (no acepta clips de otras pistas).
   */
  const getTargetTrackInfo = (targetIdx: number) => {
    const arrangement = [masterTrack, recordingTrack, ...additionalTracks];
    const t = arrangement[targetIdx];
    if (t) {
      return { id: t.id, name: t.name, exclusive: t.id === recordingTrack.id };
    }
    return { id: trackId, name: 'Pista', exclusive: false };
  };

  // ── Drag Gesture con @use-gesture/react ──
  const bindDrag = useDrag(
    ({ down, movement: [mx, my], xy: [clientX, clientY], first, last, event, cancel }) => {
      if (isAdjustingFadeIn || isAdjustingFadeOut) return;

      // Dos o más dedos = gesto de pinza/zoom: nunca arrastrar un clip.
      // Sin esta guarda el clip "secuestraba" el pinch en landscape.
      const activeTouches = (event as TouchEvent | undefined)?.touches?.length;
      if (typeof activeTouches === 'number' && activeTouches > 1) {
        cancel?.();
        return;
      }

      // ── MODO BASURERO (activado por pulsación larga) ──
      // Mientras el clip está "cogido" para borrar, NO se mueve en el timeline:
      // solo sigue al puntero y se resalta el basurero cuando se pasa por encima.
      const trash = useAudioStudioStore.getState().trashDrag;
      const isTrashMode = trash.active && trash.clipId === clip.id;

      if (isTrashMode) {
        const over = isPointOverTrash(clientX, clientY);

        if (first) {
          setIsDraggingClip(true);
          if ('vibrate' in navigator) navigator.vibrate(10);
        }

        if (down) {
          setTrashHover(over);
          setDragDeltaY(my);
          setDraggingGhost({
            clip,
            fromTrackId: trackId,
            targetTrackIndex: trackIndex,
            targetTrackId: trackId,
            targetTrackName: over ? 'Eliminar' : 'Basurero',
            startOffsetSec: clip.startOffsetSec,
            cursorX: clientX,
            cursorY: clientY,
            isOverMaster: false,
            snapLineSec: null,
          });
        }

        if (last) {
          setIsDraggingClip(false);
          setDraggingGhost(null);
          setDragDeltaY(0);
          // Suelta sobre el basurero → elimina el fragmento del timeline.
          if (isPointOverTrash(clientX, clientY)) {
            if ('vibrate' in navigator) navigator.vibrate(24);
            deleteClip(trackId, clip.id);
          }
          endTrashDrag();
        }
        return;
      }

      // Cualquier arrastre normal cancela un modo basurero abierto en otro clip.
      if (trash.active) endTrashDrag();

      const laneOffset = Math.round(my / trackLaneHeight);
      const safeTotal = Math.max(1, totalTracks);
      const targetIndex = Math.max(0, Math.min(safeTotal - 1, trackIndex + laneOffset));
      const targetInfo = getTargetTrackInfo(targetIndex);

      if (first) {
        setIsDraggingClip(true);
        setSelectedClipId(clip.id);
        if ('vibrate' in navigator) navigator.vibrate(10);
      }

      if (down) {
        const deltaSec = mx / pxPerSec;
        const rawSec = Math.max(0, clip.startOffsetSec + deltaSec);

        // Snapping magnético estricto de 0.5s
        const snapResult = calculateSnapOffset
          ? calculateSnapOffset(targetInfo.id, clip.id, rawSec, clipDurationSec, 0.50)
          : { snappedSec: rawSec, snapLineSec: null };

        setDragOffsetSec(snapResult.snappedSec);
        setDragDeltaY(my);

        // Ghost Overlay en tiempo real
        setDraggingGhost({
          clip,
          fromTrackId: trackId,
          targetTrackIndex: targetIndex,
          targetTrackId: targetInfo.id,
          targetTrackName: targetInfo.name,
          startOffsetSec: snapResult.snappedSec,
          cursorX: clientX,
          cursorY: clientY,
          isOverMaster: targetIndex === 0,
          snapLineSec: snapResult.snapLineSec,
        });
      }

      if (last) {
        setIsDraggingClip(false);
        setDraggingGhost(null);
        const finalSec = dragOffsetSec !== null ? dragOffsetSec : clip.startOffsetSec;
        setDragOffsetSec(null);

        if (targetIndex !== trackIndex) {
          if (targetInfo.exclusive) {
            // La pista de VOZ grabada es exclusiva: solo admite grabaciones propias.
            if ('vibrate' in navigator) navigator.vibrate(30);
          } else if (onTrackHop) {
            onTrackHop(clip.id, my, finalSec);
          } else {
            moveClipToTrack(trackId, targetInfo.id, clip.id, finalSec);
          }
          if ('vibrate' in navigator) navigator.vibrate(15);
        } else {
          moveClip(trackId, clip.id, finalSec);
        }
        setDragDeltaY(0);
      }
    },
    {
      filterTaps: true,
      threshold: 4,
    }
  );

  /**
   * Pulsación larga (~500 ms) → activa el modo basurero.
   * En móvil/tablet es la vía táctil para borrar fragmentos cortados sin depender
   * del menú contextual. El temporizador se cancela si hay desplazamiento previo.
   */
  const longPress = useLongPress({
    delay: 500,
    moveTolerance: 10,
    onLongPress: () => {
      suppressClickRef.current = true;
      beginTrashDrag(trackId, clip.id);
      setSelectedClipId(clip.id);
      if ('vibrate' in navigator) navigator.vibrate(20);
    },
  });

  const dragBind = bindDrag() as Record<string, ((e: React.PointerEvent) => void) | undefined>;

  const handleClick = (e: React.MouseEvent) => {
    // Click sintético posterior a una pulsación larga: ignorar.
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    // Si el basurero está abierto, un tap simple lo cancela en vez de abrir menú.
    if (useAudioStudioStore.getState().trashDrag.active) {
      e.preventDefault();
      e.stopPropagation();
      endTrashDrag();
      return;
    }
    e.stopPropagation();
    setSelectedClipId(clip.id);
    useAudioStudioStore.getState().setActiveTrackId(trackId);
    if (clipRef.current) {
      const rect = clipRef.current.getBoundingClientRect();
      // Anclar el menú en el centro superior del clip
      openContextMenu(trackId, clip.id, rect.left + rect.width / 2, rect.top);
    } else {
      openContextMenu(trackId, clip.id, e.clientX, e.clientY);
    }
  };

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
      {...dragBind}
      onPointerDown={(e) => {
        dragBind.onPointerDown?.(e);
        longPress.onPointerDown(e);
      }}
      onPointerMove={(e) => {
        dragBind.onPointerMove?.(e);
        longPress.onPointerMove(e);
      }}
      onPointerUp={(e) => {
        dragBind.onPointerUp?.(e);
        longPress.onPointerUp(e);
        // Si el modo basurero quedó abierto (pulsación larga sin arrastre), se
        // cierra al levantar el dedo. Si el gesto ya hizo el "drop", es no-op.
        const trash = useAudioStudioStore.getState().trashDrag;
        if (trash.active && trash.clipId === clip.id) {
          setTrashHover(false);
          endTrashDrag();
        }
      }}
      onPointerCancel={(e) => {
        dragBind.onPointerCancel?.(e);
        longPress.onPointerCancel(e);
      }}
      onClick={handleClick}
      className={`absolute top-1 select-none cursor-pointer rounded-lg overflow-hidden transition-all ${
        isDraggingClip ? 'z-30 shadow-2xl scale-[1.02] opacity-95' : 'z-10'
      } ${
        isSelected
          ? 'ring-2 ring-white shadow-xl shadow-cyan/30'
          : 'hover:brightness-110 shadow-md'
      }`}
      style={{
        left: `${leftPx}px`,
        width: `${widthPx}px`,
        height: `${trackLaneHeight - 8}px`,
        backgroundColor: trackColor, // Bloque de color sólido auténtico BandLab
        transform: isDraggingClip ? `translateY(${dragDeltaY}px)` : 'none',
        touchAction: 'none',
      }}
    >
      {/* Canvas con la onda sonora */}
      <canvas
        ref={canvasRef}
        className="w-full h-full block pointer-events-none"
        style={{ width: '100%', height: '100%' }}
      />

      {/* Header del Clip con nombre y duración estilo BandLab */}
      <div className="absolute top-0 inset-x-0 h-4 px-2 flex items-center justify-between bg-black/25 text-[10px] font-sans font-bold text-white pointer-events-none truncate">
        <span className="truncate drop-shadow-sm">{clip.name}</span>
        <span className="text-[9px] font-mono text-white/80 ml-1">
          {clipDurationSec.toFixed(1)}s
        </span>
      </div>

      {/* Tirador Fade In (Superior Izquierda) */}
      <div
        onPointerDown={handleFadeInPointerDown}
        className="absolute top-0 left-0 w-5 h-5 cursor-ew-resize z-20 flex items-start justify-start group p-0.5"
        title="Arrastra para Fade In"
      >
        <div className="w-2 h-2 bg-white group-hover:scale-125 rounded-xs shadow transition-transform" />
      </div>

      {/* Tirador Fade Out (Superior Derecha) */}
      <div
        onPointerDown={handleFadeOutPointerDown}
        className="absolute top-0 right-0 w-5 h-5 cursor-ew-resize z-20 flex items-start justify-end group p-0.5"
        title="Arrastra para Fade Out"
      >
        <div className="w-2 h-2 bg-white group-hover:scale-125 rounded-xs shadow transition-transform" />
      </div>
    </div>
  );
};
