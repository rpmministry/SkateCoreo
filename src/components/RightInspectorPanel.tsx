import React from 'react';
import {
  Plus,
  Trash2,
  Tag,
  Clock,
  Sparkles,
  MinusCircle,
  Move,
  PenTool,
  Route,
  Undo2
} from 'lucide-react';

import { useChoreographyStore } from '../store/useChoreographyStore';
import { 
  getFigurasObligatorias, 
  FIGURAS_LIBRES_Y_ARTISTICAS 
} from '../constants/reglamento';

import { isSpeakableFigure } from '../core/audio/VoiceCueEngine';
import { useAudioEngine } from '../hooks/useAudioEngine';

interface RightInspectorPanelProps {
  onAddNode: () => void;
}

const formatTime = (ms: number): string => {
  const totalSeconds = Math.floor(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
};

/**
 * Right inspector panel — Dark Mode Neon aesthetic.
 * Primary Master CTA in Coral Neon, Selected items highlighted in Mint Neon.
 */
export const RightInspectorPanel: React.FC<RightInspectorPanelProps> = ({
  onAddNode,
}) => {
  const audio = useAudioEngine();

  // ── Zustand store ──────────────────────────────────────────
  const points = useChoreographyStore((s) => s.points);
  const selectedPointId = useChoreographyStore((s) => s.selectedPointId);
  const setSelectedPointId = useChoreographyStore((s) => s.setSelectedPointId);
  const updatePointMetadata = useChoreographyStore((s) => s.updatePointMetadata);
  const deletePoint = useChoreographyStore((s) => s.deletePoint);
  const setPoints = useChoreographyStore((s) => s.setPoints);
  const pushHistory = useChoreographyStore((s) => s.pushHistory);
  const straightenSegment = useChoreographyStore((s) => s.straightenSegment);
  const phase = useChoreographyStore((s) => s.phase);
  const history = useChoreographyStore((s) => s.history);
  const undo = useChoreographyStore((s) => s.undo);
  const setPhase = useChoreographyStore((s) => s.setPhase);

  // Reglamento 2026
  const categoria = useChoreographyStore((s) => s.categoria);
  const eficiencia = useChoreographyStore((s) => s.eficiencia);
  const figurasObligatoriasGrupos = getFigurasObligatorias(eficiencia, categoria);

  const selectedPoint = points.find((p) => p.id === selectedPointId) ?? null;
  const selectedPointIndex = selectedPoint
    ? points.findIndex((p) => p.id === selectedPoint.id)
    : -1;

  // ── Handlers ───────────────────────────────────────────────
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
    deletePoint(selectedPointId);
  };

  const handleStraighten = () => {
    if (!selectedPointId) return;
    straightenSegment(selectedPointId);
  };

  // ── Render ─────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full w-full bg-neon-surface text-white select-none">
      {/* ── Panel header ── */}
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

      {/* ── Body ── */}
      <div className="flex-1 overflow-y-auto overscroll-contain">

        {/* ── Action Dock: Dibujar Coreografía & Acciones Clave ─── */}
        <div className="px-4 py-3.5 space-y-3 border-b border-white/5">

          {/* Botón Maestro: Coral Neón Vibrante (CTA Primario) */}
          {phase === 'plot' ? (
            <button
              type="button"
              onClick={() => { if (points.length >= 2) setPhase('curve'); }}
              disabled={points.length < 2}
              title={points.length < 2 ? 'Coloca al menos 2 nodos para trazar la ruta' : 'Trazar ruta coreográfica completa'}
              className={[
                'w-full flex items-center justify-center gap-2.5 py-3.5 rounded-2xl text-xs font-black uppercase tracking-wider interactive-tap transition-all',
                points.length >= 2
                  ? 'bg-coral hover:bg-coral-hover text-white shadow-glow-coral'
                  : 'bg-neon-card text-slate-500 opacity-40 cursor-not-allowed shadow-none',
              ].join(' ')}
            >
              <Route className="w-4 h-4 stroke-[2.5]" />
              Dibujar Coreografía
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setPhase('plot')}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-xs font-bold bg-neon-card hover:bg-neon-hover text-cyan shadow-soft-elevation interactive-tap"
            >
              <PenTool className="w-4 h-4 text-cyan stroke-[2]" />
              Volver a Editar Nodos
            </button>
          )}

          {/* Feedback explicativo */}
          <p className="text-[11px] text-slate-500 text-center leading-relaxed">
            {phase === 'plot'
              ? points.length === 0
                ? 'Toca en la pista para situar nodos'
                : points.length === 1
                ? 'Agrega 1 nodo más para habilitar trazado'
                : `${points.length} nodos listos · Pulsa "Dibujar"`
              : `Ruta activa en Cyan · ${points.length} nodos conectados`}
          </p>

          {/* Row secundario: Añadir Nodo + Deshacer */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onAddNode}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold bg-neon-card hover:bg-neon-hover text-slate-200 hover:text-white shadow-soft-elevation interactive-tap"
              title="Añadir nodo en el tiempo actual del audio"
            >
              <Plus className="w-4 h-4 text-cyan stroke-[2.5]" />
              Añadir Nodo
            </button>

            <button
              type="button"
              onClick={undo}
              disabled={history.length === 0}
              title="Deshacer último cambio (Ctrl+Z)"
              className="flex items-center justify-center gap-1 px-3.5 py-2.5 rounded-xl text-xs font-bold bg-neon-card hover:bg-neon-hover text-slate-300 hover:text-coral shadow-soft-elevation interactive-tap disabled:opacity-25 disabled:pointer-events-none"
            >
              <Undo2 className="w-3.5 h-3.5" />
              <span>Ctrl+Z</span>
            </button>
          </div>
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
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-neon-card hover:bg-neon-hover text-left shadow-soft-elevation interactive-tap group"
                >
                  <span className="w-5 h-5 rounded-lg bg-neon-surface group-hover:bg-mint group-hover:text-neon-canvas flex items-center justify-center text-[10px] font-mono font-bold text-mint shrink-0 transition-colors">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-slate-200 truncate">
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
              <p className="text-[11px] text-slate-600 mt-1 leading-relaxed">
                Toca cualquier zona de la pista 2D<br />o pulsa "Añadir Nodo".
              </p>
            </div>
          </div>
        )}

        {/* ── Inspector Contextual Activo: Acento Menta Neón ─── */}
        {selectedPoint && (
          <div className="px-4 py-3.5 space-y-4">

            {/* Identidad del nodo con halo Menta */}
            <div className="flex items-center gap-3 bg-neon-card p-3 rounded-2xl shadow-soft-elevation">
              <span className="w-8 h-8 rounded-xl bg-mint text-neon-canvas shadow-glow-mint flex items-center justify-center text-xs font-mono font-black shrink-0">
                #{selectedPointIndex + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-white truncate">
                  {selectedPoint.label || 'Nodo sin asignar'}
                </p>
                <p className="text-[10px] font-mono text-slate-400">
                  X: {selectedPoint.x.toFixed(1)}m · Y: {selectedPoint.y.toFixed(1)}m
                </p>
              </div>
            </div>

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
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Etiqueta / Guía Vocal
              </label>
              <input
                type="text"
                placeholder="Ej: Salchow, Axel..."
                value={selectedPoint.label || ''}
                onChange={(e) => handleUpdateLabel(selectedPoint.id, e.target.value)}
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
            {selectedPoint.label &&
              isSpeakableFigure(selectedPoint.label, selectedPoint.type) && (
                <div className="bg-neon-card shadow-soft-elevation rounded-2xl p-3 space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-mint shrink-0" />
                    <span className="text-[10px] font-bold text-mint uppercase tracking-wide">
                      Guía en Pista:
                    </span>
                  </div>
                  <p className="text-xs text-white font-bold">
                    "{selectedPoint.label}, en tres, dos, uno, ¡ya!"
                  </p>
                  <p className="text-[10px] text-slate-500">
                    Aviso: {Math.max(0, (selectedPoint.time_ms - 4200) / 1000).toFixed(1)}s →
                    Ejecución: {(selectedPoint.time_ms / 1000).toFixed(1)}s
                  </p>
                </div>
              )}

            {/* Acciones del Nodo */}
            <div className="space-y-2 pt-2">
              <button
                type="button"
                onClick={handleStraighten}
                className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-neon-card hover:bg-neon-hover text-slate-200 hover:text-white text-xs font-bold shadow-soft-elevation interactive-tap"
              >
                <MinusCircle className="w-4 h-4 text-cyan" />
                Enderezar Curva
              </button>
              <button
                type="button"
                onClick={() => setSelectedPointId(null)}
                className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-neon-card hover:bg-neon-hover text-slate-400 hover:text-white text-xs font-semibold shadow-soft-elevation interactive-tap"
              >
                <Move className="w-4 h-4" />
                Deseleccionar
              </button>
              <button
                type="button"
                onClick={handleDeleteSelected}
                className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-coral/15 hover:bg-coral text-coral hover:text-white text-xs font-bold shadow-soft-elevation interactive-tap transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                Eliminar Nodo
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
