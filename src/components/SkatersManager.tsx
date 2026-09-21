import React, { useState } from 'react';
import { 
  Users, 
  UserPlus, 
  Plus, 
  Trash2, 
  Download, 
  Upload
} from 'lucide-react';
import {
  Skater,
  Program,
  SkaterCategoryReglamento,
  SkaterEficiencia,
} from '../types';
import {
  EFICIENCIAS_DISPONIBLES,
  getCategoriaByEdad,
  getDescripcionCategoria,
} from '../constants/reglamento';
import { dbService } from '../services/db';

interface SkatersManagerProps {
  skaters: Skater[];
  selectedSkater: Skater | null;
  onSelectSkater: (skater: Skater) => void;
  onRefreshData: () => void;
  programs: Program[];
  selectedProgram: Program | null;
  onSelectProgram: (program: Program) => void;
}

/**
 * Categorías OFICIALES del Reglamento 2026.
 * Es exactamente la misma estructura de datos que alimenta el panel de
 * Reglamento, de modo que el perfil del atleta y el motor de cálculo nunca
 * divergen.
 */
const CATEGORIAS_REGLAMENTO: SkaterCategoryReglamento[] = ['TOT', 'MINI', 'ESPOIR', 'CADET', 'MAYOR'];

/** Rango de edad soportado por el reglamento (TOT a MAYOR). */
const EDADES_DISPONIBLES: number[] = Array.from({ length: 28 }, (_, i) => i + 3); // 3..30

/** Duraciones reglamentarias habituales (segundos) para evitar errores de tipeo. */
const DURACIONES_REGLAMENTO: number[] = [60, 90, 120, 150, 180, 210, 240, 270, 300, 330, 360];

const formatDuracion = (sec: number): string => {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, '0')} min (${sec}s)`;
};

export const SkatersManager: React.FC<SkatersManagerProps> = ({
  skaters,
  selectedSkater,
  onSelectSkater,
  onRefreshData,
  programs,
  selectedProgram,
  onSelectProgram
}) => {
  // New Skater Modal / Form State
  const [showNewSkaterModal, setShowNewSkaterModal] = useState(false);
  const [newSkaterName, setNewSkaterName] = useState('');
  const [newSkaterAge, setNewSkaterAge] = useState<number>(12);
  const [newSkaterCat, setNewSkaterCat] = useState<SkaterCategoryReglamento>('ESPOIR');
  const [newSkaterEficiencia, setNewSkaterEficiencia] = useState<SkaterEficiencia>('BÁSICA');
  const [newSkaterCatTouched, setNewSkaterCatTouched] = useState(false);
  const [newSkaterClub, setNewSkaterClub] = useState('');

  // New Program Modal / Form State
  const [showNewProgramModal, setShowNewProgramModal] = useState(false);
  const [newProgTitle, setNewProgTitle] = useState('');
  const [newProgDurationSec, setNewProgDurationSec] = useState(240); // 4 min default
  const [newProgCustomDuration, setNewProgCustomDuration] = useState(false);

  // Backup / JSON status
  const [statusMessage, setStatusMessage] = useState<{ text: string; isError?: boolean } | null>(null);

  const handleCreateSkater = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSkaterName.trim()) return;

    const newSkater: Skater = {
      id: `skater-${Date.now()}`,
      name: newSkaterName.trim(),
      category: newSkaterCat,
      age: newSkaterAge,
      eficiencia: newSkaterEficiencia,
      club: newSkaterClub.trim() || undefined,
      created_at: Date.now()
    };

    await dbService.saveSkater(newSkater);
    setNewSkaterName('');
    setNewSkaterClub('');
    setNewSkaterCatTouched(false);
    setShowNewSkaterModal(false);
    onRefreshData();
    onSelectSkater(newSkater);
    setStatusMessage({ text: `Atleta "${newSkater.name}" creado con éxito` });
  };

  /**
   * Al cambiar la edad se recalcula automáticamente la categoría oficial
   * (Reglamento 2026), salvo que la entrenadora la haya fijado a mano.
   */
  const handleAgeChange = (age: number) => {
    setNewSkaterAge(age);
    if (!newSkaterCatTouched) {
      setNewSkaterCat(getCategoriaByEdad(age));
    }
  };

  const handleCategoryChange = (cat: SkaterCategoryReglamento) => {
    setNewSkaterCat(cat);
    setNewSkaterCatTouched(true);
  };

  const handleDeleteSkater = async (id: string, name: string) => {
    if (window.confirm(`¿Estás seguro de eliminar a ${name} y todos sus programas?`)) {
      await dbService.deleteSkater(id);
      onRefreshData();
      setStatusMessage({ text: `Atleta "${name}" eliminado` });
    }
  };

  const handleCreateProgram = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSkater || !newProgTitle.trim()) return;

    const durMs = newProgDurationSec * 1000;
    const newProg: Program = {
      id: `prog-${Date.now()}`,
      skater_id: selectedSkater.id,
      title: newProgTitle.trim(),
      duration_ms: durMs,
      half_time_ms: Math.round(durMs / 2),
      choreography_path: [
        { id: 'pt-1', x: 5, y: 12.5, time_ms: 0, label: '', isMainNode: true },
        { id: 'pt-2', x: 25, y: 12.5, time_ms: Math.round(durMs / 2), label: '', isMainNode: true },
        { id: 'pt-3', x: 45, y: 12.5, time_ms: durMs, label: '', isMainNode: true }
      ],
      created_at: Date.now()
    };

    await dbService.saveProgram(newProg);
    setNewProgTitle('');
    setShowNewProgramModal(false);
    onRefreshData();
    onSelectProgram(newProg);
    setStatusMessage({ text: `Programa "${newProg.title}" creado con éxito` });
  };

  // JSON Export / Download
  const handleExportData = async () => {
    try {
      const json = await dbService.exportAllData();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `SkateCoreo_Backup_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setStatusMessage({ text: 'Copia de seguridad exportada con éxito' });
    } catch (err: any) {
      setStatusMessage({ text: 'Error al exportar datos: ' + err.message, isError: true });
    }
  };

  // JSON Import
  const handleImportData = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const text = evt.target?.result as string;
        const res = await dbService.importData(text);
        onRefreshData();
        setStatusMessage({ text: `Importados ${res.skatersCount} atletas y ${res.programsCount} programas` });
      } catch (err: any) {
        setStatusMessage({ text: 'Error al importar archivo: ' + err.message, isError: true });
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="space-y-6">
      
      {/* Notifications banner */}
      {statusMessage && (
        <div className={`p-3 rounded-xl border text-xs flex items-center justify-between transition-all ${
          statusMessage.isError 
            ? 'bg-red-950/80 border-red-500/50 text-red-200' 
            : 'bg-emerald-950/80 border-emerald-500/50 text-emerald-200'
        }`}>
          <span>{statusMessage.text}</span>
          <button onClick={() => setStatusMessage(null)} className="p-1 hover:opacity-75">✕</button>
        </div>
      )}

      {/* Header and Controls */}
      <div className="bg-zinc-950 border border-sky-900/50 rounded-2xl p-5 shadow-xl flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-sky-400 flex items-center gap-2">
            <Users className="w-5 h-5 text-sky-400" />
            Gestión de Atletas y Programas Coreográficos
          </h2>
          <p className="text-xs text-sky-300/80 mt-0.5">
            Base de datos local en <code className="text-sky-400 font-mono">IndexedDB</code> estructurada según el PRD con persistencia anti-evicción.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowNewSkaterModal(true)}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-sky-600 hover:bg-amber-400 hover:text-zinc-950 active:bg-amber-400 active:text-zinc-950 text-white font-bold text-xs shadow-md border border-sky-500 transition-all touch-target"
          >
            <UserPlus className="w-4 h-4" />
            <span>Nuevo Atleta</span>
          </button>

          <button
            onClick={handleExportData}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-sky-950/70 hover:bg-amber-400 hover:text-zinc-950 text-sky-300 border border-sky-800 text-xs font-semibold transition-all"
            title="Exportar base de datos a archivo JSON"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Exportar JSON</span>
          </button>

          <label className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-sky-950/70 hover:bg-amber-400 hover:text-zinc-950 text-sky-300 border border-sky-800 text-xs font-semibold cursor-pointer transition-all">
            <Upload className="w-3.5 h-3.5" />
            <span>Importar JSON</span>
            <input type="file" accept=".json" onChange={handleImportData} className="hidden" />
          </label>
        </div>
      </div>

      {/* Skaters and Programs Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Left Column: Skaters List */}
        <div className="bg-zinc-950 border border-sky-900/50 rounded-2xl p-4 shadow-xl space-y-3">
          <div className="flex items-center justify-between border-b border-sky-900/50 pb-3">
            <h3 className="text-xs font-bold text-sky-400 uppercase tracking-wider">
              Atletas Registrados ({skaters.length})
            </h3>
          </div>

          <div className="space-y-2 max-h-[480px] overflow-y-auto pr-1">
            {skaters.length === 0 ? (
              <div className="text-center py-10 text-sky-400/50 text-xs">
                No hay atletas registrados. Crea uno nuevo para comenzar.
              </div>
            ) : (
              skaters.map(skater => {
                const isSelected = selectedSkater?.id === skater.id;
                return (
                  <div
                    key={skater.id}
                    onClick={() => onSelectSkater(skater)}
                    className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                      isSelected
                        ? 'bg-sky-950/80 border-amber-400 shadow-md shadow-amber-400/10'
                        : 'bg-zinc-900/60 border-sky-950 hover:bg-sky-950/40'
                    }`}
                  >
                    <div>
                      <h4 className={`font-bold text-sm ${isSelected ? 'text-amber-300' : 'text-sky-300'}`}>{skater.name}</h4>
                      <div className="flex items-center gap-2 mt-1 text-[11px] text-sky-400/80">
                        <span className="font-mono text-sky-400 font-semibold">{skater.category}</span>
                        {skater.club && <span>• {skater.club}</span>}
                      </div>
                    </div>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteSkater(skater.id, skater.name);
                      }}
                      className="text-sky-400/50 hover:text-red-400 p-1.5 rounded-lg transition-all"
                      title="Eliminar atleta"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right 2 Columns: Programs of Selected Skater */}
        <div className="md:col-span-2 bg-zinc-950 border border-sky-900/50 rounded-2xl p-5 shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-sky-900/50 pb-3">
            <div>
              <h3 className="text-sm font-bold text-sky-400">
                Programas de {selectedSkater ? selectedSkater.name : 'Atleta'}
              </h3>
              <p className="text-xs text-sky-300/80">
                Coreografías, audio vinculado y puntos de trazado 2D.
              </p>
            </div>

            {selectedSkater && (
              <button
                onClick={() => setShowNewProgramModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-sky-950/70 hover:bg-amber-400 hover:text-zinc-950 text-sky-300 border border-sky-800 text-xs font-bold transition-all touch-target shadow-sm"
              >
                <Plus className="w-4 h-4 text-amber-400" />
                <span>Nuevo Programa</span>
              </button>
            )}
          </div>

          {!selectedSkater ? (
            <div className="text-center py-16 text-sky-400/50 text-xs">
              Selecciona un atleta en la lista izquierda para ver o crear sus programas.
            </div>
          ) : programs.length === 0 ? (
            <div className="text-center py-16 text-sky-400/50 text-xs">
              Este atleta aún no tiene programas asignados. Crea uno con el botón "Nuevo Programa".
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {programs.map(prog => {
                const isSelected = selectedProgram?.id === prog.id;
                const durMin = Math.floor(prog.duration_ms / 60000);
                const durSec = Math.floor((prog.duration_ms % 60000) / 1000);

                return (
                  <div
                    key={prog.id}
                    onClick={() => onSelectProgram(prog)}
                    className={`p-4 rounded-xl border transition-all cursor-pointer space-y-2.5 ${
                      isSelected
                        ? 'bg-sky-950/80 border-amber-400 shadow-md shadow-amber-400/10'
                        : 'bg-zinc-900/60 border-sky-950 hover:bg-sky-950/40'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <h4 className={`font-bold text-sm truncate ${isSelected ? 'text-amber-300' : 'text-sky-300'}`}>{prog.title}</h4>
                      {isSelected && <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-400 text-zinc-950 font-black border border-amber-300">ACTIVO</span>}
                    </div>

                    <div className="text-xs font-mono text-slate-400 space-y-1">
                      <div className="flex items-center justify-between">
                        <span>Duración:</span>
                        <strong className="text-slate-200">{durMin}:{durSec.toString().padStart(2, '0')} min</strong>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Mitad (Factor T):</span>
                        <strong className="text-amber-400">{(prog.half_time_ms / 1000).toFixed(0)}s</strong>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Puntos Pista:</span>
                        <strong className="text-sky-400">{prog.choreography_path.length}</strong>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>

      {/* New Skater Modal */}
      {showNewSkaterModal && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <form onSubmit={handleCreateSkater} className="bg-skate-panel border border-skate-border rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-sky-400" />
              Registrar Nuevo Atleta
            </h3>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-300 font-medium mb-1">Nombre Completo:</label>
                <input
                  type="text"
                  required
                  placeholder="ej. Martina Gómez"
                  value={newSkaterName}
                  onChange={(e) => setNewSkaterName(e.target.value)}
                  className="w-full bg-skate-bg border border-skate-border rounded-xl px-3 py-2 text-white outline-none focus:border-sky-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="min-w-0">
                  <label className="mb-1 block text-slate-300 font-medium">Edad:</label>
                  <select
                    value={newSkaterAge}
                    onChange={(e) => handleAgeChange(parseInt(e.target.value, 10))}
                    className="w-full rounded-xl border border-skate-border bg-skate-bg px-3 py-2 text-white outline-none focus:border-sky-500"
                  >
                    {EDADES_DISPONIBLES.map((edad) => (
                      <option key={edad} value={edad}>
                        {edad} años
                      </option>
                    ))}
                  </select>
                </div>

                <div className="min-w-0">
                  <label className="mb-1 block text-slate-300 font-medium">Categoría Oficial:</label>
                  <select
                    value={newSkaterCat}
                    onChange={(e) => handleCategoryChange(e.target.value as SkaterCategoryReglamento)}
                    className="w-full rounded-xl border border-skate-border bg-skate-bg px-3 py-2 text-white outline-none focus:border-sky-500"
                  >
                    {CATEGORIAS_REGLAMENTO.map((c) => (
                      <option key={c} value={c}>
                        {c} · {getDescripcionCategoria(c)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <p className="rounded-xl border border-sky-900/60 bg-sky-950/40 px-3 py-2 text-[11px] text-sky-300">
                Categoría sugerida por Reglamento 2026 para {newSkaterAge} años:{' '}
                <strong className="font-mono font-black text-amber-300">
                  {getCategoriaByEdad(newSkaterAge)}
                </strong>{' '}
                ({getDescripcionCategoria(getCategoriaByEdad(newSkaterAge))})
                {newSkaterCatTouched && newSkaterCat !== getCategoriaByEdad(newSkaterAge) && (
                  <span className="ml-1 text-amber-400">
                    · Ajustada manualmente a {newSkaterCat}
                  </span>
                )}
              </p>

              <div>
                <label className="mb-1 block text-slate-300 font-medium">Nivel de Eficiencia:</label>
                <select
                  value={newSkaterEficiencia}
                  onChange={(e) => setNewSkaterEficiencia(e.target.value as SkaterEficiencia)}
                  className="w-full rounded-xl border border-skate-border bg-skate-bg px-3 py-2 text-white outline-none focus:border-sky-500"
                >
                  {EFICIENCIAS_DISPONIBLES.map((eff) => (
                    <option key={eff} value={eff}>
                      {eff}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Club / Federación (Opcional):</label>
                <input
                  type="text"
                  placeholder="ej. CPA Barcelona"
                  value={newSkaterClub}
                  onChange={(e) => setNewSkaterClub(e.target.value)}
                  className="w-full bg-skate-bg border border-skate-border rounded-xl px-3 py-2 text-white outline-none focus:border-sky-500"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowNewSkaterModal(false)}
                className="px-4 py-2 rounded-xl bg-skate-card text-slate-300 text-xs font-semibold hover:bg-slate-700"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-bold shadow-md"
              >
                Guardar Atleta
              </button>
            </div>
          </form>
        </div>
      )}

      {/* New Program Modal */}
      {showNewProgramModal && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <form onSubmit={handleCreateProgram} className="bg-skate-panel border border-skate-border rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Plus className="w-5 h-5 text-emerald-400" />
              Nuevo Programa Coreográfico
            </h3>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-300 font-medium mb-1">Título del Programa:</label>
                <input
                  type="text"
                  required
                  placeholder="ej. Programa Corto - O Mio Babbino Caro"
                  value={newProgTitle}
                  onChange={(e) => setNewProgTitle(e.target.value)}
                  className="w-full bg-skate-bg border border-skate-border rounded-xl px-3 py-2 text-white outline-none focus:border-sky-500"
                />
              </div>

              <div>
                <label className="mb-1 block text-slate-300 font-medium">Duración Reglamentaria:</label>
                <select
                  value={newProgCustomDuration ? 'custom' : String(newProgDurationSec)}
                  onChange={(e) => {
                    if (e.target.value === 'custom') {
                      setNewProgCustomDuration(true);
                      return;
                    }
                    setNewProgCustomDuration(false);
                    setNewProgDurationSec(parseInt(e.target.value, 10));
                  }}
                  className="w-full rounded-xl border border-skate-border bg-skate-bg px-3 py-2 font-mono text-white outline-none focus:border-sky-500"
                >
                  {DURACIONES_REGLAMENTO.map((sec) => (
                    <option key={sec} value={sec}>
                      {formatDuracion(sec)}
                    </option>
                  ))}
                  <option value="custom">Personalizado…</option>
                </select>

                {newProgCustomDuration && (
                  <input
                    type="number"
                    required
                    min={30}
                    max={360}
                    value={newProgDurationSec}
                    onChange={(e) => setNewProgDurationSec(parseInt(e.target.value, 10) || 240)}
                    className="mt-2 w-full rounded-xl border border-skate-border bg-skate-bg px-3 py-2 font-mono text-white outline-none focus:border-sky-500"
                  />
                )}

                <span className="mt-1 block text-[11px] text-slate-500">
                  Cuarto/medio de programa para factor T: {(newProgDurationSec / 2)}s
                </span>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowNewProgramModal(false)}
                className="px-4 py-2 rounded-xl bg-skate-card text-slate-300 text-xs font-semibold hover:bg-slate-700"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold shadow-md"
              >
                Crear Programa
              </button>
            </div>
          </form>
        </div>
      )}

    </div>
  );
};
