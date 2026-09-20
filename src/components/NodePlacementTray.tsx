import React from 'react';
import { 
  MapPin, 
  Lock, 
  CheckCircle2, 
  Trash2, 
  Sparkles,
  Clock
} from 'lucide-react';
import { useChoreographyStore } from '../store/useChoreographyStore';

interface NodePlacementTrayProps {
  onOpenAudioStudio?: () => void;
}

const fmtTimeWithMs = (sec: number): string => {
  const mins = Math.floor(sec / 60);
  const secs = Math.floor(sec % 60);
  const ms = Math.floor((sec % 1) * 10);
  return `${mins}:${secs.toString().padStart(2, '0')}.${ms}`;
};

export const NodePlacementTray: React.FC<NodePlacementTrayProps> = ({
  onOpenAudioStudio,
}) => {
  const unplacedNodes = useChoreographyStore((s) => s.unplacedNodes);
  const activeTrayNodeIndex = useChoreographyStore((s) => s.activeTrayNodeIndex);
  const clearUnplacedNodes = useChoreographyStore((s) => s.clearUnplacedNodes);
  const placeTrayNode = useChoreographyStore((s) => s.placeTrayNode);

  if (unplacedNodes.length === 0) return null;

  const currentNode = unplacedNodes[activeTrayNodeIndex];
  const totalCount = unplacedNodes.length;
  const currentStep = Math.min(activeTrayNodeIndex + 1, totalCount);

  const handlePlaceAtCenter = () => {
    if (!currentNode) return;
    // Pista reglamentaria es 50m x 25m -> centro es (25, 12.5) con ligera variación para no encimar
    const offsetX = (activeTrayNodeIndex % 5) * 2 - 4;
    const offsetY = (activeTrayNodeIndex % 3) * 2 - 2;
    placeTrayNode(currentNode.id, 25 + offsetX, 12.5 + offsetY);
  };

  return (
    <div className="absolute top-3 right-3 z-30 w-80 max-w-[calc(100vw-24px)] bg-[#0C1220]/95 backdrop-blur-xl border border-cyan/40 rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-in fade-in slide-in-from-top-4 duration-200">
      {/* ── Cabecera de la Bandeja ── */}
      <div className="h-10 px-3.5 bg-gradient-to-r from-cyan/20 to-transparent border-b border-white/10 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-cyan shadow-glow-cyan animate-pulse" />
          <span className="text-xs font-black uppercase tracking-wider text-white">
            Bandeja de Nodos de Audio
          </span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-cyan/15 text-cyan border border-cyan/30">
            {currentStep}/{totalCount}
          </span>
          <button
            type="button"
            onClick={clearUnplacedNodes}
            className="w-6 h-6 rounded-lg flex items-center justify-center text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
            title="Descartar bandeja de nodos"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* ── Banner de Instrucción: Bloqueo Secuencial Estricto ── */}
      <div className="p-3 bg-cyan/5 border-b border-cyan/20">
        <div className="flex items-start gap-2">
          <MapPin className="w-4 h-4 text-cyan shrink-0 mt-0.5 animate-bounce" />
          <div className="text-xs">
            <p className="font-bold text-slate-200 leading-tight">
              Toca la pista para ubicar el{' '}
              <span className="text-cyan font-black underline underline-offset-2">
                Nodo {currentNode ? currentNode.numeroSecuencial : currentStep}
              </span>
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Orden estricto: cada nodo se desbloquea tras posicionar el anterior.
            </p>
          </div>
        </div>

        {/* Acciones Rápidas */}
        <div className="mt-2.5 flex items-center gap-2">
          <button
            type="button"
            onClick={handlePlaceAtCenter}
            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-xl bg-cyan/15 hover:bg-cyan/25 text-cyan border border-cyan/30 text-xs font-bold transition-all interactive-tap"
            title="Ubicar automáticamente en el centro de la pista"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Colocar en Centro</span>
          </button>

          {onOpenAudioStudio && (
            <button
              type="button"
              onClick={onOpenAudioStudio}
              className="py-1.5 px-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/10 text-xs font-medium transition-all"
              title="Volver a editar tiempos en el Estudio de Audio"
            >
              <span>Editar en DAW</span>
            </button>
          )}
        </div>
      </div>

      {/* ── Lista de Nodos con Bloqueo Secuencial ── */}
      <div className="max-h-56 overflow-y-auto divide-y divide-white/5 p-2 space-y-1">
        {unplacedNodes.map((node, index) => {
          const isPlaced = index < activeTrayNodeIndex;
          const isCurrent = index === activeTrayNodeIndex;

          return (
            <div
              key={node.id}
              className={[
                'flex items-center justify-between p-2 rounded-xl transition-all',
                isCurrent
                  ? 'bg-cyan/20 border border-cyan/50 shadow-glow-cyan text-white'
                  : isPlaced
                  ? 'bg-white/[0.02] text-slate-400 border border-transparent opacity-60'
                  : 'bg-white/[0.01] text-slate-500 border border-transparent opacity-40',
              ].join(' ')}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className={[
                    'w-6 h-6 rounded-full text-xs font-black flex items-center justify-center shrink-0',
                    isCurrent
                      ? 'bg-cyan text-slate-950 font-black'
                      : isPlaced
                      ? 'bg-mint/20 text-mint'
                      : 'bg-slate-800 text-slate-500',
                  ].join(' ')}
                >
                  {isPlaced ? '✓' : node.numeroSecuencial}
                </span>

                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold truncate">
                      {node.label || `Nodo ${node.numeroSecuencial}`}
                    </span>
                    {isCurrent && (
                      <span className="text-[9px] font-bold px-1.5 py-0.2 bg-cyan text-slate-950 rounded uppercase">
                        Siguiente
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] font-mono text-slate-400 flex items-center gap-1">
                    <Clock className="w-2.5 h-2.5" />
                    <span>{fmtTimeWithMs(node.timestampSec)}s</span>
                  </div>
                </div>
              </div>

              {/* Estado / Candado */}
              <div className="shrink-0 pl-2">
                {isPlaced ? (
                  <CheckCircle2 className="w-4 h-4 text-mint" />
                ) : isCurrent ? (
                  <MapPin className="w-4 h-4 text-cyan animate-pulse" />
                ) : (
                  <div className="flex items-center gap-1 text-[10px] text-slate-500 font-mono">
                    <Lock className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Bloqueado</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
