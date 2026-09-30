import React, { useState } from 'react';
import { 
  MapPin, 
  Trash2, 
  Sparkles, 
  Clock, 
  ChevronDown, 
  ChevronUp 
} from 'lucide-react';
import { useChoreographyStore } from '../store/useChoreographyStore';

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
 * Obsidian Precision Tech: superficie layered titanium, acento Cobalt Pro,
 * y visualización clara del orden secuencial.
 */
export const NodePlacementTray: React.FC = () => {
  const unplacedNodes = useChoreographyStore((s) => s.unplacedNodes);
  const activeTrayNodeIndex = useChoreographyStore((s) => s.activeTrayNodeIndex);
  const clearUnplacedNodes = useChoreographyStore((s) => s.clearUnplacedNodes);
  const placeTrayNode = useChoreographyStore((s) => s.placeTrayNode);

  // Minimización local: al colapsar deja solo la cabecera + acción rápida
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
    <div className="node-tray fm-tablet-tray flex min-h-0 max-h-[42%] shrink-0 flex-col overflow-hidden border-b border-cobalt-500/30 bg-surface-1 shadow-elevation-1 lg:max-h-none lg:h-full lg:w-60 lg:border-b-0 lg:border-r lg:border-white/[0.08] xl:w-64">
      {/* ── Cabecera de la Bandeja ── */}
      <div className="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1 border-b border-white/[0.08] bg-surface-2/80 px-3 py-2.5">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className="h-2 w-2 shrink-0 rounded-full bg-[#0f62fe] animate-pulse" />
          <span className="min-w-0 text-xs font-bold uppercase tracking-wider text-white">
            Nodos por colocar
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <span
            className="rounded-full border border-cobalt-400/30 bg-cobalt-500/15 px-2 py-0.5 font-mono text-[10px] font-bold text-cobalt-300"
            title={`${currentStep} de ${totalCount} pendientes`}
          >
            {totalCount}
          </span>
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            aria-expanded={!collapsed}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-300 hover:bg-white/10 hover:text-white transition-colors"
            title={collapsed ? 'Expandir bandeja de nodos' : 'Minimizar bandeja de nodos'}
            aria-label={collapsed ? 'Expandir bandeja de nodos' : 'Minimizar bandeja de nodos'}
          >
            {collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          </button>
          <button
            type="button"
            onClick={clearUnplacedNodes}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-danger/10 hover:text-danger"
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
          <div className="shrink-0 border-b border-cobalt-500/20 bg-cobalt-500/[0.05] p-3">
            <div className="flex items-start gap-2">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-cobalt-400 animate-bounce" />
              <div className="text-xs">
                <p className="font-semibold leading-tight text-slate-200">
                  Toca la pista para ubicar el{' '}
                  <span className="font-bold text-cobalt-300 underline underline-offset-2">
                    Nodo {currentNode ? currentNode.numeroSecuencial : currentStep}
                  </span>
                </p>
                <p className="mt-0.5 text-[11px] text-slate-400 leading-relaxed">
                  Orden estricto: cada nodo se desbloquea tras posicionar el anterior.
                </p>
              </div>
            </div>

            {/* Acciones Rápidas */}
            <div className="mt-2.5 flex items-center gap-2">
              <button
                type="button"
                onClick={handlePlaceAtCenter}
                className="flex min-h-[38px] flex-1 items-center justify-center gap-1.5 rounded-xl border border-cobalt-500/30 bg-cobalt-500/15 px-3 py-1.5 text-xs font-semibold text-cobalt-300 transition-all hover:bg-cobalt-500/25 active:scale-[0.98]"
                title="Ubicar automáticamente en el centro de la pista"
              >
                <Sparkles className="h-3.5 w-3.5 text-cobalt-300" />
                <span>Colocar en Centro</span>
              </button>
            </div>
          </div>

          {/* ── Rejilla de Nodos ── */}
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">
            <div className="node-tray-grid grid grid-cols-6 gap-1.5 sm:grid-cols-8 lg:grid-cols-6">
              {unplacedNodes.map((node, index) => {
                const isPlaced = index < activeTrayNodeIndex;
                const isCurrent = index === activeTrayNodeIndex;
                return (
                  <button
                    key={node.id}
                    type="button"
                    onClick={() => {
                      if (isCurrent) handlePlaceAtCenter();
                    }}
                    disabled={!isCurrent}
                    title={`Nodo ${node.numeroSecuencial} · ${fmtTimeWithMs(node.timestampSec)}s${
                      isPlaced ? ' · colocado' : isCurrent ? ' · siguiente' : ' · bloqueado'
                    }`}
                    aria-label={`Nodo ${node.numeroSecuencial}${isPlaced ? ' (colocado)' : isCurrent ? ' (siguiente)' : ''}`}
                    className={[
                      'flex h-10 min-h-[40px] items-center justify-center rounded-xl text-xs font-bold transition-all',
                      isCurrent
                        ? 'bg-[#0f62fe] text-white ring-2 ring-[#78a9ff]/80 shadow-sm active:scale-[0.96]'
                        : isPlaced
                        ? 'bg-mint-500/15 text-mint-300 border border-mint-500/30'
                        : 'bg-surface-2 text-slate-500 border border-white/[0.04]',
                    ].join(' ')}
                  >
                    {isPlaced ? '✓' : node.numeroSecuencial}
                  </button>
                );
              })}
            </div>

            {/* Guía del paso actual */}
            {currentNode && (
              <p className="mt-2.5 flex items-center gap-1.5 font-mono text-[11px] text-slate-400">
                <Clock className="h-3 w-3 shrink-0 text-cobalt-400" />
                <span>Nodo {currentNode.numeroSecuencial} · {fmtTimeWithMs(currentNode.timestampSec)}s</span>
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
};

