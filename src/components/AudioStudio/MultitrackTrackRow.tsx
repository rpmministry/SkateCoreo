import React, { useMemo, useRef, useState } from 'react';
import { 
  Upload, 
  Mic, 
  Music, 
  Activity, 
  Layers, 
  MoreVertical 
} from 'lucide-react';
import { AudioStudioTrack } from '../../types/audioStudio';
import { ACCEPTED_AUDIO_FORMATS } from '../../constants/mediaFormats';
import { useAudioStudioStore } from '../../store/useAudioStudioStore';
import { createTimelineGeometry } from '../../core/audio/timeline/AudioTimelineGeometry';
import { logAudioDiagnostic } from '../../core/audio/audioDiagnostics';
import { AudioClipItem } from './AudioClipItem';
import { BandLabTrackMenuModal } from './BandLabTrackMenuModal';
import { useIosFileCapture } from '../../hooks/useIosFileCapture';

interface MultitrackTrackRowProps {
  track: AudioStudioTrack;
  trackIndex: number; // 0 = Master, 1..4 = Adicionales
  totalTracks: number;
  totalDurationSec: number;
  contentWidth: number;
  overscrollPx?: number;
  trackLaneHeight?: number;
  /** Ancho de la cabecera de pista, compartido con la regla y la geometría. */
  headerWidth?: number;
  onUploadFile: (file: File) => void;
  onTrackHop?: (fromTrackId: string, toTrackIndex: number, clipId: string, newOffsetSec: number) => void;
  onRemoveTrack?: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onDuplicate?: () => void;
  /** Contenedor con scroll horizontal compartido (para el edge-pan de los clips). */
  scrollContainerRef?: React.RefObject<HTMLElement | null>;
}

export const MultitrackTrackRow: React.FC<MultitrackTrackRowProps> = ({
  track,
  trackIndex,
  totalTracks,
  totalDurationSec,
  contentWidth,
  overscrollPx = 0,
  trackLaneHeight = 64,
  headerWidth = 90,
  onUploadFile,
  onTrackHop,
  onRemoveTrack,
  onMoveUp,
  onMoveDown,
  onDuplicate,
  scrollContainerRef,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const laneRef = useRef<HTMLDivElement | null>(null);
  /**
   * Detección de DOBLE TOQUE propia (independiente de `event.detail`, que en
   * Safari iOS/Android llega como 1 en muchos toques): permite pegar el clip
   * del portapapeles en la pista tocada sin depender de un doble clic real.
   */
  const lastLaneTapRef = useRef<{ t: number; x: number; y: number } | null>(null);

  const activeTrackId = useAudioStudioStore((s) => s.activeTrackId);
  const setActiveTrackId = useAudioStudioStore((s) => s.setActiveTrackId);
  const toggleTrackMute = useAudioStudioStore((s) => s.toggleTrackMute);
  const toggleTrackSolo = useAudioStudioStore((s) => s.toggleTrackSolo);
  const pasteClip = useAudioStudioStore((s) => s.pasteClip);
  const audioClipboard = useAudioStudioStore((s) => s.audioClipboard);
  const draggingGhost = useAudioStudioStore((s) => s.draggingGhost);

  const [showTrackMenu, setShowTrackMenu] = useState(false);

  // Única transformación tiempo ↔ píxeles del carril (compartida con regla y clips).
  const geometry = useMemo(
    () => createTimelineGeometry({ contentWidth, durationSec: Math.max(10, totalDurationSec) }),
    [contentWidth, totalDurationSec]
  );

  const isMasterTrack = trackIndex === 0 || track.type === 'music';
  const isActive = activeTrackId === track.id || (isMasterTrack && (activeTrackId === 'music' || activeTrackId === 'track-music' || activeTrackId === 'master'));
  const isDropTarget = draggingGhost?.targetTrackIndex === trackIndex;
  const isMasterDropTarget = isMasterTrack && isDropTarget;
  // Nombre de la pista (el master siempre se denomina Pista Master)
  const displayName = isMasterTrack ? 'Pista Master' : track.name;

  // Icono dinámico según la pista estilo BandLab
  const getTrackIcon = () => {
    if (isMasterTrack) return Music;
    if (trackIndex === 1) return Mic;
    if (trackIndex === 2) return Activity;
    return Layers;
  };
  const IconComponent = getTrackIcon();

  const { handleChange: handleFileChange } = useIosFileCapture(fileInputRef, (file) => {
    onUploadFile(file);
  });

  const handleLaneClick = (e: React.MouseEvent) => {
    setActiveTrackId(track.id);
    if (e.target === laneRef.current) {
      const rect = laneRef.current.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickedTimeSec = Math.max(0, geometry.pxToTime(clickX));

      // Doble toque robusto: `detail === 2` en escritorio; en táctil, dos taps
      // consecutivos cercanos dentro de 350 ms cuentan como doble toque.
      const now = Date.now();
      const last = lastLaneTapRef.current;
      const isDoubleTap =
        e.detail === 2 ||
        (last !== null &&
          now - last.t < 350 &&
          Math.abs(e.clientX - last.x) < 28 &&
          Math.abs(e.clientY - last.y) < 28);
      lastLaneTapRef.current = { t: now, x: e.clientX, y: e.clientY };

      if (audioClipboard && isDoubleTap) {
        pasteClip(track.id, clickedTimeSec, geometry.pixelsPerSecond);
        logAudioDiagnostic('TRACK_PASTE', {
          details: `track=${track.id} t=${clickedTimeSec.toFixed(3)} doubleTap`
        });
        lastLaneTapRef.current = null; // un tercer toque no cuenta como nuevo doble
      }
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setActiveTrackId(track.id);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('audio/')) {
      onUploadFile(file);
    }
  };

  const totalLaneWidth = contentWidth + overscrollPx;

  return (
    <>
      <div 
        className={`relative flex items-stretch border-b border-white/[0.06] transition-all ${
          isMasterDropTarget
            ? 'bg-ice-primary/10 ring-1 ring-inset ring-ice-primary/50'
            : isDropTarget
              ? 'bg-ice-primary/5 ring-1 ring-inset ring-ice-primary/30'
              : isActive
                ? 'bg-surface-2/60 ring-1 ring-inset ring-white/[0.06]'
                : 'bg-canvas/80 hover:bg-canvas'
        }`}
        style={{ height: `${trackLaneHeight}px` }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
      >
        {/* ── CABECERA DE PISTA: panel de identidad FIJO a la izquierda ── */}
        <div 
          onClick={() => {
            setActiveTrackId(track.id);
            setShowTrackMenu(true);
          }}
          className={`sticky left-0 z-40 shrink-0 border-r border-white/[0.06] flex flex-col justify-center gap-1 px-2 py-1.5 cursor-pointer select-none transition-colors group overflow-hidden ${
            isActive ? 'bg-surface-2' : 'bg-surface-1 hover:bg-surface-2'
          }`}
          style={{ width: `${headerWidth}px`, borderLeft: `3px solid ${track.color}` }}
          title={displayName}
        >
          {/* ── Fila 1: IDENTIDAD ── icono + NOMBRE COMPLETO */}
          <div className="flex items-start gap-1.5 min-w-0">
            <div
              className="mt-0.5 w-5 h-5 rounded-full flex items-center justify-center shrink-0 shadow-subtle relative"
              style={{ backgroundColor: `${track.color}20`, color: track.color }}
            >
              <IconComponent className="w-3 h-3" />
              {isActive && (
                <div className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-ice-primary ring-1 ring-black" />
              )}
            </div>
            <span
              className="min-w-0 flex-1 font-semibold text-[11px] sm:text-[12px] leading-[1.2] text-white break-words line-clamp-2"
              title={displayName}
            >
              {displayName}
            </span>
          </div>

          {/* ── Fila 2: ESTADO + CONTROLES reales de la pista (Mute / Solo) + menú ── */}
          <div className="flex items-center gap-1 min-w-0">
            <span className="text-[8px] sm:text-[9px] font-mono uppercase tracking-wide text-slate-400 truncate shrink">
              {isActive ? 'Activa' : isMasterTrack ? 'MASTER' : 'PISTA'}
            </span>
            <div className="ml-auto flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleTrackMute(track.id);
                }}
                aria-pressed={track.muted}
                aria-label={track.muted ? `Quitar silencio a ${displayName}` : `Silenciar ${displayName}`}
                title="Silenciar pista (Mute)"
                className={`flex h-6 w-6 items-center justify-center rounded-md text-[10px] font-semibold transition-all ${
                  track.muted
                    ? 'bg-red-500/20 text-red-400 ring-1 ring-red-500/30'
                    : 'bg-surface-2 border border-white/[0.06] text-slate-400 hover:text-white'
                }`}
              >
                M
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleTrackSolo(track.id);
                }}
                aria-pressed={track.solo}
                aria-label={track.solo ? `Quitar solo a ${displayName}` : `Escuchar solo ${displayName}`}
                title="Escuchar solo esta pista (Solo)"
                className={`flex h-6 w-6 items-center justify-center rounded-md text-[10px] font-semibold transition-all ${
                  track.solo
                    ? 'bg-amber-400/20 text-amber-300 ring-1 ring-amber-400/30'
                    : 'bg-surface-2 border border-white/[0.06] text-slate-400 hover:text-white'
                }`}
              >
                S
              </button>
              <MoreVertical className="w-3.5 h-3.5 shrink-0 text-slate-500 transition-colors group-hover:text-white" />
            </div>
          </div>
        </div>

        {/* ── CARRIL DE CLIPS (Timeline Lane / Drop Zone con Overscroll) ── */}
        <div 
          ref={laneRef}
          onClick={handleLaneClick}
          className="relative flex-1 overflow-hidden"
          style={{ width: `${totalLaneWidth}px` }}
        >
          {/* Zona de Espacio Vacío Continuo */}
          {overscrollPx > 0 && (
            <div 
              className="absolute top-0 bottom-0 pointer-events-none border-l border-dashed border-white/[0.06] bg-white/[0.01] flex items-center justify-start pl-3 select-none z-0"
              style={{
                left: `${contentWidth}px`,
                width: `${overscrollPx}px`,
              }}
            >
              <span className="text-[10px] font-mono text-slate-600 uppercase tracking-widest">
                + Área Libre
              </span>
            </div>
          )}

          {/* Indicador visual de Zona de Caída Activa */}
          {isDropTarget && (
            <div className={`absolute inset-0 z-30 pointer-events-none border-2 border-dashed flex items-center justify-center transition-all ${
              isMasterTrack
                ? 'border-ice-primary/50 bg-ice-primary/10'
                : 'border-white/30 bg-white/[0.03]'
            }`}>
              <span className="px-3 py-1 rounded-full bg-ice-primary text-white text-[10px] font-medium shadow-subtle flex items-center gap-1.5">
                {isMasterTrack ? '🎯 Soltar en Master (Ensamblaje)' : `↳ Soltar en ${displayName}`}
              </span>
            </div>
          )}

          {/* Renderizado de Clips */}
          {track.clips && track.clips.map((clip) => (
            <AudioClipItem
              key={clip.id}
              clip={clip}
              trackId={track.id}
              trackColor={track.color}
              totalDurationSec={totalDurationSec}
              contentWidth={contentWidth}
              trackLaneHeight={trackLaneHeight}
              trackIndex={trackIndex}
              totalTracks={totalTracks}
              scrollContainerRef={scrollContainerRef}
              onTrackHop={(clipId, deltaY, newOffsetSec) => {
                if (onTrackHop) {
                  const laneOffset = Math.round(deltaY / trackLaneHeight);
                  const targetIndex = Math.max(0, Math.min(totalTracks - 1, trackIndex + laneOffset));
                  onTrackHop(track.id, targetIndex, clipId, newOffsetSec);
                }
              }}
            />
          ))}

          {/* Estado vacío */}
          {(!track.clips || track.clips.length === 0) && (
            isMasterTrack && totalTracks > 1 ? (
              <div className="absolute inset-0 flex items-center justify-center p-2 pointer-events-auto">
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-ice-primary/10 border border-ice-primary/20 text-ice-primary text-xs font-normal">
                  <Layers className="w-3.5 h-3.5 text-ice-primary shrink-0" />
                  <span className="hidden sm:inline">Lienzo Master: Pega clips cortados de las pistas auxiliares</span>
                  <span className="sm:hidden">Lienzo Master (Ensamblaje)</span>
                  {audioClipboard && (
                    <button
                      type="button"
                      onClick={() => pasteClip(track.id, 0, geometry.pixelsPerSecond)}
                      className="ml-1 px-2.5 py-0.5 rounded-full bg-ice-primary text-white text-[10px] font-medium hover:bg-ice-primary/90 transition-all shadow-subtle active:scale-95"
                      title="Pegar clip copiado al inicio de la Pista Master"
                    >
                      Pegar Clip (Ctrl+V)
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="absolute inset-0 flex items-center justify-center p-2 pointer-events-auto">
                <label 
                  htmlFor={`file-upload-${track.id}`}
                  className="cursor-pointer h-8 px-3 rounded-xl flex items-center gap-1.5 text-xs font-medium text-slate-300 hover:text-white bg-surface-2 hover:bg-surface-3 border border-white/[0.06] transition-all shadow-subtle active:scale-95"
                >
                  <Upload className="w-3.5 h-3.5 text-ice-primary" />
                  <span>Cargar archivo de audio</span>
                </label>
                <input
                  id={`file-upload-${track.id}`}
                  ref={fileInputRef}
                  type="file"
                  accept={ACCEPTED_AUDIO_FORMATS}
                  className="sr-only"
                  onChange={handleFileChange}
                />
              </div>
            )
          )}
        </div>
      </div>

      {/* Menú Flotante de Opciones de Pista (Estilo BandLab 3_Mix-Editor-Menu-1.webp) */}
      <BandLabTrackMenuModal
        track={track}
        trackIndex={trackIndex}
        totalTracks={totalTracks}
        isOpen={showTrackMenu}
        onClose={() => setShowTrackMenu(false)}
        onUploadFile={onUploadFile}
        onMoveUp={onMoveUp}
        onMoveDown={onMoveDown}
        onDuplicate={onDuplicate}
        onRemove={onRemoveTrack}
      />
    </>
  );
};
