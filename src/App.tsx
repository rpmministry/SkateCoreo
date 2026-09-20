/**
 * App.tsx — Cyber-Athletic Dark Mode Neon Architecture
 *
 * Fully integrated with:
 *  - Cargar Música (Input file)
 *  - Render Mixdown por hardware (OfflineAudioContext -> .WAV)
 *  - Formato Propietario .coreo (Exportar/Importar Bundle con JSZip)
 *  - Modo Entrenamiento 100% Offline Zero-Network (IndexedDB)
 *  - Botón "Limpiar Toda la Pista 2D" en un solo toque
 *  - Atribución AlsisTech con enlace a alsiztech.com
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Play, Pause, Square, Music,
  Menu, X, ChevronDown, MoreVertical,
  Undo2, Route, PenTool, Eraser, Users,
  Upload, Save, Trash2, HardDrive
} from 'lucide-react';
import { Skater, Program, ElementLog, AudioEngineState } from './types';
import { RinkCanvas } from './components/RinkCanvas';
import { InteractiveWaveform } from './components/InteractiveWaveform';
import { LeftSidebarPanel } from './components/LeftSidebarPanel';
import { RightInspectorPanel } from './components/RightInspectorPanel';
import { SkatersManager } from './components/SkatersManager';
import { dbService, OfflineSessionRecord } from './services/db';
import { audioEngine } from './services/audioEngine';
import { useChoreographyStore } from './store/useChoreographyStore';
import { renderChoreographyMixdown } from './core/audio/audioMixdown';
import { exportCoreoProject, importCoreoProject } from './services/coreoPackage';
import { ProtectedLayout } from './components/ProtectedLayout';
import { AudioStudioView } from './components/AudioStudio/AudioStudioView';
import { NodePlacementTray } from './components/NodePlacementTray';

// ── Helpers ────────────────────────────────────────────────────
const fmtTime = (ms: number): string => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
};

// ── Component ──────────────────────────────────────────────────
export function App() {

  // ── Modos de Vista: Pista 2D vs Estudio de Audio (DAW Lite) ──
  const [activeView, setActiveView] = useState<'rink' | 'studio'>('rink');
  const unplacedNodes = useChoreographyStore((s) => s.unplacedNodes);

  // ── DB / domain state ──────────────────────────────────
  const [skaters, setSkaters] = useState<Skater[]>([]);
  const [selectedSkater, setSelectedSkater] = useState<Skater | null>(null);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [selectedProgram, setSelectedProgram] = useState<Program | null>(null);
  const [elements, setElements] = useState<ElementLog[]>([]);

  // ── Audio ──────────────────────────────────────────────
  const [audioState, setAudioState] = useState<AudioEngineState>(audioEngine.getState());
  const [currentTimeMs, setCurrentTimeMs] = useState(0);

  // ── Mobile overlay state ───────────────────────────────
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [sheetOpen, setSheetOpen]   = useState(false);

  // ── UI Dropdowns & Indicators ───────────────────────────
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [isExportingMix, setIsExportingMix] = useState(false);
  const [isSavingOffline, setIsSavingOffline] = useState(false);
  const [savedOfflineSuccess, setSavedOfflineSuccess] = useState(false);
  const [showSkaters, setShowSkaters] = useState(false);
  const [preRollSec, setPreRollSec]   = useState(3);

  // Input file hidden refs
  const audioInputRef = useRef<HTMLInputElement | null>(null);
  const coreoInputRef = useRef<HTMLInputElement | null>(null);

  // ── Zustand ────────────────────────────────────────────
  const undo              = useChoreographyStore((s) => s.undo);
  const history           = useChoreographyStore((s) => s.history);
  const phase             = useChoreographyStore((s) => s.phase);
  const setPhase          = useChoreographyStore((s) => s.setPhase);
  const points            = useChoreographyStore((s) => s.points);
  const clearAllPoints    = useChoreographyStore((s) => s.clearAllPoints);
  const loadProgramPoints = useChoreographyStore((s) => s.loadProgramPoints);

  // ── Data loading & Offline Autoload ─────────────────────
  const loadData = useCallback(async () => {
    await dbService.seedInitialData();
    const allSkaters = await dbService.getAllSkaters();
    setSkaters(allSkaters);
    if (allSkaters.length > 0) {
      const active = selectedSkater || allSkaters[0];
      setSelectedSkater(active);
      const progs = await dbService.getProgramsBySkater(active.id);
      setPrograms(progs);
      if (progs.length > 0) {
        const prog = selectedProgram || progs[0];
        setSelectedProgram(prog);
        setElements(await dbService.getElementsByProgram(prog.id));
      }
    }

    // Auto-recuperar sesión sin conexión de IndexedDB si no hay audio cargado
    try {
      const offlineRecord = await dbService.getOfflineSession();
      if (offlineRecord && !audioEngine.getState().hasAudioLoaded) {
        await audioEngine.loadAudioFile(offlineRecord.audioBlob, offlineRecord.audioFileName);
        if (offlineRecord.points && offlineRecord.points.length > 0) {
          loadProgramPoints(offlineRecord.points);
        }
      }
    } catch (e) {
      console.warn('No se pudo restaurar la sesión offline de IndexedDB:', e);
    }
  }, [selectedSkater, selectedProgram, loadProgramPoints]);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Audio subscriptions ───────────────────────────────
  useEffect(() => {
    const u1 = audioEngine.onStateChange(setAudioState);
    const u2 = audioEngine.onTimeUpdate(setCurrentTimeMs);
    return () => { u1(); u2(); };
  }, []);

  // ── Handlers ──────────────────────────────────────────
  const handleSelectSkater = async (skater: Skater) => {
    setSelectedSkater(skater);
    const progs = await dbService.getProgramsBySkater(skater.id);
    setPrograms(progs);
    if (progs.length > 0) {
      setSelectedProgram(progs[0]);
      setElements(await dbService.getElementsByProgram(progs[0].id));
    } else {
      setSelectedProgram(null);
      setElements([]);
    }
  };

  const handleSelectProgram = async (program: Program) => {
    setSelectedProgram(program);
    setElements(await dbService.getElementsByProgram(program.id));
  };

  const handleProgramUpdated = async (updated: Program) => {
    setSelectedProgram(updated);
    await dbService.saveProgram(updated);
    setPrograms((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
  };

  const handleUndo = useCallback(() => undo(), [undo]);

  // Limpiar toda la pista 2D en un solo toque
  const handleClearRink = useCallback(() => {
    if (points.length === 0) return;
    if (window.confirm(`¿Limpiar toda la pista 2D? Se eliminarán los ${points.length} nodos creados.`)) {
      clearAllPoints();
      audioEngine.setNodes([]);
      if (selectedProgram) {
        handleProgramUpdated({
          ...selectedProgram,
          choreography_path: []
        });
      }
    }
  }, [points.length, clearAllPoints, selectedProgram]);

  const handleResetDemo = async () => {
    const store = useChoreographyStore.getState();
    if (store.points.length > 0 && !window.confirm('¿Reemplazar nodos con la coreografía demo?')) return;
    const { DEFAULT_CHOREOGRAPHY_POINTS } = await import('./store/useChoreographyStore');
    store.pushHistory();
    store.loadProgramPoints(DEFAULT_CHOREOGRAPHY_POINTS);
    try { await audioEngine.generateDemoTrack(); } catch { /* ignore */ }
  };

  const handleNodeSelect = useCallback((id: string | null) => {
    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
      setSheetOpen(!!id);
    }
  }, []);

  const handleDragChange = useCallback((isDragging: boolean) => {
    if (isDragging) {
      setSheetOpen(false);
      setDrawerOpen(false);
    }
  }, []);

  // Cleanup de selección cuando se cierra el bottom sheet en móvil
  useEffect(() => {
    if (!sheetOpen && typeof window !== 'undefined' && window.innerWidth < 1024) {
      useChoreographyStore.getState().setSelectedPointId(null);
    }
  }, [sheetOpen]);

  // ── 1. Cargar Música desde archivo del dispositivo ─────
  const handleMusicFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await audioEngine.loadAudioFile(file, file.name);
    } catch (err: any) {
      alert('Error al cargar audio: ' + (err?.message || 'Archivo no compatible'));
    }
  };

  // ── 2. Exportar Mezcla de Entrenamiento (.WAV) con OfflineAudioContext ──
  const handleExportMixdown = async () => {
    const buffer = audioEngine.getAudioBuffer();
    if (!buffer) {
      alert('Primero debes cargar una pista de música para exportar la mezcla.');
      return;
    }
    setIsExportingMix(true);
    setShowExportMenu(false);
    try {
      const metroConfig = audioEngine.metronome.getConfig();
      const wavBlob = await renderChoreographyMixdown({
        musicBuffer: buffer,
        bpm: metroConfig.bpm,
        beatsPerMeasure: metroConfig.beatsPerMeasure,
        metronomeEnabled: metroConfig.enabled,
        musicVolume: 1.0,
        metronomeVolume: metroConfig.volume,
        points,
      });

      // Disparar descarga directa
      const url = URL.createObjectURL(wavBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${(audioState.fileName || 'mezcla_coreo').replace(/\.[^/.]+$/, '')}_mix.wav`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert('Error al renderizar mezcla de audio: ' + err?.message);
    } finally {
      setIsExportingMix(false);
    }
  };

  // ── 3. Exportar Proyecto Propietario (.coreo) ──────────
  const handleExportCoreo = async () => {
    setShowExportMenu(false);
    try {
      const rawBlob = audioEngine.getRawAudioBlob();
      const metroConfig = audioEngine.metronome.getConfig();
      const coreoBlob = await exportCoreoProject(
        selectedProgram?.title || 'Rutina Patinaje',
        selectedSkater?.category || 'Standard',
        useChoreographyStore.getState().skaterGender,
        points,
        rawBlob,
        audioState.fileName,
        metroConfig.bpm,
        metroConfig.beatsPerMeasure
      );

      const url = URL.createObjectURL(coreoBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${(selectedProgram?.title || 'coreografia').replace(/\s+/g, '_')}.coreo`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert('Error al exportar proyecto .coreo: ' + err?.message);
    }
  };

  // ── 4. Importar Proyecto Propietario (.coreo) ──────────
  const handleImportCoreoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const project = await importCoreoProject(file);
      // Cargar audio si viene dentro del paquete
      if (project.audioBlob) {
        await audioEngine.loadAudioFile(project.audioBlob, project.manifest.audioMeta.fileName);
      }
      // Restaurar nodos en el Canvas
      loadProgramPoints(project.points);
      audioEngine.setNodes(project.points);
      alert(`¡Proyecto "${project.manifest.program.title}" importado con éxito!`);
    } catch (err: any) {
      alert('Error al importar archivo .coreo: ' + err?.message);
    }
  };

  // ── 5. Modo Avión / Guardar para Entrenamiento Offline (IndexedDB) ──
  const handleSaveOffline = async () => {
    const rawBlob = audioEngine.getRawAudioBlob();
    if (!rawBlob) {
      alert('Carga primero una pista musical para guardar la sesión sin conexión.');
      return;
    }
    setIsSavingOffline(true);
    try {
      const sessionRecord: OfflineSessionRecord = {
        id: 'current_offline_session',
        audioBlob: rawBlob,
        audioFileName: audioState.fileName || 'musica_offline.wav',
        points,
        programTitle: selectedProgram?.title || 'Entrenamiento Offline',
        savedAt: Date.now()
      };
      await dbService.saveOfflineSession(sessionRecord);
      setSavedOfflineSuccess(true);
      setTimeout(() => setSavedOfflineSuccess(false), 3000);
    } catch (err: any) {
      alert('No se pudo guardar en IndexedDB: ' + err?.message);
    } finally {
      setIsSavingOffline(false);
    }
  };

  // ── Derived ───────────────────────────────────────────
  const isAudioActive = audioState.isPlaying || audioState.isPreRollActive;
  const canDraw = points.length >= 2;

  // ── Render ────────────────────────────────────────────
  return (
    <ProtectedLayout>
      <div className="h-dvh w-screen overflow-hidden flex flex-col bg-neon-canvas text-white select-none font-sans">

        {/* Hidden file inputs */}
      <input
        ref={audioInputRef}
        type="file"
        accept="audio/*,.mp3,.wav,.m4a,.aac"
        className="hidden"
        onChange={handleMusicFileChange}
      />
      <input
        ref={coreoInputRef}
        type="file"
        accept=".coreo,.skate,.zip"
        className="hidden"
        onChange={handleImportCoreoChange}
      />

      {/* ═══════════════════════════════════════════════
          HEADER — Pro Dark Console (h-12 / landscape-compact-header)
          ═══════════════════════════════════════════════ */}
      <header className="h-12 landscape-compact-header shrink-0 flex items-center justify-between px-3 sm:px-4 bg-neon-surface/95 backdrop-blur-md border-b border-white/10 z-20">

        {/* ── ZONA 1 (Izquierda): Identidad SkateArt + Contexto Atleta ── */}
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="lg:hidden flex items-center justify-center w-8 h-8 rounded-xl text-slate-400 hover:text-white hover:bg-white/5 interactive-tap shrink-0"
            aria-label="Abrir menú"
          >
            <Menu className="w-4 h-4 stroke-[1.75]" />
          </button>

          <div className="flex items-center gap-2 min-w-0">
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="w-2.5 h-2.5 rounded-full bg-cyan shadow-glow-cyan" />
              <span className="text-[13px] font-black uppercase tracking-wider text-white">SkateArt</span>
            </div>
            <span className="text-slate-600 text-xs hidden sm:inline">·</span>
            <span className="text-[11px] text-slate-400 font-medium hidden sm:inline truncate">
              por{' '}
              <a
                href="https://www.alsiztech.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-slate-300 hover:text-cyan hover:underline transition-colors"
              >
                AlsisTech
              </a>
            </span>
          </div>

          {/* Contexto del Atleta Activo */}
          <div className="hidden md:flex items-center gap-1.5 pl-3 border-l border-white/10 text-xs min-w-0">
            <span className="font-semibold text-slate-200 truncate max-w-[110px]" title={selectedSkater?.name}>
              {selectedSkater?.name || 'Sin Atleta'}
            </span>
            {selectedSkater?.category && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-white/5 text-cyan border border-white/10 shrink-0">
                {selectedSkater.category}
              </span>
            )}
          </div>
        </div>

        {/* ── ZONA 2 (Centro): Herramientas Desktop & Master Audio Transport ── */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Herramientas de Trazado (Exclusivo Desktop lg+) */}
          <div className="hidden lg:flex items-center bg-white/[0.04] p-0.5 rounded-xl border border-white/10 gap-0.5 shadow-soft-elevation">
            <button
              type="button"
              onClick={() => {
                setPhase('plot');
                useChoreographyStore.getState().setSelectedPointId(null);
              }}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold transition-all interactive-tap ${
                phase === 'plot'
                  ? 'bg-amber-500 text-black shadow-glow-amber font-black'
                  : 'text-slate-300 hover:text-white hover:bg-white/5'
              }`}
              title="Modo Nodos: Coloca puntos clave"
            >
              <PenTool className="w-3.5 h-3.5 stroke-[1.75]" />
              <span>Nodos</span>
            </button>
            <button
              type="button"
              onClick={() => {
                if (phase === 'curve') setPhase('plot');
                else if (canDraw) setPhase('curve');
                useChoreographyStore.getState().setSelectedPointId(null);
              }}
              disabled={!canDraw}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold transition-all interactive-tap ${
                phase === 'curve'
                  ? 'bg-cyan text-black shadow-glow-cyan font-black'
                  : 'text-slate-300 hover:text-white hover:bg-white/5 disabled:opacity-30 disabled:pointer-events-none'
              }`}
              title={canDraw ? 'Modo Trazado: Ver y deformar curvas' : 'Requiere al menos 2 nodos'}
            >
              <Route className="w-3.5 h-3.5 stroke-[1.75]" />
              <span>Trazar</span>
            </button>
            <button
              type="button"
              onClick={() => {
                if (phase === 'erase') setPhase('plot');
                else setPhase('erase');
                useChoreographyStore.getState().setSelectedPointId(null);
              }}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold transition-all interactive-tap ${
                phase === 'erase'
                  ? 'bg-red-500 text-white shadow-lg shadow-red-500/30 font-black'
                  : 'text-slate-300 hover:text-white hover:bg-white/5'
              }`}
              title="Modo Borrador: Toca cualquier nodo para eliminarlo"
            >
              <Eraser className="w-3.5 h-3.5 stroke-[1.75]" />
              <span>Borrar</span>
            </button>
          </div>

          {/* Master Transport Controls */}
          <div className="flex items-center gap-1.5 bg-white/[0.03] px-2 py-1 rounded-xl border border-white/10 shadow-soft-elevation">
            <button
              type="button"
              onClick={() => {
                if (isAudioActive) {
                  audioEngine.pause();
                } else {
                  if (phase === 'plot' && canDraw) setPhase('curve');
                  audioEngine.play();
                }
              }}
              disabled={!audioState.hasAudioLoaded}
              title={isAudioActive ? 'Pausar' : 'Reproducir'}
              className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all interactive-tap ${
                isAudioActive
                  ? 'bg-coral text-white shadow-glow-coral'
                  : 'bg-white/10 hover:bg-white/15 text-white'
              } disabled:opacity-25 disabled:pointer-events-none`}
            >
              {isAudioActive ? (
                <Pause className="w-3.5 h-3.5 fill-current stroke-none" />
              ) : (
                <Play className="w-3.5 h-3.5 fill-current stroke-none ml-0.5" />
              )}
            </button>

            <button
              type="button"
              onClick={() => audioEngine.stop()}
              disabled={!audioState.hasAudioLoaded}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 interactive-tap disabled:opacity-25 disabled:pointer-events-none"
              title="Detener"
            >
              <Square className="w-3 h-3 fill-current stroke-none" />
            </button>

            <div className="font-mono text-[11px] px-1.5 text-slate-300 flex items-center gap-1 select-none">
              <span className="text-cyan font-bold">{fmtTime(currentTimeMs)}</span>
              <span className="text-slate-600">/</span>
              <span className="text-slate-400">{fmtTime(audioState.durationMs || 240000)}</span>
            </div>
          </div>
        </div>

        {/* ── ZONA 3 (Derecha): CTA Principal & Menú de Desbordamiento Carbon ── */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Botón Estudio de Audio (DAW Lite) */}
          <button
            type="button"
            onClick={() => setActiveView((v) => (v === 'studio' ? 'rink' : 'studio'))}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all interactive-tap shadow-soft-elevation border ${
              activeView === 'studio'
                ? 'bg-cyan text-slate-950 border-white/20 shadow-glow-cyan font-black'
                : 'bg-white/[0.04] hover:bg-white/10 text-cyan border-cyan/30'
            }`}
            title="Abrir Estudio de Audio (DAW Lite multipista)"
          >
            <span>🎛️</span>
            <span className="hidden sm:inline">
              {activeView === 'studio' ? 'Ver Pista 2D' : 'Estudio de Audio'}
            </span>
            {unplacedNodes.length > 0 && activeView !== 'studio' && (
              <span className="w-4 h-4 rounded-full bg-amber-400 text-slate-950 text-[10px] font-black flex items-center justify-center animate-pulse">
                {unplacedNodes.length}
              </span>
            )}
          </button>

          {/* Botón Cargar Audio (CTA Primario) */}
          <button
            type="button"
            onClick={() => audioInputRef.current?.click()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-cyan/15 hover:bg-cyan/25 text-cyan border border-cyan/30 interactive-tap transition-all shadow-soft-elevation"
            title="Cargar archivo de música"
          >
            <Upload className="w-3.5 h-3.5 stroke-[1.75]" />
            <span className="hidden sm:inline">Cargar Audio</span>
          </button>

          {/* Menú de Desbordamiento Unificado (...) */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowExportMenu((v) => !v)}
              className="w-8 h-8 rounded-xl flex items-center justify-center bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 hover:text-white border border-white/10 interactive-tap transition-all"
              title="Más opciones del proyecto"
            >
              <MoreVertical className="w-4 h-4 stroke-[1.75]" />
            </button>

            {showExportMenu && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setShowExportMenu(false)}
                  aria-hidden="true"
                />
                <div className="absolute right-0 mt-2 w-64 rounded-2xl bg-neon-surface/98 backdrop-blur-xl border border-white/10 shadow-2xl p-2 z-50 flex flex-col gap-1 divide-y divide-white/5 animate-in fade-in zoom-in-95 duration-100">
                  <div className="space-y-1 pb-1">
                    <button
                      type="button"
                      onClick={() => {
                        setShowExportMenu(false);
                        setActiveView((v) => (v === 'studio' ? 'rink' : 'studio'));
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-left hover:bg-white/5 text-slate-200 hover:text-white transition-all"
                    >
                      <Music className="w-4 h-4 text-cyan shrink-0 stroke-[1.75]" />
                      <div>
                        <p className="font-semibold leading-tight">
                          {activeView === 'studio' ? 'Volver a Pista 2D' : 'Estudio de Audio (DAW)'}
                        </p>
                        <p className="text-[10px] text-slate-400 font-normal">
                          {activeView === 'studio' ? 'Ver lienzo y coreografía' : 'Editor multipista y marcadores'}
                        </p>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => { setShowExportMenu(false); handleSaveOffline(); }}
                      disabled={!audioState.hasAudioLoaded || isSavingOffline}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-left hover:bg-white/5 text-slate-200 hover:text-white transition-all disabled:opacity-40"
                    >
                      <HardDrive className="w-4 h-4 text-mint shrink-0 stroke-[1.75]" />
                      <div>
                        <p className="font-semibold leading-tight">{savedOfflineSuccess ? '¡Guardado!' : 'Modo Offline (IndexedDB)'}</p>
                        <p className="text-[10px] text-slate-400 font-normal">Guardar en memoria para usar sin red</p>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => { setShowExportMenu(false); setShowSkaters(true); }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-left hover:bg-white/5 text-slate-200 hover:text-white transition-all"
                    >
                      <Users className="w-4 h-4 text-cyan shrink-0 stroke-[1.75]" />
                      <div>
                        <p className="font-semibold leading-tight">Gestión de Atletas</p>
                        <p className="text-[10px] text-slate-400 font-normal">Cambiar patinador o programa</p>
                      </div>
                    </button>
                  </div>

                  <div className="space-y-1 py-1">
                    <button
                      type="button"
                      onClick={() => { setShowExportMenu(false); handleExportMixdown(); }}
                      disabled={!audioState.hasAudioLoaded || isExportingMix}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-left hover:bg-white/5 text-slate-200 hover:text-white transition-all disabled:opacity-40"
                    >
                      <Music className="w-4 h-4 text-coral shrink-0 stroke-[1.75]" />
                      <div>
                        <p className="font-semibold leading-tight">Exportar Mezcla (.WAV)</p>
                        <p className="text-[10px] text-slate-400 font-normal">Mixdown con metrónomo y cues</p>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => { setShowExportMenu(false); handleExportCoreo(); }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-left hover:bg-white/5 text-slate-200 hover:text-white transition-all"
                    >
                      <Save className="w-4 h-4 text-cyan shrink-0 stroke-[1.75]" />
                      <div>
                        <p className="font-semibold leading-tight">Exportar Paquete (.coreo)</p>
                        <p className="text-[10px] text-slate-400 font-normal">Bundle completo con audio y nodos 2D</p>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => { setShowExportMenu(false); coreoInputRef.current?.click(); }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-left hover:bg-white/5 text-slate-200 hover:text-white transition-all"
                    >
                      <Upload className="w-4 h-4 text-mint shrink-0 stroke-[1.75]" />
                      <div>
                        <p className="font-semibold leading-tight">Importar Paquete (.coreo)</p>
                        <p className="text-[10px] text-slate-400 font-normal">Cargar rutina previamente guardada</p>
                      </div>
                    </button>
                  </div>

                  <div className="pt-1">
                    <button
                      type="button"
                      onClick={() => { setShowExportMenu(false); handleClearRink(); }}
                      disabled={points.length === 0}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-left hover:bg-red-500/10 text-red-400 hover:text-red-300 transition-all disabled:opacity-30"
                    >
                      <Trash2 className="w-4 h-4 text-coral shrink-0 stroke-[1.75]" />
                      <div>
                        <p className="font-semibold leading-tight">Limpiar Toda la Pista</p>
                        <p className="text-[10px] text-red-400/70 font-normal">Reiniciar lienzo 2D en blanco</p>
                      </div>
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      {/* ═══════════════════════════════════════════════
          BODY — Audio Studio (DAW Lite) vs Pista 2D Tri-Column
          ═══════════════════════════════════════════════ */}
      {activeView === 'studio' ? (
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden relative">
          <AudioStudioView
            onExportToRink={() => setActiveView('rink')}
            onBackToRink={() => setActiveView('rink')}
          />
        </div>
      ) : (
        <>
          <div className="flex-1 min-h-0 flex flex-col landscape:flex-row lg:flex-row overflow-hidden relative">
            {/* Bandeja de Colocación de Nodos de Audio (Estricto Orden Secuencial) */}
            <NodePlacementTray onOpenAudioStudio={() => setActiveView('studio')} />

            {/* Backdrop for Mobile Drawers/Sheets (EXCLUSIVAMENTE MÓVIL: lg:hidden) */}
            {(drawerOpen || sheetOpen) && (
              <div
                className="lg:hidden fixed inset-0 z-40 bg-black/75 backdrop-blur-md transition-opacity"
                onClick={() => {
                  setDrawerOpen(false);
                  setSheetOpen(false);
                  useChoreographyStore.getState().setSelectedPointId(null);
                }}
                onTouchStart={(e) => e.stopPropagation()}
                onTouchMove={(e) => e.stopPropagation()}
                onTouchEnd={(e) => e.stopPropagation()}
                onWheel={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                aria-hidden="true"
              />
            )}

            {/* ── DESKTOP LEFT ASIDE (Preparación y Mezcla) ── */}
            <aside className="hidden lg:flex lg:w-[272px] xl:w-[288px] shrink-0 flex-col bg-neon-surface border-r border-white/5 overflow-hidden shadow-soft-elevation">
              <LeftSidebarPanel
                preRollSec={preRollSec}
                onPreRollSecChange={setPreRollSec}
                onUndo={handleUndo}
                onResetDemo={handleResetDemo}
                onClearRink={handleClearRink}
                onOpenAudioStudio={() => setActiveView('studio')}
              />
            </aside>

        {/* ── MOBILE / TABLET LANDSCAPE TOOLBAR (Figma Style Sidebar) ── */}
        <nav
          aria-label="Herramientas táctiles en modo horizontal"
          className="hidden landscape:flex lg:hidden w-14 shrink-0 flex-col items-center py-2 px-1 gap-1.5 bg-neon-surface/95 border-r border-white/5 z-30 overflow-y-auto"
        >
          {/* 1. Config / Menu */}
          <button
            type="button"
            onClick={() => { setDrawerOpen((o) => !o); setSheetOpen(false); }}
            className={[
              'w-11 h-11 shrink-0 flex flex-col items-center justify-center rounded-xl interactive-tap transition-all',
              drawerOpen ? 'text-cyan bg-cyan/15 shadow-glow-cyan' : 'text-slate-400 hover:text-white bg-neon-card hover:bg-neon-hover',
            ].join(' ')}
            title="Configuración y Audio"
          >
            <Menu className="w-4 h-4 stroke-[2]" />
            <span className="text-[9px] font-bold truncate-safe max-w-[44px]">Config</span>
          </button>

          {/* 2. Modo Nodos */}
          <button
            type="button"
            onClick={() => {
              setPhase('plot');
              setSheetOpen(false);
              useChoreographyStore.getState().setSelectedPointId(null);
            }}
            className={[
              'w-11 h-11 shrink-0 flex flex-col items-center justify-center rounded-xl interactive-tap transition-all',
              phase === 'plot'
                ? 'bg-amber-500 text-black shadow-glow-amber font-black'
                : 'text-slate-400 hover:text-white bg-neon-card hover:bg-neon-hover',
            ].join(' ')}
            title="Modo Nodos: Toca para colocar puntos"
          >
            <PenTool className="w-4 h-4 stroke-[2.5]" />
            <span className="text-[9px] font-bold truncate-safe max-w-[44px]">Nodos</span>
          </button>

          {/* 3. Modo Trazado */}
          <button
            type="button"
            onClick={() => {
              if (phase === 'curve') {
                setPhase('plot');
              } else if (canDraw) {
                setPhase('curve');
              }
              useChoreographyStore.getState().setSelectedPointId(null);
            }}
            disabled={!canDraw}
            className={[
              'w-11 h-11 shrink-0 flex flex-col items-center justify-center rounded-xl interactive-tap transition-all',
              phase === 'curve'
                ? 'bg-cyan text-black shadow-glow-cyan font-black'
                : 'text-slate-400 hover:text-white bg-neon-card hover:bg-neon-hover disabled:opacity-30 disabled:pointer-events-none',
            ].join(' ')}
            title={canDraw ? 'Modo Trazado: Ver y deformar curvas' : 'Mínimo 2 nodos'}
          >
            <Route className="w-4 h-4 stroke-[2.5]" />
            <span className="text-[9px] font-bold truncate-safe max-w-[44px]">Trazar</span>
          </button>

          {/* 4. Modo Borrador */}
          <button
            type="button"
            onClick={() => {
              if (phase === 'erase') {
                setPhase('plot');
              } else {
                setPhase('erase');
              }
              useChoreographyStore.getState().setSelectedPointId(null);
              setSheetOpen(false);
            }}
            className={[
              'w-11 h-11 shrink-0 flex flex-col items-center justify-center rounded-xl interactive-tap transition-all',
              phase === 'erase'
                ? 'bg-red-500 text-white shadow-lg shadow-red-500/40 font-black'
                : 'text-slate-400 hover:text-white bg-neon-card hover:bg-neon-hover',
            ].join(' ')}
            title="Modo Borrador: Toca cualquier nodo para eliminarlo"
          >
            <Eraser className="w-4 h-4 stroke-[2.5]" />
            <span className="text-[9px] font-bold truncate-safe max-w-[44px]">Borrar</span>
          </button>

          {/* 5. Limpiar Pista */}
          <button
            type="button"
            onClick={handleClearRink}
            disabled={points.length === 0}
            className="w-11 h-11 shrink-0 flex flex-col items-center justify-center rounded-xl text-slate-400 hover:text-coral bg-neon-card hover:bg-neon-hover interactive-tap disabled:opacity-20 disabled:pointer-events-none"
            title="Limpiar toda la pista"
          >
            <Trash2 className="w-4 h-4 text-coral stroke-[2]" />
            <span className="text-[9px] font-bold truncate-safe max-w-[44px]">Limpiar</span>
          </button>

          {/* 6. Deshacer */}
          <button
            type="button"
            onClick={undo}
            disabled={history.length === 0}
            className="w-11 h-11 shrink-0 flex flex-col items-center justify-center rounded-xl text-slate-400 hover:text-white bg-neon-card hover:bg-neon-hover interactive-tap disabled:opacity-20 disabled:pointer-events-none"
            title="Deshacer último cambio"
          >
            <Undo2 className="w-4 h-4 stroke-[2]" />
            <span className="text-[9px] font-bold truncate-safe max-w-[44px]">Deshacer</span>
          </button>

          {/* 7. Inspector de Nodo */}
          <button
            type="button"
            onClick={() => { setSheetOpen((o) => !o); setDrawerOpen(false); }}
            className={[
              'w-11 h-11 shrink-0 flex flex-col items-center justify-center rounded-xl interactive-tap transition-all',
              sheetOpen ? 'text-mint bg-mint/15 shadow-glow-mint' : 'text-slate-400 hover:text-white bg-neon-card hover:bg-neon-hover',
            ].join(' ')}
            title="Inspector de nodo seleccionado"
          >
            <ChevronDown className={`w-4 h-4 stroke-[2] transition-transform ${sheetOpen ? 'rotate-180' : ''}`} />
            <span className="text-[9px] font-bold truncate-safe max-w-[44px]">Nodo</span>
          </button>
        </nav>

        {/* ── CENTER WORKSPACE: 2D Rink Canvas + Waveform Timeline ── */}
        <main className="flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden bg-neon-canvas">

          {/* 2D Canvas Rink Engine — Zero Distortion */}
          <div className="flex-1 min-h-0 overflow-hidden">
            <RinkCanvas
              layoutMode="ide"
              currentProgram={selectedProgram}
              onProgramUpdated={handleProgramUpdated}
              elements={elements}
              onNodeSelect={handleNodeSelect}
              onDragChange={handleDragChange}
            />
          </div>

          {/* Interactive Waveform Strip (Área Inferior del Visor de Música) */}
          <div className="shrink-0 h-[22%] min-h-[75px] max-h-[160px] landscape-compact-waveform border-t border-white/5 bg-neon-surface/40 timeline-container">
            <InteractiveWaveform
              currentTimeMs={currentTimeMs}
              durationMs={audioState.durationMs}
              isPlaying={isAudioActive}
              onSeek={(ms) => audioEngine.seek(ms)}
              fileName={audioState.fileName}
            />
          </div>
        </main>

        {/* ── DESKTOP RIGHT ASIDE (Inspector de Nodo) ── */}
        <aside className="hidden lg:flex lg:w-[272px] xl:w-[288px] shrink-0 flex-col bg-neon-surface border-l border-white/5 overflow-hidden shadow-soft-elevation">
          <RightInspectorPanel onClose={() => useChoreographyStore.getState().setSelectedPointId(null)} />
        </aside>

        {/* ── MOBILE LEFT DRAWER (Configuración Global) ── */}
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Panel de configuración"
          className={[
            'lg:hidden fixed inset-y-0 left-0 z-50',
            'w-[85vw] max-w-[320px] flex flex-col',
            'bg-neon-surface shadow-2xl shadow-black/80',
            'transition-transform duration-ui ease-spring',
            drawerOpen ? 'translate-x-0' : '-translate-x-full',
          ].join(' ')}
          style={{
            maxHeight: '100dvh',
            overscrollBehavior: 'contain',
            WebkitOverflowScrolling: 'touch',
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
          {/* Drawer Top Handle */}
          <div className="shrink-0 h-14 flex items-center justify-between px-4 border-b border-white/5">
            <span className="text-xs font-black uppercase tracking-widest text-cyan">
              Preparación &amp; Audio
            </span>
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              className="min-w-touch min-h-touch flex items-center justify-center rounded-2xl text-slate-400 hover:text-white interactive-tap"
              aria-label="Cerrar menú"
            >
              <X className="w-5 h-5 stroke-[2]" />
            </button>
          </div>

          {/* Drawer Content Body */}
          <div
            className="flex-1 overflow-y-auto overscroll-contain pb-8"
            style={{
              overflowY: 'auto',
              overscrollBehavior: 'contain',
              WebkitOverflowScrolling: 'touch',
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
            <LeftSidebarPanel
              preRollSec={preRollSec}
              onPreRollSecChange={setPreRollSec}
              onUndo={handleUndo}
              onResetDemo={handleResetDemo}
              onClearRink={handleClearRink}
              onOpenAudioStudio={() => { setDrawerOpen(false); setActiveView('studio'); }}
              showHeader={false}
              isMobileModal={true}
            />
          </div>
        </div>

        {/* ── MOBILE INSPECTOR (Bottom Sheet en Portrait / Right Panel en Landscape) ── */}
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Inspector de nodo"
          className={[
            'lg:hidden fixed z-50 flex flex-col bg-neon-surface shadow-2xl shadow-black/80',
            'portrait:bottom-0 portrait:left-0 portrait:right-0 portrait:rounded-t-3xl portrait:border-t portrait:border-white/10',
            'landscape:top-0 landscape:bottom-0 landscape:right-0 landscape:w-[320px] landscape:max-w-[42vw] landscape:rounded-l-2xl landscape:border-l landscape:border-white/10',
            'transition-transform duration-ui ease-spring',
            sheetOpen
              ? 'portrait:translate-y-0 landscape:translate-x-0'
              : 'portrait:translate-y-full landscape:translate-x-full',
          ].join(' ')}
          style={{
            maxHeight: '85dvh',
            height: 'auto',
            overscrollBehavior: 'contain',
            WebkitOverflowScrolling: 'touch',
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
          {/* Pull Grip Affordance (Portrait Only) */}
          <div
            className="portrait:flex landscape:hidden shrink-0 justify-center pt-3 pb-1 cursor-pointer"
            onClick={() => {
              setSheetOpen(false);
              useChoreographyStore.getState().setSelectedPointId(null);
            }}
          >
            <div className="w-12 h-1.5 rounded-full bg-slate-700" />
          </div>

          {/* Sheet Header */}
          <div className="shrink-0 flex items-center justify-between px-4 py-2.5 border-b border-white/5">
            <span className="text-xs font-black uppercase tracking-widest text-mint truncate-safe">
              Inspector de Nodo
            </span>
            <button
              type="button"
              onClick={() => {
                setSheetOpen(false);
                useChoreographyStore.getState().setSelectedPointId(null);
              }}
              className="min-w-touch min-h-touch flex items-center justify-center rounded-2xl text-slate-400 hover:text-white interactive-tap"
              aria-label="Cerrar inspector"
            >
              <ChevronDown className="w-5 h-5 stroke-[2] portrait:block landscape:hidden" />
              <X className="w-5 h-5 stroke-[2] portrait:hidden landscape:block" />
            </button>
          </div>

          {/* Sheet Content Body - Single Scrollable Container */}
          <div
            className="flex-1 overflow-y-auto overscroll-contain pb-12"
            style={{
              maxHeight: 'calc(85dvh - 56px)',
              overflowY: 'auto',
              overscrollBehavior: 'contain',
              WebkitOverflowScrolling: 'touch',
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
            <RightInspectorPanel
              showHeader={false}
              isMobileModal={true}
              onClose={() => {
                setSheetOpen(false);
                useChoreographyStore.getState().setSelectedPointId(null);
              }}
            />
          </div>
        </div>

      </div>

      {/* ═══════════════════════════════════════════════
          MOBILE BOTTOM ACTION DOCK — Portrait Only (<lg)
          ═══════════════════════════════════════════════ */}
      <nav
        aria-label="Acciones principales táctiles en vertical"
        className="landscape:hidden lg:hidden shrink-0 flex items-stretch justify-around bg-neon-surface/95 backdrop-blur-md border-t border-white/10 z-30 pb-safe"
        style={{ minHeight: 52 }}
      >
        {/* Config / Drawer Trigger */}
        <button
          type="button"
          onClick={() => { setDrawerOpen((o) => !o); setSheetOpen(false); }}
          className={[
            'flex-1 max-w-[64px] min-h-touch flex flex-col items-center justify-center gap-0.5',
            'text-[10px] font-bold border-r border-white/5 interactive-tap',
            drawerOpen ? 'text-cyan bg-cyan/10' : 'text-slate-400 hover:text-white',
          ].join(' ')}
        >
          <Menu className="w-4 h-4 stroke-[2]" />
          <span className="truncate-safe max-w-[56px] text-center">Config</span>
        </button>

        {/* Herramienta 1: Colocar Nodos (Modo Nodos) */}
        <button
          type="button"
          onClick={() => {
            setPhase('plot');
            setSheetOpen(false);
            useChoreographyStore.getState().setSelectedPointId(null);
          }}
          className={[
            'flex-1 max-w-[64px] min-h-touch flex flex-col items-center justify-center gap-0.5',
            'text-[10px] font-black uppercase tracking-wider border-r border-white/5 interactive-tap transition-all',
            phase === 'plot'
              ? 'bg-amber-500 text-black shadow-glow-amber font-black'
              : 'text-slate-400 hover:text-white',
          ].join(' ')}
          title="Modo Nodos: Un clic en el lienzo vacío coloca nodos. Las líneas están ocultas."
        >
          <PenTool className="w-4 h-4 stroke-[2.5]" />
          <span className="truncate-safe max-w-[56px] text-center">Nodos</span>
        </button>

        {/* Herramienta 2: Trazar Líneas (Modo Trazado, Toggle) */}
        <button
          type="button"
          onClick={() => {
            if (phase === 'curve') {
              setPhase('plot');
            } else if (canDraw) {
              setPhase('curve');
            }
            useChoreographyStore.getState().setSelectedPointId(null);
          }}
          disabled={!canDraw}
          className={[
            'flex-1 max-w-[64px] min-h-touch flex flex-col items-center justify-center gap-0.5',
            'text-[10px] font-black uppercase tracking-wider border-r border-white/5 interactive-tap transition-all',
            phase === 'curve'
              ? 'bg-cyan text-black shadow-glow-cyan font-black'
              : 'text-slate-400 hover:text-white disabled:opacity-30 disabled:pointer-events-none',
          ].join(' ')}
          title={canDraw ? 'Modo Trazado: Ver líneas conectadas y esculpir curvas' : 'Mínimo 2 nodos'}
        >
          <Route className="w-4 h-4 stroke-[2.5]" />
          <span className="truncate-safe max-w-[56px] text-center">Trazar</span>
        </button>

        {/* Herramienta 3: Borrador (Modo Borrador, Toggle) */}
        <button
          type="button"
          onClick={() => {
            if (phase === 'erase') {
              setPhase('plot');
            } else {
              setPhase('erase');
            }
            useChoreographyStore.getState().setSelectedPointId(null);
            setSheetOpen(false);
          }}
          className={[
            'flex-1 max-w-[64px] min-h-touch flex flex-col items-center justify-center gap-0.5',
            'text-[10px] font-black uppercase tracking-wider border-r border-white/5 interactive-tap transition-all',
            phase === 'erase'
              ? 'bg-red-500 text-white shadow-lg shadow-red-500/40 font-black'
              : 'text-slate-400 hover:text-white',
          ].join(' ')}
          title="Modo Borrador: Toca cualquier nodo para eliminarlo instantáneamente."
        >
          <Eraser className="w-4 h-4 stroke-[2.5]" />
          <span className="truncate-safe max-w-[56px] text-center">Borrar</span>
        </button>

        {/* Limpiar Pista en un toque (Mobile) */}
        <button
          type="button"
          onClick={handleClearRink}
          disabled={points.length === 0}
          className="flex-1 max-w-[64px] min-h-touch flex flex-col items-center justify-center gap-0.5 text-[10px] font-bold text-slate-400 hover:text-coral border-r border-white/5 interactive-tap disabled:opacity-20 disabled:pointer-events-none"
          title="Limpiar toda la pista"
        >
          <Trash2 className="w-4 h-4 text-coral stroke-[2]" />
          <span className="truncate-safe max-w-[56px] text-center">Limpiar</span>
        </button>

        {/* Deshacer Action */}
        <button
          type="button"
          onClick={undo}
          disabled={history.length === 0}
          className="flex-1 max-w-[64px] min-h-touch flex flex-col items-center justify-center gap-0.5 text-[10px] font-bold text-slate-400 hover:text-white border-r border-white/5 interactive-tap disabled:opacity-20 disabled:pointer-events-none"
          title="Deshacer"
        >
          <Undo2 className="w-4 h-4 stroke-[2]" />
          <span className="truncate-safe max-w-[56px] text-center">Deshacer</span>
        </button>

        {/* Inspector Bottom Sheet Trigger */}
        <button
          type="button"
          onClick={() => { setSheetOpen((o) => !o); setDrawerOpen(false); }}
          className={[
            'flex-1 max-w-[64px] min-h-touch flex flex-col items-center justify-center gap-0.5',
            'text-[10px] font-bold interactive-tap',
            sheetOpen ? 'text-mint bg-mint/10' : 'text-slate-400 hover:text-white',
          ].join(' ')}
          title="Inspector de nodo"
        >
          <ChevronDown className={`w-4 h-4 stroke-[2] transition-transform ${sheetOpen ? 'rotate-180' : ''}`} />
          <span className="truncate-safe max-w-[56px] text-center">Inspector</span>
        </button>
      </nav>
      </>
      )}

      {/* ═══════════════════════════════════════════════
          FOOTER — Atribución Oficial AlsisTech
          ═══════════════════════════════════════════════ */}
      <footer className="h-6 shrink-0 flex items-center justify-between px-3 bg-neon-surface/85 border-t border-white/5 text-[12px] text-slate-400 select-none z-20">
        <span className="truncate-safe font-normal">
          Desarrollado por{' '}
          <a
            href="https://www.alsiztech.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-slate-300 font-medium hover:text-cyan hover:underline transition-colors"
          >
            AlsisTech
          </a>
        </span>
      </footer>

      {/* ═══════════════════════════════════════════════
          SKATERS MANAGER OVERLAY MODAL
          ═══════════════════════════════════════════════ */}
      {showSkaters && (
        <div className="absolute inset-0 z-[60] flex flex-col bg-neon-canvas/98 backdrop-blur-md">
          <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-white/10">
            <span className="text-xs font-black uppercase tracking-widest text-white">
              Gestión de Atletas &amp; Programas
            </span>
            <button
              type="button"
              onClick={() => setShowSkaters(false)}
              className="px-3 py-1.5 rounded-xl bg-neon-card hover:bg-neon-hover text-slate-200 hover:text-white text-xs font-bold shadow-soft-elevation interactive-tap"
            >
              ✕ Cerrar
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            <SkatersManager
              skaters={skaters}
              selectedSkater={selectedSkater}
              onSelectSkater={handleSelectSkater}
              onRefreshData={loadData}
              programs={programs}
              selectedProgram={selectedProgram}
              onSelectProgram={handleSelectProgram}
            />
          </div>
        </div>
      )}
      </div>
    </ProtectedLayout>
  );
}

export default App;
