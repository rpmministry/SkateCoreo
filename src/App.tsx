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

import { useState, useEffect, useCallback, useMemo, useRef, startTransition, lazy, Suspense } from 'react';
import {
  Music,
  X, ChevronDown, MoreVertical,
  Upload, Save, HardDrive, Trash2, LogOut, Sparkles, SlidersHorizontal
} from 'lucide-react';
import { Skater, Program, ElementLog, AudioEngineState } from './types';
import { SkateCoreoBrand } from './components/brand/SkateCoreoBrand';
import { dbService, OfflineSessionRecord } from './services/db';
import { audioEngine } from './services/audioEngine';
import { useChoreographyStore } from './store/useChoreographyStore';
import { useAudioStudioStore } from './store/useAudioStudioStore';
import { useRinkAudioStore } from './store/useRinkAudioStore';
import { useAuthStore } from './store/useAuthStore';
import { ACCEPTED_AUDIO_FORMATS, ACCEPTED_PROJECT_FORMATS } from './constants/mediaFormats';
import { ProtectedLayout } from './components/ProtectedLayout';
import { ConfirmDialog } from './components/ConfirmDialog';
import { HomeView } from './components/HomeView';
import { useIosFileCapture } from './hooks/useIosFileCapture';
import { LoadProgressBar } from './components/LoadProgressBar';
import { ensureDataOwnership, releaseWorkingSession } from './services/workingSession';
import {
  BottomNav,
  DesktopHeaderNav,
} from './components/navigation/AppNav';
import type { AppTab } from './components/navigation/AppNav';

/**
 * ── CARGA DIFERIDA (code splitting) ──────────────────────────────────────────
 * La pantalla inicial (Home) ya no descarga el motor del lienzo, el DAW, la
 * visión artificial, los paneles ni los modales. Cada bloque pesado se convierte
 * en su propio chunk y se solicita SOLO al abrirse, reduciendo drásticamente el
 * JavaScript del arranque. La funcionalidad es idéntica: son los mismos
 * componentes, solo que llegan bajo demanda.
 */
const RinkCanvasLazy = lazy(() => import('./components/RinkCanvas').then((m) => ({ default: m.RinkCanvas })));
const InteractiveWaveformLazy = lazy(() => import('./components/InteractiveWaveform').then((m) => ({ default: m.InteractiveWaveform })));
const LeftSidebarPanelLazy = lazy(() => import('./components/LeftSidebarPanel').then((m) => ({ default: m.LeftSidebarPanel })));
const RightInspectorPanelLazy = lazy(() => import('./components/RightInspectorPanel').then((m) => ({ default: m.RightInspectorPanel })));
const SkatersManagerLazy = lazy(() => import('./components/SkatersManager').then((m) => ({ default: m.SkatersManager })));
const AudioStudioViewLazy = lazy(() => import('./components/AudioStudio/AudioStudioView').then((m) => ({ default: m.AudioStudioView })));
const NodePlacementTrayLazy = lazy(() => import('./components/NodePlacementTray').then((m) => ({ default: m.NodePlacementTray })));
const RinkAudioPlayerLazy = lazy(() => import('./components/RinkAudioPlayer').then((m) => ({ default: m.RinkAudioPlayer })));
const RinkContextToolsLazy = lazy(() => import('./components/rink/RinkContextTools').then((m) => ({ default: m.RinkContextTools })));

/** Fallback mínimo mientras llega un chunk bajo demanda (evita pantallas en blanco). */
function ViewLoadingFallback() {
  return (
    <div className="flex-1 min-h-0 flex items-center justify-center bg-neon-canvas">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-cyan/30 border-t-cyan" />
        <span className="font-mono text-[10px] uppercase tracking-widest text-slate-400">Cargando…</span>
      </div>
    </div>
  );
}

/**
 * Envuelve un componente diferido en su propio `Suspense`, preservando la MISMA
 * firma de props. Así los usos existentes no cambian y cada bloque muestra su
 * fallback local (el resto de la interfaz permanece visible e interactiva).
 */
const RinkCanvas = (props: React.ComponentProps<typeof RinkCanvasLazy>) => (
  <Suspense fallback={<ViewLoadingFallback />}><RinkCanvasLazy {...props} /></Suspense>
);
const AudioStudioView = (props: React.ComponentProps<typeof AudioStudioViewLazy>) => (
  <Suspense fallback={<ViewLoadingFallback />}><AudioStudioViewLazy {...props} /></Suspense>
);
const SkatersManager = (props: React.ComponentProps<typeof SkatersManagerLazy>) => (
  <Suspense fallback={<ViewLoadingFallback />}><SkatersManagerLazy {...props} /></Suspense>
);
const InteractiveWaveform = (props: React.ComponentProps<typeof InteractiveWaveformLazy>) => (
  <Suspense fallback={null}><InteractiveWaveformLazy {...props} /></Suspense>
);
const LeftSidebarPanel = (props: React.ComponentProps<typeof LeftSidebarPanelLazy>) => (
  <Suspense fallback={null}><LeftSidebarPanelLazy {...props} /></Suspense>
);
const RightInspectorPanel = (props: React.ComponentProps<typeof RightInspectorPanelLazy>) => (
  <Suspense fallback={null}><RightInspectorPanelLazy {...props} /></Suspense>
);
const NodePlacementTray = (props: React.ComponentProps<typeof NodePlacementTrayLazy>) => (
  <Suspense fallback={null}><NodePlacementTrayLazy {...props} /></Suspense>
);
const RinkAudioPlayer = (props: React.ComponentProps<typeof RinkAudioPlayerLazy>) => (
  <Suspense fallback={null}><RinkAudioPlayerLazy {...props} /></Suspense>
);
const RinkContextTools = (props: React.ComponentProps<typeof RinkContextToolsLazy>) => (
  <Suspense fallback={null}><RinkContextToolsLazy {...props} /></Suspense>
);
const PaperToDigitalModalLazy = lazy(() =>
  import('./components/PaperToDigital/PaperToDigitalModal').then((m) => ({ default: m.PaperToDigitalModal }))
);
const PaperToDigitalModal = (props: React.ComponentProps<typeof PaperToDigitalModalLazy>) => (
  <Suspense fallback={null}><PaperToDigitalModalLazy {...props} /></Suspense>
);


type AppView = 'home' | 'rink' | 'studio';

// ── Component ──────────────────────────────────────────────────
export function App() {

  // ── Modos de Vista: Inicio / Pista 2D / Estudio de Audio (DAW Lite) ──
  const [activeView, setActiveView] = useState<AppView>('home');
  // Digitalización de la plantilla A4 accesible desde Home y desde la Pista.
  const [paperOpen, setPaperOpen] = useState(false);
  const unplacedNodes = useChoreographyStore((s) => s.unplacedNodes);
  const studioBpm = useAudioStudioStore((s) => s.globalControls.bpm);
  const logout = useAuthStore((s) => s.logout);
  const authUser = useAuthStore((s) => s.user);
  const authPlan = useAuthStore((s) => s.subscription_plan);
  const getDaysRemaining = useAuthStore((s) => s.getDaysRemaining);
  const getFormattedExpiration = useAuthStore((s) => s.getFormattedExpiration);

  /**
   * Propiedad de los datos locales: si se entra con una cuenta distinta a la que
   * dejó datos en el dispositivo, se limpia la sesión de trabajo (audio,
   * coreografía y Estudio) para que la nueva cuenta arranque en limpio.
   */
  useEffect(() => {
    void ensureDataOwnership(authUser?.id ?? null);
  }, [authUser?.id]);

  /** Logout con limpieza: no debe quedar la sesión del usuario anterior. */
  const handleLogout = useCallback(async () => {
    await releaseWorkingSession();
    logout();
  }, [logout]);

  // ── DB / domain state ──────────────────────────────────
  const [skaters, setSkaters] = useState<Skater[]>([]);
  const [selectedSkater, setSelectedSkater] = useState<Skater | null>(null);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [selectedProgram, setSelectedProgram] = useState<Program | null>(null);
  const [elements, setElements] = useState<ElementLog[]>([]);

  // ── Intro / Pre-Inicio (countdown) ─────────────────────────────────────────
  // ÚNICA fuente de verdad del pre-roll en la UI. Se persiste en localStorage y
  // se sincroniza con el motor de audio (que la usa para el conteo real).
  const [preRollSec, setPreRollSec] = useState<number>(() => {
    try {
      const saved = Number(localStorage.getItem('skatecoreo_preroll_sec'));
      return [0, 3, 5, 8].includes(saved) ? saved : 3;
    } catch {
      return 3;
    }
  });

  const handlePreRollSecChange = useCallback((sec: number) => {
    const value = [0, 3, 5, 8].includes(sec) ? sec : 3;
    setPreRollSec(value);
    audioEngine.voiceCueEngine.setIntroDelay(value);
    try {
      localStorage.setItem('skatecoreo_preroll_sec', String(value));
    } catch {
      /* almacenamiento no disponible */
    }
  }, []);

  // Mantiene el motor sincronizado con la selección (incluido el arranque).
  useEffect(() => {
    audioEngine.voiceCueEngine.setIntroDelay(preRollSec);
  }, [preRollSec]);

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
  const clearPaperTraceOverlay = useChoreographyStore((s) => s.clearPaperTraceOverlay);
  const hasPaperTraceOverlay = useChoreographyStore((s) => Boolean(s.paperTraceOverlay));

  // ── Data loading & Offline Autoload ─────────────────────
  // Carga INICIAL única. Se eliminaron `selectedSkater`/`selectedProgram` de las
  // dependencias: al actualizarse dentro del propio callback, la identidad de
  // `loadData` cambiaba y el efecto se re-ejecutaba en bucle (lecturas repetidas
  // a IndexedDB + re-render continuo), lo que en Safari iOS se percibía como
  // congelamiento al navegar entre pestañas.
  const loadData = useCallback(async () => {
    // Estado inicial limpio («lienzo en blanco»): no se siembran atletas,
    // programas ni rutas de demostración. Si la base de datos está vacía, la
    // interfaz guía al usuario a crear su primer perfil y proyecto.
    const allSkaters = await dbService.getAllSkaters();
    setSkaters(allSkaters);

    // Solo se restaura la SESIÓN DE TRABAJO si hay una cuenta con acceso activo
    // (usuario registrado). Sin sesión, la app arranca limpia: no se muestra ni
    // el último atleta/programa ni la pista/auditoría del usuario anterior.
    const hasSession = useAuthStore.getState().hasActiveAccess();

    if (hasSession && allSkaters.length > 0) {
      const active = allSkaters[0];
      setSelectedSkater(active);
      const progs = await dbService.getProgramsBySkater(active.id);
      setPrograms(progs);
      if (progs.length > 0) {
        setSelectedProgram(progs[0]);
        setElements(await dbService.getElementsByProgram(progs[0].id));
      }
    }

    if (!hasSession) return;

    // Auto-recuperar sesión sin conexión de IndexedDB si no hay audio cargado
    try {
      const offlineRecord = await dbService.getOfflineSession();
      if (offlineRecord && !audioEngine.getState().hasAudioLoaded) {
        await audioEngine.loadAudioFile(offlineRecord.audioBlob, offlineRecord.audioFileName);
        // Importación DIRECTA a la Pista 2D → publica como 'direct-file' del Rink.
        useRinkAudioStore.getState().syncFromEngine();
        if (offlineRecord.points && offlineRecord.points.length > 0) {
          loadProgramPoints(offlineRecord.points);
        }
      }
    } catch (e) {
      console.warn('No se pudo restaurar la sesión offline de IndexedDB:', e);
    }
  }, [loadProgramPoints]);

  useEffect(() => { void loadData(); }, [loadData]);

  // ── Audio subscriptions ───────────────────────────────
  useEffect(() => {
    const u1 = audioEngine.onStateChange(setAudioState);
    const u2 = audioEngine.onTimeUpdate(setCurrentTimeMs);
    return () => { u1(); u2(); };
  }, []);

  // ── Handoff de dominio: al entrar al Estudio se detiene TODA la Pista 2D ──
  // (música + metrónomo + voces guía) y el dominio pasa al Estudio. Al volver,
  // se restaura el dominio del Rink. Centraliza todos los puntos de entrada.
  useEffect(() => {
    if (activeView === 'studio') {
      audioEngine.handoffToStudio();
    } else {
      audioEngine.setPlaybackDomain('rink');
    }
  }, [activeView]);

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
    // Hay algo que limpiar si hay nodos/trazados O una hoja A4 de calco cargada.
    if (points.length === 0 && !hasPaperTraceOverlay) return;
    setConfirmClearOpen(true);
  }, [points.length, hasPaperTraceOverlay]);

  /**
   * «Limpiar pista» — reset TOTAL del lienzo:
   *  · elimina todos los nodos y trazados de la coreografía,
   *  · elimina el calco/imagen de la hoja A4 escaneada (Paper-to-Digital),
   *  · deja la pista completamente en blanco.
   */
  const handleClearRink = useCallback(() => {
    setConfirmClearOpen(false);
    if (points.length === 0 && !hasPaperTraceOverlay) return;

    clearAllPoints();
    // Elimina la capa de la hoja A4 escaneada (onion skin) por completo.
    clearPaperTraceOverlay();
    audioEngine.setNodes([]);
    if (selectedProgram) {
      handleProgramUpdated({
        ...selectedProgram,
        choreography_path: []
      });
    }
  }, [points.length, hasPaperTraceOverlay, clearAllPoints, clearPaperTraceOverlay, selectedProgram, handleProgramUpdated]);

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
  // La lectura real del archivo se delega a `useIosFileCapture`, que en iOS
  // reintenta por `change` + `focus` + `visibilitychange` y deduplica.
  const processMusicFile = useCallback(async (file: File) => {
    try {
      await audioEngine.loadAudioFile(file, file.name);
      // CAMINO A: audio directo en la Pista 2D. Se publica como audio activo del
      // Rink ('direct-file'). El Audio Studio NO recibe este audio automáticamente.
      useRinkAudioStore.getState().syncFromEngine();
    } catch (err: any) {
      alert('Error al cargar audio: ' + (err?.message || 'Archivo no compatible'));
    }
  }, []);

  const { handleChange: handleMusicFileChange } = useIosFileCapture(audioInputRef, processMusicFile);

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
      // Import dinámico: el motor de mixdown solo se descarga al exportar.
      const { renderChoreographyMixdown } = await import('./core/audio/audioMixdown');
      const wavBlob = await renderChoreographyMixdown({
        musicBuffer: buffer,
        bpm: metroConfig.bpm,
        beatsPerMeasure: metroConfig.beatsPerMeasure,
        subdivision: metroConfig.subdivision,
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
      // Import dinámico: JSZip (.coreo) solo se descarga al exportar/importar.
      const { exportCoreoProject } = await import('./services/coreoPackage');
      const coreoBlob = await exportCoreoProject(
        selectedProgram?.title || 'Rutina Patinaje',
        selectedSkater?.category || 'Standard',
        useChoreographyStore.getState().skaterGender,
        points,
        rawBlob,
        audioState.fileName,
        metroConfig.bpm,
        metroConfig.beatsPerMeasure,
        1.0,
        metroConfig.subdivision
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
      const { importCoreoProject } = await import('./services/coreoPackage');
      const project = await importCoreoProject(file);
      // Cargar audio si viene dentro del paquete
      if (project.audioBlob) {
        await audioEngine.loadAudioFile(project.audioBlob, project.manifest.audioMeta.fileName);
        useRinkAudioStore.getState().syncFromEngine();
      }
      // Restaurar nodos en el Canvas
      loadProgramPoints(project.points);
      audioEngine.setNodes(project.points);
      // Restaurar la subdivisión del metrónomo del proyecto (1/1, 1/2, 1/4, 1/8).
      const importedSubdivision = project.manifest.audioMeta?.subdivision;
      if (
        importedSubdivision === 1 ||
        importedSubdivision === 2 ||
        importedSubdivision === 4 ||
        importedSubdivision === 8
      ) {
        useAudioStudioStore.getState().setMetronomeConfig({ subdivision: importedSubdivision });
      }
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

  /**
   * Guardia anti doble-disparo táctil.
   *
   * En iOS/WebKit un toque puede generar `touchend` + `click` (y a veces un
   * segundo `click` sintético), lo que montaba dos veces la vista destino y, con
   * el lienzo pesado, congelaba el hilo principal. Se ignoran activaciones
   * repetidas dentro de una ventana corta.
   */
  const navLockRef = useRef(0);

  // Navegación principal unificada para Bottom Nav, Sidebar y Barra Desktop
  const handleNav = useCallback((tab: AppTab) => {
    const now = performance.now();
    if (now - navLockRef.current < 260) return;
    navLockRef.current = now;

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
    // Cambio de vista como transición: el montaje del lienzo pesado no bloquea
    // la respuesta táctil del sistema en WebKit.
    startTransition(() => setActiveView(tab));
  }, []);

  // El digitalizador solicita volver a la Pista 2D al terminar (sin diálogos
  // bloqueantes). Este listener garantiza la navegación inmediata.
  useEffect(() => {
    const goRink = () => handleNav('rink');
    window.addEventListener('skatecoreo:goto-rink', goRink);
    return () => window.removeEventListener('skatecoreo:goto-rink', goRink);
  }, [handleNav]);

  const handleToggleInspector = useCallback(() => {
    setDrawerOpen(false);
    setSheetOpen((open) => !open);
  }, []);

  // ── Render ────────────────────────────────────────────
  return (
    <ProtectedLayout>
      {/* Indicador global de carga: barra superior no invasiva */}
      <LoadProgressBar />
      <div className="app-viewport-height w-full overflow-hidden flex flex-col bg-neon-canvas text-white select-none font-sans">

        {/* Hidden file inputs */}
      <input
        ref={audioInputRef}
        type="file"
        accept={ACCEPTED_AUDIO_FORMATS}
        className="hidden"
        onChange={handleMusicFileChange}
      />
      <input
        ref={coreoInputRef}
        type="file"
        accept={ACCEPTED_PROJECT_FORMATS}
        className="hidden"
        onChange={handleImportCoreoChange}
      />

      {/* ═══════════════════════════════════════════════
          HEADER — Consola superior
          IZQUIERDA (marca) · CENTRO (navegación desktop) · DERECHA (acciones)
          Sin `flex-wrap`: una sola fila garantiza cero apiñamiento/superposición.
          ═══════════════════════════════════════════════ */}
      {activeView !== 'studio' && (
        <header className="relative z-30 shrink-0 glass-hud border-b border-white/10 pt-safe px-safe">
          <div className="flex min-h-[54px] items-center justify-between gap-2 px-2 py-1 sm:px-3 lg:min-h-[60px] lg:px-4">

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

          {/* Insignia Beta Tester (acceso de 30 días) */}
          {authPlan === 'beta_tester' && (
            <div
              className="ml-2 hidden items-center gap-1.5 rounded-full border border-coral/40 bg-coral/15 px-2.5 py-1 sm:flex"
              title={`Acceso Beta Tester · vence el ${getFormattedExpiration() ?? '—'}`}
            >
              <Sparkles className="h-3.5 w-3.5 shrink-0 text-coral" />
              <span className="text-[10px] font-black uppercase tracking-wide text-coral">Beta Tester</span>
              <span className="rounded-full bg-black/30 px-1.5 py-0.5 font-mono text-[10px] font-bold text-white">
                {getDaysRemaining()}d
              </span>
            </div>
          )}
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
                sourceKind={audioState.sourceKind}
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

          {/* Botón Subir pista (escritorio). En móvil/tablet vive en la segunda
              fila del header con TEXTO visible (el icono solo era ambiguo). */}
          <button
            type="button"
            onClick={() => audioInputRef.current?.click()}
            className="press hidden min-h-touch items-center justify-center gap-2 rounded-xl border border-cyan/30 bg-cyan/15 px-3 text-xs font-bold text-cyan shadow-soft-elevation hover:bg-cyan/25 lg:flex lg:px-3.5"
            title="Subir una pista de audio directamente al visor de la Pista 2D"
            aria-label="Subir pista al visor"
          >
            <Upload className="h-4 w-4 shrink-0 stroke-[2]" />
            <span className="lg:inline">Subir pista al visor</span>
          </button>

          {/* Botón de Salir / Cerrar Sesión (header en ≥ sm; en móvil vive en el
              menú de desbordamiento y en el panel de Preparación) */}
          <button
            type="button"
                  onClick={() => { void handleLogout(); }}
            className="press hidden h-12 w-12 min-h-touch min-w-touch items-center justify-center rounded-xl border border-coral/20 bg-coral/[0.06] text-slate-300 hover:bg-coral/15 hover:text-coral sm:flex"
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
                        onClick={() => { setShowExportMenu(false); void handleLogout(); }}
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

          {/* ── FILA MÓVIL DE ACCIONES FUNDAMENTALES (Pista 2D, < lg) ──
              En portrait los botones críticos llevan TEXTO visible: el icono
              solo era ambiguo. Una segunda fila evita todo overflow horizontal.
              · Subir pista al visor      → carga un archivo DIRECTAMENTE al visor.
              · Editar mezcla en Estudio  → NAVEGA al Audio Studio (no publica). */}
          {activeView === 'rink' && (
            <div className="flex items-stretch gap-2 px-2 pb-2 lg:hidden">
              <button
                type="button"
                onClick={() => audioInputRef.current?.click()}
                className="press flex min-h-touch min-w-0 flex-1 items-center justify-center gap-1.5 rounded-xl border border-cyan/30 bg-cyan/15 px-2.5 text-[11px] font-bold text-cyan hover:bg-cyan/25"
                title="Subir una pista de audio directamente al visor de la Pista 2D"
                aria-label="Subir pista al visor"
              >
                <Upload className="h-4 w-4 shrink-0 stroke-[2]" />
                <span className="truncate">Subir pista al visor</span>
              </button>
              <button
                type="button"
                onClick={() => handleNav('studio')}
                className="press flex min-h-touch min-w-0 flex-1 items-center justify-center gap-1.5 rounded-xl border border-white/15 bg-white/[0.06] px-2.5 text-[11px] font-bold text-slate-200 hover:bg-white/[0.12]"
                title="Abrir el Audio Studio para editar y mezclar la música (no publica ni cambia el audio activo)"
                aria-label="Editar mezcla en Estudio"
              >
                <SlidersHorizontal className="h-4 w-4 shrink-0" />
                <span className="truncate">Editar mezcla en Estudio</span>
              </button>
            </div>
          )}
        </header>
      )}

      {/* ═══════════════════════════════════════════════
          SHELL — navegación + vista activa
          Inicio (Hero + Acciones) · Estudio DAW · Pista 2D
          Portrait-first: en móvil/tablet (< lg) la vista es una sola columna;
          en escritorio (lg+) se mantiene el layout de tres columnas.
          ═══════════════════════════════════════════════ */}
      <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden relative">

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
            onOpenPaperToDigital={() => setPaperOpen(true)}
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
          <div className="flex-1 min-w-0 min-h-0 flex flex-col lg:flex-row overflow-hidden relative">
            {/* ── DESKTOP LEFT ASIDE (Preparación y Mezcla) ── */}
            <aside className="hidden lg:flex lg:w-[272px] xl:w-[288px] shrink-0 flex-col bg-neon-surface border-r border-white/5 overflow-hidden shadow-soft-elevation">
              <LeftSidebarPanel
                preRollSec={preRollSec}
                onPreRollSecChange={handlePreRollSecChange}
                onUndo={handleUndo}
                                onClearRink={requestClearRink}
                onOpenAudioStudio={() => setActiveView('studio')}
                onLogout={handleLogout}
              />
            </aside>

        {/* ── CENTER WORKSPACE: 2D Rink Canvas + Waveform Timeline ── */}
        <main className="flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden bg-neon-canvas relative">

          {/* Bandeja de Colocación de Nodos de Audio (Estricto Orden Secuencial).
              Vive DENTRO del área de la Pista 2D para no solaparse con el
              inspector/paneles laterales (flota sobre el propio editor). */}
          <NodePlacementTray onOpenAudioStudio={() => setActiveView('studio')} />

          {/* 2D Canvas Rink Engine — Zero Distortion. Zona protegida: conserva
              una altura mínima útil y absorbe el espacio restante (protagonista). */}
          <div className="workspace-canvas overflow-hidden">
            <RinkCanvas
              layoutMode="ide"
              currentProgram={selectedProgram}
              onProgramUpdated={handleProgramUpdated}
              elements={elements}
              onNodeSelect={handleNodeSelect}
              onDragChange={handleDragChange}
            />
          </div>

          {/* ── AUDIO DOCK: Transporte + Waveform ──
              Portrait-first: en columna, dimensionado por CONTENIDO con tope
              fluido (`.audio-dock`), de modo que el panel de audio nunca queda
              recortado en teléfonos grandes ni pequeños. La pista conserva el
              máximo espacio vertical. */}
          <div className="landscape-audio-dock audio-dock shrink-0 border-t border-white/5 pb-safe bg-neon-surface/30">

            {/* Transporte compacto (en desktop lo reemplaza el del header) */}
            <div className="shrink-0 flex items-center border-b border-white/5 bg-neon-surface/60 px-2 py-1.5 pl-safe pr-safe lg:hidden">
              <RinkAudioPlayer
                variant="compact"
                currentTimeMs={currentTimeMs}
                durationMs={audioState.durationMs || 240000}
                isPlaying={isAudioActive}
                hasAudioLoaded={audioState.hasAudioLoaded}
                fileName={audioState.fileName}
                sourceKind={audioState.sourceKind}
              />
            </div>

            {/* Waveform Timeline — min-height suficiente para que el header del
                visor + la pista de onda + los marcadores quepan sin recortes. */}
            <div className="flex-1 min-w-0 min-h-[112px] bg-neon-surface/40">
              <InteractiveWaveform
                currentTimeMs={currentTimeMs}
                durationMs={audioState.durationMs}
                isPlaying={isAudioActive}
                onSeek={(ms) => audioEngine.seek(ms)}
                fileName={audioState.fileName}
                onOpenStudio={() => setActiveView('studio')}
              />
            </div>
          </div>
        </main>

        {/* ── DESKTOP RIGHT ASIDE (Inspector de Nodo) ── */}
        <aside className="hidden lg:flex lg:w-[272px] xl:w-[288px] shrink-0 flex-col bg-neon-surface border-l border-white/5 overflow-hidden shadow-soft-elevation">
          <RightInspectorPanel onClose={() => useChoreographyStore.getState().setSelectedPointId(null)} />
        </aside>



        {/* ── MOBILE INSPECTOR · PORTRAIT-FIRST (Bottom Sheet) ──
            Única presentación del inspector en móvil/tablet (< lg): un sheet
            deslizable desde abajo que deja la Pista 2D como protagonista y
            permite cerrarlo para recuperar TODO el espacio. Se abre al
            seleccionar un nodo o con el botón «Figuras» de la barra de pista. */}
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Inspector de nodo"
          className={[
            'lg:hidden fixed z-50 flex flex-col bg-neon-surface shadow-2xl shadow-black/80',
            'bottom-0 left-0 right-0 rounded-t-3xl border-t border-white/10',
            'transition-transform duration-ui ease-spring',
            sheetOpen ? 'translate-y-0' : 'translate-y-full',
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
          {/* Pull Grip Affordance */}
          <div
            className="flex shrink-0 justify-center pt-3 pb-1 cursor-pointer"
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
              <ChevronDown className="w-5 h-5 stroke-[2]" />
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

      {/* ── BARRA DE HERRAMIENTAS DE PISTA (portrait móvil/tablet, < lg) ── */}
      {activeView === 'rink' && (
        <RinkContextTools
          layout="bar"
          onClear={requestClearRink}
          inspectorOpen={sheetOpen}
          onToggleInspector={handleToggleInspector}
          onResetView={() => useChoreographyStore.getState().requestCameraReset()}
        />
      )}

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
            onPreRollSecChange={handlePreRollSecChange}
            onUndo={handleUndo}
                        onClearRink={requestClearRink}
            onOpenAudioStudio={() => { setDrawerOpen(false); setActiveView('studio'); }}
            onLogout={handleLogout}
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
        } de la coreografía actual${hasPaperTraceOverlay ? ' y la hoja A4 escaneada (calco)' : ''}. El lienzo quedará completamente en blanco. Esta acción no se puede deshacer.`}
        confirmLabel="Sí, limpiar pista"
        cancelLabel="Cancelar"
        onConfirm={handleClearRink}
        onCancel={() => setConfirmClearOpen(false)}
      />

      {/* Digitalización de la plantilla A4 (accesible desde Home y desde la Pista) */}
      <PaperToDigitalModal
        isOpen={paperOpen}
        onClose={() => setPaperOpen(false)}
        onDigitalized={() => setActiveView('rink')}
      />
      </div>
    </ProtectedLayout>
  );
}

export default App;
