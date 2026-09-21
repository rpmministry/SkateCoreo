import React, { useEffect, useState, useRef, useMemo } from 'react';
import { usePinch } from '@use-gesture/react';
import {
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Scissors,
  MousePointer,
  Trash2,
  MapPin,
  CheckCircle2,
  Copy,
  ClipboardPaste,
} from 'lucide-react';
import { useAudioStudioStore } from '../../store/useAudioStudioStore';
import { audioEngine } from '../../services/audioEngine';
import { useAudioZoomPan } from '../../hooks/useAudioZoomPan';
import { AudioStudioTrack } from '../../types/audioStudio';
import { TopTransportBar } from './TopTransportBar';
import { AudioTimeRuler } from './AudioTimeRuler';
import { MultitrackTrackRow } from './MultitrackTrackRow';
import { FloatingClipContextMenu } from './FloatingClipContextMenu';

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

  const setCurrentTimeSec = useAudioStudioStore((s) => s.setCurrentTimeSec);
  const setTrackBuffer = useAudioStudioStore((s) => s.setTrackBuffer);
  const removeAudioTrack = useAudioStudioStore((s) => s.removeAudioTrack);
  const moveClipToTrack = useAudioStudioStore((s) => s.moveClipToTrack);
  const addTimeNode = useAudioStudioStore((s) => s.addTimeNode);
  const renderAndExportMixdown = useAudioStudioStore((s) => s.renderAndExportMixdown);

  const activeTool = useAudioStudioStore((s) => s.activeTool);
  const setActiveTool = useAudioStudioStore((s) => s.setActiveTool);
  const selectedClipId = useAudioStudioStore((s) => s.selectedClipId);
  const splitClip = useAudioStudioStore((s) => s.splitClip);
  const deleteClip = useAudioStudioStore((s) => s.deleteClip);
  const copyClip = useAudioStudioStore((s) => s.copyClip);
  const pasteClip = useAudioStudioStore((s) => s.pasteClip);

  const [isExporting, setIsExporting] = useState(false);
  const [exportNotice, setExportNotice] = useState<string | null>(null);

  // Ancho de cabecera fija de pista (48px en móvil, 64px en desktop)
  const headerWidth = 56;
  const playheadLineRef = useRef<HTMLDivElement | null>(null);
  const workspaceRef = useRef<HTMLDivElement | null>(null);

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
  });

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

  // Auto-scroll durante reproducción si hay zoom activo
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

  // Actualización fluida del cabezal a 60 FPS
  useEffect(() => {
    let animId: number;
    const updatePlayhead = () => {
      if (playheadLineRef.current) {
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

  // Manejador de cambio de pista (Track Hopping) al arrastrar clips verticalmente
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

  // Cargar archivo de audio en una pista específica
  const handleUploadFile = async (trackId: string, file: File) => {
    try {
      const buffer = await audioEngine.loadAudioFile(file, file.name);
      setTrackBuffer(trackId, buffer, file.name);
    } catch (err: any) {
      alert('Error al decodificar audio: ' + (err?.message || 'Archivo no compatible'));
    }
  };

  // Exportar mezcla mixdown por hardware
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
    if ((e.target as HTMLElement).closest('button, input, [data-interactive]')) return;
    
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

  // Altura de carril adaptativa según cantidad de pistas para maximizar el espacio vertical
  const trackLaneHeight = useMemo(() => {
    const totalTracks = arrangementTracks.length;
    if (totalTracks <= 2) return 80;
    if (totalTracks <= 3) return 68;
    if (totalTracks <= 4) return 58;
    return 52; // 5 pistas
  }, [arrangementTracks.length]);

  return (
    <div 
      className="fixed inset-0 z-50 flex flex-col bg-zinc-950 text-slate-100 overflow-hidden select-none font-sans"
      style={{ touchAction: 'pan-x' }}
    >
      {/* ── 1. CABECERA ULTRA-COMPACTA (36px) — TopTransportBar ── */}
      <TopTransportBar
        onBackToRink={onBackToRink}
        onExportToRink={handleExportMix}
        isExporting={isExporting}
      />

      {/* ── 2. LIENZO CENTRAL MULTITRACK (Arrangement View) ── */}
      <div 
        ref={timelineContainerRef}
        onPointerDown={handleWorkspacePointerDown}
        onPointerUp={handleWorkspacePointerUp}
        onPointerCancel={handleWorkspacePointerUp}
        className="relative flex-1 overflow-x-auto overflow-y-auto bg-black/80"
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
          {/* Regla de tiempo y marcadores */}
          <div className="sticky top-0 z-30 flex items-stretch bg-zinc-950/95 border-b border-white/10 backdrop-blur-md">
            <div 
              className="shrink-0 border-r border-white/10 flex items-center justify-center bg-zinc-900/90 text-[10px] font-mono font-bold text-slate-400"
              style={{ width: `${headerWidth}px` }}
            >
              RULER
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

          {/* Carriles de Pistas (Máximo 5 pistas: 1 Master + hasta 4 adicionales) */}
          <div className="flex-1 flex flex-col">
            {arrangementTracks.map((track, index) => (
              <MultitrackTrackRow
                key={track.id}
                track={track}
                trackIndex={index}
                totalDurationSec={totalDurationSec}
                contentWidth={contentWidth}
                trackLaneHeight={trackLaneHeight}
                onUploadFile={(file) => handleUploadFile(track.id, file)}
                onTrackHop={(fromTrackId, targetIndex, clipId, newOffsetSec) => {
                  handleTrackHop(fromTrackId, targetIndex, clipId, newOffsetSec);
                }}
                onRemoveTrack={() => removeAudioTrack(track.id)}
              />
            ))}
          </div>

          {/* Aguja de Reproducción Global Única (Playhead) */}
          <div
            ref={playheadLineRef}
            className="absolute top-0 bottom-0 w-[2px] bg-amber-400 pointer-events-none z-40 transition-none shadow-glow-amber"
            style={{ left: 0, transform: `translateX(${headerWidth}px)` }}
          >
            <div className="w-3.5 h-3.5 bg-amber-400 rotate-45 -translate-x-[6px] -translate-y-1 rounded-xs shadow-md" />
          </div>
        </div>
      </div>

      {/* ── 3. DOCK INFERIOR ULTRA-COMPACTO (32px) — Herramientas & Zoom ── */}
      <footer className="h-8 shrink-0 flex items-center justify-between px-2 sm:px-3 bg-zinc-950/95 border-t border-white/10 text-xs z-30 backdrop-blur-md">
        {/* Herramientas de Edición Rápida */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setActiveTool('select')}
            className={`h-6 px-2 rounded flex items-center gap-1 text-[10px] font-bold transition-colors ${
              activeTool === 'select' ? 'bg-cyan text-black font-black' : 'bg-white/5 text-slate-400 hover:text-white'
            }`}
            title="Herramienta Selección"
          >
            <MousePointer className="w-3 h-3" />
            <span className="hidden sm:inline">Elegir</span>
          </button>

          <button
            type="button"
            onClick={() => {
              if (selectedClipId) {
                // Dividir en el punto del playhead
                for (const t of arrangementTracks) {
                  if (t.clips.some((c) => c.id === selectedClipId)) {
                    splitClip(t.id, selectedClipId, currentTimeSec);
                    break;
                  }
                }
              }
            }}
            disabled={!selectedClipId}
            className="h-6 px-2 rounded flex items-center gap-1 text-[10px] font-bold bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/10 disabled:opacity-30 transition-colors"
            title="Dividir clip seleccionado en la aguja de tiempo"
          >
            <Scissors className="w-3 h-3 text-mint" />
            <span className="hidden sm:inline">Cortar</span>
          </button>

          <button
            type="button"
            onClick={() => copyClip()}
            disabled={!selectedClipId}
            className="h-6 px-2 rounded flex items-center gap-1 text-[10px] font-bold bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/10 disabled:opacity-30 transition-colors"
            title="Copiar clip"
          >
            <Copy className="w-3 h-3 text-amber-400" />
            <span className="hidden sm:inline">Copiar</span>
          </button>

          <button
            type="button"
            onClick={() => pasteClip('music', currentTimeSec)}
            className="h-6 px-2 rounded flex items-center gap-1 text-[10px] font-bold bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/10 transition-colors"
            title="Pegar clip en el cabezal"
          >
            <ClipboardPaste className="w-3 h-3 text-blue-400" />
            <span className="hidden sm:inline">Pegar</span>
          </button>

          <button
            type="button"
            onClick={() => deleteClip()}
            disabled={!selectedClipId}
            className="h-6 px-2 rounded flex items-center gap-1 text-[10px] font-bold bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 disabled:opacity-30 transition-colors"
            title="Eliminar clip seleccionado"
          >
            <Trash2 className="w-3 h-3" />
            <span className="hidden sm:inline">Borrar</span>
          </button>
        </div>

        {/* Nodos de Marcación de Coreografía */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => addTimeNode(currentTimeSec)}
            className="h-6 px-2 rounded flex items-center gap-1 bg-cyan/10 hover:bg-cyan/20 text-cyan border border-cyan/30 text-[10px] font-bold transition-colors"
            title="Añadir marcador temporal en la aguja actual"
          >
            <MapPin className="w-3 h-3" />
            <span>+ Nodo ({audioNodes.length})</span>
          </button>
        </div>

        {/* Controles de Zoom Horizontal */}
        <div className="flex items-center gap-1 font-mono text-[10px]">
          <button
            type="button"
            onClick={() => zoomOut()}
            className="h-6 w-6 rounded flex items-center justify-center bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white"
            title="Alejar Zoom"
          >
            <ZoomOut className="w-3 h-3" />
          </button>
          <span className="px-1 text-slate-400">{zoom.toFixed(1)}x</span>
          <button
            type="button"
            onClick={() => zoomIn()}
            className="h-6 w-6 rounded flex items-center justify-center bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white"
            title="Acercar Zoom"
          >
            <ZoomIn className="w-3 h-3" />
          </button>
          {zoom > 1.05 && (
            <button
              type="button"
              onClick={resetZoom}
              className="h-6 px-1.5 rounded flex items-center gap-0.5 bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white"
              title="Restablecer Zoom a 1x"
            >
              <RotateCcw className="w-2.5 h-2.5" />
              <span>1x</span>
            </button>
          )}
        </div>
      </footer>

      {/* ── 4. MENÚ CONTEXTUAL TÁCTIL FLOTANTE (Pill Menu) ── */}
      <FloatingClipContextMenu />

      {/* ── 5. NOTIFICACIÓN FLOTANTE DE SINCRONIZACIÓN ── */}
      {exportNotice && (
        <div className="fixed bottom-12 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-3 py-1.5 rounded-full bg-cyan-950/90 border border-cyan/50 text-cyan text-xs font-bold shadow-2xl backdrop-blur-md animate-in fade-in slide-in-from-bottom-2">
          <CheckCircle2 className="w-4 h-4 text-cyan" />
          <span>{exportNotice}</span>
        </div>
      )}
    </div>
  );
};
