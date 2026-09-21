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

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Music,
  X, ChevronDown, MoreVertical,
  Upload, Save, HardDrive, Trash2, LogOut
} from 'lucide-react';
import { Skater, Program, ElementLog, AudioEngineState } from './types';
import { RinkCanvas } from './components/RinkCanvas';
import { InteractiveWaveform } from './components/InteractiveWaveform';
import { LeftSidebarPanel } from './components/LeftSidebarPanel';
import { SkateCoreoBrand } from './components/brand/SkateCoreoBrand';
import { RightInspectorPanel } from './components/RightInspectorPanel';
import { SkatersManager } from './components/SkatersManager';
import { dbService, OfflineSessionRecord } from './services/db';
import { audioEngine } from './services/audioEngine';
import { useChoreographyStore } from './store/useChoreographyStore';
import { useAudioStudioStore } from './store/useAudioStudioStore';
import { useAuthStore } from './store/useAuthStore';
import { renderChoreographyMixdown } from './core/audio/audioMixdown';
import { exportCoreoProject, importCoreoProject } from './services/coreoPackage';
import { ProtectedLayout } from './components/ProtectedLayout';
import { AudioStudioView } from './components/AudioStudio/AudioStudioView';
import { NodePlacementTray } from './components/NodePlacementTray';
import { RinkAudioPlayer } from './components/RinkAudioPlayer';
import { RinkContextTools } from './components/rink/RinkContextTools';
import { ConfirmDialog } from './components/ConfirmDialog';
import { HomeView } from './components/HomeView';
import {
  BottomNav,
  DesktopHeaderNav,
  LandscapeNavRail,
} from './components/navigation/AppNav';
import type { AppTab } from './components/navigation/AppNav';

type AppView = 'home' | 'rink' | 'studio';

// ── Component ──────────────────────────────────────────────────
export function App() {

  // ── Modos de Vista: Inicio / Pista 2D / Estudio de Audio (DAW Lite) ──
  const [activeView, setActiveView] = useState<AppView>('home');
  const unplacedNodes = useChoreographyStore((s) => s.unplacedNodes);
  const studioBpm = useAudioStudioStore((s) => s.globalControls.bpm);
  const logout = useAuthStore((s) => s.logout);

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
  /** Confirmación del borrado total de la pista 2D (acción destructiva). */
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);

  // Input file hidden refs
  const audioInputRef = useRef<HTMLInputElement | null>(null);
  const coreoInputRef = useRef<HTMLInputElement | null>(null);

  // ── Zustand ────────────────────────────────────────────
  const undo              = useChoreographyStore((s) => s.undo);
  const points            = useChoreographyStore((s) => s.points);
  const clearAllPoints    = useChoreographyStore((s) => s.clearAllPoints);
  const loadProgramPoints = useChoreographyStore((s) => s.loadProgramPoints);

  // ── Data loading & Offline Autoload ─────────────────────
  const loadData = useCallback(async () => {
    // Estado inicial limpio («lienzo en blanco»): no se siembran atletas,
    // programas ni rutas de demostración. Si la base de datos está vacía, la
    // interfaz guía al usuario a crear su primer perfil y proyecto.
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

  // ── Gesto Edge-Swipe para transicionar a Estudio de Audio desde la Pista 2D ──
  useEffect(() => {
    if (activeView !== 'rink') return;
    let touchStartX = 0;
    let touchStartY = 0;
    let isEdgeSwipe = false;

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      const t = e.touches[0];
      touchStartX = t.clientX;
      touchStartY = t.clientY;
      // Borde derecho (swipe hacia izquierda) o borde inferior (swipe hacia arriba en vertical)
      isEdgeSwipe = touchStartX >= window.innerWidth - 50 || touchStartY >= window.innerHeight - 60;
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (!isEdgeSwipe || e.changedTouches.length !== 1) return;
      const t = e.changedTouches[0];
      const deltaX = t.clientX - touchStartX;
      const deltaY = t.clientY - touchStartY;

      const isSwipeLeft = touchStartX >= window.innerWidth - 50 && deltaX <= -75 && Math.abs(deltaY) < 60;
      const isSwipeUp = touchStartY >= window.innerHeight - 60 && deltaY <= -75 && Math.abs(deltaX) < 60;

      if (isSwipeLeft || isSwipeUp) {
        if ('vibrate' in navigator) navigator.vibrate(15);
        setActiveView('studio');
      }
      isEdgeSwipe = false;
    };

    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchend', handleTouchEnd, { passive: true });
    return () => {
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchend', handleTouchEnd);
    };
  }, [activeView]);

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

  /**
   * «Limpiar Pista 2D» ahora está a un toque en la interfaz principal, así que
   * se protege con un modal de confirmación (en lugar de `window.confirm`) para
   * evitar pérdidas accidentales de trabajo en pantallas táctiles.
   */
  const requestClearRink = useCallback(() => {
    if (points.length === 0) return;
    setConfirmClearOpen(true);
  }, [points.length]);

  const handleClearRink = useCallback(() => {
    setConfirmClearOpen(false);
    if (points.length === 0) return;

    clearAllPoints();
    audioEngine.setNodes([]);
    if (selectedProgram) {
      handleProgramUpdated({
        ...selectedProgram,
        choreography_path: []
      });
    }
  }, [points.length, clearAllPoints, selectedProgram, handleProgramUpdated]);

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

  // Pestaña activa de la navegación principal (sincronizada con drawer/modal)
  const activeTab: AppTab = showSkaters
    ? 'skaters'
    : drawerOpen
    ? 'settings'
    : activeView;

  const navBadges = useMemo(() => ({ rink: unplacedNodes.length }), [unplacedNodes.length]);

  // Navegación principal unificada para Bottom Nav, Sidebar y Barra Desktop
  const handleNav = useCallback((tab: AppTab) => {
    if (tab === 'skaters') {
      setSheetOpen(false);
      setDrawerOpen(false);
      setShowSkaters(true);
      return;
    }
    if (tab === 'settings') {
      setSheetOpen(false);
      setDrawerOpen(true);
      return;
    }
    setShowSkaters(false);
    setDrawerOpen(false);
    setSheetOpen(false);
    useChoreographyStore.getState().setSelectedPointId(null);
    setActiveView(tab);
  }, []);

  const handleToggleInspector = useCallback(() => {
    setDrawerOpen(false);
    setSheetOpen((open) => !open);
  }, []);

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
          HEADER — Consola superior
          IZQUIERDA (marca) · CENTRO (navegación desktop) · DERECHA (acciones)
          Sin `flex-wrap`: una sola fila garantiza cero apiñamiento/superposición.
          ═══════════════════════════════════════════════ */}
      {activeView !== 'studio' && (
        <header className="relative z-30 shrink-0 glass-hud border-b border-white/10 pt-safe px-safe landscape:h-10 landscape:pt-safe landscape:px-safe">
          <div className="flex min-h-[54px] landscape:min-h-0 landscape:h-10 items-center justify-between gap-2 px-2 py-1 sm:px-3 lg:min-h-[60px] lg:px-4">

        {/* ── IZQUIERDA: Marca (navega a Inicio) + contexto del atleta ── */}
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            onClick={() => handleNav('home')}
            className="press -ml-1 flex shrink-0 items-center rounded-xl px-1 py-1 hover:bg-white/[0.06]"
            aria-label="Ir al inicio"
            title="Ir al inicio"
          >
            <SkateCoreoBrand size="sm" showTagline={false} className="sm:hidden" />
            <SkateCoreoBrand size="md" showTagline={false} className="hidden sm:flex" />
          </button>

          {/* Contexto del Atleta Activo (solo en pantallas muy anchas) */}
          <div className="hidden min-w-0 items-center gap-2 border-l border-white/10 pl-3 text-xs xl:flex">
            <span className="max-w-[120px] truncate font-semibold text-slate-200" title={selectedSkater?.name}>
              {selectedSkater?.name || 'Sin Atleta'}
            </span>
            {selectedSkater?.category && (
              <span className="shrink-0 rounded border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-bold text-cyan">
                {selectedSkater.category}
              </span>
            )}
          </div>
        </div>

        {/* ── CENTRO: Navegación principal de escritorio ── */}
        <DesktopHeaderNav active={activeTab} onSelect={handleNav} badges={navBadges} />

        {/* ── DERECHA: Transporte maestro + carga de audio + desbordamiento ── */}
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          {activeView === 'rink' && (
            <div className="hidden lg:flex">
              <RinkAudioPlayer
                variant="header"
                currentTimeMs={currentTimeMs}
                durationMs={audioState.durationMs || 240000}
                isPlaying={isAudioActive}
                hasAudioLoaded={audioState.hasAudioLoaded}
                fileName={audioState.fileName}
              />
            </div>
          )}
          {/* Limpiar Pista 2D — acción rápida de la barra principal (desktop).
              En móvil/tablet vive en el rail de herramientas de la pista. */}
          {activeView === 'rink' && (
            <button
              type="button"
              onClick={requestClearRink}
              disabled={points.length === 0}
              className="press hidden min-h-touch min-w-touch items-center justify-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3 text-xs font-bold text-red-400 hover:bg-red-500/20 disabled:pointer-events-none disabled:opacity-30 lg:flex"
              title={
                points.length === 0
                  ? 'La pista ya está vacía'
                  : `Limpiar pista 2D (${points.length} nodos)`
              }
              aria-label="Limpiar toda la pista 2D"
            >
              <Trash2 className="h-4 w-4 shrink-0 stroke-[2]" />
              <span className="hidden xl:inline">Limpiar Pista</span>
            </button>
          )}

          {/* Botón Cargar Audio (CTA primario único) */}
          <button
            type="button"
            onClick={() => audioInputRef.current?.click()}
            className="press flex min-h-touch min-w-touch items-center justify-center gap-2 rounded-xl border border-cyan/30 bg-cyan/15 px-3 text-xs font-bold text-cyan shadow-soft-elevation hover:bg-cyan/25 lg:px-3.5"
            title="Cargar archivo de música"
            aria-label="Cargar archivo de música"
          >
            <Upload className="h-4 w-4 shrink-0 stroke-[2]" />
            <span className="hidden md:inline">Cargar Audio</span>
          </button>

          {/* Botón de Salir / Cerrar Sesión (siempre visible en header) */}
          <button
            type="button"
            onClick={() => logout()}
            className="press flex h-12 w-12 min-h-touch min-w-touch items-center justify-center rounded-xl border border-coral/20 bg-coral/[0.06] text-slate-300 hover:bg-coral/15 hover:text-coral"
            title="Cerrar sesión y salir de la aplicación"
            aria-label="Cerrar sesión"
          >
            <LogOut className="w-5 h-5 stroke-[1.8]" />
          </button>

          {/* Menú de Desbordamiento Unificado (...) */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowExportMenu((v) => !v)}
              className="press flex h-12 w-12 min-h-touch min-w-touch items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/[0.08] hover:text-white"
              title="Más opciones del proyecto"
              aria-label="Más opciones del proyecto"
            >
              <MoreVertical className="w-5 h-5 stroke-[2]" />
            </button>

            {showExportMenu && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setShowExportMenu(false)}
                  aria-hidden="true"
                />
                <div className="glass-panel absolute right-0 mt-2 flex w-[min(19rem,calc(100vw-1.5rem))] flex-col gap-1 overflow-hidden rounded-2xl p-2 shadow-2xl animate-scale-in">
                  <p className="px-2 pb-1 pt-0.5 text-[9px] font-black uppercase tracking-[0.2em] text-slate-500">
                    Proyecto
                  </p>

                  <button
                    type="button"
                    onClick={() => { setShowExportMenu(false); handleExportMixdown(); }}
                    disabled={!audioState.hasAudioLoaded || isExportingMix}
                    className="press flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-xs font-medium text-slate-200 hover:bg-white/5 hover:text-white disabled:opacity-40"
                  >
                    <Music className="w-4 h-4 text-coral shrink-0 stroke-[1.75]" />
                    <span>
                      <span className="block font-semibold leading-tight">Exportar Mezcla (.WAV)</span>
                      <span className="block text-[10px] font-normal text-slate-400">Mixdown con metrónomo y cues</span>
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => { setShowExportMenu(false); handleExportCoreo(); }}
                    className="press flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-xs font-medium text-slate-200 hover:bg-white/5 hover:text-white"
                  >
                    <Save className="w-4 h-4 text-cyan shrink-0 stroke-[1.75]" />
                    <span>
                      <span className="block font-semibold leading-tight">Exportar Paquete (.coreo)</span>
                      <span className="block text-[10px] font-normal text-slate-400">Bundle completo con audio y nodos 2D</span>
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => { setShowExportMenu(false); coreoInputRef.current?.click(); }}
                    className="press flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-xs font-medium text-slate-200 hover:bg-white/5 hover:text-white"
                  >
                    <Upload className="w-4 h-4 text-mint shrink-0 stroke-[1.75]" />
                    <span>
                      <span className="block font-semibold leading-tight">Importar Paquete (.coreo)</span>
                      <span className="block text-[10px] font-normal text-slate-400">Cargar rutina previamente guardada</span>
                    </span>
                  </button>

                  <span aria-hidden="true" className="my-1 h-px bg-white/5" />

                  <button
                    type="button"
                    onClick={() => { setShowExportMenu(false); handleSaveOffline(); }}
                    disabled={!audioState.hasAudioLoaded || isSavingOffline}
                    className="press flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-xs font-medium text-slate-200 hover:bg-white/5 hover:text-white disabled:opacity-40"
                  >
                    <HardDrive className="w-4 h-4 text-mint shrink-0 stroke-[1.75]" />
                    <span>
                      <span className="block font-semibold leading-tight">{savedOfflineSuccess ? '¡Guardado!' : 'Modo Offline'}</span>
                      <span className="block text-[10px] font-normal text-slate-400">Guardar en el dispositivo para usar sin red</span>
                    </span>
                  </button>

                  <span aria-hidden="true" className="my-1 h-px bg-white/5" />

                  <button
                    type="button"
                    onClick={() => { setShowExportMenu(false); logout(); }}
                    className="press flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-xs font-medium text-slate-200 hover:bg-coral/10 hover:text-coral"
                  >
                    <LogOut className="w-4 h-4 text-coral shrink-0 stroke-[1.75]" />
                    <span>
                      <span className="block font-semibold leading-tight">Cerrar Sesión</span>
                      <span className="block text-[10px] font-normal text-slate-400">Salir de la aplicación de forma segura</span>
                    </span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
          </div>
        </header>
      )}

      {/* ═══════════════════════════════════════════════
          SHELL — Sidebar de navegación + vista activa
          Inicio (Hero + Acciones) · Estudio DAW · Pista 2D
          ═══════════════════════════════════════════════ */}
      <div className="flex-1 min-h-0 flex flex-col landscape:flex-row lg:flex-row overflow-hidden relative">

        {/* ── SIDEBAR COMPACTA: navegación + herramientas (landscape < lg) ── */}
        {activeView !== 'studio' && (
          <LandscapeNavRail active={activeTab} onSelect={handleNav} badges={navBadges}>
            {activeView === 'rink' && (
              <RinkContextTools
                layout="rail"
                onClear={requestClearRink}
                inspectorOpen={sheetOpen}
                onToggleInspector={handleToggleInspector}
              />
            )}
          </LandscapeNavRail>
        )}

        {activeView === 'home' ? (
          <HomeView
            skaterName={selectedSkater?.name}
            skaterCategory={selectedSkater?.category}
            programTitle={selectedProgram?.title}
            pointsCount={points.length}
            unplacedNodesCount={unplacedNodes.length}
            audioFileName={audioState.fileName}
            hasAudioLoaded={audioState.hasAudioLoaded}
            bpm={studioBpm}
            isSavingOffline={isSavingOffline}
            offlineSaved={savedOfflineSuccess}
            onOpenRink={() => handleNav('rink')}
            onOpenStudio={() => handleNav('studio')}
            onOpenSkaters={() => handleNav('skaters')}
            onOpenSettings={() => handleNav('settings')}
            onLoadAudio={() => audioInputRef.current?.click()}
            onImportCoreo={() => coreoInputRef.current?.click()}
            onExportCoreo={handleExportCoreo}
            onSaveOffline={handleSaveOffline}
          />
        ) : activeView === 'studio' ? (
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden relative">
            <AudioStudioView
              onExportToRink={() => setActiveView('rink')}
              onBackToRink={() => setActiveView('rink')}
              onGoHome={() => setActiveView('home')}
              onOpenDrawer={() => setDrawerOpen(true)}
            />
          </div>
        ) : (
          <div className="flex-1 min-w-0 min-h-0 flex flex-col landscape:flex-row lg:flex-row overflow-hidden relative">
            {/* Bandeja de Colocación de Nodos de Audio (Estricto Orden Secuencial) */}
            <NodePlacementTray onOpenAudioStudio={() => setActiveView('studio')} />

            {/* ── DESKTOP LEFT ASIDE (Preparación y Mezcla) ── */}
            <aside className="hidden lg:flex lg:w-[272px] xl:w-[288px] shrink-0 flex-col bg-neon-surface border-r border-white/5 overflow-hidden shadow-soft-elevation">
              <LeftSidebarPanel
                preRollSec={preRollSec}
                onPreRollSecChange={setPreRollSec}
                onUndo={handleUndo}
                                onClearRink={requestClearRink}
                onOpenAudioStudio={() => setActiveView('studio')}
              />
            </aside>

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

          {/* Transporte compacto: exclusivo de portrait móvil/tablet,
              donde el header no tiene ancho suficiente sin apiñar la marca. */}
          <div className="shrink-0 border-t border-white/5 bg-neon-surface/60 px-2 py-1.5 pl-safe pr-safe lg:hidden">
            <RinkAudioPlayer
              variant="compact"
              currentTimeMs={currentTimeMs}
              durationMs={audioState.durationMs || 240000}
              isPlaying={isAudioActive}
              hasAudioLoaded={audioState.hasAudioLoaded}
              fileName={audioState.fileName}
            />
          </div>

          {/* Interactive Waveform Strip (Área Inferior del Visor de Música) */}
          <div className="timeline-container landscape-compact-waveform h-[26%] max-h-[170px] min-h-[104px] shrink-0 border-t border-white/5 bg-neon-surface/40">
            <InteractiveWaveform
              currentTimeMs={currentTimeMs}
              durationMs={audioState.durationMs}
              isPlaying={isAudioActive}
              onSeek={(ms) => audioEngine.seek(ms)}
              fileName={audioState.fileName}
              onOpenStudio={() => setActiveView('studio')}
            />
          </div>
        </main>

        {/* ── DESKTOP RIGHT ASIDE (Inspector de Nodo) ── */}
        <aside className="hidden lg:flex lg:w-[272px] xl:w-[288px] shrink-0 flex-col bg-neon-surface border-l border-white/5 overflow-hidden shadow-soft-elevation">
          <RightInspectorPanel onClose={() => useChoreographyStore.getState().setSelectedPointId(null)} />
        </aside>



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
        )}
      </div>

      {/* ── RAIL DE HERRAMIENTAS DE PISTA (portrait móvil/tablet) ── */}
      {activeView === 'rink' && (
        <RinkContextTools
          layout="bar"
          onClear={requestClearRink}
          inspectorOpen={sheetOpen}
          onToggleInspector={handleToggleInspector}
        />
      )}

      {/* ═══════════════════════════════════════════════
          FOOTER — Atribución oficial (solo escritorio y landscape)
          ═══════════════════════════════════════════════ */}
      <footer className="attribution-bar min-h-6 shrink-0 items-center justify-between border-t border-white/5 bg-neon-surface/85 px-3 py-1 text-xs text-gray-500 select-none z-20 pb-safe px-safe">
        <span className="truncate-safe font-normal">
          Desarrollado por Mauricio Andrade Luna | Diseñada por:{' '}
          <a
            href="http://www.alsitech.com"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-blue-500 transition-colors hover:text-blue-400 hover:underline"
          >
            AlsizTech
          </a>
        </span>
      </footer>

      {/* ═══════════════════════════════════════════════
          BOTTOM NAVIGATION BAR — Portrait móvil y tablet (< lg)
          ═══════════════════════════════════════════════ */}
      {activeView !== 'studio' && (
        <BottomNav active={activeTab} onSelect={handleNav} badges={navBadges} />
      )}

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

      {/* ── MOBILE LEFT DRAWER (Configuración Global Accesible en Pista y Estudio) ── */}
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
                        onClearRink={requestClearRink}
            onOpenAudioStudio={() => { setDrawerOpen(false); setActiveView('studio'); }}
            showHeader={false}
            isMobileModal={true}
          />
        </div>
      </div>

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

      {/* ═══════════════════════════════════════════════
          CONFIRMACIÓN DE ACCIÓN DESTRUCTIVA
          «Limpiar Pista 2D» está a un toque: se confirma siempre.
          ═══════════════════════════════════════════════ */}
      <ConfirmDialog
        isOpen={confirmClearOpen}
        tone="danger"
        title="¿Estás seguro de limpiar toda la pista?"
        message={`Se eliminarán los ${points.length} ${
          points.length === 1 ? 'nodo' : 'nodos'
        } de la coreografía actual. Esta acción no se puede deshacer.`}
        confirmLabel="Sí, limpiar pista"
        cancelLabel="Cancelar"
        onConfirm={handleClearRink}
        onCancel={() => setConfirmClearOpen(false)}
      />
      </div>
    </ProtectedLayout>
  );
}

export default App;
