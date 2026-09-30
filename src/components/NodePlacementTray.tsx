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
    <div className="node-tray fm-tablet-tray flex min-h-0 max-h-[42%] shrink-0 flex-col overflow-hidden border-b border-white/[0.07] bg-surface-1 shadow-elevation-1 lg:max-h-none lg:h-full lg:w-60 lg:border-b-0 lg:border-r lg:border-white/[0.07] xl:w-64">
      {/* ── Cabecera de la Bandeja ── */}
      <div className="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1 border-b border-white/[0.07] bg-surface-2/90 px-3 py-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-ice-primary" />
          <span className="min-w-0 text-xs font-medium uppercase tracking-wider text-white">
            Nodos por colocar
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <span
            className="rounded-full border border-ice-primary/25 bg-ice-primary/10 px-2 py-0.5 font-mono text-[10px] font-medium text-ice-light"
            title={`${currentStep} de ${totalCount} pendientes`}
          >
            {totalCount}
          </span>
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            aria-expanded={!collapsed}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-neutral-400 hover:bg-white/[0.06] hover:text-white transition-colors"
            title={collapsed ? 'Expandir bandeja de nodos' : 'Minimizar bandeja de nodos'}
            aria-label={collapsed ? 'Expandir bandeja de nodos' : 'Minimizar bandeja de nodos'}
          >
            {collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          </button>
          <button
            type="button"
            onClick={clearUnplacedNodes}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-danger/10 hover:text-danger"
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
          <div className="shrink-0 border-b border-white/[0.06] bg-ice-primary/[0.03] p-3">
            <div className="flex items-start gap-2">
              <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ice-primary" />
              <div className="text-xs">
                <p className="font-medium leading-tight text-neutral-200">
                  Toca la pista para ubicar el{' '}
                  <span className="font-semibold text-ice-light underline underline-offset-2">
                    Nodo {currentNode ? currentNode.numeroSecuencial : currentStep}
                  </span>
                </p>
                <p className="mt-0.5 text-[11px] text-neutral-400 leading-relaxed">
                  Orden estricto: cada nodo se desbloquea tras posicionar el anterior.
                </p>
              </div>
            </div>

            {/* Acciones Rápidas */}
            <div className="mt-2.5 flex items-center gap-2">
              <button
                type="button"
                onClick={handlePlaceAtCenter}
                className="flex min-h-[34px] flex-1 items-center justify-center gap-1.5 rounded-lg border border-white/[0.08] bg-surface-2 px-3 py-1.5 text-xs font-medium text-neutral-200 transition-all hover:bg-surface-3 active:scale-[0.98]"
                title="Ubicar automáticamente en el centro de la pista"
              >
                <Sparkles className="h-3.5 w-3.5 text-ice-primary" />
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
                      'flex h-9 min-h-[36px] items-center justify-center rounded-lg text-xs font-medium transition-all',
                      isCurrent
                        ? 'bg-ice-primary text-white border border-ice-light/40 shadow-elevation-1 active:scale-[0.96]'
                        : isPlaced
                        ? 'bg-studio-primary/15 text-studio-light border border-studio-primary/25'
                        : 'bg-surface-2 text-neutral-500 border border-white/[0.04]',
                    ].join(' ')}
                  >
                    {isPlaced ? '✓' : node.numeroSecuencial}
                  </button>
                );
              })}
            </div>

            {/* Guía del paso actual */}
            {currentNode && (
              <p className="mt-2.5 flex items-center gap-1.5 font-mono text-[11px] text-neutral-400">
                <Clock className="h-3 w-3 shrink-0 text-ice-primary" />
                <span>Nodo {currentNode.numeroSecuencial} · {fmtTimeWithMs(currentNode.timestampSec)}s</span>
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
};

