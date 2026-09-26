import React, { useCallback, useEffect, useLayoutEffect, useState, useRef, useMemo } from 'react';
import {
  ZoomIn,
  ZoomOut,
  Scissors,
  MapPin,
  CheckCircle2,
  Plus,
  Play,
  Pause,
  Square,
  Sliders,
  Bell,
  Trash2,
  Mic,
  Repeat,
  Headphones,
  Timer,
} from 'lucide-react';
import { useAudioStudioStore, flushPendingConsolidation, hasAudioInStudio } from '../../store/useAudioStudioStore';
import { audioEngine } from '../../services/audioEngine';
import { useAudioZoomPan } from '../../hooks/useAudioZoomPan';
import { usePressAction } from '../../hooks/usePressAction';
import { usePlayheadSync } from '../../hooks/usePlayheadSync';
import { useIosFileCapture } from '../../hooks/useIosFileCapture';
import { createTimelineGeometry } from '../../core/audio/timeline/AudioTimelineGeometry';
import {
  computeTrackLaneHeight,
  computeTrackHeaderWidth,
} from '../../core/audio/timeline/TrackLaneLayout';
import { useViewportSize } from '../../hooks/useViewportSize';
import { AudioStudioTrack } from '../../types/audioStudio';
import { ACCEPTED_AUDIO_FORMATS } from '../../constants/mediaFormats';
import { TopTransportBar } from './TopTransportBar';
import { AudioTimeRuler } from './AudioTimeRuler';
import { MultitrackTrackRow } from './MultitrackTrackRow';
import { FloatingClipContextMenu } from './FloatingClipContextMenu';
import { BandLabMixerDrawer } from './BandLabMixerDrawer';
import { TRASH_ZONE_ID } from './AudioClipItem';
import { ConfirmDialog } from '../ConfirmDialog';

interface AudioStudioViewProps {
  onExportToRink?: () => void;
  onBackToRink?: () => void;
  onGoHome?: () => void;
  onOpenDrawer?: () => void;
}

/**
 * `pan-x pan-y` permite desplazar la línea de tiempo con un dedo pero BLOQUEA el
 * zoom nativo del navegador, de modo que el gesto de pinza llega íntegro a
 * nuestro gestor de zoom (crítico en orientación horizontal).
 */
const STUDIO_TOUCH_ACTION: React.CSSProperties = { touchAction: 'pan-x pan-y' };

export const AudioStudioView: React.FC<AudioStudioViewProps> = ({
  onExportToRink,
  onBackToRink,
  onGoHome,
}) => {
  const tracks = useAudioStudioStore((s) => s.tracks);
  const additionalTracks = useAudioStudioStore((s) => s.additionalTracks);
  const audioNodes = useAudioStudioStore((s) => s.audioNodes);
  const selectedNodeId = useAudioStudioStore((s) => s.selectedNodeId);
  // NOTA de rendimiento: este componente NO se suscribe a `currentTimeSec`. La
  // aguja se mueve por una ruta DOM ligera (`applyPlayheadRef`) y, durante el
  // scrub táctil, el estado del store se sincroniza COMO MÁXIMO una vez por frame.
  // Suscribirse aquí re-renderizaba TODO el arreglo en cada `pointermove`.
  const totalDurationSec = useAudioStudioStore((s) => s.totalDurationSec);
  const isPlaying = useAudioStudioStore((s) => s.isPlaying);
  const setIsPlaying = useAudioStudioStore((s) => s.setIsPlaying);

  const setCurrentTimeSec = useAudioStudioStore((s) => s.setCurrentTimeSec);
  const setTrackBuffer = useAudioStudioStore((s) => s.setTrackBuffer);
  const addAudioTrack = useAudioStudioStore((s) => s.addAudioTrack);
  const removeAudioTrack = useAudioStudioStore((s) => s.removeAudioTrack);
  const moveClipToTrack = useAudioStudioStore((s) => s.moveClipToTrack);
  const addTimeNode = useAudioStudioStore((s) => s.addTimeNode);
  const renderAndExportMixdown = useAudioStudioStore((s) => s.renderAndExportMixdown);

  // Grabación de voz (Fase 4)
  const isRecording = useAudioStudioStore((s) => s.isRecording);
  const recordingElapsedSec = useAudioStudioStore((s) => s.recordingElapsedSec);
  const recordingError = useAudioStudioStore((s) => s.recordingError);
  const startVoiceRecording = useAudioStudioStore((s) => s.startVoiceRecording);
  const stopVoiceRecording = useAudioStudioStore((s) => s.stopVoiceRecording);
  const undoStudio = useAudioStudioStore((s) => s.undoStudio);
  const redoStudio = useAudioStudioStore((s) => s.redoStudio);
  const recordingMonitorEnabled = useAudioStudioStore((s) => s.recordingMonitorEnabled);
  const setRecordingMonitor = useAudioStudioStore((s) => s.setRecordingMonitor);
  const recordingCountdownEnabled = useAudioStudioStore((s) => s.recordingCountdownEnabled);
  const recordingCountdownSec = useAudioStudioStore((s) => s.recordingCountdownSec);
  const recordingCountdown = useAudioStudioStore((s) => s.recordingCountdown);
  const setRecordingCountdownEnabled = useAudioStudioStore((s) => s.setRecordingCountdownEnabled);
  const setRecordingCountdownSec = useAudioStudioStore((s) => s.setRecordingCountdownSec);

  const globalControls = useAudioStudioStore((s) => s.globalControls);
  const toggleMetronomeMute = useAudioStudioStore((s) => s.toggleMetronomeMute);

  const selectedClipId = useAudioStudioStore((s) => s.selectedClipId);
  const splitClip = useAudioStudioStore((s) => s.splitClip);
  const draggingGhost = useAudioStudioStore((s) => s.draggingGhost);
  const lastCutSec = useAudioStudioStore((s) => s.lastCutSec);
  const setLastCutSec = useAudioStudioStore((s) => s.setLastCutSec);
  const consolidateStudioAudio = useAudioStudioStore((s) => s.consolidateStudioAudio);
  const trashDrag = useAudioStudioStore((s) => s.trashDrag);
  const endTrashDrag = useAudioStudioStore((s) => s.endTrashDrag);

  const [isExporting, setIsExporting] = useState(false);
  const [exportNotice, setExportNotice] = useState<string | null>(null);
  const [confirmReplaceOpen, setConfirmReplaceOpen] = useState(false);
  const [loopEnabled, setLoopEnabled] = useState<boolean>(() => !!audioEngine.getLoop());
  const [showMixerDrawer, setShowMixerDrawer] = useState(false);

  // Activación táctil inmediata sin doble disparo (evita el Play/Pausa fantasma)
  const press = usePressAction();

  /**
   * Ancho de cabecera de pista: UNA SOLA fuente de verdad para la regla, la
   * geometría, el playhead y las cabeceras de fila. Antes había 90px fijos aquí
   * frente a `sm:w-28` (112px) en la fila, lo que desplazaba 22px los clips y el
   * playhead respecto de la regla en desktop. Se sigue el breakpoint `sm` (640px).
   */
  /**
   * Ancho de cabecera de pista: UNA SOLA fuente de verdad para la regla, la
   * geometría, el playhead y las cabeceras. Se deriva del ANCHO REAL disponible
   * (el Studio es full-screen, así que el viewport equivale al contenedor) con
   * tramos compact/medium/wide, y reacciona a resize/orientación. Ya no hay un
   * valor fijo que obligue a truncar el nombre de la pista.
   */
  const [headerWidth, setHeaderWidth] = useState<number>(() =>
    computeTrackHeaderWidth(typeof window !== 'undefined' ? window.innerWidth : 1280)
  );
  useEffect(() => {
    const update = () => setHeaderWidth(computeTrackHeaderWidth(window.innerWidth));
    update();
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
    };
  }, []);

  // Espacio Vacío Continuo de Ensamblaje (450px) tras el final del audio.
  const OVERSCROLL_PX = 450;

  // La marca de corte es un aviso TRANSITORIO: se apaga sola tras unos segundos.
  useEffect(() => {
    if (lastCutSec === null) return;
    const id = window.setTimeout(() => setLastCutSec(null), 1800);
    return () => window.clearTimeout(id);
  }, [lastCutSec, setLastCutSec]);
  const playheadLineRef = useRef<HTMLDivElement | null>(null);
  // La aguja es SOLO visual (pointer-events: none): nunca intercepta rueda, pan,
  // drag de clips ni scroll. Este ref permite reapuntarla desde `onScroll`.
  const applyPlayheadRef = useRef<(timeMs: number) => void>(() => {});
  const workspaceRef = useRef<HTMLDivElement | null>(null);
  const addTrackFileInputRef = useRef<HTMLInputElement | null>(null);

  // Coalescencia del scrub: muchos `pointermove` → como máximo UNA sincronización
  // de estado de React por frame. La aguja y el motor se actualizan al instante.
  const seekRafRef = useRef<number | null>(null);
  const pendingSeekSecRef = useRef<number | null>(null);

  // Motor de Zoom y Paneo Dinámico con matemática touch precisa y overscroll continuo
  const {
    zoom,
    containerRef: timelineContainerRef,
    contentWidth,
    overscrollPx,
    zoomIn,
    zoomOut,
    resetZoom,
    isInteracting,
  } = useAudioZoomPan({
    minZoom: 1.0,
    maxZoom: 35.0,
    initialZoom: 1.0,
    widthOffset: headerWidth,
    overscrollPx: OVERSCROLL_PX,
    enableWheelPan: true,
    // Rueda normal = scroll NATIVO (vertical entre pistas); el paneo horizontal con
    // rueda requiere Shift; solo Ctrl/⌘+rueda hace zoom.
    wheelPanRequiresShift: true,
    onZoomChange: (z) => useAudioStudioStore.getState().setZoom(z),
    // Al hacer scroll horizontal, la aguja (anclada al viewport) se reposiciona.
    onScroll: () => applyPlayheadRef.current(audioEngine.getCurrentTimeMs()),
  });

  /**
   * Única transformación tiempo ↔ píxeles del Estudio. El origen es el ancho de
   * la cabecera de pista, porque el playhead y la guía de snapping viven en el
   * espacio del área temporal (a la derecha de la columna de nombres).
   */
  const timelineGeometry = useMemo(
    () =>
      createTimelineGeometry({
        contentWidth,
        durationSec: Math.max(10, totalDurationSec),
        originPx: headerWidth,
      }),
    [contentWidth, totalDurationSec, headerWidth]
  );

  // Tamaño real del área de arreglos (alto útil según viewport móvil/orientación).
  const timelineViewport = useViewportSize(timelineContainerRef);

  // (El playhead ya no se arrastra: es pointer-events:none. El seek se hace con la
  // regla o el long-press sobre el workspace.)

  /**
   * Proyección tiempo → píxeles con coma flotante (sin redondeo).
   * `headerWidth` es el ancho de la columna fija de nombres de pista; `contentWidth`
   * es el ancho total de la línea de tiempo.
   */
  const playheadPxFor = useCallback(
    (timeMs: number) => timelineGeometry.timeToPx(timeMs / 1000, true),
    [timelineGeometry]
  );

  /**
   * Escritura directa sobre el DOM: `transform: translateX(...)`.
   * No hay `setState` aquí, así que ningún frame provoca re-render de React.
   * El auto-scroll sigue al cabezal con el mismo reloj de hardware.
   */
  const applyPlayheadFromHardwareClock = useCallback(
    (timeMs: number) => {
      // `px` = coordenada de CONTENIDO (incluye headerWidth). La aguja vive en un
      // overlay del VIEWPORT de la timeline (a la derecha del header), así que se
      // resta `scrollLeft` + `headerWidth` para confinarla: nunca invade la columna
      // de nombres y el `overflow-hidden` del overlay la recorta al salir.
      const px = playheadPxFor(timeMs);

      const line = playheadLineRef.current;
      if (line) {
        const scrollLeft = timelineContainerRef.current?.scrollLeft ?? 0;
        line.style.transform = `translateX(${px - scrollLeft - headerWidth}px) translateX(-50%)`;
      }

      const container = timelineContainerRef.current;
      // Seguimiento automático SOLO si el usuario no está manipulando el timeline
      // (pan/pinch/arrastre): durante la edición el control de la vista es suyo.
      if (container && isPlaying && zoom > 1.05 && !isInteracting()) {
        const left = container.scrollLeft;
        const right = left + container.clientWidth;
        if (px > right - 80 || px < left + 100) {
          container.scrollLeft = Math.max(0, px - container.clientWidth / 2);
        }
      }
    },
    [playheadPxFor, isPlaying, zoom, isInteracting, headerWidth]
  );
  applyPlayheadRef.current = applyPlayheadFromHardwareClock;

  /**
   * SEEK de interfaz con RUTA LIGERA.
   *
   * Antes, cada `pointermove` de la regla llamaba a `setCurrentTimeSec`, lo que
   * re-renderizaba TODO el Audio Studio (arreglo + pistas + clips + marcadores)
   * decenas de veces por segundo → en móvil esto era el lag/saltos del playhead.
   *
   * Ahora TODO el trabajo se coalesce a UN frame:
   *   1. `audioEngine.seek(ms)`  → una sola vez por frame (el seek re-agenda la
   *      fuente y emite cambios de estado, así que no debe correr por evento).
   *   2. `applyPlayheadRef`      → la aguja se mueve por `transform` (sin React).
   *   3. `setCurrentTimeSec`     → el estado también, una vez por frame.
   * Y como `AudioStudioView` ya no se suscribe a `currentTimeSec`, el último paso
   * solo re-renderiza componentes ligeros (p. ej. la barra superior).
   */
  const handleSeek = useCallback(
    (sec: number) => {
      const clamped = Math.max(0, Number.isFinite(sec) ? sec : 0);
      pendingSeekSecRef.current = clamped;
      if (seekRafRef.current === null) {
        seekRafRef.current = requestAnimationFrame(() => {
          seekRafRef.current = null;
          const pending = pendingSeekSecRef.current;
          pendingSeekSecRef.current = null;
          if (pending === null) return;
          const ms = pending * 1000;
          audioEngine.seek(ms);
          applyPlayheadRef.current(ms);
          setCurrentTimeSec(pending);
        });
      }
    },
    [setCurrentTimeSec]
  );

  /**
   * Reposiciona la aguja ante cambios de `currentTimeSec` que NO pasan por
   * `handleSeek` (Escape → 0:00, "Dividir en el cabezal" del menú contextual…).
   * Se suscribe de forma IMPERATIVA al store (sin selector React), así no
   * provoca el re-render completo del arreglo que se eliminó por rendimiento.
   * Durante la reproducción no interfiere: el rAF del reloj manda.
   */
  useEffect(() => {
    return useAudioStudioStore.subscribe((state, prev) => {
      if (state.currentTimeSec === prev.currentTimeSec) return;
      if (useAudioStudioStore.getState().isPlaying) return;
      applyPlayheadRef.current(state.currentTimeSec * 1000);
    });
  }, []);

  // Cancelación limpia de la coalescencia al desmontar (sin timers colgados).
  useEffect(
    () => () => {
      if (seekRafRef.current !== null) {
        cancelAnimationFrame(seekRafRef.current);
        seekRafRef.current = null;
      }
    },
    []
  );

  /**
   * SNAPSHOT Rink → Studio en el MONTAJE (antes del primer pintado).
   *
   * Es el único puente de entrada: da igual si el usuario llegó por el botón del
   * visor, por la navegación o por un gesto de borde. Se ejecuta de forma
   * SINCRÓNICA con `useLayoutEffect`, así el Estudio nunca se muestra vacío ni
   * existe una carrera temporal (no hay `setTimeout`).
   */
  useLayoutEffect(() => {
    // Nota: NO se llama a `setActiveDurationSec` aquí: el dominio del motor aún es
    // 'rink' en el montaje y sobrescribiría su duración. El efecto pasivo de
    // duración, ya con el dominio 'studio' activo, se encarga de fijarla.
    useAudioStudioStore.getState().syncRinkSnapshotIntoStudio();
  }, []);

  // Playhead gobernado por el reloj de hardware (AudioContext.currentTime).
  // Durante la reproducción: un frame de rAF compartido para toda la app.
  // En pausa/seek/zoom: una única escritura puntual con el tiempo real.
  // El refreshKey incluye la geometría (zoom, anchos, duración): al cambiar
  // reposiciona la aguja con el tiempo real del motor. El scrub táctil escribe
  // la aguja directamente (`handleSeek`), sin depender de este refreshKey.
  usePlayheadSync(applyPlayheadFromHardwareClock, {
    active: isPlaying,
    refreshKey: `${contentWidth}|${totalDurationSec}|${headerWidth}|${zoom}`,
  });

  // 1 Pista Principal (Música) + VOZ grabada + hasta 4 Pistas Adicionales
  const arrangementTracks: AudioStudioTrack[] = useMemo(() => {
    return [tracks.music, tracks.recording, ...additionalTracks];
  }, [tracks.music, tracks.recording, additionalTracks]);

  /**
   * ¿Existe audio real en las pistas del Estudio?
   * Se verifica de forma reactiva contra todas las pistas editables (música, voz, recording, adicionales).
   */
  const hasStudioAudio = useAudioStudioStore(hasAudioInStudio);

  /**
   * Habilita los controles de transporte (Stop, Split, Loop) solo si hay audio real en el Estudio.
   */
  const hasTransportAudio = hasStudioAudio;

  // Atajos de teclado en escritorio:
  // - Espacio: Reproducir / Pausar
  // - Ctrl + C: Copiar clip de la pista (seleccionado o bajo el cabezal)
  // - Ctrl + V: Pegar clip copiado en la pista Master en la posición del cabezal
  // - Supr / Backspace: Eliminar clip seleccionado
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const activeEl = document.activeElement as HTMLElement | null;
      const activeTag = activeEl?.tagName;
      if (
        activeTag === 'INPUT' ||
        activeTag === 'TEXTAREA' ||
        activeTag === 'SELECT' ||
        activeEl?.isContentEditable ||
        target?.isContentEditable
      ) {
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        // Ctrl/Cmd+Z → Deshacer; Ctrl/Cmd+Shift+Z → Rehacer (atajos de DAW).
        e.preventDefault();
        if (e.shiftKey) {
          redoStudio();
        } else {
          undoStudio();
        }
      } else if (e.code === 'Space') {
        // Evita repetición por auto-repeat al mantener pulsado
        if (e.repeat) return;
        // preventDefault cancela la activación nativa del <button> enfocado:
        // sin esto, un botón con foco + este atajo ejecutaban la acción DOS veces
        // (causa directa del Play/Pausa fantasma con teclado).
        e.preventDefault();
        if (!hasStudioAudio && !isPlaying) return;
        handlePlayToggle();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
        e.preventDefault();
        const store = useAudioStudioStore.getState();
        let targetClipId = store.selectedClipId;

        // Si no hay clip seleccionado explícitamente, buscar el clip que esté bajo el cabezal
        if (!targetClipId) {
          // Tiempo REAL del reloj de hardware (el estado de React ya no se
          // re-suscribe al playhead para no re-renderizar el arreglo en cada frame).
          const headSec = audioEngine.getCurrentTimeMs() / 1000;
          for (const t of arrangementTracks) {
            const found = t.clips.find(
              (c) => headSec >= c.startOffsetSec && headSec <= c.startOffsetSec + (c.trimEndSec - c.trimStartSec)
            );
            if (found) {
              targetClipId = found.id;
              store.setSelectedClipId(found.id);
              break;
            }
          }
        }

        if (targetClipId) {
          store.copyClip();
          setExportNotice('📋 Clip copiado. Pega con Ctrl+V en el cabezal o en el lienzo Master');
          setTimeout(() => setExportNotice(null), 2500);
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
        const store = useAudioStudioStore.getState();
        const clipboard = store.audioClipboard || store.clipboardClip;
        if (clipboard) {
          e.preventDefault();
          const targetTrack = arrangementTracks.find((t) => t.id === store.activeTrackId) || tracks.music;
    // Tiempo de HARDWARE (no el estado de React, que va con retraso): el pegado
    // cae exactamente bajo el cabezal visible.
    const exactSec = audioEngine.getCurrentTimeMs() / 1000;
      store.pasteClip(targetTrack.id, exactSec, timelineGeometry.pixelsPerSecond);
      setCurrentTimeSec(exactSec);
      setExportNotice(`✂️ Clip pegado en "${targetTrack.name}" a los ${exactSec.toFixed(3)}s`);
          setTimeout(() => setExportNotice(null), 2500);
        }
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        const selId = useAudioStudioStore.getState().selectedClipId;
        if (selId) {
          e.preventDefault();
          useAudioStudioStore.getState().deleteClip();
          setExportNotice('🗑️ Clip eliminado');
          setTimeout(() => setExportNotice(null), 2000);
        }
      } else if (e.key.toLowerCase() === 'r' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        // R → Grabar / Detener grabación (atajo profesional de DAW).
        e.preventDefault();
        if (isRecording) {
          void stopVoiceRecording();
        } else {
          void startVoiceRecording();
        }
      } else if (e.key.toLowerCase() === 'l' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        // L → Repetir (loop), atajo estándar de DAW.
        e.preventDefault();
        const nextLoop = !audioEngine.getLoop();
        const loopDurationSec = useAudioStudioStore.getState().totalDurationSec;
        audioEngine.setLoop(nextLoop, 0, loopDurationSec);
        setLoopEnabled(!!audioEngine.getLoop());
      } else if (e.key === 'Escape') {
        // Esc → Cancelar grabación o detener el transporte. No se aplica si hay
        // un diálogo modal abierto (ConfirmDialog gestiona su propio Escape).
        if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
        e.preventDefault();
        if (isRecording) {
          useAudioStudioStore.getState().cancelVoiceRecording();
        } else {
          audioEngine.pause();
          audioEngine.seek(0);
          setIsPlaying(false);
          setCurrentTimeSec(0);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPlaying, tracks.music.id, arrangementTracks, isRecording, startVoiceRecording, stopVoiceRecording, undoStudio, redoStudio]);

  // Carga infalible de archivos de audio
  const handleUploadFile = async (trackId: string, file: File) => {
    try {
      const buffer = await audioEngine.decodeAudioFile(file);
      setTrackBuffer(trackId, buffer, file.name);
      if (trackId === 'music') {
        audioEngine.setAudioBuffer(buffer, file.name);
      }
    } catch (err: any) {
      alert('Error al cargar archivo de audio: ' + (err?.message || 'Archivo no compatible'));
    }
  };

  // Importar archivo desde la barra superior
  const handleImportGlobal = async (file: File) => {
    try {
      const buffer = await audioEngine.decodeAudioFile(file);
      // Caso 1: Modo Pista Única (sin pistas adicionales y Master libre) -> Carga rápida directa en Master
      if (additionalTracks.length === 0 && (!tracks.music.buffer || tracks.music.clips.length === 0)) {
        setTrackBuffer('music', buffer, file.name);
        audioEngine.setAudioBuffer(buffer, file.name);
      } else if (additionalTracks.length < 4) {
        // Caso 2: Modo Multipista -> La Master es lienzo de ensamblaje; se importa en pista adicional
        const newTrack = addAudioTrack(file.name.replace(/\.[^/.]+$/, ''), buffer, file.name);
        setTrackBuffer(newTrack.id, buffer, file.name);
      } else {
        alert('Límite de pistas alcanzado (1 Master + 4 adicionales). En modo multipista, utiliza las pistas adicionales para cortar y pegar hacia el lienzo Master.');
      }
    } catch (err: any) {
      alert('Error al importar audio: ' + (err?.message || 'Archivo no compatible'));
    }
  };

  // Añadir pista desde botón + con archivo opcional
  // La captura la gestiona `useIosFileCapture` (iOS: reintentos + deduplicación).
  const processAddTrackFile = useCallback((file: File) => {
    void (async () => {
      if (additionalTracks.length >= 4) return;
      try {
        const buffer = await audioEngine.decodeAudioFile(file);
        const newTrack = addAudioTrack(file.name.replace(/\.[^/.]+$/, ''), buffer, file.name);
        setTrackBuffer(newTrack.id, buffer, file.name);
      } catch (err: any) {
        alert('Error al decodificar audio: ' + err?.message);
      }
    })();
  }, [additionalTracks.length, addAudioTrack, setTrackBuffer]);

  const { handleChange: handleAddTrackFileSelected } = useIosFileCapture(
    addTrackFileInputRef,
    processAddTrackFile
  );

  // Track Hopping (arrastre vertical entre pistas)
  const handleTrackHop = (
    fromTrackId: string,
    targetTrackIndex: number,
    clipId: string,
    newOffsetSec: number
  ) => {
    const targetTrack = arrangementTracks[targetTrackIndex];
    if (!targetTrack || targetTrack.id === fromTrackId) return;
    moveClipToTrack(fromTrackId, targetTrack.id, clipId, newOffsetSec);
  };

  // Corte milimétrico del clip seleccionado en la posición exacta del cabezal.
  // El store ajusta el punto de corte al cruce por cero más cercano (±4ms) para
  // que el empalme sea inaudible.
  const handleSplitAtPlayhead = () => {
    // Corte milimétrico: se usa el reloj de hardware, no el estado de React
    // (que puede ir hasta ~80ms por detrás de la música).
    const splitAtSec = audioEngine.getCurrentTimeMs() / 1000;

    // Clip objetivo: el seleccionado o, si no hay ninguno, el que está BAJO el
    // cabezal. Así "Cortar" funciona directamente sin tener que seleccionar antes.
    let targetTrackId: string | null = null;
    let targetClipId: string | null = selectedClipId;

    if (targetClipId) {
      const owner = arrangementTracks.find((t) => t.clips.some((c) => c.id === targetClipId));
      targetTrackId = owner?.id ?? null;
      if (!owner) targetClipId = null;
    }

    if (!targetClipId) {
      for (const t of arrangementTracks) {
        const clip = t.clips.find(
          (c) =>
            splitAtSec > c.startOffsetSec &&
            splitAtSec < c.startOffsetSec + (c.trimEndSec - c.trimStartSec)
        );
        if (clip) {
          targetTrackId = t.id;
          targetClipId = clip.id;
          break;
        }
      }
    }

    if (!targetTrackId || !targetClipId) {
      setExportNotice('Coloca el cabezal dentro de un clip para cortar');
      setTimeout(() => setExportNotice(null), 2200);
      return;
    }

    const didSplit = splitClip(targetTrackId, targetClipId, splitAtSec);
    if (didSplit) {
      // Tiempo REAL del corte (ya ajustado a cruce por cero), no el solicitado:
      // así el aviso coincide con la línea de corte y con el borde de los clips.
      const cut = useAudioStudioStore.getState().lastCutSec ?? splitAtSec;
      // Clava el playhead en el punto EXACTO de corte (ruta ligera + estado).
      handleSeek(cut);
      setExportNotice(`✂️ Corte milimétrico a ${cut.toFixed(3)}s (sin clic)`);
      setTimeout(() => setExportNotice(null), 2200);
    }
  };

  // Reordenar pistas adicionales
  const handleMoveTrackUp = (index: number) => {
    if (index <= 1) return;
    const addIdx = index - 1;
    useAudioStudioStore.setState((state) => {
      const list = [...state.additionalTracks];
      const temp = list[addIdx];
      list[addIdx] = list[addIdx - 1];
      list[addIdx - 1] = temp;
      return { additionalTracks: list };
    });
  };

  const handleMoveTrackDown = (index: number) => {
    const addIdx = index - 1;
    useAudioStudioStore.setState((state) => {
      const list = [...state.additionalTracks];
      if (addIdx >= list.length - 1) return state;
      const temp = list[addIdx];
      list[addIdx] = list[addIdx + 1];
      list[addIdx + 1] = temp;
      return { additionalTracks: list };
    });
  };

  // Duplicar pista
  const handleDuplicateTrack = (track: AudioStudioTrack) => {
    if (additionalTracks.length >= 4) {
      alert('Límite de 5 pistas alcanzado.');
      return;
    }
    const newTrack = addAudioTrack(`${track.name} (Copia)`, track.buffer || undefined, track.fileName || undefined);
    if (track.clips && track.clips.length > 0) {
      track.clips.forEach((c) => {
        useAudioStudioStore.getState().duplicateClipToTrack(track.id, newTrack.id, c.id, c.startOffsetSec);
      });
    }
  };

  // Detección de gesto Swipe en bordes móviles para retorno rápido a Pista 2D
  useEffect(() => {
    if (!onBackToRink) return;
    let touchStartX = 0;
    let touchStartY = 0;
    let isEdgeSwipe = false;

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      const t = e.touches[0];
      touchStartX = t.clientX;
      touchStartY = t.clientY;
      isEdgeSwipe = touchStartX <= 45 || touchStartY <= 45;
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (!isEdgeSwipe || e.changedTouches.length !== 1) return;
      const t = e.changedTouches[0];
      const deltaX = t.clientX - touchStartX;
      const deltaY = t.clientY - touchStartY;

      const isSwipeRight = touchStartX <= 45 && deltaX >= 75 && Math.abs(deltaY) < 60;
      const isSwipeDown = touchStartY <= 45 && deltaY >= 75 && Math.abs(deltaX) < 60;

      if (isSwipeRight || isSwipeDown) {
        if ('vibrate' in navigator) navigator.vibrate(15);
        onBackToRink();
      }
      isEdgeSwipe = false;
    };

    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchend', handleTouchEnd, { passive: true });
    return () => {
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchend', handleTouchEnd);
    };
  }, [onBackToRink]);

  /**
   * Sincroniza el estado del store con el motor de audio real.
   *
   * El motor es la ÚNICA fuente de verdad de la reproducción (onended, stop por
   * consolidación, media keys del sistema, etc.). Sin esta suscripción el botón
   * quedaba "encendido" mostrando Pausa con el audio ya detenido: el clásico
   * Play fantasma.
   */
  useEffect(() => {
    const unsubscribe = audioEngine.onStateChange((state) => {
      // El pre-inicio (3, 2, 1, ¡Ya!) mantiene la UI en estado "reproduciendo"
      // aunque el buffer aún no suene: es la misma semántica que usa la Pista 2D.
      setIsPlaying(state.isPlaying || state.isPreRollActive);
      if (!state.isPlaying) {
        // La reproducción terminó: aplicar cambios de mezcla diferidos
        flushPendingConsolidation();
      }
    });
    return unsubscribe;
  }, [setIsPlaying]);

  /**
   * AISLAMIENTO DE DOMINIO DE AUDIO.
   *
   * Mientras el Audio Studio está montado, el motor se marca como dominio
   * 'studio': metrónomo y voces guía de los nodos de la Pista 2D quedan
   * SILENCIADOS. Al salir, se restaura el dominio 'rink'.
   *
   * Deliberadamente NO se adopta el audio cargado en la Pista 2D: la relación
   * permitida es únicamente Studio → Rink (no Rink → Studio).
   */
  useEffect(() => {
    audioEngine.setPlaybackDomain('studio');
    return () => {
      audioEngine.setPlaybackDomain('rink');
    };
  }, []);

  /**
   * El motor debe conocer la DURACIÓN del arreglo del Studio para poder hacer SEEK
   * con el audio pausado (sin esperar a Play/consolidación). No crea buffer ni
   * publica nada: solo habilita `seek()` (que se recortaba a 0 tras importar).
   */
  useEffect(() => {
    audioEngine.setActiveDurationSec(totalDurationSec);
  }, [totalDurationSec]);

  /**
   * Auto-cancelación del modo basurero: si el usuario activa la pulsación larga
   * pero no arrastra, tras 8s se cierra solo para no dejar la UI en un estado
   * modal "pegado" (frecuente en táctil cuando se levanta el dedo sin soltar
   * sobre la Dropzone).
   */
  useEffect(() => {
    if (!trashDrag.active) return;
    const timer = window.setTimeout(() => endTrashDrag(), 8000);
    return () => window.clearTimeout(timer);
  }, [trashDrag.active, endTrashDrag]);

  // Play / Pause Toggle instantáneo sin latencia (Web Audio API)
  // Lee el estado REAL del motor (no la clausura de React) para que un toque
  // nunca invierta el sentido equivocado por un render pendiente.
  const handlePlayToggle = () => {
    // Si no existen pistas con audio en el Estudio y no se está reproduciendo, el botón permanece inactivo
    if (!hasStudioAudio && !isPlaying) return;

    audioEngine.initAudioContext();
    const engineState = audioEngine.getState();
    const isEngineActive = engineState.isPlaying || engineState.isPreRollActive;

    if (isEngineActive) {
      audioEngine.pause();
      setIsPlaying(false);
      // Sincroniza la posición de pausa en el store (el store no se actualiza
      // durante la reproducción). Así el transporte queda coherente y un STOP
      // posterior supone un cambio real de tiempo.
      setCurrentTimeSec(audioEngine.getCurrentTimeMs() / 1000);
      flushPendingConsolidation();
      return;
    }

    // Re-render de la mezcla con los cambios pendientes antes de sonar.
    // El offset de arranque se toma del motor (offset de pausa/seek exacto),
    // nunca del estado de React: así la reanudación no da saltos visuales.
    const resumeFromMs = audioEngine.getCurrentTimeMs();
    void consolidateStudioAudio();
    // El Estudio arranca DIRECTO (sin cuenta atrás de entrada a pista): el
    // count-in hablado es exclusivo de la Pista 2D.
    audioEngine.play(resumeFromMs, { countIn: false });
    setIsPlaying(true);
  };

  // Stop: detiene TODO (fuente, pre-roll, metrónomo y voces) y reinicia a 0:00.
  // Se usa `stop()` (no `pause()`) para no dejar ningún residuo agendado.
  const handleStop = () => {
    audioEngine.stop();
    setIsPlaying(false);
    setCurrentTimeSec(0);
    // Devuelve la AGUJA a 0:00 de forma INMEDIATA y garantizada. El store
    // `currentTimeSec` no se actualiza durante la reproducción, así que tras una
    // pausa `setCurrentTimeSec(0)` puede ser un no-op y el one-shot de
    // `usePlayheadSync` no se dispararía: la línea quedaba clavada. Escribimos el
    // transform directamente (misma geometría) sin depender de un re-render.
    applyPlayheadFromHardwareClock(0);
    flushPendingConsolidation();
  };

  /**
   * «Nodos»: crea un MARCADOR TEMPORAL (Studio Time Marker) en la mezcla principal,
   * exactamente en el tiempo REAL del cabezal (reloj de hardware, no estado React
   * retrasado). Funciona igual en reproducción y en pausa, y da feedback inmediato.
   */
  const handleAddTimeNode = () => {
    const atSec = audioEngine.getCurrentTimeMs() / 1000;
    const node = addTimeNode(atSec);
    const mm = Math.floor(atSec / 60);
    const ss = (atSec % 60).toFixed(2).padStart(5, '0');
    setExportNotice(`● Nodo ${node.numeroSecuencial} · ${mm}:${ss}`);
    setTimeout(() => setExportNotice(null), 1600);
  };

  // Regresar / Ir a Inicio: salir del Estudio detiene SIEMPRE la reproducción
  // (cero audio fantasma) y conserva el proyecto y los buffers intactos.
  const handleExitStudio = useCallback(
    (navigate?: () => void) => {
      audioEngine.stop();
      setIsPlaying(false);
      setCurrentTimeSec(0);
      navigate?.();
    },
    []
  );

  // Red de seguridad: si el Estudio se desmonta por cualquier vía (navegación
  // inferior, cambio de cuenta…), se detiene el transporte para no dejar música,
  // metrónomo ni voz sonando en segundo plano.
  useEffect(() => {
    return () => {
      audioEngine.stop();
    };
  }, []);

  // Loop de la mezcla completa (bucle nativo del motor, sin clics).
  const toggleLoop = () => {
    const next = !audioEngine.getLoop();
    const durationSec = useAudioStudioStore.getState().totalDurationSec;
    audioEngine.setLoop(next, 0, durationSec);
    setLoopEnabled(!!audioEngine.getLoop());
  };

  // Exportar mezcla mixdown (transferencia única Studio → Pista 2D)
  const performExportMix = async () => {
    setIsExporting(true);
    try {
      const result = await renderAndExportMixdown();
      if (result.success) {
        setExportNotice('Mezcla enviada al visor');
        setTimeout(() => setExportNotice(null), 3500);
        if (onExportToRink) onExportToRink();
      }
    } catch (err: any) {
      alert('Error al exportar la mezcla: ' + err?.message);
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportMix = () => {
    // Evita una doble transferencia por doble pulsación.
    if (isExporting) return;
    // Si la Pista 2D ya tiene música publicada, se confirma el reemplazo (no se borra nada
    // antes de confirmar).
    const rinkHasAudio = audioEngine.getPublishedAudio().buffer !== null;
    if (rinkHasAudio) {
      setConfirmReplaceOpen(true);
      return;
    }
    void performExportMix();
  };

  // Long-press en el fondo del área de trabajo para mover el cabezal directamente.
  // Se CANCELA si el dedo se desplaza >10px (era la causa de seeks fantasma al
  // panea/arrastrar con el dedo apoyado sobre el fondo vacío).
  const longPressTimerRef = useRef<number | null>(null);
  const longPressStartRef = useRef<{ x: number; y: number; clientX: number } | null>(null);

  const cancelWorkspaceLongPress = useCallback(() => {
    if (longPressTimerRef.current !== null) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    longPressStartRef.current = null;
  }, []);

  // Sin esto, un long-press pendiente disparaba `handleSeek` tras desmontar el
  // Estudio (timer huérfano).
  useEffect(() => cancelWorkspaceLongPress, [cancelWorkspaceLongPress]);

  const handleWorkspacePointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button, input, label, [data-interactive]')) return;

    const container = timelineContainerRef.current;
    if (!container) return;

    longPressStartRef.current = { x: e.clientX, y: e.clientY, clientX: e.clientX };
    longPressTimerRef.current = window.setTimeout(() => {
      longPressTimerRef.current = null;
      const start = longPressStartRef.current;
      if (!start) return;
      const rect = container.getBoundingClientRect();
      const absoluteX = start.clientX - rect.left + container.scrollLeft;
      // Tiempo EXACTO bajo el puntero: sin redondeo a milisegundos.
      const targetTimeSec = Math.max(0, timelineGeometry.pixelToTime(absoluteX, true));
      handleSeek(targetTimeSec);
      if ('vibrate' in navigator) navigator.vibrate(12);
    }, 280);
  };

  const handleWorkspacePointerMove = (e: React.PointerEvent) => {
    const start = longPressStartRef.current;
    if (!start) return;
    if (Math.abs(e.clientX - start.x) > 10 || Math.abs(e.clientY - start.y) > 10) {
      cancelWorkspaceLongPress();
    }
  };

  const handleWorkspacePointerUp = () => {
    cancelWorkspaceLongPress();
  };

  /**
   * Tirador del PLAYHEAD (hit area independiente del marker).
   *
   * Captura el puntero y mueve SOLO `currentTimeSec`; nunca toca
   * `marker.timestampSec`. La captura garantiza que el gesto sigue al dedo aunque
   * salga del tirador, y se libera siempre en `pointerup`/`pointercancel`/
   * `lostpointercapture` para no dejar ningún gesto "atrapado".
   */
  const handlePlayheadPointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    const container = timelineContainerRef.current;
    if (!container) return;
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch (err) {}

    const seekFromClientX = (clientX: number) => {
      const rect = container.getBoundingClientRect();
      const absoluteX = clientX - rect.left + container.scrollLeft;
      handleSeek(Math.max(0, timelineGeometry.pixelToTime(absoluteX, true)));
    };
    seekFromClientX(e.clientX);
    if ('vibrate' in navigator) navigator.vibrate(8);

    // Solo el puntero que inició el gesto mueve el cabezal (un segundo dedo,
    // p. ej. al iniciar una pinza, no lo arrastra).
    const pointerId = e.pointerId;
    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      seekFromClientX(ev.clientX);
    };
    const onEnd = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onEnd);
      window.removeEventListener('pointercancel', onEnd);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onEnd);
    window.addEventListener('pointercancel', onEnd);
  };

  // Altura de carril adaptativa al ALTO REAL disponible (móvil táctil / escritorio
  // compacto), acotada entre mínimo y máximo. Si el viewport aún no se ha medido,
  // `computeTrackLaneHeight` conserva el reparto clásico por número de pistas.
  const trackLaneHeight = useMemo(
    () =>
      computeTrackLaneHeight(timelineViewport.height, arrangementTracks.length, {
        isMobile: timelineViewport.width > 0 && timelineViewport.width < 640,
      }),
    [timelineViewport.height, timelineViewport.width, arrangementTracks.length]
  );

  return (
    <div 
      className="audio-studio-shell fixed inset-0 z-50 flex flex-col bg-black text-slate-100 overflow-hidden select-none font-sans"
      style={STUDIO_TOUCH_ACTION}
    >
      {/* ── 1. CABECERA BANDLAB (TopTransportBar) ── */}
      <TopTransportBar
        onBackToRink={() => handleExitStudio(onBackToRink)}
        onGoHome={() => handleExitStudio(onGoHome)}
        onExportToRink={handleExportMix}
        onImportGlobalAudio={handleImportGlobal}
        isExporting={isExporting}
      />

      {/* ── 2. LIENZO CENTRAL DE ARREGLOS (BandLab Arrangement View con Overscroll) ──
          Envuelto en un contenedor `relative`: el scroll vive DENTRO y la capa del
          playhead vive FUERA (hermana), confinada al viewport de la timeline. */}
      <div className="relative flex-1 min-h-0">
      <div 
        ref={timelineContainerRef}
        onPointerDown={handleWorkspacePointerDown}
        onPointerMove={handleWorkspacePointerMove}
        onPointerUp={handleWorkspacePointerUp}
        onPointerCancel={handleWorkspacePointerUp}
        className="absolute inset-0 overflow-x-auto overflow-y-auto bg-black isolate"
        style={{
          WebkitOverflowScrolling: 'touch',
          overscrollBehavior: 'contain',
        }}
      >
        <div 
          ref={workspaceRef}
          className="relative min-h-full flex flex-col"
          style={{ width: `${headerWidth + contentWidth + overscrollPx}px` }}
        >
          {/* ── ÁREA TEMPORAL (regla + carriles de pistas) ──
              El playhead vive SOLO aquí: nunca atraviesa la cabecera ni el botón
              «Añadir pista» (que queda FUERA de este contenedor). */}
          <div className="relative flex flex-col">
          {/* Regla de tiempo superior */}
          {/* z-50: la regla queda SIEMPRE por encima de los headers de fila al
              hacer scroll vertical (y estos por encima de los clips). */}
          <div className="sticky top-0 z-50 flex items-stretch bg-zinc-950/95 border-b border-white/10 backdrop-blur-md">
            <div
              className="sticky left-0 z-10 shrink-0 border-r border-white/10 flex flex-col items-center justify-center gap-0.5 bg-zinc-900 text-[9px] font-mono font-black text-slate-400 leading-none"
              style={{ width: `${headerWidth}px` }}
              title="Marcadores temporales (doble clic en la regla para crear)"
            >
              <span>TRACKS</span>
              <span
                className={[
                  'px-1.5 py-0.5 rounded-full border text-[9px] font-bold',
                  audioNodes.length > 0
                    ? 'bg-cyan/15 text-cyan border-cyan/30'
                    : 'bg-white/5 text-slate-500 border-white/10',
                ].join(' ')}
              >
                {audioNodes.length} {audioNodes.length === 1 ? 'nodo' : 'nodos'}
              </span>
            </div>
            <div className="flex-1 overflow-hidden">
              <AudioTimeRuler
                totalDurationSec={totalDurationSec}
                currentTimeSec={0}
                contentWidth={contentWidth}
                overscrollPx={overscrollPx}
                scrollContainerRef={timelineContainerRef}
                viewportWidth={Math.max(0, timelineViewport.width - headerWidth)}
                onSeek={handleSeek}
                hidePlayhead={true}
                isPlaying={isPlaying}
              />
            </div>
          </div>

          {/* Carriles de Pistas (Arrangement Track Rows con Overscroll y Drop Zone) */}
          <div className="flex flex-col">
            {arrangementTracks.map((track, index) => (
              <MultitrackTrackRow
                key={track.id}
                track={track}
                trackIndex={index}
                totalTracks={arrangementTracks.length}
                totalDurationSec={totalDurationSec}
                contentWidth={contentWidth}
                overscrollPx={overscrollPx}
                headerWidth={headerWidth}
                trackLaneHeight={trackLaneHeight}
                scrollContainerRef={timelineContainerRef}
                onUploadFile={(file) => handleUploadFile(track.id, file)}
                onTrackHop={(fromTrackId, targetIndex, clipId, newOffsetSec) => {
                  handleTrackHop(fromTrackId, targetIndex, clipId, newOffsetSec);
                }}
                onRemoveTrack={() => removeAudioTrack(track.id)}
                onMoveUp={() => handleMoveTrackUp(index)}
                onMoveDown={() => handleMoveTrackDown(index)}
                onDuplicate={() => handleDuplicateTrack(track)}
              />
            ))}

          </div>

          {/* ── STUDIO TIME MARKERS: línea vertical anclada al TIEMPO ──
              Misma `AudioTimelineGeometry` (timeToPx) que regla, clips y playhead.
              Se dibuja dentro del timeline (x ≥ headerWidth), por debajo de la regla
              (top-12) y por encima de los clips (z-30): nunca invade la columna de
              nombres ni la regla. Es distinta del PLAYHEAD (z-40) y de la marca de
              CORTE. Al mover un marcador, la línea se desplaza con él en tiempo real. */}
          {audioNodes.map((node) => {
            const isSelectedNode = selectedNodeId === node.id;
            return (
              <div
                key={`marker-${node.id}`}
                className="absolute top-12 bottom-0 z-30 pointer-events-none flex flex-col items-center"
                style={{
                  left: 0,
                  transform: `translateX(${timelineGeometry.timeToPx(
                    node.timestampSec
                  )}px) translateX(-50%)`,
                }}
                title={`Nodo ${node.numeroSecuencial} · ${node.timestampSec.toFixed(3)}s`}
              >
                <span
                  className={[
                    'flex h-4 min-w-4 items-center justify-center rounded-full px-1 font-mono text-[9px] font-black',
                    isSelectedNode ? 'bg-cyan text-slate-950' : 'bg-cyan/25 text-cyan',
                  ].join(' ')}
                >
                  {node.numeroSecuencial}
                </span>
                <div
                  className={
                    isSelectedNode ? 'w-[2px] flex-1 bg-cyan' : 'w-px flex-1 bg-cyan/45'
                  }
                />
              </div>
            );
          })}

          {/* Referencia vertical durante el arrastre de un clip (dentro del área
              temporal): guía magnética si hay snap, o referencia de posición si no.
              Usa la MISMA geometría que regla, playhead y clips → alineación exacta. */}
          {!trashDrag.active && draggingGhost && (
            <div
              className="absolute top-0 bottom-0 pointer-events-none z-[35] flex flex-col items-center select-none"
              style={{
                left: 0,
                // `-50%` centra la guía (ancho de contenido) sobre el tiempo exacto.
                transform: `translateX(${timelineGeometry.timeToPx(
                  draggingGhost.snapLineSec ?? draggingGhost.startOffsetSec
                )}px) translateX(-50%)`,
              }}
            >
              <div
                className={[
                  'px-1.5 py-0.5 rounded font-mono font-black text-[9px] shadow-md -translate-y-1 whitespace-nowrap',
                  draggingGhost.snapLineSec != null
                    ? 'bg-cyan text-slate-950'
                    : 'bg-black/80 text-cyan border border-cyan/40',
                ].join(' ')}
              >
                {draggingGhost.snapLineSec != null
                  ? `🧲 ${draggingGhost.snapLineSec.toFixed(2)}s`
                  : `${draggingGhost.startOffsetSec.toFixed(2)}s`}
              </div>
              <div
                className={[
                  'w-[2px] h-full',
                  draggingGhost.snapLineSec != null ? 'bg-cyan shadow-glow-cyan' : 'bg-white/40',
                ].join(' ')}
              />
            </div>
          )}

          {/* Marca del ÚLTIMO CORTE: misma geometría que regla/playhead/clips, así
              el punto de corte queda matemáticamente alineado con ambos bordes. */}
          {lastCutSec !== null && (
            <div
              className="absolute top-0 bottom-0 pointer-events-none z-[35] flex flex-col items-center select-none"
              style={{
                left: 0,
                // `-50%` centra la marca (ancho de contenido) sobre el corte exacto.
                transform: `translateX(${timelineGeometry.timeToPx(lastCutSec)}px) translateX(-50%)`,
              }}
            >
              <div className="px-1.5 py-0.5 rounded bg-white text-slate-950 font-mono font-black text-[9px] shadow-md -translate-y-1 whitespace-nowrap">
                CORTE {lastCutSec.toFixed(3)} s
              </div>
              <div className="w-[2px] h-full bg-white/90 shadow-glow-cyan" />
            </div>
          )}

          </div>

          {/* ── BOTÓN + AÑADIR PISTA (Estilo BandLab 2_Arrangement-View-1.webp) ──
              Fuera del área temporal: el playhead nunca lo atraviesa y queda
              totalmente libre para el toque. */}
          {arrangementTracks.length < 5 && (
            <div 
              className="p-3 border-b border-white/5 flex items-center gap-3"
              style={{ width: `${headerWidth + contentWidth + overscrollPx}px` }}
            >
              <label 
                htmlFor="add-track-input"
                className="cursor-pointer h-11 px-5 rounded-2xl border border-dashed border-white/20 hover:border-cyan/60 bg-zinc-950 hover:bg-zinc-900 flex items-center gap-2 text-xs font-bold text-slate-300 hover:text-white transition-all shadow-md active:scale-98"
              >
                <Plus className="w-4 h-4 text-cyan" />
                <span>Añadir Pista ({arrangementTracks.length}/5)</span>
              </label>
              <input
                id="add-track-input"
                ref={addTrackFileInputRef}
                type="file"
                accept={ACCEPTED_AUDIO_FORMATS}
                className="sr-only"
                onChange={handleAddTrackFileSelected}
              />
              <button
                type="button"
                onClick={() => addAudioTrack()}
                className="h-11 px-4 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-medium text-slate-400 hover:text-slate-200 transition-colors"
              >
                + Pista Vacía
              </button>
            </div>
          )}
        </div>
      </div>

      {/* PLAYHEAD OVERLAY — confinado al VIEWPORT de la timeline (a la derecha del
          header). `left: headerWidth` + `overflow-hidden` garantizan que la aguja
          NUNCA invade la columna de nombres; su posición resta `scrollLeft`. Es
          `pointer-events-none`: no bloquea rueda, pan, drag de clips ni scroll. */}
      <div
        className="absolute inset-y-0 right-0 z-40 overflow-hidden pointer-events-none"
        style={{ left: `${headerWidth}px` }}
      >
        <div
          ref={playheadLineRef}
          className="absolute top-0 bottom-0 w-8 pointer-events-none flex justify-center select-none"
          style={{ left: 0, transform: `translateX(0px) translateX(-50%)` }}
        >
          <div className="w-[2px] h-full bg-white shadow-glow-cyan relative flex justify-center">
            {/* HIT AREA DEL PLAYHEAD — independiente del marker. Es un blanco
                cómodo (~36px) sobre la aguja que SOLO modifica `currentTimeSec`.
                `touch-action:none`: el navegador no lo interpreta como scroll ni
                como zoom, así el scrub llega íntegro. No cubre toda la timeline:
                es una zona pequeña centrada en la aguja. */}
            <div
              role="slider"
              aria-label="Posición del cabezal"
              aria-valuemin={0}
              onPointerDown={handlePlayheadPointerDown}
              className="pointer-events-auto absolute top-12 left-1/2 flex h-9 w-9 -translate-x-1/2 cursor-ew-resize items-center justify-center rounded-full transition-transform active:scale-110"
              style={{ touchAction: 'none' }}
              title="Arrastra para mover el cabezal"
            >
              <div className="w-3.5 h-3.5 bg-white rotate-45 rounded-xs shadow-md" />
              <span className="absolute -bottom-1 h-1 w-4 rounded-full bg-white/70" />
            </div>
          </div>
        </div>
      </div>
      </div>

      {/* ── 3. BARRA INFERIOR DE TRANSPORTE BANDLAB (BandLab Bottom Dock) ──
          Mobile-first: `flex-wrap` garantiza CERO desbordamiento horizontal y
          CERO recorte. La altura es automática (no fija) para que la safe-area
          inferior nunca corte los botones. Todos los controles quedan siempre
          visibles y alcanzables en pantallas estrechas. */}
      <footer
        className="relative z-40 shrink-0 flex flex-wrap items-center justify-center gap-x-1 gap-y-1 border-t border-white/10 bg-zinc-950 px-1.5 py-1.5 text-xs select-none studio-dock-safe sm:justify-between sm:gap-x-3 sm:px-4 sm:py-2"
      >
        {/* Izquierda: Mezclador + Rewind + Stop + Tijeras */}
        <div className="flex shrink-0 items-center gap-0.5 sm:gap-1.5">
          {/* Botón Mezclador (Abre BandLabMixerDrawer) */}
          <button
            type="button"
            onClick={() => setShowMixerDrawer(true)}
            className="w-11 h-11 sm:w-12 sm:h-12 shrink-0 rounded-full flex items-center justify-center bg-white/10 hover:bg-white/20 text-slate-200 hover:text-white transition-all active:scale-95 shadow-sm"
            title="Abrir Mezclador de Pistas (Volumen, Mute, Solo)"
            aria-label="Abrir mezclador de pistas"
          >
            <Sliders className="w-5 h-5 text-cyan" />
          </button>

          {/* Stop / Detener — detiene todo (fuente, pre-roll, metrónomo y voz)
              y devuelve la posición a 0:00. Es el único botón de parada/inicio:
              hace ambas cosas, así que no se duplica con un "volver al inicio". */}
          <button
            type="button"
            {...press(handleStop, { enabled: hasTransportAudio })}
            disabled={!hasTransportAudio}
            className={`press w-11 h-11 sm:w-12 sm:h-12 shrink-0 rounded-full flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 active:bg-white/15 disabled:pointer-events-none disabled:opacity-40`}
            title="Detener todo y volver al inicio (0:00)"
            aria-label="Detener y volver al inicio"
          >
            <Square className="w-4 h-4 fill-current" />
          </button>

          {/* Cortar en cabezal (precisión al cruce por cero).
              Habilitado siempre: si no hay clip seleccionado, corta el clip que
              está bajo el cabezal; si no hay ninguno, muestra un aviso. */}
          <button
            type="button"
            {...press(handleSplitAtPlayhead, { enabled: hasTransportAudio })}
            disabled={!hasTransportAudio}
            className={`press w-11 h-11 sm:w-12 sm:h-12 shrink-0 rounded-full flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 active:bg-white/15 disabled:pointer-events-none disabled:opacity-40`}
            title="Dividir clip en el cabezal (corte milimétrico)"
            aria-label="Dividir clip en el cabezal"
          >
            <Scissors className="w-5 h-5 text-mint" />
          </button>
        </div>

        {/* Centro: BOTÓN CIRCULAR PRINCIPAL (BandLab Big Action Centerpiece) */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            {...press(handlePlayToggle, { enabled: hasStudioAudio || isPlaying })}
            disabled={!hasStudioAudio && !isPlaying}
            aria-disabled={!hasStudioAudio && !isPlaying}
            aria-pressed={isPlaying}
            aria-label={isPlaying ? 'Pausar reproducción' : 'Reproducir'}
            className={`press w-12 h-12 sm:w-14 sm:h-14 shrink-0 rounded-full flex items-center justify-center shadow-lg transition-all ${
              !hasStudioAudio && !isPlaying
                ? 'bg-white/10 text-slate-500 cursor-not-allowed shadow-none opacity-40 pointer-events-none'
                : isPlaying 
                  ? 'bg-amber-400 text-black shadow-amber-400/30' 
                  : 'bg-red-500 text-white shadow-red-500/30 hover:bg-red-600'
            }`}
            title={
              !hasStudioAudio && !isPlaying
                ? 'No hay pistas de audio para reproducir'
                : isPlaying
                  ? 'Pausar (Espacio)'
                  : 'Reproducir (Espacio)'
            }
          >
            {isPlaying ? (
              <Pause className="w-6 h-6 fill-current" />
            ) : (
              <Play className="w-6 h-6 fill-current ml-0.5" />
            )}
          </button>

          {/* REC — Grabación de voz (tomas múltiples, no destructivo) */}
          <button
            type="button"
            onClick={() => {
              void (isRecording ? stopVoiceRecording() : startVoiceRecording());
            }}
            aria-pressed={isRecording}
            aria-label={isRecording ? 'Detener grabación de voz' : 'Grabar voz'}
            title={isRecording ? 'Detener grabación (R / Esc)' : 'Grabar voz desde el micrófono (R)'}
            className={`press shrink-0 rounded-full flex items-center justify-center gap-2 shadow-lg ${
              isRecording
                ? 'bg-rose-500 text-white shadow-rose-500/40 animate-pulse px-3 h-12 sm:h-14'
                : 'w-12 h-12 sm:w-14 sm:h-14 bg-white/5 text-rose-400 border border-rose-500/40 hover:bg-rose-500/15'
            }`}
          >
            <Mic className="w-5 h-5" />
            {isRecording && (
              <span className="font-mono text-xs font-bold tabular-nums">
                {Math.floor(recordingElapsedSec / 60)}:
                {String(Math.floor(recordingElapsedSec % 60)).padStart(2, '0')}
              </span>
            )}
          </button>

          {/* Monitorización de entrada (por defecto OFF; auriculares recomendados) */}
          <button
            type="button"
            onClick={() => setRecordingMonitor(!recordingMonitorEnabled)}
            aria-pressed={recordingMonitorEnabled}
            aria-label="Monitorizar el micrófono (usar auriculares)"
            title={
              recordingMonitorEnabled
                ? 'Monitorización activada (usa auriculares para evitar realimentación)'
                : 'Escucharte por los auriculares (monitorización)'
            }
            className={`press w-11 h-11 sm:w-12 sm:h-12 shrink-0 rounded-full flex items-center justify-center ${
              recordingMonitorEnabled ? 'text-cyan bg-cyan/15' : 'text-slate-500 hover:bg-white/5'
            }`}
          >
            <Headphones className="w-5 h-5" />
          </button>

          {/* Pre-inicio (cuenta atrás) antes de capturar */}
          <button
            type="button"
            onClick={() => setRecordingCountdownEnabled(!recordingCountdownEnabled)}
            aria-pressed={recordingCountdownEnabled}
            aria-label="Pre-inicio antes de grabar"
            title="Cuenta atrás antes de iniciar la grabación (sin offsets mágicos)"
            className={`press h-11 sm:h-12 shrink-0 rounded-full flex items-center justify-center gap-1 ${
              recordingCountdownEnabled
                ? 'text-amber-400 bg-amber-500/15 px-2'
                : 'w-11 sm:w-12 text-slate-500 hover:bg-white/5'
            }`}
          >
            <Timer className="w-5 h-5" />
            {recordingCountdownEnabled && (
              <span className="font-mono text-xs font-bold">{recordingCountdownSec}s</span>
            )}
          </button>
          {recordingCountdownEnabled && (
            <select
              value={recordingCountdownSec}
              onChange={(e) => setRecordingCountdownSec(Number(e.target.value))}
              aria-label="Segundos de pre-inicio"
              className="h-9 shrink-0 rounded-lg bg-white/5 px-1 text-xs text-slate-200"
            >
              {[3, 5, 10].map((s) => (
                <option key={s} value={s}>
                  {s}s
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Derecha: Metrónomo + Marcador + Zoom */}
        <div className="flex items-center gap-0.5 sm:gap-1.5 shrink-0">
          {/* Toggle Metrónomo rápido */}
          <button
            type="button"
            {...press(toggleMetronomeMute)}
            className={`w-11 h-11 sm:w-12 sm:h-12 shrink-0 rounded-full flex items-center justify-center press ${
              globalControls.metronome.muted 
                ? 'text-slate-500 hover:bg-white/5' 
                : 'text-amber-400 bg-amber-500/15'
            }`}
            aria-pressed={globalControls.metronome.muted}
            aria-label={globalControls.metronome.muted ? 'Activar metrónomo' : 'Silenciar metrónomo'}
            title={globalControls.metronome.muted ? 'Activar Metrónomo' : 'Silenciar Metrónomo'}
          >
            <Bell className="w-5 h-5" />
          </button>

          {/* Loop — repetir la mezcla (bucle nativo sin clics) */}
          <button
            type="button"
            onClick={toggleLoop}
            disabled={!hasTransportAudio}
            aria-pressed={loopEnabled}
            aria-label={loopEnabled ? 'Desactivar repetición' : 'Activar repetición'}
            title={loopEnabled ? 'Repetir activado (L)' : 'Repetir (L)'}
            className={`w-11 h-11 sm:w-12 sm:h-12 shrink-0 rounded-full flex items-center justify-center press disabled:opacity-30 disabled:pointer-events-none ${
              loopEnabled ? 'text-cyan bg-cyan/15' : 'text-slate-500 hover:bg-white/5'
            }`}
          >
            <Repeat className="w-5 h-5" />
          </button>

          {/* + Marcador temporal */}
          <button
            type="button"
            onClick={handleAddTimeNode}
            className="press flex h-11 sm:h-12 shrink-0 items-center gap-1.5 rounded-full border border-cyan/30 bg-cyan/15 px-2.5 text-xs font-bold text-cyan hover:bg-cyan/25 sm:px-3"
            title="Añadir marcador temporal"
            aria-label="Añadir marcador temporal"
          >
            <MapPin className="w-4 h-4 shrink-0" />
            <span className="hidden sm:inline">Nodo</span>
            <span className="font-mono">({audioNodes.length})</span>
          </button>

          {/* Controles de Zoom */}
          <div className="flex shrink-0 items-center gap-0.5 pl-0.5 font-mono text-xs sm:gap-1 sm:pl-1">
            <button
              type="button"
              onClick={() => zoomOut()}
              className="w-10 h-10 sm:w-9 sm:h-9 shrink-0 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10"
              title="Alejar Zoom"
              aria-label="Alejar zoom"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => zoomIn()}
              className="w-10 h-10 sm:w-9 sm:h-9 shrink-0 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10"
              title="Acercar Zoom"
              aria-label="Acercar zoom"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            {zoom > 1.05 && (
              <button
                type="button"
                onClick={resetZoom}
                className="px-2 py-1 rounded-lg text-[10px] bg-white/10 text-slate-300 font-bold shrink-0"
                aria-label="Restablecer zoom"
              >
                1x
              </button>
            )}
          </div>
        </div>
      </footer>

      {/* ── DROPZONE DE BASURA (modo pulsación larga en móvil/táctil) ──
          `pointer-events-none`: el objetivo se detecta por geometría desde el
          gesto del clip, así la zona nunca intercepta ni bloquea el arrastre. */}
      {trashDrag.active && (
        <div
          id={TRASH_ZONE_ID}
          className={`pointer-events-none fixed bottom-24 left-1/2 z-[70] flex -translate-x-1/2 flex-col items-center gap-1.5 rounded-3xl border-2 px-6 py-4 backdrop-blur-md transition-all duration-200 ${
            trashDrag.overTrash
              ? 'scale-110 border-rose-400 bg-rose-500/25 shadow-2xl shadow-rose-500/40'
              : 'border-rose-500/50 bg-rose-950/70'
          }`}
        >
          <Trash2 className={`h-8 w-8 ${trashDrag.overTrash ? 'text-rose-100' : 'text-rose-400'}`} />
          <span className="text-[11px] font-black uppercase tracking-wider text-rose-100">
            {trashDrag.overTrash ? 'Suelta para borrar' : 'Arrastra aquí'}
          </span>
          <span className="text-[9px] font-mono text-rose-300/80">
            {trashDrag.clipId ? 'Fragmento seleccionado' : ''}
          </span>
        </div>
      )}

      {/* ── 4. MENÚ CONTEXTUAL TÁCTIL FLOTANTE (Pill Menu) ── */}
      <FloatingClipContextMenu />

      {/* ── 5. MEZCLADOR MULTITRACK (BandLabMixerDrawer) ── */}
      <BandLabMixerDrawer
        isOpen={showMixerDrawer}
        onClose={() => setShowMixerDrawer(false)}
        tracks={arrangementTracks}
      />

      {/* ── 6. NOTIFICACIÓN FLOTANTE DE SINCRONIZACIÓN ── */}
      {exportNotice && (
        <div className="fixed bottom-16 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2 rounded-full bg-cyan-950/90 border border-cyan/50 text-cyan text-xs font-bold shadow-2xl backdrop-blur-md animate-in fade-in slide-in-from-bottom-2">
          <CheckCircle2 className="w-4 h-4 text-cyan" />
          <span>{exportNotice}</span>
        </div>
      )}

      {/* ── 6. CUENTA ATRÁS DE PRE-INICIO DE GRABACIÓN ── */}
      {recordingCountdown > 0 && (
        <div className="pointer-events-none fixed inset-0 z-[60] flex items-center justify-center">
          <span className="text-7xl font-black text-rose-400 drop-shadow-[0_0_18px_rgba(244,63,94,0.6)]">
            {recordingCountdown}
          </span>
        </div>
      )}

      {/* ── 6a. AVISO DE ERROR DE GRABACIÓN ── */}
      {recordingError && (
        <div
          role="alert"
          className="fixed bottom-16 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2 rounded-full bg-rose-950/90 border border-rose-500/50 text-rose-200 text-xs font-bold shadow-2xl backdrop-blur-md"
        >
          <Mic className="w-4 h-4" />
          <span>{recordingError}</span>
        </div>
      )}

      {/* ── 6b. CONFIRMACIÓN DE REEMPLAZO DE LA MÚSICA DE LA PISTA 2D ── */}
      <ConfirmDialog
        isOpen={confirmReplaceOpen}
        title="Reemplazar la música de la Pista 2D"
        message="La Pista 2D ya tiene una canción. La mezcla del Audio Studio la reemplazará como única pista musical. Los nodos y trayectorias se conservarán."
        confirmLabel="Reemplazar"
        cancelLabel="Cancelar"
        tone="danger"
        onConfirm={() => {
          setConfirmReplaceOpen(false);
          void performExportMix();
        }}
        onCancel={() => setConfirmReplaceOpen(false)}
      />

      {/* ── 7. DRAG OVERLAY / GHOST ELEMENT FLOTANTE (Feedback visual de arrastre) ── */}
      {draggingGhost && (
        <div
          className="fixed pointer-events-none z-50 -translate-x-1/2 -translate-y-1/2 transition-transform duration-75 ease-out select-none"
          style={{ left: `${draggingGhost.cursorX}px`, top: `${draggingGhost.cursorY}px` }}
        >
          <div className={`flex items-center gap-2.5 px-3.5 py-2 rounded-2xl border backdrop-blur-xl shadow-2xl transition-all ${
            draggingGhost.isOverMaster
              ? 'bg-cyan-950/95 border-cyan text-white shadow-cyan/50 ring-2 ring-cyan scale-105'
              : 'bg-zinc-900/95 border-white/25 text-white shadow-black/90'
          }`}>
            <div className={`w-3 h-3 rounded-full shrink-0 ${draggingGhost.isOverMaster ? 'bg-cyan animate-ping' : 'bg-white/80'}`} />
            <div className="flex flex-col min-w-0 pr-1">
              <span className="text-xs font-black truncate max-w-[150px]">{draggingGhost.clip.name}</span>
              <div className="flex items-center gap-1.5 font-mono text-[10px]">
                <span className={draggingGhost.isOverMaster ? 'text-cyan font-bold' : 'text-slate-300'}>
                  {draggingGhost.isOverMaster ? '🎯 Soltar en Master' : `↳ ${draggingGhost.targetTrackName}`}
                </span>
                <span className="text-slate-400">· {draggingGhost.startOffsetSec.toFixed(2)}s</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
