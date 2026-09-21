import React from 'react';
import { PenTool, Route, Eraser, Trash2, Undo2, ChevronDown } from 'lucide-react';
import { useChoreographyStore } from '../../store/useChoreographyStore';

export type RinkToolsLayout = 'bar' | 'rail' | 'panel';

interface RinkContextToolsProps {
  layout: RinkToolsLayout;
  onClear: () => void;
  /**
   * Muestra Deshacer/Limpiar. Se desactiva en `panel` porque el panel de
   * preparación ya expone esas acciones en su propia sección "Herramientas".
   */
  showActions?: boolean;
  /** Disponible cuando el Inspector se presenta como panel/bottom-sheet. */
  inspectorOpen?: boolean;
  onToggleInspector?: () => void;
  className?: string;
}

const ACTIVE_STYLES: Record<string, string> = {
  node: 'bg-amber-500 text-black shadow-glow-amber',
  curve: 'bg-cyan text-black shadow-glow-cyan',
  erase: 'bg-red-500 text-white shadow-lg shadow-red-500/35',
};

const IDLE_STYLES =
  'bg-white/[0.04] text-slate-300 hover:bg-white/[0.09] hover:text-white border border-white/10';

/**
 * RinkContextTools — Única fuente de los controles de edición de pista
 * (modo de trazado + limpiar + deshacer + inspector).
 *
 * Se instancia una sola vez por breakpoint:
 *  - `bar`   → rail horizontal sobre la Bottom Nav (portrait móvil/tablet)
 *  - `rail`  → sidebar compacta izquierda (landscape móvil/tablet)
 *  - `panel` → sección dentro del panel de preparación (desktop lg+)
 */
export const RinkContextTools: React.FC<RinkContextToolsProps> = ({
  layout,
  onClear,
  showActions = true,
  inspectorOpen = false,
  onToggleInspector,
  className = '',
}) => {
  const phase = useChoreographyStore((s) => s.phase);
  const setPhase = useChoreographyStore((s) => s.setPhase);
  const points = useChoreographyStore((s) => s.points);
  const history = useChoreographyStore((s) => s.history);
  const undo = useChoreographyStore((s) => s.undo);

  const canDraw = points.length >= 2;
  const hasPoints = points.length > 0;
  const canUndo = history.length > 0;

  const selectMode = (mode: 'plot' | 'curve' | 'erase') => {
    if (mode === 'curve' && !canDraw) return;
    setPhase(phase === mode && mode !== 'plot' ? 'plot' : mode);
    useChoreographyStore.getState().setSelectedPointId(null);
  };

  if (layout === 'panel') {
    return (
      <div className={`space-y-2 ${className}`}>
        <div className="grid grid-cols-3 gap-1.5">
          <button
            type="button"
            onClick={() => selectMode('plot')}
            aria-pressed={phase === 'plot'}
            title="Modo Nodos: coloca los puntos clave de la rutina"
            className={[
              'press flex min-h-touch flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 text-[11px] font-bold',
              phase === 'plot' ? ACTIVE_STYLES.node : IDLE_STYLES,
            ].join(' ')}
          >
            <PenTool className="h-4 w-4 stroke-[2]" />
            Nodos
          </button>
          <button
            type="button"
            onClick={() => selectMode('curve')}
            disabled={!canDraw}
            aria-pressed={phase === 'curve'}
            title={canDraw ? 'Modo Trazado: esculpe las curvas entre nodos' : 'Requiere al menos 2 nodos'}
            className={[
              'press flex min-h-touch flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 text-[11px] font-bold',
              phase === 'curve' ? ACTIVE_STYLES.curve : IDLE_STYLES,
              !canDraw ? 'pointer-events-none opacity-30' : '',
            ].join(' ')}
          >
            <Route className="h-4 w-4 stroke-[2]" />
            Trazar
          </button>
          <button
            type="button"
            onClick={() => selectMode('erase')}
            aria-pressed={phase === 'erase'}
            title="Modo Borrador: toca un nodo para eliminarlo"
            className={[
              'press flex min-h-touch flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 text-[11px] font-bold',
              phase === 'erase' ? ACTIVE_STYLES.erase : IDLE_STYLES,
            ].join(' ')}
          >
            <Eraser className="h-4 w-4 stroke-[2]" />
            Borrar
          </button>
        </div>

        {showActions && (
          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={undo}
              disabled={!canUndo}
              className="press flex min-h-touch items-center justify-center gap-1.5 rounded-xl bg-white/[0.04] px-2 py-2 text-[11px] font-bold text-slate-300 hover:bg-white/[0.09] hover:text-white disabled:pointer-events-none disabled:opacity-30"
            >
              <Undo2 className="h-3.5 w-3.5 text-coral" />
              Deshacer
            </button>
            <button
              type="button"
              onClick={onClear}
              disabled={!hasPoints}
              className="press flex min-h-touch items-center justify-center gap-1.5 rounded-xl bg-coral/12 px-2 py-2 text-[11px] font-bold text-coral hover:bg-coral hover:text-white disabled:pointer-events-none disabled:opacity-30"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Limpiar
            </button>
          </div>
        )}
      </div>
    );
  }

  if (layout === 'bar') {
    return (
      <div
        role="toolbar"
        aria-label="Herramientas de edición de pista"
        className={`lg:hidden landscape:hidden flex items-center gap-1.5 overflow-x-auto no-scrollbar glass-hud border-t border-white/10 px-2 py-1.5 pl-safe pr-safe ${className}`}
      >
        <button
          type="button"
          onClick={() => selectMode('plot')}
          aria-pressed={phase === 'plot'}
          title="Modo Nodos"
          className={[
            'press flex h-[48px] min-w-[52px] shrink-0 flex-col items-center justify-center gap-0.5 rounded-xl text-[9px] font-black uppercase tracking-wide',
            phase === 'plot' ? ACTIVE_STYLES.node : IDLE_STYLES,
          ].join(' ')}
        >
          <PenTool className="h-4 w-4 stroke-[2.4]" />
          Nodos
        </button>
        <button
          type="button"
          onClick={() => selectMode('curve')}
          disabled={!canDraw}
          aria-pressed={phase === 'curve'}
          title={canDraw ? 'Modo Trazado' : 'Mínimo 2 nodos'}
          className={[
            'press flex h-[48px] min-w-[52px] shrink-0 flex-col items-center justify-center gap-0.5 rounded-xl text-[9px] font-black uppercase tracking-wide',
            phase === 'curve' ? ACTIVE_STYLES.curve : IDLE_STYLES,
            !canDraw ? 'pointer-events-none opacity-30' : '',
          ].join(' ')}
        >
          <Route className="h-4 w-4 stroke-[2.4]" />
          Trazar
        </button>
        <button
          type="button"
          onClick={() => selectMode('erase')}
          aria-pressed={phase === 'erase'}
          title="Modo Borrador"
          className={[
            'press flex h-[48px] min-w-[52px] shrink-0 flex-col items-center justify-center gap-0.5 rounded-xl text-[9px] font-black uppercase tracking-wide',
            phase === 'erase' ? ACTIVE_STYLES.erase : IDLE_STYLES,
          ].join(' ')}
        >
          <Eraser className="h-4 w-4 stroke-[2.4]" />
          Borrar
        </button>

        <span aria-hidden="true" className="mx-0.5 h-7 w-px shrink-0 bg-white/10" />

        <button
          type="button"
          onClick={onClear}
          disabled={!hasPoints}
          title="Limpiar toda la pista"
          className="press flex h-[48px] min-w-[52px] shrink-0 flex-col items-center justify-center gap-0.5 rounded-xl bg-white/[0.04] text-[9px] font-black uppercase tracking-wide text-slate-300 hover:bg-white/[0.09] hover:text-white disabled:pointer-events-none disabled:opacity-30"
        >
          <Trash2 className="h-4 w-4 stroke-[2] text-coral" />
          Limpiar
        </button>
        <button
          type="button"
          onClick={undo}
          disabled={!canUndo}
          title="Deshacer último cambio"
          className="press flex h-[48px] min-w-[52px] shrink-0 flex-col items-center justify-center gap-0.5 rounded-xl bg-white/[0.04] text-[9px] font-black uppercase tracking-wide text-slate-300 hover:bg-white/[0.09] hover:text-white disabled:pointer-events-none disabled:opacity-30"
        >
          <Undo2 className="h-4 w-4 stroke-[2]" />
          Deshacer
        </button>
        {onToggleInspector && (
          <button
            type="button"
            onClick={onToggleInspector}
            aria-pressed={inspectorOpen}
            title="Inspector del nodo seleccionado"
            className={[
              'press flex h-[48px] min-w-[52px] shrink-0 flex-col items-center justify-center gap-0.5 rounded-xl text-[9px] font-black uppercase tracking-wide',
              inspectorOpen
                ? 'bg-mint/15 text-mint ring-1 ring-mint/40'
                : IDLE_STYLES,
            ].join(' ')}
          >
            <ChevronDown
              className={`h-4 w-4 stroke-[2] transition-transform ${inspectorOpen ? 'rotate-180' : ''}`}
            />
            Inspector
          </button>
        )}
      </div>
    );
  }

  // layout === 'rail'
  return (
    <div className={`flex flex-col items-center gap-1.5 ${className}`}>
      <button
        type="button"
        onClick={() => selectMode('plot')}
        aria-pressed={phase === 'plot'}
        title="Modo Nodos"
        className={[
          'press flex h-12 w-12 shrink-0 flex-col items-center justify-center gap-1 rounded-xl text-[9px] font-bold',
          phase === 'plot' ? ACTIVE_STYLES.node : IDLE_STYLES,
        ].join(' ')}
      >
        <PenTool className="h-4 w-4 stroke-[2.4]" />
        Nodos
      </button>
      <button
        type="button"
        onClick={() => selectMode('curve')}
        disabled={!canDraw}
        aria-pressed={phase === 'curve'}
        title={canDraw ? 'Modo Trazado' : 'Mínimo 2 nodos'}
        className={[
          'press flex h-12 w-12 shrink-0 flex-col items-center justify-center gap-1 rounded-xl text-[9px] font-bold',
          phase === 'curve' ? ACTIVE_STYLES.curve : IDLE_STYLES,
          !canDraw ? 'pointer-events-none opacity-30' : '',
        ].join(' ')}
      >
        <Route className="h-4 w-4 stroke-[2.4]" />
        Trazar
      </button>
      <button
        type="button"
        onClick={() => selectMode('erase')}
        aria-pressed={phase === 'erase'}
        title="Modo Borrador"
        className={[
          'press flex h-12 w-12 shrink-0 flex-col items-center justify-center gap-1 rounded-xl text-[9px] font-bold',
          phase === 'erase' ? ACTIVE_STYLES.erase : IDLE_STYLES,
        ].join(' ')}
      >
        <Eraser className="h-4 w-4 stroke-[2.4]" />
        Borrar
      </button>

      <span aria-hidden="true" className="my-0.5 h-px w-7 shrink-0 bg-white/10" />

      <button
        type="button"
        onClick={onClear}
        disabled={!hasPoints}
        title="Limpiar toda la pista"
        className="press flex h-12 w-12 shrink-0 flex-col items-center justify-center gap-1 rounded-xl bg-white/[0.04] text-[9px] font-bold text-slate-300 hover:bg-white/[0.09] hover:text-white disabled:pointer-events-none disabled:opacity-30 border border-white/10"
      >
        <Trash2 className="h-4 w-4 stroke-[2] text-coral" />
        Limpiar
      </button>
      <button
        type="button"
        onClick={undo}
        disabled={!canUndo}
        title="Deshacer último cambio"
        className="press flex h-12 w-12 shrink-0 flex-col items-center justify-center gap-1 rounded-xl bg-white/[0.04] text-[9px] font-bold text-slate-300 hover:bg-white/[0.09] hover:text-white disabled:pointer-events-none disabled:opacity-30 border border-white/10"
      >
        <Undo2 className="h-4 w-4 stroke-[2]" />
        Deshacer
      </button>
      {onToggleInspector && (
        <button
          type="button"
          onClick={onToggleInspector}
          aria-pressed={inspectorOpen}
          title="Inspector del nodo seleccionado"
          className={[
            'press flex h-12 w-12 shrink-0 flex-col items-center justify-center gap-1 rounded-xl text-[9px] font-bold',
            inspectorOpen
              ? 'bg-mint/15 text-mint ring-1 ring-mint/40'
              : IDLE_STYLES,
          ].join(' ')}
        >
          <ChevronDown
            className={`h-4 w-4 stroke-[2] transition-transform ${inspectorOpen ? 'rotate-180' : ''}`}
          />
          Nodo
        </button>
      )}
    </div>
  );
};
