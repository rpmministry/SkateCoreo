import React, { useState } from 'react';
import { 
  MapPin, 
  Lock, 
  CheckCircle2, 
  Trash2, 
  Sparkles,
  Clock,
  ChevronDown,
  ChevronUp
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

/**
 * NodePlacementTray — Bandeja contextual para colocar por orden estricto los
 * nodos generados desde el audio.
 *
 * Portrait-first: en móvil/tablet flota SOBRE la Pista 2D (no le roba espacio
 * permanente) y puede minimizarse a una barra compacta para liberar el lienzo.
 * Solo aparece cuando hay nodos pendientes (`unplacedNodes`), y desaparece al
 * vaciarlos. En escritorio (lg+) se ancla arriba a la derecha como panel.
 */
export const NodePlacementTray: React.FC<NodePlacementTrayProps> = ({
  onOpenAudioStudio,
}) => {
  const unplacedNodes = useChoreographyStore((s) => s.unplacedNodes);
  const activeTrayNodeIndex = useChoreographyStore((s) => s.activeTrayNodeIndex);
  const clearUnplacedNodes = useChoreographyStore((s) => s.clearUnplacedNodes);
  const placeTrayNode = useChoreographyStore((s) => s.placeTrayNode);

  // Minimización local: al colapsar deja solo la cabecera + acción rápida para
  // que la pista recupere espacio sin perder la bandeja.
  const [collapsed, setCollapsed] = useState(false);

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
    <div className="absolute inset-x-2 top-2 z-30 flex max-h-[46dvh] flex-col overflow-hidden rounded-2xl border border-cyan/40 bg-[#0C1220] shadow-2xl animate-in fade-in slide-in-from-top-4 duration-200 lg:inset-x-auto lg:left-auto lg:right-3 lg:top-3 lg:max-h-none lg:w-80">
      {/* ── Cabecera de la Bandeja ── */}
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-white/10 bg-gradient-to-r from-cyan/20 to-transparent px-3.5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-cyan shadow-glow-cyan animate-pulse" />
          <span className="truncate text-xs font-black uppercase tracking-wider text-white">
            Bandeja de Nodos
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <span className="rounded-full border border-cyan/30 bg-cyan/15 px-2 py-0.5 font-mono text-[10px] font-bold text-cyan">
            {currentStep}/{totalCount}
          </span>
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            aria-expanded={!collapsed}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-300 hover:bg-white/10 hover:text-white"
            title={collapsed ? 'Expandir bandeja de nodos' : 'Minimizar bandeja de nodos'}
            aria-label={collapsed ? 'Expandir bandeja de nodos' : 'Minimizar bandeja de nodos'}
          >
            {collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          </button>
          <button
            type="button"
            onClick={clearUnplacedNodes}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-red-500/10 hover:text-red-400"
            title="Descartar bandeja de nodos"
            aria-label="Descartar bandeja de nodos"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {!collapsed && (
        <>
          {/* ── Banner de Instrucción: Bloqueo Secuencial Estricto ── */}
          <div className="shrink-0 border-b border-cyan/20 bg-cyan/5 p-3">
            <div className="flex items-start gap-2">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 animate-bounce text-cyan" />
              <div className="text-xs">
                <p className="font-bold leading-tight text-slate-200">
                  Toca la pista para ubicar el{' '}
                  <span className="font-black text-cyan underline underline-offset-2">
                    Nodo {currentNode ? currentNode.numeroSecuencial : currentStep}
                  </span>
                </p>
                <p className="mt-0.5 text-[11px] text-slate-400">
                  Orden estricto: cada nodo se desbloquea tras posicionar el anterior.
                </p>
              </div>
            </div>

            {/* Acciones Rápidas */}
            <div className="mt-2.5 flex items-center gap-2">
              <button
                type="button"
                onClick={handlePlaceAtCenter}
                className="flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-xl border border-cyan/30 bg-cyan/15 px-2 py-1.5 text-xs font-bold text-cyan transition-all interactive-tap hover:bg-cyan/25"
                title="Ubicar automáticamente en el centro de la pista"
              >
                <Sparkles className="h-3.5 w-3.5" />
                <span>Colocar en Centro</span>
              </button>

              {onOpenAudioStudio && (
                <button
                  type="button"
                  onClick={onOpenAudioStudio}
                  className="min-h-[44px] rounded-xl border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs font-medium text-slate-300 transition-all hover:bg-white/10 hover:text-white"
                  title="Abrir el Audio Studio para editar y mezclar la música"
                >
                  <span>Editar mezcla en Estudio</span>
                </button>
              )}
            </div>
          </div>

          {/* ── Lista de Nodos con Bloqueo Secuencial ── */}
          <div className="max-h-[30dvh] space-y-1 divide-y divide-white/5 overflow-y-auto overscroll-contain p-2 lg:max-h-56">
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
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className={[
                        'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-black',
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
                        <span className="truncate text-xs font-bold">
                          {node.label || `Nodo ${node.numeroSecuencial}`}
                        </span>
                        {isCurrent && (
                          <span className="rounded bg-cyan px-1.5 py-0 text-[9px] font-bold uppercase text-slate-950">
                            Siguiente
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1 font-mono text-[10px] text-slate-400">
                        <Clock className="h-2.5 w-2.5" />
                        <span>{fmtTimeWithMs(node.timestampSec)}s</span>
                      </div>
                    </div>
                  </div>

                  {/* Estado / Candado */}
                  <div className="shrink-0 pl-2">
                    {isPlaced ? (
                      <CheckCircle2 className="h-4 w-4 text-mint" />
                    ) : isCurrent ? (
                      <MapPin className="h-4 w-4 animate-pulse text-cyan" />
                    ) : (
                      <div className="flex items-center gap-1 font-mono text-[10px] text-slate-500">
                        <Lock className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">Bloqueado</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};
