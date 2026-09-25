import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAudioStudioStore } from '../../store/useAudioStudioStore';
import { Trash2 } from 'lucide-react';
import { usePlayheadSync } from '../../hooks/usePlayheadSync';
import {
  computeRulerTicks,
  createTimelineGeometry,
  formatTimelineTime,
} from '../../core/audio/timeline/AudioTimelineGeometry';

interface AudioTimeRulerProps {
  totalDurationSec: number;
  currentTimeSec: number;
  onSeek: (sec: number) => void;
  contentWidth?: number;
  overscrollPx?: number;
  hidePlayhead?: boolean;
  /** Habilita el bucle de frames del reloj de hardware para la aguja. */
  isPlaying?: boolean;
  /**
   * Contenedor con scroll horizontal del timeline. La regla se suscribe ella
   * misma: así el scroll solo re-renderiza la regla (ventana visible) y no todo
   * el Audio Studio.
   */
  scrollContainerRef?: React.RefObject<HTMLElement | null>;
  /** Ancho visible del área temporal (a la derecha de la cabecera de pista). */
  viewportWidth?: number;
}

/**
 * AudioTimeRuler — regla temporal ADAPTATIVA del Audio Studio.
 *
 * La resolución no está fijada en segundos: se deriva de `pixelsPerSecond`
 * (AudioTimelineGeometry.rulerStep). Al hacer zoom, el paso baja por la escalera
 * natural 1-2-5 (… 5s → 2s → 1s → 0.5s → 0.2s → 0.1s → 50ms → 20ms → 10ms …)
 * y aparecen marcas menores, manteniendo la separación visual entre 60 y 160 px.
 *
 * La regla SOLO orienta: el seek y los marcadores usan `pixelToTime()` sobre la
 * posición exacta del puntero, sin redondear a milisegundos ni forzar snap.
 */
export const AudioTimeRuler: React.FC<AudioTimeRulerProps> = ({
  totalDurationSec,
  currentTimeSec,
  onSeek,
  contentWidth,
  overscrollPx = 0,
  hidePlayhead = false,
  isPlaying = false,
  scrollContainerRef,
  viewportWidth = 0,
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

  // Scroll horizontal observado localmente por la REGLA. Mantenerlo aquí (y no en
  // AudioStudioView) evita re-renderizar todo el Estudio en cada frame de scroll:
  // solo se vuelve a montar la ventana de marcas de la regla.
  const [scrollLeftPx, setScrollLeftPx] = useState(0);
  const scrollRafRef = useRef<number | null>(null);

  useEffect(() => {
    const el = scrollContainerRef?.current;
    if (!el) return;
    const handleScroll = () => {
      if (scrollRafRef.current !== null) return;
      scrollRafRef.current = requestAnimationFrame(() => {
        scrollRafRef.current = null;
        setScrollLeftPx(el.scrollLeft);
      });
    };
    handleScroll();
    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', handleScroll);
      if (scrollRafRef.current !== null) {
        cancelAnimationFrame(scrollRafRef.current);
        scrollRafRef.current = null;
      }
    };
  }, [scrollContainerRef]);

  const duration = Math.max(10, totalDurationSec);
  const effectiveWidth = contentWidth || 1000;
  const totalRulerWidth = effectiveWidth + overscrollPx;

  // Única transformación tiempo ↔ píxeles de la regla (misma que clips, nodos y playhead).
  const geometry = useMemo(
    () => createTimelineGeometry({ contentWidth: effectiveWidth, durationSec: duration }),
    [effectiveWidth, duration]
  );

  // Escala temporal adaptativa: el paso nace de los píxeles por segundo reales.
  const rulerStep = useMemo(() => geometry.rulerStep(), [geometry]);
  const pxPerSec = geometry.pixelsPerSecond;

  // Ventana visible para no montar miles de marcas con zoom alto. El scroll del
  // contenedor coincide con la coordenada local de la regla.
  const hasWindow = viewportWidth > 0;
  const windowStartPx = hasWindow ? Math.max(0, scrollLeftPx - viewportWidth * 0.5) : 0;
  const windowEndPx = hasWindow
    ? Math.min(totalRulerWidth, scrollLeftPx + viewportWidth * 1.5)
    : totalRulerWidth;

  const ticks = useMemo(() => {
    const visible = geometry.visibleRange(
      windowStartPx,
      Math.max(0, windowEndPx - windowStartPx)
    );
    return computeRulerTicks(visible.startSec, visible.endSec, rulerStep);
  }, [geometry, windowStartPx, windowEndPx, rulerStep]);

  // Scrubbing continuo con arrastre del ratón sobre la regla de tiempo
  const handleRulerPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('[data-marker]')) return;
    if (!rulerRef.current) return;

    const rect = rulerRef.current.getBoundingClientRect();
    const px = e.clientX - rect.left;
    // Tiempo EXACTO bajo el puntero: sin snap y sin redondeo a milisegundos.
    const clickedSec = Math.max(0, geometry.pixelToTime(px));

    // Doble clic o Shift + clic crea marcador de nodo.
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
    if (!rulerRef.current) return;
    const px = e.clientX - rulerRef.current.getBoundingClientRect().left;

    // ARRASTRE DE MARKER: modifica SOLO su `timestampSec`. NUNCA hace seek, así el
    // playhead permanece INDEPENDIENTE del marker. La captura vive en la REGLA
    // (elemento estable), de modo que sobrevive al reordenado/renumerado del store
    // y no puede quedar un puntero capturado en un chip desmontado (bloqueo).
    if (draggingNodeId) {
      updateTimeNode(draggingNodeId, Math.max(0, geometry.pixelToTime(px)));
      return;
    }

    if (!isScrubbingRulerRef.current) return;
    onSeek(Math.max(0, geometry.pixelToTime(px)));
  };

  const handleRulerPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isScrubbingRulerRef.current) isScrubbingRulerRef.current = false;
    if (draggingNodeId) setDraggingNodeId(null);
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch (err) {}
  };

  // Arrastre horizontal de un marcador: la captura se hace en la REGLA (estable),
  // no en el chip (que puede reordenarse/desmontarse durante el drag).
  const handleNodePointerDown = (id: string, e: React.PointerEvent) => {
    e.stopPropagation();
    try {
      rulerRef.current?.setPointerCapture(e.pointerId);
    } catch (err) {}
    setDraggingNodeId(id);
    setSelectedNodeId(id);
  };

  const markerDecimals = pxPerSec >= 100 ? 3 : 2;

  /**
   * Aguja movida por `transform: translateX()` (propiedad de composición, no de
   * layout) desde el reloj de hardware. Cero `setState` por frame.
   */
  const applyPlayhead = useCallback(
    (timeMs: number) => {
      const el = playheadRef.current;
      if (!el) return;
      el.style.transform = `translateX(${geometry.timeToPixel(timeMs / 1000, true)}px)`;
    },
    [geometry]
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
        {/* Marcas temporales adaptativas: mayores etiquetadas + menores de precisión. */}
        {ticks.map((tick) => {
          const leftPx = geometry.timeToPixel(tick.timeSec);

          if (!tick.isMajor) {
            return (
              <div
                key={`min-${tick.timeSec}`}
                className="absolute top-0 pointer-events-none w-[1px] h-2 bg-slate-700/40"
                style={{ left: `${leftPx}px` }}
              />
            );
          }

          // Marca mayor: la línea de 1px, la guía vertical y la etiqueta caen
          // EXACTAMENTE en `leftPx`. El contenedor `items-center` de ancho variable
          // (el de la etiqueta) desplazaba antes la línea media anchura de la
          // etiqueta a la derecha, desalineando la regla respecto a clips/playhead.
          return (
            <React.Fragment key={`maj-${tick.timeSec}`}>
              <div
                className="absolute top-0 bottom-0 w-[1px] bg-white/[0.04] pointer-events-none"
                style={{ left: `${leftPx}px` }}
              />
              <div
                className="absolute top-0 w-[1px] h-3.5 bg-slate-500/80 pointer-events-none"
                style={{ left: `${leftPx}px` }}
              />
              <span
                className="absolute top-4 -translate-x-1/2 text-[9px] font-mono font-medium text-slate-400 whitespace-nowrap pointer-events-none"
                style={{ left: `${leftPx}px` }}
              >
                {formatTimelineTime(tick.timeSec, rulerStep.labelDecimals)}
              </span>
            </React.Fragment>
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
          const leftPx = geometry.timeToPixel(node.timestampSec);
          const isSelected = selectedNodeId === node.id;
          const isDragging = draggingNodeId === node.id;
          const formattedTime = formatTimelineTime(node.timestampSec, markerDecimals);

          return (
            <div
              key={node.id}
              data-marker="true"
              onPointerDown={(e) => handleNodePointerDown(node.id, e)}
              className={[
                'absolute top-4 -translate-x-1/2 z-20 group cursor-grab active:cursor-grabbing',
                'flex max-w-[72px] items-center gap-0.5 px-1 py-0.5 rounded-full border shadow-lg transition-transform shrink-0',
                'sm:max-w-none sm:gap-1 sm:px-2',
                isDragging ? 'scale-110 z-40' : '',
                isSelected
                  ? 'bg-cyan text-slate-950 font-black border-white shadow-cyan/40 shadow-glow-cyan'
                  : 'bg-slate-900/95 text-cyan border-cyan/40 hover:border-cyan',
              ].join(' ')}
              style={{ left: `${leftPx}px` }}
              title={`Nodo ${node.numeroSecuencial} · ${node.timestampSec.toFixed(3)}s (Arrastra para mover)`}
            >
              <span className="w-3.5 h-3.5 rounded-full flex items-center justify-center text-[9px] font-black bg-cyan-950/60 text-cyan shrink-0 sm:w-4 sm:h-4 sm:text-[10px]">
                {node.numeroSecuencial}
              </span>
              <span className="truncate text-[9px] font-mono font-bold whitespace-nowrap sm:text-[10px]">
                {formattedTime}
              </span>

              {/* Botón rápido para eliminar marcador (oculto en móvil para no
                  desbordar; en móvil se elimina desde el menú/gesto). */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  deleteTimeNode(node.id);
                }}
                className="hidden w-3.5 h-3.5 rounded-full items-center justify-center text-slate-400 hover:text-red-400 hover:bg-red-500/20 transition-all opacity-0 group-hover:opacity-100 shrink-0 sm:flex"
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
