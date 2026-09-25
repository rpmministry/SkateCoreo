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
  Hash
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
}

/**
 * Right inspector panel — Dark Mode Neon aesthetic.
 * Primary Master CTA in Coral Neon, Selected items highlighted in Mint Neon.
 */
export const RightInspectorPanel: React.FC<RightInspectorPanelProps> = ({
  showHeader = true,
  isMobileModal = false,
  onClose,
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
      {/* Acción prioritaria: eliminar el nodo seleccionado, SIEMPRE visible arriba
          (en móvil el panel es corto y el botón quedaba fuera de pantalla). */}
      {selectedPoint && (
        <div className="px-4 pt-3">
          <button
            type="button"
            onClick={handleDeleteSelected}
            className="w-full flex items-center justify-center gap-2 rounded-xl border border-coral/40 bg-coral/15 py-2.5 text-xs font-black text-coral interactive-tap hover:bg-coral/25"
            aria-label="Eliminar nodo seleccionado"
          >
            <Trash2 className="w-4 h-4 stroke-[2.5]" />
            Eliminar nodo {displayNumber === '?' ? 'sin número' : `#${displayNumber}`}
          </button>
        </div>
      )}

      {/* ── BARRA DE HERRAMIENTAS EXCLUSIVAS: Colocar Nodos vs Conectar Ruta ─── */}
        <div className="px-4 py-3.5 space-y-3 border-b border-white/5">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              <span>Herramienta Activa</span>
              <span className="font-mono text-cyan">{points.length} {points.length === 1 ? 'nodo' : 'nodos'}</span>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {/* Botón 1: Colocar Nodos (Siempre visible) */}
              <button
                type="button"
                onClick={() => {
                  setPhase('plot');
                  setSelectedPointId(null);
                }}
                className={[
                  'flex flex-col items-center justify-center gap-1 py-2.5 px-1 rounded-xl text-[11px] font-black transition-all interactive-tap shadow-soft-elevation text-center',
                  phase === 'plot'
                    ? 'bg-amber-500 text-black shadow-glow-amber ring-2 ring-amber-400'
                    : 'bg-neon-card hover:bg-neon-hover text-slate-300 hover:text-white',
                ].join(' ')}
                title="Modo Nodos: Un clic en el lienzo coloca nodos. Las líneas están ocultas."
              >
                <PenTool className="w-4 h-4 stroke-[2.5]" />
                <span>Nodos</span>
              </button>

              {/* Botón 2: Trazar Líneas (Toggle mutuamente excluyente).
                  Herramienta independiente y siempre disponible: separa el
                  trazado/conexión del modo Nodos (colocar/mover). */}
              <button
                type="button"
                onClick={() => {
                  setPhase(phase === 'curve' ? 'plot' : 'curve');
                  setSelectedPointId(null);
                }}
                className={[
                  'flex flex-col items-center justify-center gap-1 py-2.5 px-1 rounded-xl text-[11px] font-black transition-all interactive-tap shadow-soft-elevation text-center',
                  phase === 'curve'
                    ? 'bg-cyan text-black shadow-glow-cyan ring-2 ring-cyan-400'
                    : 'bg-neon-card hover:bg-neon-hover text-slate-300 hover:text-white',
                ].join(' ')}
                title="Modo Trazado: conecta nodos y esculpe curvas. Arrastra sobre el trazo para curvarlo."
              >
                <Route className="w-4 h-4 stroke-[2.5]" />
                <span>Trazar</span>
              </button>

              {/* Botón 3: Borrador (Modo Borrador) */}
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
                  'flex flex-col items-center justify-center gap-1 py-2.5 px-1 rounded-xl text-[11px] font-black transition-all interactive-tap shadow-soft-elevation text-center',
                  phase === 'erase'
                    ? 'bg-red-500 text-white shadow-lg shadow-red-500/40 ring-2 ring-red-400'
                    : 'bg-neon-card hover:bg-neon-hover text-slate-300 hover:text-red-400',
                ].join(' ')}
                title="Modo Borrador: Toca cualquier nodo en la pista para eliminarlo al instante."
              >
                <Eraser className="w-4 h-4 stroke-[2.5]" />
                <span>Borrador</span>
              </button>
            </div>
          </div>

          {/* Feedback interactivo de la herramienta seleccionada */}
          <div className="p-2.5 rounded-xl bg-neon-card text-[11px] leading-snug">
            {phase === 'plot' ? (
              <p className="text-amber-300 flex items-center gap-1.5 font-medium">
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse shrink-0" />
                Modo Nodos: toca un espacio vacío para crear y arrastra un nodo para moverlo. El trazado está desactivado.
              </p>
            ) : phase === 'curve' ? (
              <p className="text-cyan flex items-center gap-1.5 font-medium">
                <span className="w-2 h-2 rounded-full bg-cyan shrink-0" />
                Modo Trazado: dibuja/conecta desde un nodo o sobre la pista. Arrastra el trazo para esculpir curvas.
              </p>
            ) : (
              <p className="text-red-300 flex items-center gap-1.5 font-medium">
                <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
                Modo Borrador: toca un nodo para eliminarlo.
              </p>
            )}
          </div>

          {/* «Retroceder»: deshace SOLO el último paso del trazado en construcción
              (NO la figura completa; eso es «Eliminar nodo»). Contextual: aparece
              mientras se construye y se deshabilita al llegar al primer paso. */}
          {buildSteps.length > 0 && (
            <button
              type="button"
              onClick={() => retrocederBuildStep()}
              disabled={buildSteps.length < 2}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-neon-card py-2.5 text-xs font-bold text-slate-200 shadow-soft-elevation hover:bg-neon-hover hover:text-white interactive-tap disabled:opacity-30 disabled:pointer-events-none"
              title="Deshacer el último punto del trazo en construcción"
              aria-label="Retroceder último paso"
            >
              <Undo2 className="w-4 h-4 text-coral" />
              Retroceder
            </button>
          )}
        </div>

        {/* ── Telemetría de nodos registrados ─── */}
        {points.length > 0 && !selectedPoint && (
          <div className="px-4 py-3.5 space-y-2 border-b border-white/5">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
              Nodos en Pista ({points.length})
            </p>
            <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
              {points.map((p, i) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelectedPointId(p.id)}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left shadow-soft-elevation interactive-tap group bg-neon-card hover:bg-neon-hover"
                >
                  <span className="w-5 h-5 rounded-lg bg-neon-surface group-hover:bg-mint group-hover:text-neon-canvas flex items-center justify-center text-[10px] font-mono font-bold text-mint shrink-0 transition-colors">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold truncate-safe text-slate-200">
                      {p.label || 'Sin etiqueta'}
                    </p>
                    <p className="text-[10px] font-mono text-slate-500">
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
            <div className="w-12 h-12 rounded-2xl bg-neon-card shadow-soft-elevation flex items-center justify-center">
              <PenTool className="w-5 h-5 text-slate-600" />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-400">Pista sin nodos</p>
              <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                Haz un clic en cualquier zona de la pista 2D<br />para crear un nuevo nodo.
              </p>
            </div>
          </div>
        )}

        {/* ── Inspector para Nodos Coreográficos: Acento Menta Neón ─── */}
        {selectedPoint && (
          <div className="px-4 py-3.5 space-y-4">

            {/* Identidad del nodo con halo Menta */}
            <div className="flex items-center gap-3 bg-neon-card p-3 rounded-2xl shadow-soft-elevation">
              <span className="w-8 h-8 rounded-xl bg-mint text-neon-canvas shadow-glow-mint flex items-center justify-center text-xs font-mono font-black shrink-0">
                {displayNumber === '?' ? '?' : `#${displayNumber}`}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-white truncate-safe">
                  {selectedPoint.unrecognized
                    ? 'Nodo pendiente de numerar'
                    : selectedPoint.label || 'Nodo sin asignar'}
                </p>
                <p className="text-[10px] font-mono text-slate-400">
                  X: {selectedPoint.x.toFixed(1)}m · Y: {selectedPoint.y.toFixed(1)}m
                </p>
                {hasConfidence && (
                  <p className="mt-0.5 text-[9px] font-mono text-slate-500">
                    color {(selectedPoint.colorConfidence ?? 0).toFixed(2)} · geom{' '}
                    {(selectedPoint.geometryConfidence ?? 0).toFixed(2)} · pos{' '}
                    {(selectedPoint.positionConfidence ?? 0).toFixed(2)} · nº{' '}
                    {(selectedPoint.digitConfidence ?? 0).toFixed(2)}
                  </p>
                )}
              </div>
            </div>

            {/* Número del nodo (leído por el escáner o escrito a mano) */}
            <div className="space-y-1.5">
              <label className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                <Hash className="w-3.5 h-3.5 text-cyan" />
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
                className="w-full rounded-xl bg-neon-card px-3 py-2.5 font-mono text-sm text-slate-100 outline-none shadow-soft-elevation focus:bg-neon-hover"
              />
              <p className="text-[10px] text-slate-500 leading-snug">
                Si el número ya existe en otro nodo, se <strong className="text-slate-300">intercambian</strong>.
                Déjalo vacío para un nodo sin número («?»).
              </p>
              {selectedPoint.unrecognized && (
                <p className="text-[10px] font-semibold text-orange-400">
                  Nodo pendiente: escribe su número para integrarlo.
                </p>
              )}
            </div>

            {/* Procedencia Studio: nunca se sobrescribe en silencio el tiempo que el
                usuario ajustó aquí, aunque el Studio publique otro valor. */}
            {selectedPoint.studioTimeConflict && (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-2.5 text-[10px] leading-snug text-amber-200">
                <strong className="font-bold">Tiempo editado en la Pista 2D.</strong> El Studio
                publicó otro valor para este marcador; se conserva tu ajuste.
              </div>
            )}

            {/* Selector de Figura Técnica Reglamentaria */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                <span className="flex items-center gap-1.5">
                  <Tag className="w-3.5 h-3.5 text-mint" />
                  Figura Reglamentaria
                </span>
                <span className="text-[9px] font-mono text-cyan normal-case font-bold">
                  {eficiencia} · {categoria}
                </span>
              </div>
              <select
                value={selectedPoint.label || ''}
                onChange={(e) => {
                  handleUpdateLabel(selectedPoint.id, e.target.value);
                }}
                className="w-full bg-neon-card text-slate-100 rounded-xl px-3 py-2.5 text-xs focus:bg-neon-hover outline-none font-medium cursor-pointer shadow-soft-elevation"
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
                className="text-[10px] font-bold text-slate-400 uppercase tracking-wider"
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
                  // «Listo» del teclado móvil: confirma y cierra el teclado sin
                  // desmontar el panel (evita perder foco/estado en iOS).
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    (e.target as HTMLInputElement).blur();
                  }
                }}
                className="w-full bg-neon-card rounded-xl px-3 py-2.5 text-xs text-slate-100 placeholder:text-slate-600 focus:bg-neon-hover outline-none font-mono shadow-soft-elevation"
              />
            </div>

            {/* Momento en Audio */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                <span className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-mint" />
                  Sincronización
                </span>
                <span className="font-mono text-mint font-bold normal-case">
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
                  className="w-20 bg-neon-card rounded-xl px-2 py-2 text-center font-mono text-mint font-black text-xs outline-none shadow-soft-elevation"
                />
                <span className="font-mono text-slate-500 text-xs">seg</span>
                <button
                  type="button"
                  onClick={() => audio.seek(selectedPoint.time_ms)}
                  className="flex-1 px-3 py-2 rounded-xl bg-neon-card hover:bg-neon-hover text-slate-200 hover:text-white text-xs font-bold shadow-soft-elevation interactive-tap"
                >
                  Escuchar
                </button>
              </div>
            </div>

            {/* Secuencia Vocal Preview */}
            {collectNodeFigures(selectedPoint).length > 0 && (
                <div className="bg-neon-card shadow-soft-elevation rounded-2xl p-3 space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-mint shrink-0" />
                    <span className="text-[10px] font-bold text-mint uppercase tracking-wide">
                      Guía en Pista:
                    </span>
                  </div>
                  <p className="text-xs text-white font-bold">
                    "{collectNodeFigures(selectedPoint).join(', ')}, en tres, dos, uno, ¡ya!"
                  </p>
                  <p className="text-[10px] text-slate-500">
                    Aviso: {Math.max(0, (selectedPoint.time_ms - 4200) / 1000).toFixed(1)}s →
                    Ejecución: {(selectedPoint.time_ms / 1000).toFixed(1)}s
                  </p>
                </div>
              )}

            {/* NOTA: la sección «Curvatura del Trazo» se eliminó. El trazado libre
                ya cubre la necesidad (arrastrar sobre el trazo esculpe la curva),
                así que esos botones no aportaban al flujo actual. El motor Bézier
                (FreehandPathEngine / RinkRenderer) sigue intacto.

                «Eliminar Nodo» tiene UNA sola ubicación: el botón superior, siempre
                visible y contextual al nodo seleccionado (no se duplica aquí). */}

            {/* ── ACCIONES DEL NODO ── */}
            <div className="pt-4 border-t border-white/10">
              <button
                type="button"
                onClick={() => setSelectedPointId(null)}
                className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-neon-card hover:bg-neon-hover text-slate-400 hover:text-white text-xs font-semibold shadow-soft-elevation interactive-tap transition-colors"
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
          <div className="flex-none flex items-center justify-between px-4 py-3 border-b border-white/5">
            <p
              className={[
                'text-[10px] font-bold uppercase tracking-widest transition-colors',
                selectedPoint ? 'text-mint' : 'text-slate-500',
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
      className="flex flex-col h-full w-full bg-neon-surface text-white select-none"
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
        <div className="flex-none flex items-center justify-between px-4 py-3 border-b border-white/5">
          <p
            className={[
              'text-[10px] font-bold uppercase tracking-widest transition-colors',
              selectedPoint ? 'text-mint' : 'text-slate-500',
            ].join(' ')}
          >
            {selectedPoint ? 'Inspector de Nodo' : 'Sin Selección'}
          </p>
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
