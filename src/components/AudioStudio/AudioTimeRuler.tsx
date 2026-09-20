import React, { useRef, useState } from 'react';
import { useAudioStudioStore } from '../../store/useAudioStudioStore';
import { Trash2, MapPin } from 'lucide-react';

interface AudioTimeRulerProps {
  totalDurationSec: number;
  currentTimeSec: number;
  onSeek: (sec: number) => void;
  contentWidth?: number;
}

export const AudioTimeRuler: React.FC<AudioTimeRulerProps> = ({
  totalDurationSec,
  currentTimeSec,
  onSeek,
  contentWidth,
}) => {
  const rulerRef = useRef<HTMLDivElement | null>(null);
  const audioNodes = useAudioStudioStore((s) => s.audioNodes);
  const addTimeNode = useAudioStudioStore((s) => s.addTimeNode);
  const updateTimeNode = useAudioStudioStore((s) => s.updateTimeNode);
  const deleteTimeNode = useAudioStudioStore((s) => s.deleteTimeNode);
  const selectedNodeId = useAudioStudioStore((s) => s.selectedNodeId);
  const setSelectedNodeId = useAudioStudioStore((s) => s.setSelectedNodeId);

  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);

  const duration = Math.max(10, totalDurationSec);
  const effectiveWidth = contentWidth || 1000;

  // Clic en la regla para agregar un nodo temporal o saltar en el tiempo
  const handleRulerClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!rulerRef.current) return;
    const rect = rulerRef.current.getBoundingClientRect();
    const w = contentWidth || rect.width;
    const px = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, px / w));
    const clickedSec = Math.round(ratio * duration * 100) / 100;

    // Si hizo clic con Shift o doble clic, añade un nodo; de lo contrario salta a esa posición
    if (e.shiftKey || e.detail >= 2) {
      addTimeNode(clickedSec);
    } else {
      onSeek(clickedSec);
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
    const w = contentWidth || rect.width;
    const px = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, px / w));
    const newSec = Math.round(ratio * duration * 100) / 100;
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

  // Graduación dinámica inteligente según el factor de zoom (LOD / Pixels per second)
  const pxPerSec = effectiveWidth / duration;
  let majorStepSec = 10;
  let subStepSec = 5;

  if (pxPerSec > 250) {
    majorStepSec = 0.5;
    subStepSec = 0.1;
  } else if (pxPerSec > 120) {
    majorStepSec = 1;
    subStepSec = 0.25;
  } else if (pxPerSec > 50) {
    majorStepSec = 2;
    subStepSec = 0.5;
  } else if (pxPerSec > 20) {
    majorStepSec = 5;
    subStepSec = 1;
  } else if (pxPerSec > 8) {
    majorStepSec = 10;
    subStepSec = 2;
  } else if (pxPerSec > 3) {
    majorStepSec = 30;
    subStepSec = 5;
  } else {
    majorStepSec = 60;
    subStepSec = 15;
  }

  const majorTickCount = Math.floor(duration / majorStepSec);
  const majorTicks = Array.from({ length: majorTickCount + 1 }, (_, i) => Math.round(i * majorStepSec * 100) / 100);

  const subTickCount = Math.floor(duration / subStepSec);
  const subTicks = Array.from({ length: subTickCount + 1 }, (_, i) => Math.round(i * subStepSec * 100) / 100);

  const playheadPx = (currentTimeSec / duration) * effectiveWidth;

  return (
    <div
      style={{ width: contentWidth ? `${contentWidth}px` : '100%' }}
      className="select-none bg-slate-950 border-b border-white/10 flex flex-col"
    >
      {/* ── Sub-header: Instrucción Rápida y Contador de Marcadores ── */}
      <div className="h-7 px-3 flex items-center justify-between bg-slate-900/80 border-b border-white/5 text-[11px]">
        <div className="flex items-center gap-2 text-slate-300 font-medium">
          <MapPin className="w-3.5 h-3.5 text-cyan" />
          <span>Regla de Marcadores Temporales:</span>
          <span className="text-[10px] text-slate-400">
            (Doble clic o Shift + Clic en la regla para crear un nuevo Nodo)
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan/10 text-cyan border border-cyan/30 font-bold">
            {audioNodes.length} {audioNodes.length === 1 ? 'Nodo creado' : 'Nodos creados'}
          </span>
        </div>
      </div>

      {/* ── Contenedor de la Regla Graduada ── */}
      <div
        ref={rulerRef}
        onClick={handleRulerClick}
        style={{ width: contentWidth ? `${contentWidth}px` : '100%' }}
        className="relative h-12 cursor-crosshair bg-[#060911] overflow-hidden"
      >
        {/* Sub-ticks sutiles */}
        {subTicks.map((tSec) => {
          const leftPx = (tSec / duration) * effectiveWidth;
          return (
            <div
              key={`sub-${tSec}`}
              className="absolute top-0 pointer-events-none w-[1px] h-2 bg-slate-700/40"
              style={{ left: `${leftPx}px` }}
            />
          );
        })}

        {/* Ticks Mayores y Marcas de Tiempo */}
        {majorTicks.map((tSec) => {
          const leftPx = (tSec / duration) * effectiveWidth;
          const mins = Math.floor(tSec / 60);
          const secs = tSec % 60;
          const isFractional = majorStepSec < 1;
          const timeLabel = isFractional
            ? `${mins}:${secs < 10 ? '0' : ''}${secs.toFixed(1)}`
            : `${mins}:${Math.floor(secs).toString().padStart(2, '0')}`;

          return (
            <div
              key={`maj-${tSec}`}
              className="absolute top-0 bottom-0 pointer-events-none flex flex-col items-center"
              style={{ left: `${leftPx}px` }}
            >
              <div className="w-[1px] h-3.5 bg-slate-500/80" />
              <span className="text-[9px] font-mono font-medium text-slate-400 mt-0.5 -translate-x-1/2">
                {timeLabel}
              </span>
              <div className="flex-1 w-[1px] bg-white/[0.04]" />
            </div>
          );
        })}

        {/* Aguja del Playhead (Línea Amarilla de Tiempo) */}
        <div
          className="absolute top-0 bottom-0 w-[2px] bg-amber-400 shadow-glow-amber pointer-events-none z-30 transition-none"
          style={{ left: `${playheadPx}px` }}
        >
          <div className="w-3 h-3 bg-amber-400 rotate-45 -translate-x-1.5 -translate-y-1 rounded-sm shadow-md" />
        </div>

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

