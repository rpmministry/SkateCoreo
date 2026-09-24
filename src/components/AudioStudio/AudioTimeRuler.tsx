import React, { useCallback, useRef, useState } from 'react';
import { useAudioStudioStore } from '../../store/useAudioStudioStore';
import { Trash2 } from 'lucide-react';
import { usePlayheadSync } from '../../hooks/usePlayheadSync';
import { timeToPlayheadPx } from '../../core/audio/PlaybackClock';

interface AudioTimeRulerProps {
  totalDurationSec: number;
  currentTimeSec: number;
  onSeek: (sec: number) => void;
  contentWidth?: number;
  overscrollPx?: number;
  hidePlayhead?: boolean;
  /** Habilita el bucle de frames del reloj de hardware para la aguja. */
  isPlaying?: boolean;
}

export const AudioTimeRuler: React.FC<AudioTimeRulerProps> = ({
  totalDurationSec,
  currentTimeSec,
  onSeek,
  contentWidth,
  overscrollPx = 0,
  hidePlayhead = false,
  isPlaying = false,
}) => {
  const rulerRef = useRef<HTMLDivElement | null>(null);
  const playheadRef = useRef<HTMLDivElement | null>(null);
  const audioNodes = useAudioStudioStore((s) => s.audioNodes);
  const addTimeNode = useAudioStudioStore((s) => s.addTimeNode);
  const updateTimeNode = useAudioStudioStore((s) => s.updateTimeNode);
  const deleteTimeNode = useAudioStudioStore((s) => s.deleteTimeNode);
  const selectedNodeId = useAudioStudioStore((s) => s.selectedNodeId);
  const setSelectedNodeId = useAudioStudioStore((s) => s.setSelectedNodeId);

  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const isScrubbingRulerRef = useRef(false);

  const duration = Math.max(10, totalDurationSec);
  const effectiveWidth = contentWidth || 1000;
  const totalRulerWidth = effectiveWidth + overscrollPx;

  // Scrubbing continuo con arrastre del ratón sobre la regla de tiempo
  const handleRulerPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('[data-marker]')) return;
    if (!rulerRef.current) return;

    const rect = rulerRef.current.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const clickedSec = Math.max(0, Math.round((px / effectiveWidth) * duration * 1000) / 1000);

    // Doble clic o Shift + clic crea marcador de nodo
    if (e.shiftKey || e.detail >= 2) {
      addTimeNode(clickedSec);
      return;
    }

    isScrubbingRulerRef.current = true;
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch (err) {}
    onSeek(clickedSec);
  };

  const handleRulerPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isScrubbingRulerRef.current || !rulerRef.current) return;
    const rect = rulerRef.current.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const newSec = Math.max(0, Math.round((px / effectiveWidth) * duration * 1000) / 1000);
    onSeek(newSec);
  };

  const handleRulerPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isScrubbingRulerRef.current) {
      isScrubbingRulerRef.current = false;
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch (err) {}
    }
  };

  // Arrastre horizontal de un marcador existente
  const handleNodePointerDown = (id: string, e: React.PointerEvent) => {
    e.stopPropagation();
    try {
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    } catch (err) {}
    setDraggingNodeId(id);
    setSelectedNodeId(id);
  };

  const handleNodePointerMove = (id: string, e: React.PointerEvent) => {
    if (draggingNodeId !== id || !rulerRef.current) return;
    const rect = rulerRef.current.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const newSec = Math.max(0, Math.round((px / effectiveWidth) * duration * 1000) / 1000);
    updateTimeNode(id, newSec);
    onSeek(newSec);
  };

  const handleNodePointerUp = (id: string, e: React.PointerEvent) => {
    if (draggingNodeId === id) {
      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch (err) {}
      setDraggingNodeId(null);
    }
  };

  // Graduación temporal: MARCAS cada 5 s (requisito) y ETIQUETAS adaptativas
  // para que nunca se superpongan. Nunca se altera la escala temporal real.
  const pxPerSec = effectiveWidth / duration;

  const MIN_TICK_PX = 12;
  const MIN_LABEL_PX = 54;

  // Marcas: 5 s si caben; si no, un múltiplo de 5 s (mantiene la base de 5 s).
  let tickStepSec = 5;
  if (pxPerSec * 5 < MIN_TICK_PX) {
    tickStepSec = 5 * Math.max(1, Math.ceil(MIN_TICK_PX / Math.max(0.0001, pxPerSec * 5)));
  }

  // Etiquetas: múltiplos del paso de marca con separación mínima legible.
  let labelStepSec = tickStepSec;
  while (labelStepSec * pxPerSec < MIN_LABEL_PX) {
    labelStepSec += tickStepSec;
  }

  const extendedDuration = duration + (overscrollPx > 0 ? (overscrollPx / pxPerSec) : 0);

  const tickCount = Math.floor(extendedDuration / tickStepSec);
  const ticks = Array.from({ length: tickCount + 1 }, (_, i) => Math.round(i * tickStepSec * 1000) / 1000);

  const isLabelTick = (tSec: number) => {
    const ratio = tSec / labelStepSec;
    return Math.abs(ratio - Math.round(ratio)) < 0.001;
  };

  /**
   * Aguja movida por `transform: translateX()` (propiedad de composición, no de
   * layout) desde el reloj de hardware. Cero `setState` por frame.
   */
  const applyPlayhead = useCallback(
    (timeMs: number) => {
      const el = playheadRef.current;
      if (!el) return;
      el.style.transform = `translateX(${timeToPlayheadPx(
        timeMs,
        duration * 1000,
        0,
        effectiveWidth
      )}px)`;
    },
    [duration, effectiveWidth]
  );

  usePlayheadSync(applyPlayhead, {
    active: isPlaying && !hidePlayhead,
    refreshKey: `${effectiveWidth}|${duration}|${hidePlayhead ? '-' : Math.round(currentTimeSec / 50)}`,
  });

  return (
    <div
      style={{ width: `${totalRulerWidth}px` }}
      className="select-none bg-slate-950 border-b border-white/10 flex flex-col"
      title="Regla de tiempo · Doble clic (o Shift + clic) crea un marcador arrastrable"
    >
      {/* ── Contenedor de la Regla Graduada con Scrubbing Continuo ── */}
      <div
        ref={rulerRef}
        onPointerDown={handleRulerPointerDown}
        onPointerMove={handleRulerPointerMove}
        onPointerUp={handleRulerPointerUp}
        onPointerCancel={handleRulerPointerUp}
        style={{ width: `${totalRulerWidth}px` }}
        className="relative h-12 cursor-pointer bg-[#060911] overflow-hidden select-none"
      >
        {/* Marcas de tiempo (base 5 s) con etiquetas adaptativas. */}
        {ticks.map((tSec) => {
          const leftPx = (tSec / duration) * effectiveWidth;
          const showLabel = isLabelTick(tSec);
          const mins = Math.floor(tSec / 60);
          const secs = Math.round(tSec % 60);
          const timeLabel = `${mins}:${secs < 10 ? '0' : ''}${secs}`;

          if (!showLabel) {
            return (
              <div
                key={`sub-${tSec}`}
                className="absolute top-0 pointer-events-none w-[1px] h-2 bg-slate-700/40"
                style={{ left: `${leftPx}px` }}
              />
            );
          }

          return (
            <div
              key={`maj-${tSec}`}
              className="absolute top-0 bottom-0 pointer-events-none flex flex-col items-center"
              style={{ left: `${leftPx}px` }}
            >
              <div className="w-[1px] h-3.5 bg-slate-500/80" />
              <span className="text-[9px] font-mono font-medium text-slate-400 mt-0.5 -translate-x-1/2 whitespace-nowrap">
                {timeLabel}
              </span>
              <div className="flex-1 w-[1px] bg-white/[0.04]" />
            </div>
          );
        })}

        {/* Aguja del Playhead (Línea Amarilla de Tiempo).
            Posicionada con transform (composición GPU) desde el reloj de hardware. */}
        {!hidePlayhead && (
          <div
            ref={playheadRef}
            className="absolute top-0 bottom-0 left-0 w-[2px] bg-amber-400 shadow-glow-amber pointer-events-none z-30 will-change-transform"
            style={{ transform: 'translateX(0px)' }}
          >
            <div className="w-3 h-3 bg-amber-400 rotate-45 -translate-x-1.5 -translate-y-1 rounded-sm shadow-md" />
          </div>
        )}

        {/* Marcadores de Nodos Temporales (Chips rígidos numerados 1, 2, 3... Sin deformación) */}
        {audioNodes.map((node) => {
          const leftPx = (node.timestampSec / duration) * effectiveWidth;
          const isSelected = selectedNodeId === node.id;
          const isDragging = draggingNodeId === node.id;

          const mins = Math.floor(node.timestampSec / 60);
          const secs = (node.timestampSec % 60).toFixed(2);
          const formattedTime = `${mins}:${node.timestampSec % 60 < 10 ? '0' : ''}${secs}`;

          return (
            <div
              key={node.id}
              data-marker="true"
              onPointerDown={(e) => handleNodePointerDown(node.id, e)}
              onPointerMove={(e) => handleNodePointerMove(node.id, e)}
              onPointerUp={(e) => handleNodePointerUp(node.id, e)}
              className={[
                'absolute top-4 -translate-x-1/2 z-20 group cursor-grab active:cursor-grabbing',
                'flex items-center gap-1 px-2 py-0.5 rounded-full border shadow-lg transition-transform shrink-0',
                isDragging ? 'scale-110 z-40' : '',
                isSelected
                  ? 'bg-cyan text-slate-950 font-black border-white shadow-cyan/40 shadow-glow-cyan'
                  : 'bg-slate-900/95 text-cyan border-cyan/40 hover:border-cyan',
              ].join(' ')}
              style={{ left: `${leftPx}px` }}
              title={`Nodo ${node.numeroSecuencial} · ${formattedTime}s (Arrastra para mover)`}
            >
              <span className="w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-black bg-cyan-950/60 text-cyan shrink-0">
                {node.numeroSecuencial}
              </span>
              <span className="text-[10px] font-mono font-bold whitespace-nowrap">
                {formattedTime}
              </span>

              {/* Botón rápido para eliminar marcador */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  deleteTimeNode(node.id);
                }}
                className="w-3.5 h-3.5 rounded-full flex items-center justify-center text-slate-400 hover:text-red-400 hover:bg-red-500/20 transition-all opacity-0 group-hover:opacity-100 shrink-0"
                title="Eliminar este marcador"
              >
                <Trash2 className="w-2.5 h-2.5" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};

