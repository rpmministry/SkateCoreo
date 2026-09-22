import React, { useCallback, useEffect, useState, useRef, useMemo } from 'react';
import {
  ZoomIn,
  ZoomOut,
  Scissors,
  MapPin,
  CheckCircle2,
  Plus,
  Play,
  Pause,
  SkipBack,
  Square,
  Sliders,
  Bell,
  Trash2,
} from 'lucide-react';
import { useAudioStudioStore, flushPendingConsolidation } from '../../store/useAudioStudioStore';
import { audioEngine } from '../../services/audioEngine';
import { useAudioZoomPan } from '../../hooks/useAudioZoomPan';
import { usePressAction } from '../../hooks/usePressAction';
import { usePlayheadSync } from '../../hooks/usePlayheadSync';
import { useIosFileCapture } from '../../hooks/useIosFileCapture';
import { timeToPlayheadPx } from '../../core/audio/PlaybackClock';
import { AudioStudioTrack } from '../../types/audioStudio';
import { ACCEPTED_AUDIO_FORMATS } from '../../constants/mediaFormats';
import { TopTransportBar } from './TopTransportBar';
import { AudioTimeRuler } from './AudioTimeRuler';
import { MultitrackTrackRow } from './MultitrackTrackRow';
import { FloatingClipContextMenu } from './FloatingClipContextMenu';
import { BandLabMixerDrawer } from './BandLabMixerDrawer';
import { TRASH_ZONE_ID } from './AudioClipItem';

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
  const currentTimeSec = useAudioStudioStore((s) => s.currentTimeSec);
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

  const globalControls = useAudioStudioStore((s) => s.globalControls);
  const toggleMetronomeMute = useAudioStudioStore((s) => s.toggleMetronomeMute);

  const selectedClipId = useAudioStudioStore((s) => s.selectedClipId);
  const splitClip = useAudioStudioStore((s) => s.splitClip);
  const draggingGhost = useAudioStudioStore((s) => s.draggingGhost);
  const consolidateStudioAudio = useAudioStudioStore((s) => s.consolidateStudioAudio);
  const trashDrag = useAudioStudioStore((s) => s.trashDrag);
  const endTrashDrag = useAudioStudioStore((s) => s.endTrashDrag);

  const [isExporting, setIsExporting] = useState(false);
  const [exportNotice, setExportNotice] = useState<string | null>(null);
  const [showMixerDrawer, setShowMixerDrawer] = useState(false);
  // Estado real del motor: permite que el transporte funcione aunque la pista se
  // haya cargado en la Pista 2D (fuera del store del Estudio).
  const [engineHasAudio, setEngineHasAudio] = useState<boolean>(() => audioEngine.getState().hasAudioLoaded);

  // Activación táctil inmediata sin doble disparo (evita el Play/Pausa fantasma)
  const press = usePressAction();

  // Ancho de cabecera de pista BandLab (90px — sincronizado con MultitrackTrackRow) y Espacio Vacío Continuo de Ensamblaje (450px)
  const headerWidth = 90;
  const OVERSCROLL_PX = 450;
  const playheadLineRef = useRef<HTMLDivElement | null>(null);
  const workspaceRef = useRef<HTMLDivElement | null>(null);
  const addTrackFileInputRef = useRef<HTMLInputElement | null>(null);

  // Motor de Zoom y Paneo Dinámico con matemática touch precisa y overscroll continuo
  const {
    zoom,
    containerRef: timelineContainerRef,
    contentWidth,
    overscrollPx,
    zoomIn,
    zoomOut,
    resetZoom,
  } = useAudioZoomPan({
    minZoom: 1.0,
    maxZoom: 35.0,
    initialZoom: 1.0,
    widthOffset: headerWidth,
    overscrollPx: OVERSCROLL_PX,
    enableWheelPan: true,
    onZoomChange: (z) => useAudioStudioStore.getState().setZoom(z),
  });

  // Estado y manejadores de arrastre del Playhead (Hitbox ensanchado de 32px)
  const isDraggingPlayheadRef = useRef(false);

  const handlePlayheadPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    e.preventDefault();
    isDraggingPlayheadRef.current = true;
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch (err) {}
  };

  const handlePlayheadPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingPlayheadRef.current) return;
    const container = timelineContainerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const clickX = e.clientX - rect.left + container.scrollLeft - headerWidth;
    const dur = Math.max(10, totalDurationSec);
    const ratio = Math.max(0, Math.min(1, clickX / contentWidth));
    // Precisión de 1ms: el offset exacto se guarda y el motor lo usa al reanudar
    const targetTimeSec = Math.round(ratio * dur * 1000) / 1000;

    setCurrentTimeSec(targetTimeSec);
    audioEngine.seek(targetTimeSec * 1000);
    if (playheadLineRef.current) {
      // Proyección en coma flotante, sin redondeo (evita micro-saltos)
      playheadLineRef.current.style.transform = `translateX(${headerWidth + ratio * contentWidth}px)`;
    }
  };

  const handlePlayheadPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isDraggingPlayheadRef.current) {
      isDraggingPlayheadRef.current = false;
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch (err) {}
    }
  };

  /**
   * Proyección tiempo → píxeles con coma flotante (sin redondeo).
   * `headerWidth` es el ancho de la columna fija de nombres de pista; `contentWidth`
   * es el ancho total de la línea de tiempo.
   */
  const playheadPxFor = useCallback(
    (timeMs: number) =>
      timeToPlayheadPx(
        timeMs,
        Math.max(10, totalDurationSec) * 1000,
        headerWidth,
        contentWidth
      ),
    [totalDurationSec, headerWidth, contentWidth]
  );

  /**
   * Escritura directa sobre el DOM: `transform: translateX(...)`.
   * No hay `setState` aquí, así que ningún frame provoca re-render de React.
   * El auto-scroll sigue al cabezal con el mismo reloj de hardware.
   */
  const applyPlayheadFromHardwareClock = useCallback(
    (timeMs: number) => {
      const px = playheadPxFor(timeMs);

      const line = playheadLineRef.current;
      if (line && !isDraggingPlayheadRef.current) {
        line.style.transform = `translateX(${px}px)`;
      }

      const container = timelineContainerRef.current;
      if (container && isPlaying && zoom > 1.05) {
        const left = container.scrollLeft;
        const right = left + container.clientWidth;
        if (px > right - 80 || px < left + 100) {
          container.scrollLeft = Math.max(0, px - container.clientWidth / 2);
        }
      }
    },
    [playheadPxFor, isPlaying, zoom]
  );

  // Playhead gobernado por el reloj de hardware (AudioContext.currentTime).
  // Durante la reproducción: un frame de rAF compartido para toda la app.
  // En pausa/seek/zoom: una única escritura puntual con el tiempo real.
  usePlayheadSync(applyPlayheadFromHardwareClock, {
    active: isPlaying,
    refreshKey: `${contentWidth}|${totalDurationSec}|${headerWidth}|${zoom}`,
  });

  // 1 Pista Principal (Música) + hasta 4 Pistas Adicionales (Total: hasta 5 pistas)
  const arrangementTracks: AudioStudioTrack[] = useMemo(() => {
    return [tracks.music, ...additionalTracks];
  }, [tracks.music, additionalTracks]);

  /**
   * ¿Existe audio real para transportar? Se usa para deshabilitar con honestidad
   * los controles de Rewind/Stop cuando no hay nada que mover: antes se pulsaban
   * y "no hacían nada", lo que se percibía como botones rotos.
   */
  const hasAudioContent = useMemo(
    () => arrangementTracks.some((t) => (t.clips && t.clips.length > 0) || !!t.buffer),
    [arrangementTracks]
  );

  /**
   * Habilita el transporte si hay audio en el arreglo del Estudio O en el motor
   * (pista cargada desde la Pista 2D). Sin esto, al abrir el Estudio con una
   * canción ya cargada, Rewind/Stop/Cortar quedaban deshabilitados y parecían
   * botones rotos.
   */
  const hasTransportAudio = hasAudioContent || engineHasAudio;

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

      if (e.code === 'Space') {
        // Evita repetición por auto-repeat al mantener pulsado
        if (e.repeat) return;
        // preventDefault cancela la activación nativa del <button> enfocado:
        // sin esto, un botón con foco + este atajo ejecutaban la acción DOS veces
        // (causa directa del Play/Pausa fantasma con teclado).
        e.preventDefault();
        handlePlayToggle();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
        e.preventDefault();
        const store = useAudioStudioStore.getState();
        let targetClipId = store.selectedClipId;

        // Si no hay clip seleccionado explícitamente, buscar el clip que esté bajo el cabezal
        if (!targetClipId) {
          for (const t of arrangementTracks) {
            const found = t.clips.find(
              (c) => currentTimeSec >= c.startOffsetSec && currentTimeSec <= c.startOffsetSec + (c.trimEndSec - c.trimStartSec)
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
      store.pasteClip(targetTrack.id, exactSec);
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
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPlaying, currentTimeSec, tracks.music.id, arrangementTracks]);

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
      setExportNotice(`✂️ Corte milimétrico a ${splitAtSec.toFixed(3)}s (sin clic)`);
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
      setEngineHasAudio(state.hasAudioLoaded);
      if (!state.isPlaying) {
        // La reproducción terminó: aplicar cambios de mezcla diferidos
        flushPendingConsolidation();
      }
    });
    return unsubscribe;
  }, [setIsPlaying]);

  /**
   * ADOPCIÓN DEL AUDIO DE LA PISTA 2D.
   *
   * Si el usuario cargó la música en la Pista 2D y luego abre el Estudio, el
   * store del Estudio está vacío aunque el motor SÍ tenga la pista. Sin esto, la
   * barra inferior quedaba con Rewind/Stop/Cortar deshabilitados y no había
   * ningún clip que cortar. Se crea la pista Master a partir del buffer del motor.
   */
  useEffect(() => {
    const store = useAudioStudioStore.getState();
    const master = store.tracks.music;
    if (master.buffer || master.clips.length > 0) return;

    const engineBuffer = audioEngine.getAudioBuffer();
    if (!engineBuffer) return;

    store.setTrackBuffer(
      'music',
      engineBuffer,
      audioEngine.getState().fileName || 'pista_2d.wav'
    );
  }, []);

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
    audioEngine.initAudioContext();
    const engineState = audioEngine.getState();
    const isEngineActive = engineState.isPlaying || engineState.isPreRollActive;

    if (isEngineActive) {
      audioEngine.pause();
      setIsPlaying(false);
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

  // Stop y Reset a 0:00
  const handleStop = () => {
    audioEngine.pause();
    audioEngine.seek(0);
    setIsPlaying(false);
    setCurrentTimeSec(0);
    flushPendingConsolidation();
  };

  // Return to start
  const handleRewind = () => {
    audioEngine.seek(0);
    setCurrentTimeSec(0);
  };

  // Exportar mezcla mixdown
  const handleExportMix = async () => {
    setIsExporting(true);
    try {
      const result = await renderAndExportMixdown();
      if (result.success) {
        setExportNotice('¡Mezcla sincronizada con éxito en la Pista 2D!');
        setTimeout(() => setExportNotice(null), 3500);
        if (onExportToRink) onExportToRink();
      }
    } catch (err: any) {
      alert('Error al exportar la mezcla: ' + err?.message);
    } finally {
      setIsExporting(false);
    }
  };

  // Long-press en el fondo del área de trabajo para mover el cabezal directamente
  const longPressTimerRef = useRef<number | null>(null);
  const handleWorkspacePointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button, input, label, [data-interactive]')) return;
    
    const clientX = e.clientX;
    const container = timelineContainerRef.current;
    if (!container) return;

    longPressTimerRef.current = window.setTimeout(() => {
      const rect = container.getBoundingClientRect();
      const clickX = clientX - rect.left + container.scrollLeft - headerWidth;
      const dur = Math.max(10, totalDurationSec);
      const ratio = Math.max(0, Math.min(1, clickX / contentWidth));
      const targetTimeSec = Math.round(ratio * dur * 1000) / 1000;

      setCurrentTimeSec(targetTimeSec);
      audioEngine.seek(targetTimeSec * 1000);
      // El clock de hardware escribe la línea en el mismo instante del seek
      applyPlayheadFromHardwareClock(targetTimeSec * 1000);
      if ('vibrate' in navigator) navigator.vibrate(12);
    }, 280);
  };

  const handleWorkspacePointerUp = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  // Altura de carril adaptativa
  const trackLaneHeight = useMemo(() => {
    const totalTracks = arrangementTracks.length;
    if (totalTracks <= 2) return 84;
    if (totalTracks <= 3) return 72;
    if (totalTracks <= 4) return 64;
    return 56; // 5 pistas
  }, [arrangementTracks.length]);

  return (
    <div 
      className="fixed inset-0 z-50 flex flex-col bg-black text-slate-100 overflow-hidden select-none font-sans"
      style={STUDIO_TOUCH_ACTION}
    >
      {/* ── 1. CABECERA BANDLAB (TopTransportBar) ── */}
      <TopTransportBar
        onBackToRink={onBackToRink}
        onGoHome={onGoHome}
        onExportToRink={handleExportMix}
        onImportGlobalAudio={handleImportGlobal}
        isExporting={isExporting}
      />

      {/* ── 2. LIENZO CENTRAL DE ARREGLOS (BandLab Arrangement View con Overscroll) ── */}
      <div 
        ref={timelineContainerRef}
        onPointerDown={handleWorkspacePointerDown}
        onPointerUp={handleWorkspacePointerUp}
        onPointerCancel={handleWorkspacePointerUp}
        className="relative flex-1 min-h-0 overflow-x-auto overflow-y-auto bg-black isolate"
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
          {/* Regla de tiempo superior */}
          <div className="sticky top-0 z-30 flex items-stretch bg-zinc-950/95 border-b border-white/10 backdrop-blur-md">
            <div
              className="shrink-0 border-r border-white/10 flex flex-col items-center justify-center gap-0.5 bg-zinc-900/90 text-[9px] font-mono font-black text-slate-400 leading-none"
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
                currentTimeSec={currentTimeSec}
                contentWidth={contentWidth}
                overscrollPx={overscrollPx}
                onSeek={(sec) => {
                  setCurrentTimeSec(sec);
                  audioEngine.seek(sec * 1000);
                }}
                hidePlayhead={true}
                isPlaying={isPlaying}
              />
            </div>
          </div>

          {/* Carriles de Pistas (Arrangement Track Rows con Overscroll y Drop Zone) */}
          <div className="flex-1 flex flex-col">
            {arrangementTracks.map((track, index) => (
              <MultitrackTrackRow
                key={track.id}
                track={track}
                trackIndex={index}
                totalTracks={arrangementTracks.length}
                totalDurationSec={totalDurationSec}
                contentWidth={contentWidth}
                overscrollPx={overscrollPx}
                trackLaneHeight={trackLaneHeight}
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

            {/* ── BOTÓN + AÑADIR PISTA (Estilo BandLab 2_Arrangement-View-1.webp) ── */}
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

          {/* Guía Visual Vertical de Snapping Magnético */}
          {draggingGhost?.snapLineSec !== null && draggingGhost?.snapLineSec !== undefined && (
            <div
              className="absolute top-0 bottom-0 pointer-events-none z-35 flex flex-col items-center select-none"
              style={{
                left: 0,
                transform: `translateX(${headerWidth + (draggingGhost.snapLineSec / Math.max(10, totalDurationSec)) * contentWidth}px)`,
              }}
            >
              <div className="px-1.5 py-0.5 rounded bg-cyan text-slate-950 font-mono font-black text-[9px] shadow-md -translate-y-1">
                🧲 {draggingGhost.snapLineSec.toFixed(2)}s
              </div>
              <div className="w-[2px] h-full bg-cyan shadow-glow-cyan" />
            </div>
          )}

          {/* Aguja de Reproducción Global Única (Playhead con Hitbox Táctil Ensanchado de 32px) */}
          <div
            ref={playheadLineRef}
            onPointerDown={handlePlayheadPointerDown}
            onPointerMove={handlePlayheadPointerMove}
            onPointerUp={handlePlayheadPointerUp}
            onPointerCancel={handlePlayheadPointerUp}
            className="absolute top-0 bottom-0 w-8 -translate-x-4 z-40 pointer-events-auto cursor-ew-resize flex justify-center group select-none touch-none"
            style={{ left: 0, transform: `translateX(${headerWidth}px)` }}
            title="Arrastra el cabezal de tiempo para desplazarte libremente"
          >
            {/* Línea visible de 2px centrada en el hitbox con iluminación cyan en hover/drag */}
            <div className="w-[2px] h-full bg-white group-hover:bg-cyan group-active:bg-cyan shadow-glow-cyan relative flex justify-center transition-colors">
              <div className="w-3.5 h-3.5 bg-white group-hover:bg-cyan group-active:bg-cyan rotate-45 -translate-y-1 rounded-xs shadow-md shrink-0 transition-colors" />
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

          {/* Rewind to 0:00
              Activación multimodal con `usePressAction`: dispara en `pointerdown`
              (táctil/ratón/touchpad, latencia cero) y ADEMÁS conserva `onClick`
              como respaldo (teclado o navegadores que no emiten pointer events).
              Depender solo de `onClick` fallaba en móviles WebKit porque el
              `click` no se sintetiza de forma fiable. Nunca se deshabilita. */}
          <button
            type="button"
            {...press(handleRewind)}
            className={`press w-11 h-11 sm:w-12 sm:h-12 shrink-0 rounded-full flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 active:bg-white/15 ${hasTransportAudio ? '' : 'opacity-40'}`}
            title="Volver al inicio (0:00)"
            aria-label="Volver al inicio"
          >
            <SkipBack className="w-5 h-5" />
          </button>

          {/* Stop / Detener */}
          <button
            type="button"
            {...press(handleStop)}
            className={`press w-11 h-11 sm:w-12 sm:h-12 shrink-0 rounded-full flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 active:bg-white/15 ${hasTransportAudio ? '' : 'opacity-40'}`}
            title="Detener reproducción y reiniciar posición"
            aria-label="Detener reproducción"
          >
            <Square className="w-4 h-4 fill-current" />
          </button>

          {/* Cortar en cabezal (precisión al cruce por cero).
              Habilitado siempre: si no hay clip seleccionado, corta el clip que
              está bajo el cabezal; si no hay ninguno, muestra un aviso. */}
          <button
            type="button"
            {...press(handleSplitAtPlayhead)}
            className={`press w-11 h-11 sm:w-12 sm:h-12 shrink-0 rounded-full flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 active:bg-white/15 ${hasTransportAudio ? '' : 'opacity-40'}`}
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
            {...press(handlePlayToggle)}
            aria-pressed={isPlaying}
            aria-label={isPlaying ? 'Pausar reproducción' : 'Reproducir'}
            className={`press w-12 h-12 sm:w-14 sm:h-14 shrink-0 rounded-full flex items-center justify-center shadow-lg ${
              isPlaying 
                ? 'bg-amber-400 text-black shadow-amber-400/30' 
                : 'bg-red-500 text-white shadow-red-500/30 hover:bg-red-600'
            }`}
            title={isPlaying ? 'Pausar (Espacio)' : 'Reproducir (Espacio)'}
          >
            {isPlaying ? (
              <Pause className="w-6 h-6 fill-current" />
            ) : (
              <Play className="w-6 h-6 fill-current ml-0.5" />
            )}
          </button>
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

          {/* + Marcador temporal */}
          <button
            type="button"
            onClick={() => addTimeNode(audioEngine.getCurrentTimeMs() / 1000)}
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
