import React from 'react';
import { PenTool, Route, Eraser, Trash2, Undo2, Tag, Maximize2 } from 'lucide-react';
import { useChoreographyStore } from '../../store/useChoreographyStore';

export type RinkToolsLayout = 'bar' | 'panel';

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
  /** Recentra la vista de la Pista 2D (sin overlays sobre la pista). */
  onResetView?: () => void;
  className?: string;
}

const ACTIVE_STYLES: Record<string, string> = {
  node: 'bg-amber-500/15 text-amber-300 border border-amber-500/35 shadow-elevation-1 font-medium',
  curve: 'bg-ice-primary/15 text-ice-light border border-ice-primary/35 shadow-elevation-1 font-medium',
  erase: 'bg-danger/15 text-red-300 border border-danger/35 shadow-elevation-1 font-medium',
};

const IDLE_STYLES =
  'bg-surface-2 text-neutral-300 hover:bg-surface-3 hover:text-white border border-white/[0.07] font-normal';

/**
 * RinkContextTools — Única fuente de los controles de edición de pista
 * (modo de trazado + limpiar + deshacer + inspector).
 *
 * Se instancia una sola vez por breakpoint:
 *  - `bar`   → barra horizontal sobre la Bottom Nav (SOLO TELÉFONO: la oculta
 *              `.fm-mobile-only`; las tablets usan el inspector acoplado)
 *  - `panel` → sección dentro del panel de preparación (desktop lg+)
 */
export const RinkContextTools: React.FC<RinkContextToolsProps> = ({
  layout,
  onClear,
  showActions = true,
  inspectorOpen = false,
  onToggleInspector,
  onResetView,
  className = '',
}) => {
  const phase = useChoreographyStore((s) => s.phase);
  const setPhase = useChoreographyStore((s) => s.setPhase);
  const points = useChoreographyStore((s) => s.points);
  const history = useChoreographyStore((s) => s.history);
  const undo = useChoreographyStore((s) => s.undo);

  // Trazar es una herramienta INDEPENDIENTE y siempre disponible: además de
  // conectar nodos existentes, permite dibujar a mano alzada (incluso desde
  // cero), por lo que no depende del número de nodos.
  const hasPoints = points.length > 0;
  const canUndo = history.length > 0;

  const selectMode = (mode: 'plot' | 'curve' | 'erase') => {
    setPhase(phase === mode && mode !== 'plot' ? 'plot' : mode);
    useChoreographyStore.getState().setSelectedPointId(null);
  };

  if (layout === 'bar') {
    return (
      <div
        role="toolbar"
        aria-label="Herramientas de edición de pista"
        className={`fm-mobile-only lg:hidden flex items-center gap-1.5 overflow-x-auto no-scrollbar bg-surface-1/95 backdrop-blur-md border-t border-white/[0.07] px-2 py-1.5 pl-safe pr-safe ${className}`}
      >
        <button
          type="button"
          onClick={() => selectMode('plot')}
          aria-pressed={phase === 'plot'}
          title="Modo Nodos"
          className={[
            'press flex h-[44px] min-w-[50px] shrink-0 flex-col items-center justify-center gap-0.5 rounded-lg text-[9px] font-medium uppercase tracking-wider transition-colors',
            phase === 'plot' ? ACTIVE_STYLES.node : IDLE_STYLES,
          ].join(' ')}
        >
          <PenTool className="h-3.5 w-3.5 stroke-[1.8]" />
          Nodos
        </button>
        <button
          type="button"
          onClick={() => selectMode('curve')}
          aria-pressed={phase === 'curve'}
          title="Modo Trazado: dibuja y conecta trayectorias"
          className={[
            'press flex h-[44px] min-w-[50px] shrink-0 flex-col items-center justify-center gap-0.5 rounded-lg text-[9px] font-medium uppercase tracking-wider transition-colors',
            phase === 'curve' ? ACTIVE_STYLES.curve : IDLE_STYLES,
          ].join(' ')}
        >
          <Route className="h-3.5 w-3.5 stroke-[1.8]" />
          Trazar
        </button>
        <button
          type="button"
          onClick={() => selectMode('erase')}
          aria-pressed={phase === 'erase'}
          title="Modo Borrador"
          className={[
            'press flex h-[44px] min-w-[50px] shrink-0 flex-col items-center justify-center gap-0.5 rounded-lg text-[9px] font-medium uppercase tracking-wider transition-colors',
            phase === 'erase' ? ACTIVE_STYLES.erase : IDLE_STYLES,
          ].join(' ')}
        >
          <Eraser className="h-3.5 w-3.5 stroke-[1.8]" />
          Borrar
        </button>

        <span aria-hidden="true" className="mx-0.5 h-6 w-px shrink-0 bg-white/[0.08]" />

        <button
          type="button"
          onClick={onClear}
          disabled={!hasPoints}
          title="Limpiar toda la pista"
          className="press flex h-[44px] min-w-[50px] shrink-0 flex-col items-center justify-center gap-0.5 rounded-lg bg-surface-2 border border-white/[0.07] text-[9px] font-medium uppercase tracking-wider text-neutral-300 hover:bg-surface-3 hover:text-white disabled:pointer-events-none disabled:opacity-30 transition-colors"
        >
          <Trash2 className="h-3.5 w-3.5 stroke-[1.75] text-coach-primary" />
          Limpiar
        </button>
        <button
          type="button"
          onClick={undo}
          disabled={!canUndo}
          title="Deshacer último cambio"
          className="press flex h-[44px] min-w-[50px] shrink-0 flex-col items-center justify-center gap-0.5 rounded-lg bg-surface-2 border border-white/[0.07] text-[9px] font-medium uppercase tracking-wider text-neutral-300 hover:bg-surface-3 hover:text-white disabled:pointer-events-none disabled:opacity-30 transition-colors"
        >
          <Undo2 className="h-3.5 w-3.5 stroke-[1.75]" />
          Deshacer
        </button>
        {onToggleInspector && (
          <button
            type="button"
            onClick={onToggleInspector}
            aria-pressed={inspectorOpen}
            title="Figuras y datos del nodo seleccionado"
            className={[
              'press flex h-[44px] min-w-[50px] shrink-0 flex-col items-center justify-center gap-0.5 rounded-lg text-[9px] font-medium uppercase tracking-wider transition-colors',
              inspectorOpen
                ? 'bg-ice-primary/15 text-ice-light border border-ice-primary/35'
                : IDLE_STYLES,
            ].join(' ')}
          >
            <Tag
              className={`h-3.5 w-3.5 stroke-[1.75] transition-transform ${inspectorOpen ? 'rotate-12' : ''}`}
            />
            Figuras
          </button>
        )}
        {onResetView && (
          <button
            type="button"
            onClick={onResetView}
            title="Recentrar la vista de la pista"
            aria-label="Recentrar la vista de la pista"
            className="press flex h-[44px] min-w-[50px] shrink-0 flex-col items-center justify-center gap-0.5 rounded-lg bg-surface-2 border border-white/[0.07] text-[9px] font-medium uppercase tracking-wider text-neutral-300 hover:bg-surface-3 hover:text-white transition-colors"
          >
            <Maximize2 className="h-3.5 w-3.5 stroke-[1.75] text-ice-primary" />
            Vista
          </button>
        )}
      </div>
    );
  }

  // layout === 'panel' (desktop lg+)
  return (
    <div className={`space-y-2 ${className}`}>
      <div className="grid grid-cols-3 gap-1.5">
        <button
          type="button"
          onClick={() => selectMode('plot')}
          aria-pressed={phase === 'plot'}
          title="Modo Nodos: coloca los puntos clave de la rutina"
          className={[
            'press flex min-h-[38px] flex-col items-center justify-center gap-1 rounded-lg px-1 py-1.5 text-xs font-medium transition-colors',
            phase === 'plot' ? ACTIVE_STYLES.node : IDLE_STYLES,
          ].join(' ')}
        >
          <PenTool className="h-3.5 w-3.5 stroke-[1.8]" />
          Nodos
        </button>
        <button
          type="button"
          onClick={() => selectMode('curve')}
          aria-pressed={phase === 'curve'}
          title="Modo Trazado: dibuja/conecta y esculpe las curvas"
          className={[
            'press flex min-h-[38px] flex-col items-center justify-center gap-1 rounded-lg px-1 py-1.5 text-xs font-medium transition-colors',
            phase === 'curve' ? ACTIVE_STYLES.curve : IDLE_STYLES,
          ].join(' ')}
        >
          <Route className="h-3.5 w-3.5 stroke-[1.8]" />
          Trazar
        </button>
        <button
          type="button"
          onClick={() => selectMode('erase')}
          aria-pressed={phase === 'erase'}
          title="Modo Borrador: toca un nodo para eliminarlo"
          className={[
            'press flex min-h-[38px] flex-col items-center justify-center gap-1 rounded-lg px-1 py-1.5 text-xs font-medium transition-colors',
            phase === 'erase' ? ACTIVE_STYLES.erase : IDLE_STYLES,
          ].join(' ')}
        >
          <Eraser className="h-3.5 w-3.5 stroke-[1.8]" />
          Borrar
        </button>
      </div>

      {showActions && (
        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            onClick={undo}
            disabled={!canUndo}
            className="press flex min-h-[34px] items-center justify-center gap-1.5 rounded-lg bg-surface-2 border border-white/[0.07] px-2 py-1.5 text-xs font-medium text-neutral-300 hover:bg-surface-3 hover:text-white disabled:pointer-events-none disabled:opacity-30 transition-colors"
          >
            <Undo2 className="h-3.5 w-3.5 text-neutral-400" />
            Deshacer
          </button>
          <button
            type="button"
            onClick={onClear}
            disabled={!hasPoints}
            className="press flex min-h-[34px] items-center justify-center gap-1.5 rounded-lg bg-danger/10 border border-danger/25 px-2 py-1.5 text-xs font-medium text-red-300 hover:bg-danger/20 hover:text-white disabled:pointer-events-none disabled:opacity-30 transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Limpiar
          </button>
        </div>
      )}
    </div>
  );
};
