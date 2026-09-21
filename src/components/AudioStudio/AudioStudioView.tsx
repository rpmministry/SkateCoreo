import React, { useEffect, useState, useRef, useMemo } from 'react';
import { usePinch } from '@use-gesture/react';
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
  Sliders,
  Bell,
} from 'lucide-react';
import { useAudioStudioStore } from '../../store/useAudioStudioStore';
import { audioEngine } from '../../services/audioEngine';
import { useAudioZoomPan } from '../../hooks/useAudioZoomPan';
import { AudioStudioTrack } from '../../types/audioStudio';
import { TopTransportBar } from './TopTransportBar';
import { AudioTimeRuler } from './AudioTimeRuler';
import { MultitrackTrackRow } from './MultitrackTrackRow';
import { FloatingClipContextMenu } from './FloatingClipContextMenu';
import { BandLabMixerDrawer } from './BandLabMixerDrawer';

interface AudioStudioViewProps {
  onExportToRink?: () => void;
  onBackToRink?: () => void;
  onOpenDrawer?: () => void;
}

export const AudioStudioView: React.FC<AudioStudioViewProps> = ({
  onExportToRink,
  onBackToRink,
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

  const [isExporting, setIsExporting] = useState(false);
  const [exportNotice, setExportNotice] = useState<string | null>(null);
  const [showMixerDrawer, setShowMixerDrawer] = useState(false);

  // Ancho de cabecera de pista BandLab (100px)
  const headerWidth = 100;
  const playheadLineRef = useRef<HTMLDivElement | null>(null);
  const workspaceRef = useRef<HTMLDivElement | null>(null);
  const addTrackFileInputRef = useRef<HTMLInputElement | null>(null);

  // Motor de Zoom y Paneo
  const {
    zoom,
    setZoomExplicit,
    containerRef: timelineContainerRef,
    contentWidth,
    zoomIn,
    zoomOut,
    resetZoom,
  } = useAudioZoomPan({
    minZoom: 1.0,
    maxZoom: 35.0,
    initialZoom: 1.0,
    widthOffset: headerWidth,
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
    const targetTimeSec = Math.round(ratio * dur * 100) / 100;

    setCurrentTimeSec(targetTimeSec);
    audioEngine.seek(targetTimeSec * 1000);
    if (playheadLineRef.current) {
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

  // Gesto Pinch-to-Zoom con dos dedos sobre el timeline
  usePinch(
    ({ offset: [d], first, memo }) => {
      const initialZoom = first ? zoom : ((memo as number) || zoom);
      const newZoom = Math.max(1.0, Math.min(35.0, initialZoom * d));
      setZoomExplicit(newZoom);
      return initialZoom;
    },
    {
      target: workspaceRef,
      eventOptions: { passive: false },
    }
  );

  // Auto-scroll durante reproducción
  useEffect(() => {
    if (!isPlaying || zoom <= 1.05) return;
    const container = timelineContainerRef.current;
    if (!container) return;

    const dur = Math.max(10, totalDurationSec);
    const playheadRatio = Math.max(0, Math.min(1, currentTimeSec / dur));
    const playheadPx = headerWidth + playheadRatio * contentWidth;

    const left = container.scrollLeft;
    const right = left + container.clientWidth;

    if (playheadPx > right - 80 || playheadPx < left + 100) {
      container.scrollLeft = Math.max(0, playheadPx - container.clientWidth / 2);
    }
  }, [currentTimeSec, isPlaying, zoom, contentWidth, totalDurationSec, headerWidth, timelineContainerRef]);

  // Actualización del cabezal a 60 FPS (pausado durante arrastre manual)
  useEffect(() => {
    let animId: number;
    const updatePlayhead = () => {
      if (playheadLineRef.current && !isDraggingPlayheadRef.current) {
        const timeSec = isPlaying ? audioEngine.getCurrentTimeMs() / 1000 : currentTimeSec;
        const dur = Math.max(10, totalDurationSec);
        const ratio = Math.max(0, Math.min(1, timeSec / dur));
        const leftPx = headerWidth + ratio * contentWidth;
        playheadLineRef.current.style.transform = `translateX(${leftPx}px)`;
      }
      if (isPlaying) {
        animId = requestAnimationFrame(updatePlayhead);
      }
    };

    updatePlayhead();
    if (isPlaying) {
      animId = requestAnimationFrame(updatePlayhead);
    }
    return () => cancelAnimationFrame(animId);
  }, [isPlaying, currentTimeSec, totalDurationSec, contentWidth, headerWidth]);

  // 1 Pista Principal (Música) + hasta 4 Pistas Adicionales (Total: hasta 5 pistas)
  const arrangementTracks: AudioStudioTrack[] = useMemo(() => {
    return [tracks.music, ...additionalTracks];
  }, [tracks.music, additionalTracks]);

  // Atajos de teclado en escritorio:
  // - Espacio: Reproducir / Pausar
  // - Ctrl + C: Copiar clip de la pista (seleccionado o bajo el cabezal)
  // - Ctrl + V: Pegar clip copiado en la pista Master en la posición del cabezal
  // - Supr / Backspace: Eliminar clip seleccionado
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = (document.activeElement as HTMLElement)?.tagName;
      if (activeTag === 'INPUT' || activeTag === 'TEXTAREA') return;

      if (e.code === 'Space') {
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
        const clipboard = useAudioStudioStore.getState().audioClipboard;
        if (clipboard) {
          e.preventDefault();
          useAudioStudioStore.getState().pasteClip(tracks.music.id, currentTimeSec);
          setExportNotice('✂️ Clip pegado con éxito en la Pista Master');
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
  const handleAddTrackFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && additionalTracks.length < 4) {
      try {
        const buffer = await audioEngine.decodeAudioFile(file);
        const newTrack = addAudioTrack(file.name.replace(/\.[^/.]+$/, ''), buffer, file.name);
        setTrackBuffer(newTrack.id, buffer, file.name);
      } catch (err: any) {
        alert('Error al decodificar audio: ' + err?.message);
      }
      e.target.value = '';
    }
  };

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

  // Play / Pause Toggle
  const handlePlayToggle = async () => {
    if (isPlaying) {
      audioEngine.pause();
      setIsPlaying(false);
    } else {
      await audioEngine.play();
      setIsPlaying(true);
    }
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
      const targetTimeSec = Math.round(ratio * dur * 100) / 100;
      
      setCurrentTimeSec(targetTimeSec);
      audioEngine.seek(targetTimeSec * 1000);
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
      style={{ touchAction: 'pan-x' }}
    >
      {/* ── 1. CABECERA BANDLAB (TopTransportBar) ── */}
      <TopTransportBar
        onBackToRink={onBackToRink}
        onExportToRink={handleExportMix}
        onImportGlobalAudio={handleImportGlobal}
        isExporting={isExporting}
      />

      {/* ── 2. LIENZO CENTRAL DE ARREGLOS (BandLab Arrangement View) ── */}
      <div 
        ref={timelineContainerRef}
        onPointerDown={handleWorkspacePointerDown}
        onPointerUp={handleWorkspacePointerUp}
        onPointerCancel={handleWorkspacePointerUp}
        className="relative flex-1 overflow-x-auto overflow-y-auto bg-black"
        style={{
          WebkitOverflowScrolling: 'touch',
          overscrollBehavior: 'contain',
        }}
      >
        <div 
          ref={workspaceRef}
          className="relative min-h-full flex flex-col"
          style={{ width: `${headerWidth + contentWidth}px` }}
        >
          {/* Regla de tiempo superior */}
          <div className="sticky top-0 z-30 flex items-stretch bg-zinc-950/95 border-b border-white/10 backdrop-blur-md">
            <div 
              className="shrink-0 border-r border-white/10 flex items-center justify-center bg-zinc-900/90 text-[10px] font-mono font-black text-slate-400"
              style={{ width: `${headerWidth}px` }}
            >
              TRACKS
            </div>
            <div className="flex-1 overflow-hidden">
              <AudioTimeRuler
                totalDurationSec={totalDurationSec}
                currentTimeSec={currentTimeSec}
                contentWidth={contentWidth}
                onSeek={(sec) => {
                  setCurrentTimeSec(sec);
                  audioEngine.seek(sec * 1000);
                }}
                hidePlayhead={true}
              />
            </div>
          </div>

          {/* Carriles de Pistas (Arrangement Track Rows) */}
          <div className="flex-1 flex flex-col">
            {arrangementTracks.map((track, index) => (
              <MultitrackTrackRow
                key={track.id}
                track={track}
                trackIndex={index}
                totalTracks={arrangementTracks.length}
                totalDurationSec={totalDurationSec}
                contentWidth={contentWidth}
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
                style={{ width: `${headerWidth + contentWidth}px` }}
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
                  accept="audio/*"
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

      {/* ── 3. BARRA INFERIOR DE TRANSPORTE BANDLAB (BandLab Bottom Dock) ── */}
      <footer className="h-14 shrink-0 flex items-center justify-between px-3 sm:px-6 bg-zinc-950 border-t border-white/10 text-xs z-30">
        {/* Izquierda: Mezclador + Deshacer + Rewind */}
        <div className="flex items-center gap-2">
          {/* Botón Mezclador (Abre BandLabMixerDrawer) */}
          <button
            type="button"
            onClick={() => setShowMixerDrawer(true)}
            className="w-10 h-10 rounded-full flex items-center justify-center bg-white/10 hover:bg-white/20 text-slate-200 hover:text-white transition-all active:scale-95 shadow-sm"
            title="Abrir Mezclador de Pistas (Volumen, Mute, Solo)"
          >
            <Sliders className="w-4 h-4 text-cyan" />
          </button>

          {/* Rewind to 0:00 */}
          <button
            type="button"
            onClick={handleRewind}
            className="w-9 h-9 rounded-full flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
            title="Volver al inicio"
          >
            <SkipBack className="w-4 h-4" />
          </button>

          {/* Cortar en cabezal */}
          <button
            type="button"
            onClick={() => {
              if (selectedClipId) {
                for (const t of arrangementTracks) {
                  if (t.clips.some((c) => c.id === selectedClipId)) {
                    splitClip(t.id, selectedClipId, currentTimeSec);
                    break;
                  }
                }
              }
            }}
            disabled={!selectedClipId}
            className="w-9 h-9 rounded-full flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 disabled:opacity-25 transition-colors"
            title="Dividir clip en el cabezal"
          >
            <Scissors className="w-4 h-4 text-mint" />
          </button>
        </div>

        {/* Centro: BOTÓN CIRCULAR PRINCIPAL (BandLab Big Action Centerpiece) */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handlePlayToggle}
            className={`w-12 h-12 rounded-full flex items-center justify-center shadow-lg transition-transform active:scale-95 ${
              isPlaying 
                ? 'bg-amber-400 text-black shadow-amber-400/30' 
                : 'bg-red-500 text-white shadow-red-500/30 hover:bg-red-600'
            }`}
            title={isPlaying ? 'Pausar' : 'Reproducir'}
          >
            {isPlaying ? (
              <Pause className="w-5 h-5 fill-current" />
            ) : (
              <Play className="w-5 h-5 fill-current ml-0.5" />
            )}
          </button>
        </div>

        {/* Derecha: Metrónomo + Marcador + Zoom */}
        <div className="flex items-center gap-2">
          {/* Toggle Metrónomo rápido */}
          <button
            type="button"
            onClick={toggleMetronomeMute}
            className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors ${
              globalControls.metronome.muted 
                ? 'text-slate-500 hover:bg-white/5' 
                : 'text-amber-400 bg-amber-500/15'
            }`}
            title="Activar/Silenciar Metrónomo"
          >
            <Bell className="w-4 h-4" />
          </button>

          {/* + Marcador temporal */}
          <button
            type="button"
            onClick={() => addTimeNode(currentTimeSec)}
            className="h-8 px-2.5 rounded-full flex items-center gap-1 bg-cyan/15 text-cyan border border-cyan/30 text-xs font-bold transition-all hover:bg-cyan/25 active:scale-95"
            title="Añadir marcador temporal"
          >
            <MapPin className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Nodo</span>
            <span>({audioNodes.length})</span>
          </button>

          {/* Controles de Zoom */}
          <div className="flex items-center gap-0.5 font-mono text-xs pl-1">
            <button
              type="button"
              onClick={() => zoomOut()}
              className="w-7 h-7 rounded flex items-center justify-center text-slate-400 hover:text-white"
              title="Alejar Zoom"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => zoomIn()}
              className="w-7 h-7 rounded flex items-center justify-center text-slate-400 hover:text-white"
              title="Acercar Zoom"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            {zoom > 1.05 && (
              <button
                type="button"
                onClick={resetZoom}
                className="px-1 py-0.5 rounded text-[10px] bg-white/10 text-slate-300"
              >
                1x
              </button>
            )}
          </div>
        </div>
      </footer>

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
    </div>
  );
};
