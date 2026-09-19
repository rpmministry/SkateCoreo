import React from 'react';
import {
  Trash2,
  Tag,
  Clock,
  Sparkles,
  Move,
  PenTool,
  Route,
  Undo2,
  Timer,
  SlidersHorizontal
} from 'lucide-react';

import { useChoreographyStore } from '../store/useChoreographyStore';
import { 
  getFigurasObligatorias, 
  FIGURAS_LIBRES_Y_ARTISTICAS 
} from '../constants/reglamento';

import { isSpeakableFigure } from '../core/audio/VoiceCueEngine';
import { useAudioEngine } from '../hooks/useAudioEngine';

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
export const RightInspectorPanel: React.FC = () => {
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
  const history = useChoreographyStore((s) => s.history);
  const undo = useChoreographyStore((s) => s.undo);

  const phase = useChoreographyStore((s) => s.phase);
  const setPhase = useChoreographyStore((s) => s.setPhase);

  // Sistema de Nodos de Tiempo (Time Nodes)
  const isAddingFreeTimeNodes = useChoreographyStore((s) => s.isAddingFreeTimeNodes);
  const setIsAddingFreeTimeNodes = useChoreographyStore((s) => s.setIsAddingFreeTimeNodes);
  const insertPredefinedTimeNodes = useChoreographyStore((s) => s.insertPredefinedTimeNodes);
  const clearTimeNodesForSegment = useChoreographyStore((s) => s.clearTimeNodesForSegment);

  const [presetTimeCount, setPresetTimeCount] = React.useState<number>(4);

  // Reglamento 2026
  const categoria = useChoreographyStore((s) => s.categoria);
  const eficiencia = useChoreographyStore((s) => s.eficiencia);
  const figurasObligatoriasGrupos = getFigurasObligatorias(eficiencia, categoria);

  const selectedPoint = points.find((p) => p.id === selectedPointId) ?? null;
  const selectedPointIndex = selectedPoint
    ? points.findIndex((p) => p.id === selectedPoint.id)
    : -1;

  const timeNodesInSegment = selectedPoint
    ? points.filter(
        (p) => p.kind === 'time' && p.parentSegmentStartId === selectedPoint.id
      )
    : [];
  const hasTimeNodesInSegment = timeNodesInSegment.length > 0;

  const updateControlPoint1 = useChoreographyStore((s) => s.updateControlPoint1);
  const updateControlPoint2 = useChoreographyStore((s) => s.updateControlPoint2);

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

  const handleApplyCurve = (direction: 'out' | 'in') => {
    if (!selectedPointId) return;
    const sorted = [...points].sort((a, b) => a.time_ms - b.time_ms);
    const idx = sorted.findIndex((p) => p.id === selectedPointId);
    if (idx < 0 || idx >= sorted.length - 1) return;

    const p0 = sorted[idx];
    const p1 = sorted[idx + 1];

    const dx = p1.x - p0.x;
    const dy = p1.y - p0.y;
    const dist = Math.hypot(dx, dy) || 1;

    // Vector normal unitario perpendicular
    const nx = -dy / dist;
    const ny = dx / dist;

    const sign = direction === 'out' ? 1 : -1;
    const offset = Math.min(6, Math.max(1.5, dist * 0.3)) * sign;

    pushHistory();
    const cp1x = Math.max(0.4, Math.min(49.6, p0.x + dx * 0.33 + nx * offset));
    const cp1y = Math.max(0.4, Math.min(24.6, p0.y + dy * 0.33 + ny * offset));
    const cp2x = Math.max(0.4, Math.min(49.6, p1.x - dx * 0.33 + nx * offset));
    const cp2y = Math.max(0.4, Math.min(24.6, p1.y - dy * 0.33 + ny * offset));

    updateControlPoint1(p0.id, cp1x, cp1y);
    updateControlPoint2(p0.id, cp2x, cp2y);
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

        {/* ── BARRA DE HERRAMIENTAS EXCLUSIVAS: Colocar Nodos vs Conectar Ruta ─── */}
        <div className="px-4 py-3.5 space-y-3 border-b border-white/5">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              <span>Herramienta Activa</span>
              <span className="font-mono text-cyan">{points.length} {points.length === 1 ? 'nodo' : 'nodos'}</span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {/* Botón 1: Colocar Nodos (Siempre visible) */}
              <button
                type="button"
                onClick={() => setPhase('plot')}
                className={[
                  'flex items-center justify-center gap-1.5 py-3 px-2 rounded-xl text-xs font-black transition-all interactive-tap shadow-soft-elevation',
                  phase === 'plot'
                    ? 'bg-amber-500 text-black shadow-glow-amber ring-2 ring-amber-400'
                    : 'bg-neon-card hover:bg-neon-hover text-slate-300 hover:text-white',
                ].join(' ')}
                title="Activa el modo para insertar nodos de posición o tiempo tocando libremente la pista"
              >
                <PenTool className="w-4 h-4 stroke-[2.5]" />
                <span>Colocar Nodos</span>
              </button>

              {/* Botón 2: Conectar Ruta (Siempre visible) */}
              <button
                type="button"
                onClick={() => {
                  if (points.length >= 2) setPhase('curve');
                }}
                disabled={points.length < 2}
                className={[
                  'flex items-center justify-center gap-1.5 py-3 px-2 rounded-xl text-xs font-black transition-all interactive-tap shadow-soft-elevation',
                  phase === 'curve'
                    ? 'bg-cyan text-black shadow-glow-cyan ring-2 ring-cyan-400'
                    : 'bg-neon-card hover:bg-neon-hover text-slate-300 hover:text-white disabled:opacity-30 disabled:pointer-events-none',
                ].join(' ')}
                title={points.length >= 2 ? 'Conecta los nodos con curvas Spline continuas' : 'Mínimo 2 nodos requeridos'}
              >
                <Route className="w-4 h-4 stroke-[2.5]" />
                <span>Conectar Ruta</span>
              </button>
            </div>
          </div>

          {/* Feedback interactivo de la herramienta seleccionada */}
          <div className="p-2.5 rounded-xl bg-neon-card text-[11px] leading-snug">
            {phase === 'plot' ? (
              <p className="text-amber-300 flex items-center gap-1.5 font-medium">
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse shrink-0" />
                Toca la pista para añadir nodos. Las líneas no se trazarán hasta conectar.
              </p>
            ) : (
              <p className="text-cyan flex items-center gap-1.5 font-medium">
                <span className="w-2 h-2 rounded-full bg-cyan shrink-0" />
                Ruta conectada. Arrastra los puntos sobre la línea para esculpir la curva.
              </p>
            )}
          </div>

          {/* Row de Deshacer (Ctrl+Z) y Modo Tiempos Libres */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setIsAddingFreeTimeNodes(!isAddingFreeTimeNodes)}
              className={[
                'flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold transition-all interactive-tap shadow-soft-elevation',
                isAddingFreeTimeNodes
                  ? 'bg-amber-500 text-black shadow-glow-amber ring-2 ring-amber-400 font-extrabold'
                  : 'bg-neon-card hover:bg-neon-hover text-amber-400 hover:text-amber-300 border border-amber-500/20',
              ].join(' ')}
              title="Activa el modo para insertar nodos de tiempo tocando la pista"
            >
              <Timer className="w-4 h-4 stroke-[2.5]" />
              <span>{isAddingFreeTimeNodes ? 'Tiempos ACTIVO' : '+ Nodos de Tiempo'}</span>
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
              {points.map((p, i) => {
                const isTime = p.kind === 'time';
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setSelectedPointId(p.id)}
                    className={[
                      'w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left shadow-soft-elevation interactive-tap group',
                      isTime
                        ? 'bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20'
                        : 'bg-neon-card hover:bg-neon-hover',
                    ].join(' ')}
                  >
                    {isTime ? (
                      <span className="w-5 h-5 rounded-lg bg-amber-500 text-black flex items-center justify-center text-[10px] font-mono font-black shrink-0 shadow-sm">
                        T{p.timeBeat ?? '⏱'}
                      </span>
                    ) : (
                      <span className="w-5 h-5 rounded-lg bg-neon-surface group-hover:bg-mint group-hover:text-neon-canvas flex items-center justify-center text-[10px] font-mono font-bold text-mint shrink-0 transition-colors">
                        {i + 1}
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p
                        className={[
                          'text-xs font-semibold truncate',
                          isTime ? 'text-amber-300 font-mono' : 'text-slate-200',
                        ].join(' ')}
                      >
                        {isTime ? `Nodo de Tiempo (T${p.timeBeat || ''})` : p.label || 'Sin etiqueta'}
                      </p>
                      <p className="text-[10px] font-mono text-slate-500">
                        {formatTime(p.time_ms)}
                      </p>
                    </div>
                  </button>
                );
              })}
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
                Toca cualquier zona de la pista 2D<br />con la herramienta "Colocar Nodos" activa.
              </p>
            </div>
          </div>
        )}

        {/* ── Inspector Contextual Activo ─── */}
        {selectedPoint && selectedPoint.kind === 'time' && (
          <div className="px-4 py-3.5 space-y-4">
            {/* Identidad del nodo de tiempo con halo Ámbar */}
            <div className="flex items-center gap-3 bg-neon-card p-3 rounded-2xl shadow-soft-elevation border border-amber-500/30">
              <span className="w-9 h-9 rounded-xl bg-amber-500 text-black shadow-glow-amber flex items-center justify-center text-xs font-mono font-black shrink-0">
                T{selectedPoint.timeBeat ?? '⏱'}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-amber-300 truncate">
                  Nodo de Tiempo Musical
                </p>
                <p className="text-[10px] font-mono text-slate-400">
                  X: {selectedPoint.x.toFixed(1)}m · Y: {selectedPoint.y.toFixed(1)}m
                </p>
              </div>
            </div>

            <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-3 space-y-1">
              <div className="flex items-center gap-1.5 text-[10px] font-bold text-amber-400 uppercase tracking-wide">
                <Timer className="w-3.5 h-3.5" />
                Checkpoint Rítmico
              </div>
              <p className="text-[11px] text-slate-300 leading-relaxed">
                Este nodo guía la velocidad rítmica de la patinadora. Durante la reproducción, el trazo anterior se desvanece suavemente al alcanzarlo.
              </p>
            </div>

            {/* Momento en Audio */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                <span className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-amber-400" />
                  Sincronización Rítmica
                </span>
                <span className="font-mono text-amber-400 font-bold normal-case">
                  {formatTime(selectedPoint.time_ms)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step={0.1}
                  min={0}
                  value={Math.round(selectedPoint.time_ms / 100) / 10}
                  onChange={(e) => {
                    const sec = parseFloat(e.target.value) || 0;
                    handleUpdateTime(selectedPoint.id, Math.round(sec * 1000));
                  }}
                  className="w-20 bg-neon-card rounded-xl px-2 py-2 text-center font-mono text-amber-400 font-black text-xs outline-none shadow-soft-elevation border border-amber-500/20"
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

            {/* ── Refinamiento de Curva Bézier desde este Nodo de Tiempo ─── */}
            <div className="bg-neon-card shadow-soft-elevation rounded-2xl p-3.5 space-y-2.5 border border-cyan/25">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-[10px] font-bold text-cyan uppercase tracking-wider">
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                  Curvatura del Trazo
                </span>
                <span className="text-[9px] font-mono text-cyan bg-cyan/15 px-2 py-0.5 rounded-full font-bold">
                  Spline en Línea
                </span>
              </div>

              <p className="text-[11px] text-slate-300 leading-snug">
                Arrastra los puntos sobre la línea o la propia curva para esculpirla con suavidad continua sin crear nodos de posición.
              </p>

              <div className="grid grid-cols-3 gap-1.5 pt-1">
                <button
                  type="button"
                  onClick={() => handleApplyCurve('out')}
                  className="py-2 rounded-xl bg-neon-surface hover:bg-cyan/20 text-slate-200 hover:text-cyan text-[11px] font-bold transition-all interactive-tap flex items-center justify-center gap-1"
                  title="Curvar el trazo hacia afuera"
                >
                  ⤴ Ext.
                </button>
                <button
                  type="button"
                  onClick={() => handleApplyCurve('in')}
                  className="py-2 rounded-xl bg-neon-surface hover:bg-cyan/20 text-slate-200 hover:text-cyan text-[11px] font-bold transition-all interactive-tap flex items-center justify-center gap-1"
                  title="Curvar el trazo hacia adentro"
                >
                  ⤵ Int.
                </button>
                <button
                  type="button"
                  onClick={handleStraighten}
                  className="py-2 rounded-xl bg-neon-surface hover:bg-coral/20 text-slate-200 hover:text-coral text-[11px] font-bold transition-all interactive-tap flex items-center justify-center gap-1"
                  title="Hacer el trazo recto"
                >
                  — Recta
                </button>
              </div>
            </div>

            {/* Acciones del Nodo de Tiempo */}
            <div className="space-y-2 pt-2">
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
                Eliminar Nodo de Tiempo
              </button>
            </div>
          </div>
        )}

        {/* ── Inspector para Nodos de Posición Estándar: Acento Menta Neón ─── */}
        {selectedPoint && selectedPoint.kind !== 'time' && (
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

            {/* ── Subdivisión por Nodos de Tiempo (Opcional) ─── */}
            <div className="bg-neon-card shadow-soft-elevation rounded-2xl p-3.5 space-y-3 border border-amber-500/20">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-[10px] font-bold text-amber-400 uppercase tracking-wider">
                  <Timer className="w-3.5 h-3.5" />
                  Nodos de Tiempo (Opcional)
                </span>
                {hasTimeNodesInSegment && (
                  <span className="text-[9px] font-mono px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-bold">
                    {timeNodesInSegment.length} tiempos
                  </span>
                )}
              </div>

              <p className="text-[11px] text-slate-400 leading-snug">
                Divide el trayecto hacia el siguiente nodo en tiempos musicales armónicos (2 a 15 tiempos) o actívalo en modo libre tocando la pista.
              </p>

              {/* Selector de cantidad fija de tiempos (2 a 15) */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[10px] text-slate-400">
                  <span>Tiempos a insertar:</span>
                  <span className="font-mono font-bold text-amber-400">{presetTimeCount} tiempos</span>
                </div>
                <div className="flex items-center gap-1">
                  {[2, 3, 4, 6, 8, 12, 15].map((cnt) => (
                    <button
                      key={cnt}
                      type="button"
                      onClick={() => setPresetTimeCount(cnt)}
                      className={[
                        'flex-1 py-1 rounded-lg text-xs font-mono font-bold transition-all',
                        presetTimeCount === cnt
                          ? 'bg-amber-500 text-black shadow-sm'
                          : 'bg-neon-surface text-slate-400 hover:text-white',
                      ].join(' ')}
                    >
                      {cnt}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => insertPredefinedTimeNodes(selectedPoint.id, presetTimeCount)}
                  className="flex-1 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500 text-amber-300 hover:text-black font-bold text-xs transition-colors interactive-tap shadow-soft-elevation flex items-center justify-center gap-1.5"
                >
                  <Timer className="w-3.5 h-3.5" />
                  Insertar {presetTimeCount} Tiempos
                </button>
                {hasTimeNodesInSegment && (
                  <button
                    type="button"
                    onClick={() => clearTimeNodesForSegment(selectedPoint.id)}
                    className="px-3 py-2 rounded-xl bg-coral/15 hover:bg-coral text-coral hover:text-white font-bold text-xs transition-colors interactive-tap"
                    title="Quitar nodos de tiempo de este segmento"
                  >
                    Limpiar
                  </button>
                )}
              </div>
            </div>

            {/* Curvatura del Trazo y Tiradores Bézier */}
            <div className="p-3 bg-neon-card/70 rounded-2xl border border-cyan/20 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-cyan flex items-center gap-1.5">
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                  Curvatura del Trazo
                </span>
                <span className="text-[9px] font-mono px-2 py-0.5 rounded-full bg-cyan/15 text-cyan font-bold">
                  Spline en Línea
                </span>
              </div>

              <p className="text-[11px] text-slate-300 leading-snug">
                Arrastra los puntos sobre la línea o la propia curva para esculpirla con suavidad continua sin crear nodos de posición.
              </p>

              <div className="grid grid-cols-3 gap-1.5 pt-1">
                <button
                  type="button"
                  onClick={() => handleApplyCurve('out')}
                  className="py-2 rounded-xl bg-neon-surface hover:bg-cyan/20 text-slate-200 hover:text-cyan text-[11px] font-bold transition-all interactive-tap flex items-center justify-center gap-1"
                  title="Curvar el trazo hacia afuera"
                >
                  ⤴ Ext.
                </button>
                <button
                  type="button"
                  onClick={() => handleApplyCurve('in')}
                  className="py-2 rounded-xl bg-neon-surface hover:bg-cyan/20 text-slate-200 hover:text-cyan text-[11px] font-bold transition-all interactive-tap flex items-center justify-center gap-1"
                  title="Curvar el trazo hacia adentro"
                >
                  ⤵ Int.
                </button>
                <button
                  type="button"
                  onClick={handleStraighten}
                  className="py-2 rounded-xl bg-neon-surface hover:bg-coral/20 text-slate-200 hover:text-coral text-[11px] font-bold transition-all interactive-tap flex items-center justify-center gap-1"
                  title="Hacer el trazo recto"
                >
                  — Recta
                </button>
              </div>
            </div>

            {/* Acciones del Nodo */}
            <div className="space-y-2 pt-2">
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
