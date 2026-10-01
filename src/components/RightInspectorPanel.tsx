import React, { useEffect, useState } from 'react';
import {
  Trash2,
  Tag,
  Clock,
  Sparkles,
  Move,
  PenTool,
  Route,
  Undo2,
  Eraser,
  Hash,
  PanelRightClose,
} from 'lucide-react';

import { useChoreographyStore } from '../store/useChoreographyStore';
import { 
  getFigurasObligatorias, 
  FIGURAS_LIBRES_Y_ARTISTICAS 
} from '../constants/reglamento';

import { collectNodeFigures } from '../core/audio/VoiceCueEngine';
import { useAudioEngine } from '../hooks/useAudioEngine';

const formatTime = (ms: number): string => {
  const totalSeconds = Math.floor(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
};

export interface RightInspectorPanelProps {
  showHeader?: boolean;
  isMobileModal?: boolean;
  onClose?: () => void;
  /** Colapsar inspector para maximizar el lienzo de la Pista 2D. */
  onToggleCollapse?: () => void;
}

/**
 * Right inspector panel — Dark Mode Neon aesthetic.
 * Primary Master CTA in Coral Neon, Selected items highlighted in Mint Neon.
 */
export const RightInspectorPanel: React.FC<RightInspectorPanelProps> = ({
  showHeader = true,
  isMobileModal = false,
  onClose,
  onToggleCollapse,
}) => {
  const audio = useAudioEngine();

  // ── Zustand store ──────────────────────────────────────────
  const points = useChoreographyStore((s) => s.points);
  const selectedPointId = useChoreographyStore((s) => s.selectedPointId);
  const setSelectedPointId = useChoreographyStore((s) => s.setSelectedPointId);
  const updatePointMetadata = useChoreographyStore((s) => s.updatePointMetadata);
  const swapPointNumber = useChoreographyStore((s) => s.swapPointNumber);
  const deletePoint = useChoreographyStore((s) => s.deletePoint);
  const setPoints = useChoreographyStore((s) => s.setPoints);
  const pushHistory = useChoreographyStore((s) => s.pushHistory);
  // «Retroceder»: deshace SOLO el último paso del trazado en construcción.
  const buildSteps = useChoreographyStore((s) => s.buildSteps);
  const retrocederBuildStep = useChoreographyStore((s) => s.retrocederBuildStep);

  const phase = useChoreographyStore((s) => s.phase);
  const setPhase = useChoreographyStore((s) => s.setPhase);

  // Reglamento 2026
  const categoria = useChoreographyStore((s) => s.categoria);
  const eficiencia = useChoreographyStore((s) => s.eficiencia);
  const figurasObligatoriasGrupos = getFigurasObligatorias(eficiencia, categoria);

  const selectedPoint = points.find((p) => p.id === selectedPointId) ?? null;
  const selectedPointIndex = selectedPoint
    ? points.findIndex((p) => p.id === selectedPoint.id)
    : -1;

  /** Nodo sin número = «?» (válido); solo se usa el índice si no es pendiente. */
  const displayNumber = selectedPoint
    ? selectedPoint.nodeNumber != null
      ? String(selectedPoint.nodeNumber)
      : selectedPoint.unrecognized
        ? '?'
        : String(selectedPointIndex + 1)
    : '';
  const hasConfidence =
    selectedPoint != null &&
    (selectedPoint.colorConfidence != null ||
      selectedPoint.geometryConfidence != null ||
      selectedPoint.positionConfidence != null ||
      selectedPoint.digitConfidence != null);

  /**
   * Borrador local del número: permite teclear sin disparar un intercambio por
   * cada pulsación. El cambio se confirma al salir del campo / Enter, usando la
   * renumeración inteligente central (intercambia si el destino ya existe).
   */
  const [numberDraft, setNumberDraft] = useState<string>('');
  useEffect(() => {
    setNumberDraft(selectedPoint?.nodeNumber != null ? String(selectedPoint.nodeNumber) : '');
  }, [selectedPoint?.id, selectedPoint?.nodeNumber]);

  const commitNumberDraft = () => {
    if (!selectedPoint) return;
    const raw = numberDraft.trim();
    if (raw === '') {
      swapPointNumber(selectedPoint.id, null);
      return;
    }
    const value = Number.parseInt(raw, 10);
    if (Number.isFinite(value) && value >= 1) {
      swapPointNumber(selectedPoint.id, value);
    } else {
      setNumberDraft(selectedPoint.nodeNumber != null ? String(selectedPoint.nodeNumber) : '');
    }
  };

  const handleUpdateLabel = (id: string, label: string) =>
    updatePointMetadata(id, label);

  const handleUpdateTime = (id: string, time_ms: number) => {
    pushHistory();
    const updated = points
      .map((p) => (p.id === id ? { ...p, time_ms, timestamp: time_ms } : p))
      .sort((a, b) => a.timestamp - b.timestamp);
    setPoints(updated);
  };

  /** Conflicto de tiempo Studio↔Rink: adopta el valor publicado por el Studio. */
  const handleAdoptStudioTime = () => {
    if (!selectedPoint || selectedPoint.pendingStudioTimestampMs == null) return;
    const ms = selectedPoint.pendingStudioTimestampMs;
    pushHistory();
    const updated = points
      .map((p) =>
        p.id === selectedPoint.id
          ? {
              ...p,
              time_ms: ms,
              timestamp: ms,
              studioPublishedTimestampMs: ms,
              studioTimeConflict: false,
              pendingStudioTimestampMs: undefined,
            }
          : p
      )
      .sort((a, b) => a.time_ms - b.time_ms);
    setPoints(updated);
  };

  /** Conflicto de tiempo: conserva el ajuste manual del usuario (limpia el aviso). */
  const handleKeepMyTime = () => {
    if (!selectedPoint) return;
    pushHistory();
    const updated = points.map((p) =>
      p.id === selectedPoint.id
        ? {
            ...p,
            studioPublishedTimestampMs: p.time_ms,
            studioTimeConflict: false,
            pendingStudioTimestampMs: undefined,
          }
        : p
    );
    setPoints(updated);
  };

  const handleDeleteSelected = () => {
    if (!selectedPointId) return;
    const idToDelete = selectedPointId;
    setSelectedPointId(null);
    deletePoint(idToDelete);
    onClose?.();
  };

  // ── Render ─────────────────────────────────────────────────
  const content = (
    <>
      {/* Acción prioritaria: eliminar el nodo seleccionado, SIEMPRE visible arriba */}
      {selectedPoint && (
        <div className="px-4 pt-3">
          <button
            type="button"
            onClick={handleDeleteSelected}
            className="w-full flex items-center justify-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 py-2.5 text-xs font-semibold text-red-400 interactive-tap hover:bg-red-500/15 transition-colors"
            aria-label="Eliminar nodo seleccionado"
          >
            <Trash2 className="w-4 h-4 stroke-[2]" />
            Eliminar nodo {displayNumber === '?' ? 'sin número' : `#${displayNumber}`}
          </button>
        </div>
      )}

      {/* ── BARRA DE HERRAMIENTAS EXCLUSIVAS: Colocar Nodos vs Conectar Ruta ─── */}
        <div className="px-4 py-3.5 space-y-3 border-b border-white/[0.06]">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
              <span>Herramienta Activa</span>
              <span className="font-mono text-slate-300 font-medium">{points.length} {points.length === 1 ? 'nodo' : 'nodos'}</span>
            </div>

            <div className="grid grid-cols-3 gap-1.5 bg-surface-2/60 p-1.5 rounded-xl border border-white/[0.06]">
              {/* Botón 1: Colocar Nodos */}
              <button
                type="button"
                onClick={() => {
                  setPhase('plot');
                  setSelectedPointId(null);
                }}
                className={[
                  'flex flex-col items-center justify-center gap-1 py-2 px-1 rounded-lg text-[11px] transition-all interactive-tap text-center',
                  phase === 'plot'
                    ? 'bg-surface-3 text-white border border-amber-400/40 shadow-subtle font-semibold'
                    : 'text-slate-400 hover:text-white hover:bg-white/[0.04] font-medium',
                ].join(' ')}
                title="Modo Nodos: Un clic en el lienzo coloca nodos. Las líneas están ocultas."
              >
                <PenTool className={`w-4 h-4 stroke-[2] ${phase === 'plot' ? 'text-amber-400' : 'text-slate-400'}`} />
                <span>Nodos</span>
              </button>

              {/* Botón 2: Trazar Líneas */}
              <button
                type="button"
                onClick={() => {
                  setPhase(phase === 'curve' ? 'plot' : 'curve');
                  setSelectedPointId(null);
                }}
                className={[
                  'flex flex-col items-center justify-center gap-1 py-2 px-1 rounded-lg text-[11px] transition-all interactive-tap text-center',
                  phase === 'curve'
                    ? 'bg-surface-3 text-white border border-ice-primary/40 shadow-subtle font-semibold'
                    : 'text-slate-400 hover:text-white hover:bg-white/[0.04] font-medium',
                ].join(' ')}
                title="Modo Trazado: conecta nodos y esculpe curvas. Arrastra sobre el trazo para curvarlo."
              >
                <Route className={`w-4 h-4 stroke-[2] ${phase === 'curve' ? 'text-ice-primary' : 'text-slate-400'}`} />
                <span>Trazar</span>
              </button>

              {/* Botón 3: Borrador */}
              <button
                type="button"
                onClick={() => {
                  if (phase === 'erase') {
                    setPhase('plot');
                  } else {
                    setPhase('erase');
                  }
                  setSelectedPointId(null);
                }}
                className={[
                  'flex flex-col items-center justify-center gap-1 py-2 px-1 rounded-lg text-[11px] transition-all interactive-tap text-center',
                  phase === 'erase'
                    ? 'bg-surface-3 text-white border border-red-500/40 shadow-subtle font-semibold'
                    : 'text-slate-400 hover:text-red-400 hover:bg-white/[0.04] font-medium',
                ].join(' ')}
                title="Modo Borrador: Toca cualquier nodo en la pista para eliminarlo al instante."
              >
                <Eraser className={`w-4 h-4 stroke-[2] ${phase === 'erase' ? 'text-red-400' : 'text-slate-400'}`} />
                <span>Borrador</span>
              </button>
            </div>
          </div>

          {/* Feedback interactivo de la herramienta seleccionada */}
          <div className="p-2.5 rounded-xl bg-surface-1 border border-white/[0.06] text-[11px] leading-snug">
            {phase === 'plot' ? (
              <p className="text-slate-300 flex items-center gap-1.5 font-normal">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                Modo Nodos: toca un espacio vacío para crear y arrastra un nodo para moverlo.
              </p>
            ) : phase === 'curve' ? (
              <p className="text-slate-300 flex items-center gap-1.5 font-normal">
                <span className="w-1.5 h-1.5 rounded-full bg-ice-primary shrink-0" />
                Modo Trazado: dibuja o conecta desde un nodo. Arrastra el trazo para esculpir curvas.
              </p>
            ) : (
              <p className="text-slate-300 flex items-center gap-1.5 font-normal">
                <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />
                Modo Borrador: toca un nodo para eliminarlo.
              </p>
            )}
          </div>

          {/* «Retroceder»: deshace SOLO el último paso del trazado en construcción */}
          {buildSteps.length > 0 && (
            <button
              type="button"
              onClick={() => retrocederBuildStep()}
              disabled={buildSteps.length < 2}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-surface-2 border border-white/[0.06] py-2.5 text-xs font-semibold text-slate-200 shadow-subtle hover:bg-surface-3 hover:text-white interactive-tap disabled:opacity-30 disabled:pointer-events-none transition-colors"
              title="Deshacer el último punto del trazo en construcción"
              aria-label="Retroceder último paso"
            >
              <Undo2 className="w-4 h-4 text-ice-primary" />
              Retroceder
            </button>
          )}
        </div>

        {/* ── Telemetría de nodos registrados ─── */}
        {points.length > 0 && !selectedPoint && (
          <div className="px-4 py-3.5 space-y-2 border-b border-white/[0.06]">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
              Nodos en Pista ({points.length})
            </p>
            <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
              {points.map((p, i) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelectedPointId(p.id)}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left border border-white/[0.06] bg-surface-1 hover:bg-surface-2 shadow-subtle interactive-tap group transition-colors"
                >
                  <span className="w-5 h-5 rounded-lg bg-surface-2 group-hover:bg-ice-primary group-hover:text-white flex items-center justify-center text-[10px] font-mono font-medium text-ice-primary shrink-0 transition-colors">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium truncate-safe text-slate-200">
                      {p.label || 'Sin etiqueta'}
                    </p>
                    <p className="text-[10px] font-mono text-slate-400">
                      {formatTime(p.time_ms)}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Estado vacío ─── */}
        {points.length === 0 && (
          <div className="px-4 py-12 flex flex-col items-center gap-3 text-center">
            <div className="w-12 h-12 rounded-2xl bg-surface-1 border border-white/[0.06] shadow-subtle flex items-center justify-center">
              <PenTool className="w-5 h-5 text-slate-500" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-300">Pista sin nodos</p>
              <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                Haz un clic en cualquier zona de la pista 2D<br />para crear un nuevo nodo.
              </p>
            </div>
          </div>
        )}

        {/* ── Inspector para Nodos Coreográficos ─── */}
        {selectedPoint && (
          <div className="px-4 py-3.5 space-y-4">

            {/* Identidad del nodo */}
            <div className="flex items-center gap-3 bg-surface-1 border border-white/[0.06] p-3 rounded-2xl shadow-subtle">
              <span className="w-8 h-8 rounded-xl bg-ice-primary/15 text-ice-primary border border-ice-primary/30 flex items-center justify-center text-xs font-mono font-semibold shrink-0">
                {displayNumber === '?' ? '?' : `#${displayNumber}`}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-white truncate-safe">
                  {selectedPoint.unrecognized
                    ? 'Nodo pendiente de numerar'
                    : selectedPoint.label || 'Nodo sin asignar'}
                </p>
                <p className="text-[10px] font-mono text-slate-400">
                  X: {selectedPoint.x.toFixed(1)}m · Y: {selectedPoint.y.toFixed(1)}m
                </p>
                {hasConfidence && (
                  <p className="mt-0.5 text-[9px] font-mono text-slate-400">
                    color {(selectedPoint.colorConfidence ?? 0).toFixed(2)} · geom{' '}
                    {(selectedPoint.geometryConfidence ?? 0).toFixed(2)} · pos{' '}
                    {(selectedPoint.positionConfidence ?? 0).toFixed(2)} · nº{' '}
                    {(selectedPoint.digitConfidence ?? 0).toFixed(2)}
                  </p>
                )}
              </div>
            </div>

            {/* Número del nodo */}
            <div className="space-y-1.5">
              <label className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                <Hash className="w-3.5 h-3.5 text-ice-primary" />
                Número de nodo
              </label>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={numberDraft}
                onChange={(e) => setNumberDraft(e.target.value.replace(/[^0-9]/g, ''))}
                onBlur={commitNumberDraft}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                }}
                placeholder="1, 2, 3…"
                className="w-full rounded-xl bg-surface-1 border border-white/[0.08] px-3 py-2.5 font-mono text-sm text-slate-100 placeholder:text-slate-500 outline-none shadow-subtle focus:border-ice-primary/50 focus:ring-1 focus:ring-ice-primary/20 transition-all"
              />
              <p className="text-[10px] text-slate-400 leading-snug">
                Si el número ya existe en otro nodo, se <strong className="text-slate-300">intercambian</strong>.
                Déjalo vacío para un nodo sin número («?»).
              </p>
              {selectedPoint.unrecognized && (
                <p className="text-[10px] font-medium text-amber-400">
                  Nodo pendiente: escribe su número para integrarlo.
                </p>
              )}
            </div>

            {/* Procedencia Studio */}
            {selectedPoint.studioTimeConflict && (
              <div className="space-y-2 rounded-xl border border-amber-500/25 bg-amber-500/10 p-2.5 text-[10px] leading-snug text-amber-200">
                <p>
                  <strong className="font-semibold">Tiempo editado en la Pista 2D.</strong> El Studio
                  publicó otro valor para este marcador. Se conserva tu ajuste salvo que decidas
                  adoptar el del Studio.
                </p>
                {selectedPoint.pendingStudioTimestampMs != null && (
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={handleKeepMyTime}
                      className="min-h-[40px] rounded-lg border border-white/10 bg-white/5 px-2 text-[11px] font-semibold text-slate-100 hover:bg-white/10 interactive-tap transition-colors"
                    >
                      Mantener el mío
                    </button>
                    <button
                      type="button"
                      onClick={handleAdoptStudioTime}
                      className="min-h-[40px] rounded-lg border border-amber-400/30 bg-amber-400/15 px-2 text-[11px] font-semibold text-amber-200 hover:bg-amber-400/25 interactive-tap transition-colors"
                    >
                      Usar Studio ({formatTime(selectedPoint.pendingStudioTimestampMs)})
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Selector de Figura Técnica Reglamentaria */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                <span className="flex items-center gap-1.5">
                  <Tag className="w-3.5 h-3.5 text-ice-primary" />
                  Figura Reglamentaria
                </span>
                <span className="text-[9px] font-mono text-ice-primary normal-case font-semibold">
                  {eficiencia} · {categoria}
                </span>
              </div>
              <select
                value={selectedPoint.label || ''}
                onChange={(e) => {
                  handleUpdateLabel(selectedPoint.id, e.target.value);
                }}
                className="w-full bg-surface-1 border border-white/[0.08] text-slate-100 rounded-xl px-3 py-2.5 text-xs focus:border-ice-primary/50 focus:ring-1 focus:ring-ice-primary/20 outline-none font-medium cursor-pointer shadow-subtle transition-all"
              >
                <option value="">— Elegir figura reglamentaria —</option>

                {/* a) Figuras Obligatorias (Sugeridas) */}
                <optgroup label={`★ Figuras Obligatorias (${eficiencia} · ${categoria})`}>
                  {figurasObligatoriasGrupos.length > 0 ? (
                    figurasObligatoriasGrupos.flatMap((g) =>
                      g.figuras.map((f) => (
                        <option key={`${g.grupo}-${f}`} value={`${f} (${g.grupo})`}>
                          {g.grupo}: {f}
                        </option>
                      ))
                    )
                  ) : (
                    <option disabled value="">
                      Sin figuras obligatorias para este nivel
                    </option>
                  )}
                </optgroup>

                {/* b) Figuras Libres / Elementos Artísticos */}
                <optgroup label="Figuras Libres / Elementos Artísticos">
                  {FIGURAS_LIBRES_Y_ARTISTICAS.map((item) => (
                    <option key={item.nombre} value={item.nombre}>
                      {item.nombre} ({item.categoriaElemento})
                    </option>
                  ))}
                </optgroup>
              </select>
            </div>

            {/* Input de Nombre / Voz */}
            <div className="space-y-1.5">
              <label
                htmlFor="node-label-input"
                className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider"
              >
                Etiqueta / Guía Vocal
              </label>
              <input
                type="text"
                id="node-label-input"
                name="nodeLabel"
                inputMode="text"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="words"
                spellCheck={false}
                enterKeyHint="done"
                placeholder="Ej: Salchow, Axel..."
                value={selectedPoint.label || ''}
                onChange={(e) => handleUpdateLabel(selectedPoint.id, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    (e.target as HTMLInputElement).blur();
                  }
                }}
                className="w-full bg-surface-1 border border-white/[0.08] rounded-xl px-3 py-2.5 text-xs text-slate-100 placeholder:text-slate-500 focus:border-ice-primary/50 focus:ring-1 focus:ring-ice-primary/20 outline-none font-mono shadow-subtle transition-all"
              />
            </div>

            {/* Momento en Audio */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                <span className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-ice-primary" />
                  Sincronización
                </span>
                <span className="font-mono text-ice-primary font-semibold normal-case">
                  {formatTime(selectedPoint.time_ms)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step={0.5}
                  min={0}
                  value={Math.round(selectedPoint.time_ms / 100) / 10}
                  onChange={(e) => {
                    const sec = parseFloat(e.target.value) || 0;
                    handleUpdateTime(selectedPoint.id, Math.round(sec * 1000));
                  }}
                  className="w-20 bg-surface-1 border border-white/[0.08] rounded-xl px-2 py-2 text-center font-mono text-ice-primary font-semibold text-xs outline-none shadow-subtle focus:border-ice-primary"
                />
                <span className="font-mono text-slate-400 text-xs">seg</span>
                <button
                  type="button"
                  onClick={() => audio.seek(selectedPoint.time_ms)}
                  className="flex-1 px-3 py-2 rounded-xl bg-surface-2 hover:bg-surface-3 border border-white/[0.06] text-slate-200 hover:text-white text-xs font-semibold shadow-subtle interactive-tap transition-colors"
                >
                  Escuchar
                </button>
              </div>
            </div>

            {/* Secuencia Vocal Preview */}
            {collectNodeFigures(selectedPoint).length > 0 && (
                <div className="bg-surface-1 border border-white/[0.06] shadow-subtle rounded-2xl p-3 space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-ice-primary shrink-0" />
                    <span className="text-[10px] font-semibold text-ice-primary uppercase tracking-wide">
                      Guía en Pista:
                    </span>
                  </div>
                  <p className="text-xs text-white font-medium">
                    "{collectNodeFigures(selectedPoint).join(', ')}, en tres, dos, uno, ¡ya!"
                  </p>
                  <p className="text-[10px] text-slate-400">
                    Aviso: {Math.max(0, (selectedPoint.time_ms - 4200) / 1000).toFixed(1)}s →
                    Ejecución: {(selectedPoint.time_ms / 1000).toFixed(1)}s
                  </p>
                </div>
              )}

            {/* ── ACCIONES DEL NODO ── */}
            <div className="pt-4 border-t border-white/[0.06]">
              <button
                type="button"
                onClick={() => setSelectedPointId(null)}
                className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-surface-2 border border-white/[0.06] hover:bg-surface-3 text-slate-400 hover:text-white text-xs font-medium shadow-subtle interactive-tap transition-colors"
              >
                <Move className="w-4 h-4" />
                Deseleccionar
              </button>
            </div>
          </div>
        )}
    </>
  );

  if (isMobileModal) {
    return (
      <div
        className="w-full text-white select-none"
        style={{
          WebkitOverflowScrolling: 'touch',
          overscrollBehavior: 'contain',
          touchAction: 'pan-y',
        }}
        onTouchStart={(e) => e.stopPropagation()}
        onTouchMove={(e) => e.stopPropagation()}
        onTouchEnd={(e) => e.stopPropagation()}
        onWheel={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        onPointerMove={(e) => e.stopPropagation()}
        onPointerUp={(e) => e.stopPropagation()}
      >
        {showHeader && (
          <div className="flex-none flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
            <p
              className={[
                'text-[10px] font-semibold uppercase tracking-widest transition-colors',
                selectedPoint ? 'text-ice-primary' : 'text-slate-400',
              ].join(' ')}
            >
              {selectedPoint ? 'Inspector de Nodo' : 'Sin Selección'}
            </p>
          </div>
        )}
        {content}
      </div>
    );
  }

  return (
    <div
      className="flex flex-col h-full w-full bg-surface-1 text-white select-none border-l border-white/[0.06]"
      style={{
        WebkitOverflowScrolling: 'touch',
        overscrollBehavior: 'contain',
        touchAction: 'pan-y',
      }}
      onTouchStart={(e) => e.stopPropagation()}
      onTouchMove={(e) => e.stopPropagation()}
      onTouchEnd={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onPointerMove={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
    >
      {/* ── Panel header ── */}
      {showHeader && (
        <div className="flex-none flex items-center justify-between px-3.5 sm:px-4 py-2.5 sm:py-3 border-b border-white/[0.06]">
          <p
            className={[
              'text-[10px] font-semibold uppercase tracking-widest transition-colors',
              selectedPoint ? 'text-ice-primary' : 'text-slate-400',
            ].join(' ')}
          >
            {selectedPoint ? 'Inspector de Nodo' : 'Sin Selección'}
          </p>
          {onToggleCollapse && (
            <button
              type="button"
              onClick={onToggleCollapse}
              className="press flex h-7 w-7 items-center justify-center rounded-lg text-neutral-400 hover:bg-white/[0.06] hover:text-white transition-colors"
              title="Colapsar inspector (más espacio para la pista)"
              aria-label="Colapsar inspector"
            >
              <PanelRightClose className="h-4 w-4" />
            </button>
          )}
        </div>
      )}

      {/* ── Body ── */}
      <div
        className="flex-1 overflow-y-auto overscroll-contain pb-12"
        style={{
          WebkitOverflowScrolling: 'touch',
          overscrollBehavior: 'contain',
          touchAction: 'pan-y',
        }}
        onTouchStart={(e) => e.stopPropagation()}
        onTouchMove={(e) => e.stopPropagation()}
        onTouchEnd={(e) => e.stopPropagation()}
        onWheel={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        onPointerMove={(e) => e.stopPropagation()}
        onPointerUp={(e) => e.stopPropagation()}
      >
        {content}
      </div>
    </div>
  );
};
